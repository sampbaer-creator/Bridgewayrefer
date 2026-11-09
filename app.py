import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from itertools import islice

from flask import Flask, abort, g, jsonify, redirect, render_template, request
from notifications import configure_alerts, new_alert
from reporting import build_month_report, month_date

STATUSES = ['New', 'Contacted', 'Scheduled', 'Completed', 'Closed']


def now():
    return datetime.now(timezone.utc).isoformat()


class LocalStore:
    """Fictional-data development only. Production uses Azure Table Storage."""
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS entities (p TEXT, k TEXT, data TEXT, PRIMARY KEY(p,k))')

    def connect(self):
        return sqlite3.connect(self.path)

    def get(self, partition, key):
        with self.connect() as db:
            row = db.execute('SELECT data FROM entities WHERE p=? AND k=?', (partition, key)).fetchone()
        return json.loads(row[0]) if row else None

    def list(self, partition, limit=501, prefix=''):
        with self.connect() as db:
            rows = db.execute('SELECT data FROM entities WHERE p=? AND k LIKE ? ORDER BY k LIMIT ?', (partition, prefix + '%', -1 if limit is None else limit)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def create(self, entity):
        with self.connect() as db:
            db.execute('INSERT INTO entities VALUES (?,?,?)', (entity['PartitionKey'], entity['RowKey'], json.dumps(entity)))

    def iter_referral_summaries(self):
        with self.connect() as db:
            cursor = db.execute("SELECT data FROM entities WHERE p='records' AND k LIKE 'ref-%'")
            for row in cursor:
                entity = json.loads(row[0])
                yield {key: entity.get(key, '') for key in ('RowKey', 'doctorCode', 'doctorName', 'createdAt')}

    def iter_open_summaries(self):
        return iter(self.list('traffic', limit=None, prefix='open-'))

    def create_referral(self, record, alert=None):
        with self.connect() as db:
            for entity in [record] + ([alert] if alert else []):
                db.execute('INSERT INTO entities VALUES (?,?,?)', (entity['PartitionKey'], entity['RowKey'], json.dumps(entity)))

    def pending_alerts(self, timestamp):
        return [e for e in self.list('records', 10001, prefix='alert-')
                if e['state'] != 'Accepted' and e['readyAt'] <= timestamp][:20]

    def replace_alert(self, before, after):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT data FROM entities WHERE p=? AND k=?', ('records', before['RowKey'])).fetchone()
            current = json.loads(row[0]) if row else None
            if not current or current['revision'] != before['revision']:
                return False
            after['revision'] = before['revision'] + 1
            db.execute('UPDATE entities SET data=? WHERE p=? AND k=?', (json.dumps(after), 'records', before['RowKey']))
            return True

    def update_with_audit(self, entity, event):
        with self.connect() as db:
            db.execute('UPDATE entities SET data=? WHERE p=? AND k=?', (json.dumps(entity), entity['PartitionKey'], entity['RowKey']))
            db.execute('INSERT INTO entities VALUES (?,?,?)', (event['PartitionKey'], event['RowKey'], json.dumps(event)))

    def allow_request(self, key, limit=10):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT data FROM entities WHERE p=? AND k=?', ('rate', key)).fetchone()
            count = json.loads(row[0])['count'] if row else 0
            if count >= limit:
                return False
            db.execute('INSERT OR REPLACE INTO entities VALUES (?,?,?)', ('rate', key, json.dumps({'count': count + 1})))
            return True


class AzureStore:
    def __init__(self, endpoint):
        from azure.data.tables import TableClient
        from azure.identity import ManagedIdentityCredential
        self.table = TableClient(endpoint, 'referrals', credential=ManagedIdentityCredential())

    def get(self, partition, key):
        from azure.core.exceptions import ResourceNotFoundError
        try:
            return self.table.get_entity(partition, key)
        except ResourceNotFoundError:
            return None

    def list(self, partition, limit=501, prefix=''):
        query = 'PartitionKey eq @p'
        params = {'p': partition}
        if prefix:
            query += ' and RowKey ge @start and RowKey lt @end'
            params.update(start=prefix, end=prefix[:-1] + chr(ord(prefix[-1]) + 1))
        return list(islice(self.table.query_entities(query, parameters=params), limit))

    def create(self, entity):
        self.table.create_entity(entity)

    def iter_referral_summaries(self):
        # Iterate every service page. Reporting must not inherit the inbox's 500-row display limit.
        return self.table.query_entities(
            "PartitionKey eq 'records' and RowKey ge 'ref-' and RowKey lt 'ref.'",
            select=['RowKey', 'doctorCode', 'doctorName', 'createdAt'])

    def iter_open_summaries(self):
        return self.table.query_entities(
            "PartitionKey eq 'traffic' and RowKey ge 'open-' and RowKey lt 'open.'",
            select=['doctorCode', 'doctorName', 'createdAt'])

    def create_referral(self, record, alert=None):
        self.table.submit_transaction([('create', e) for e in [record] + ([alert] if alert else [])])

    def pending_alerts(self, timestamp):
        query = "PartitionKey eq 'records' and RowKey ge 'alert-' and RowKey lt 'alert.' and state ne 'Accepted' and readyAt le @now"
        return list(islice(self.table.query_entities(query, parameters={'now': timestamp}), 20))

    def replace_alert(self, before, after):
        from azure.core import MatchConditions
        from azure.core.exceptions import ResourceModifiedError
        from azure.data.tables import UpdateMode
        try:
            after['revision'] = before['revision'] + 1
            self.table.update_entity(after, mode=UpdateMode.REPLACE, etag=before.metadata['etag'], match_condition=MatchConditions.IfNotModified)
            return True
        except ResourceModifiedError:
            return False

    def update_with_audit(self, entity, event):
        from azure.core import MatchConditions
        from azure.data.tables import UpdateMode
        self.table.submit_transaction([
            ('update', entity, {'mode': UpdateMode.REPLACE, 'etag': entity.metadata['etag'], 'match_condition': MatchConditions.IfNotModified}),
            ('create', event),
        ])

    def allow_request(self, key, limit=10):
        from azure.core import MatchConditions
        from azure.core.exceptions import ResourceExistsError, ResourceModifiedError
        from azure.data.tables import UpdateMode
        for _ in range(4):
            entity = self.get('rate', key)
            try:
                if entity is None:
                    self.create({'PartitionKey': 'rate', 'RowKey': key, 'count': 1})
                    return True
                if entity['count'] >= limit:
                    return False
                entity['count'] += 1
                self.table.update_entity(entity, mode=UpdateMode.REPLACE, etag=entity.metadata['etag'], match_condition=MatchConditions.IfNotModified)
                return True
            except (ResourceExistsError, ResourceModifiedError):
                continue
        return False


def create_app(config=None):
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=16384, DEMO=os.getenv('DEMO_MODE') == '1',
                      PUBLIC_ORIGIN=os.getenv('PUBLIC_ORIGIN', 'http://localhost:5000').rstrip('/'),
                      STAFF_IDS=set(filter(None, os.getenv('STAFF_OBJECT_IDS', '').lower().split(','))),
                      TENANT_ID=os.getenv('TENANT_ID', '').lower(),
                      ACCEPT_REFERRALS=os.getenv('ACCEPT_REFERRALS') == '1',
                      ALERT_EMAIL_ENABLED=os.getenv('ALERT_EMAIL_ENABLED') == '1',
                      ALERT_RECIPIENT=os.getenv('ALERT_RECIPIENT', ''),
                      SMTP_USERNAME=os.getenv('SMTP_USERNAME', ''),
                      SMTP_PASSWORD=os.getenv('SMTP_PASSWORD', ''),
                      SMTP_HOST=os.getenv('SMTP_HOST', 'smtp.gmail.com'),
                      SMTP_PORT=os.getenv('SMTP_PORT', '465'), START_ALERT_WORKER=True)
    if config:
        app.config.update(config)
    if app.config['DEMO'] and os.getenv('WEBSITE_INSTANCE_ID'):
        raise RuntimeError('Demo mode cannot run in Azure App Service')
    if app.config.get('STORE'):
        store = app.config['STORE']
    elif app.config['DEMO']:
        store = LocalStore(os.getenv('LOCAL_DB', 'demo.sqlite3'))
    else:
        endpoint = os.environ.get('TABLE_ENDPOINT')
        if not endpoint or not app.config['TENANT_ID'] or not app.config['STAFF_IDS']:
            raise RuntimeError('Production storage and staff identity configuration required')
        if not app.config['PUBLIC_ORIGIN'].startswith('https://'):
            raise RuntimeError('Production requires HTTPS origin')
        store = AzureStore(endpoint)
    app.extensions['store'] = store
    configure_alerts(app, store)

    def audit(action, target):
        return {'PartitionKey': 'records', 'RowKey': 'audit-' + str(uuid.uuid4()), 'action': action,
                'target': target, 'actor': g.staff, 'at': now()}

    def staff_only(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if app.config['DEMO']:
                g.staff = 'local-demo'
            else:
                # Trust these headers ONLY behind enabled Azure App Service Easy Auth.
                try:
                    principal = json.loads(base64.b64decode(request.headers.get('X-MS-CLIENT-PRINCIPAL', ''), validate=True))
                    claims = {v['typ']: v['val'] for v in principal['claims']}
                    oid = claims.get('http://schemas.microsoft.com/identity/claims/objectidentifier', claims.get('oid', '')).lower()
                    tenant = claims.get('http://schemas.microsoft.com/identity/claims/tenantid', claims.get('tid', '')).lower()
                    if principal.get('auth_typ') != 'aad' or tenant != app.config['TENANT_ID'] or oid not in app.config['STAFF_IDS']:
                        abort(403)
                    g.staff = oid
                except (ValueError, KeyError, TypeError):
                    if request.path == '/staff':
                        return render_template('sign_in.html', demo=False), 401
                    abort(401)
            return fn(*args, **kwargs)
        return wrapped

    @app.before_request
    def protect_writes():
        if request.method in ('POST', 'PATCH', 'DELETE', 'PUT'):
            if request.headers.get('Origin') != app.config['PUBLIC_ORIGIN']:
                abort(403)
            if not request.is_json:
                abort(415)

    @app.after_request
    def headers(response):
        response.headers.update({'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
                                 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
                                 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        if not app.config['DEMO']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response

    @app.errorhandler(Exception)
    def safe_error(error):
        from werkzeug.exceptions import HTTPException
        status = error.code if isinstance(error, HTTPException) else 503
        # Do not log request payloads, SDK exceptions, or patient information.
        if status == 503:
            app.logger.error('Request failed; patient details suppressed')
        return jsonify(error={400:'Please check the form.', 401:'Please sign in.', 403:'Access denied.', 404:'Not found.',
                              409:'This record changed. Refresh and try again.', 413:'Form is too large.', 415:'JSON required.',
                              429:'Please wait before trying again.'}.get(status, 'Service unavailable. Please try again.')), status

    @app.get('/health')
    def health():
        return jsonify(status='ok')

    @app.get('/')
    def home():
        return render_template('form.html', doctor=None, code='', demo=app.config['DEMO'], accepting=app.config['ACCEPT_REFERRALS'])

    @app.get('/r/<code>')
    def referral_form(code):
        if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}', code):
            abort(404)
        doctor = store.get('doctors', code)
        if not doctor or not doctor['active']:
            abort(404)
        return render_template('form.html', doctor=doctor, code=code, demo=app.config['DEMO'], accepting=app.config['ACCEPT_REFERRALS'])

    @app.post('/api/link-opens')
    def record_link_open():
        data = request.get_json()
        if not isinstance(data, dict):
            abort(400)
        code, event_id = data.get('code'), data.get('eventId')
        if not isinstance(code, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,80}', code):
            abort(400)
        try:
            event_id = str(uuid.UUID(event_id))
        except (ValueError, TypeError, AttributeError):
            abort(400)
        doctor = store.get('doctors', code)
        if not doctor or not doctor['active']:
            abort(404)
        # Retries of a single page-open event must not increase counts.
        key = 'open-' + event_id
        if store.get('traffic', key):
            return jsonify(ok=True)
        address = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[-1].strip()
        rate_key = 'opens-' + str(int(time.time() // 3600)) + '-' + hashlib.sha256(address.encode()).hexdigest()
        if not store.allow_request(rate_key, limit=300):
            abort(429)
        try:
            store.create({'PartitionKey': 'traffic', 'RowKey': key, 'doctorCode': code,
                          'doctorName': doctor['name'], 'createdAt': now()})
        except Exception as exc:
            from azure.core.exceptions import ResourceExistsError
            if not isinstance(exc, (sqlite3.IntegrityError, ResourceExistsError)):
                raise
        return jsonify(ok=True), 201

    @app.post('/api/referrals')
    def submit():
        if not app.config['ACCEPT_REFERRALS']:
            abort(503)
        data = request.get_json()
        if not isinstance(data, dict):
            abort(400)
        if data.get('website'):
            abort(400)
        fields = {}
        for name, limit in [('name', 120), ('email', 254), ('phone', 40), ('notes', 2000)]:
            value = data.get(name, '')
            if not isinstance(value, str) or len(value.strip()) > limit or (name != 'notes' and not value.strip()):
                abort(400)
            fields[name] = value.strip()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', fields['email']) or not 10 <= len(re.sub(r'\D', '', fields['phone'])) <= 15:
            abort(400)
        if data.get('consent') is not True:
            abort(400)
        code = data.get('code', '')
        if not isinstance(code, str) or (code and not re.fullmatch(r'[A-Za-z0-9_-]{8,80}', code)):
            abort(400)
        doctor = store.get('doctors', code) if code else None
        if code and (not doctor or not doctor['active']):
            abort(400)
        # Use the proxy-provided address on Azure; it cannot be used to access records.
        address = request.headers.get('X-Forwarded-For', request.remote_addr or '') .split(',')[-1].strip()
        key = str(int(time.time() // 3600)) + '-' + hashlib.sha256(address.encode()).hexdigest()
        if not store.allow_request(key):
            abort(429)
        token = data.get('submissionId', '')
        try:
            uuid.UUID(token)
        except (ValueError, TypeError, AttributeError):
            abort(400)
        record = dict(fields, PartitionKey='records', RowKey='ref-' + token,
                      doctorCode=code, doctorName=doctor['name'] if doctor else 'Direct request', status='New',
                      createdAt=now(), updatedAt=now(), consentVersion='contact-v1', consentAt=now())
        try:
            alert = new_alert('alert-' + token) if app.config['ALERT_EMAIL_ENABLED'] else None
            store.create_referral(record, alert)
        except Exception as exc:
            from azure.core.exceptions import ResourceExistsError
            from azure.data.tables import TableTransactionError
            duplicate = isinstance(exc, (sqlite3.IntegrityError, ResourceExistsError)) or (isinstance(exc, TableTransactionError) and exc.status_code == 409)
            if not duplicate:
                raise
            # Idempotent response: never reveal an existing patient's data.
        return jsonify(ok=True), 201

    @app.get('/staff')
    @staff_only
    def dashboard():
        return render_template('staff.html', demo=app.config['DEMO'], statuses=STATUSES)

    @app.get('/staff/login')
    def login():
        return redirect('/staff' if app.config['DEMO'] else '/.auth/login/aad?post_login_redirect_uri=/staff')

    @app.get('/api/staff/session')
    @staff_only
    def staff_session():
        return jsonify(ok=True)

    @app.get('/api/staff/referrals')
    @staff_only
    def referrals():
        # Audit reads before returning patient data; failure prevents disclosure.
        store.create(audit('list-referrals', 'dashboard'))
        rows = [dict(e) for e in store.list('records', 10001, prefix='ref-')]
        rows.sort(key=lambda x: x['createdAt'], reverse=True)
        return jsonify(referrals=rows[:500], limited=len(rows) > 500)

    @app.patch('/api/staff/referrals/<key>')
    @staff_only
    def update_referral(key):
        data = request.get_json()
        if not isinstance(data, dict) or data.get('status') not in STATUSES or not key.startswith('ref-'):
            abort(400)
        entity = store.get('records', key)
        if not entity:
            abort(404)
        entity.update(status=data['status'], updatedAt=now())
        try:
            store.update_with_audit(entity, audit('status:' + data['status'], key))
        except Exception as exc:
            from azure.core.exceptions import ResourceModifiedError
            from azure.data.tables import TableTransactionError
            if isinstance(exc, ResourceModifiedError) or (isinstance(exc, TableTransactionError) and exc.status_code == 412):
                abort(409)
            raise
        return jsonify(ok=True)

    @app.get('/api/staff/analytics')
    @staff_only
    def monthly_analytics():
        month = request.args.get('month')
        if month is not None:
            try:
                month_date(month)
            except (ValueError, TypeError):
                return jsonify(error='Choose a valid month.'), 400
        store.create(audit('monthly-referral-counts', month or 'current-month'))
        report = build_month_report(store.iter_referral_summaries(), store.list('doctors', limit=None), month, opens=store.iter_open_summaries())
        return jsonify(report)

    @app.get('/api/staff/alerts')
    @staff_only
    def alert_status():
        pending = store.pending_alerts(float(time.time()))
        return jsonify(enabled=app.extensions['alerts_configured'],
                       recipient=app.config['ALERT_RECIPIENT'],
                       waiting=len(pending), retrying=sum(e['attempts'] > 0 for e in pending))

    @app.post('/api/staff/alerts/test')
    @staff_only
    def test_alert():
        if not app.extensions['alerts_configured']:
            return jsonify(error='Email alerts are not configured yet.'), 503
        if not store.allow_request('alert-test-' + str(int(time.time() // 3600)) + '-' + g.staff):
            abort(429)
        store.create(audit('test-email-alert', 'configured-recipient'))
        store.create(new_alert())
        return jsonify(ok=True), 202

    @app.get('/api/staff/doctors')
    @staff_only
    def doctors():
        return jsonify(doctors=[dict(e) for e in store.list('doctors')])

    @app.post('/api/staff/doctors')
    @staff_only
    def add_doctor():
        data = request.get_json()
        name = data.get('name', '') if isinstance(data, dict) else ''
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 120:
            abort(400)
        code = secrets.token_urlsafe(18)
        store.create({'PartitionKey': 'doctors', 'RowKey': code, 'name': name.strip(), 'active': True, 'createdAt': now()})
        store.create(audit('create-doctor', code))
        return jsonify(code=code, url=app.config['PUBLIC_ORIGIN'] + '/r/' + code), 201

    @app.patch('/api/staff/doctors/<code>')
    @staff_only
    def toggle_doctor(code):
        data = request.get_json()
        if not isinstance(data, dict) or not isinstance(data.get('active'), bool):
            abort(400)
        entity = store.get('doctors', code)
        if not entity:
            abort(404)
        # Cross-partition audit cannot share a transaction. Audit intent before changing card.
        store.create(audit('card-active:' + str(data['active']), code))
        entity['active'] = data['active']
        if isinstance(store, LocalStore):
            with store.connect() as db:
                db.execute('UPDATE entities SET data=? WHERE p=? AND k=?', (json.dumps(entity), 'doctors', code))
        else:
            from azure.core import MatchConditions
            store.table.update_entity(entity, etag=entity.metadata['etag'], match_condition=MatchConditions.IfNotModified)
        return jsonify(ok=True)

    return app

