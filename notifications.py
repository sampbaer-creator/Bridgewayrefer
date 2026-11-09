"""Durable, generic referral alerts. At-least-once delivery, no patient data."""
import copy
import hashlib
import smtplib
import ssl
import threading
import time
import uuid
from email.message import EmailMessage
from email.utils import parseaddr
from urllib.parse import urlsplit


def new_alert(key=None):
    return {'PartitionKey': 'records', 'RowKey': key or 'alert-test-' + str(uuid.uuid4()),
            'state': 'Pending', 'readyAt': float(time.time()), 'attempts': 0, 'owner': '',
            'createdAt': float(time.time()), 'acceptedAt': 0.0, 'revision': 0}


def address(value):
    if not isinstance(value, str) or '\r' in value or '\n' in value:
        raise ValueError('Invalid email configuration')
    _, parsed = parseaddr(value)
    if parsed != value or '@' not in parsed or not parsed.split('@')[1]:
        raise ValueError('Invalid email configuration')
    return parsed


class SmtpSender:
    def __init__(self, config):
        self.username = address(config['SMTP_USERNAME'])
        self.recipient = address(config['ALERT_RECIPIENT'])
        self.password = config['SMTP_PASSWORD']
        self.host = config['SMTP_HOST']
        self.port = int(config['SMTP_PORT'])
        origin = config['PUBLIC_ORIGIN']
        parts = urlsplit(origin)
        if parts.scheme != 'https' or not parts.hostname or parts.path or parts.query or parts.fragment or parts.username:
            raise ValueError('Alerts require a configured HTTPS origin')
        self.dashboard = origin + '/staff/login'

    def send(self, alert):
        message = EmailMessage()
        message['From'] = self.username
        message['To'] = self.recipient
        message['Subject'] = 'New referral received - Saratoga Springs Orthodontics'
        # A stable ID helps mail clients recognize an occasional duplicate retry.
        message['Message-ID'] = '<' + hashlib.sha256(alert['RowKey'].encode()).hexdigest() + '@' + urlsplit(self.dashboard).hostname + '>'
        message.set_content('A new referral is waiting in your secure Saratoga Springs Orthodontics dashboard.\n\n'
                            'Sign in to review it:\n' + self.dashboard + '\n\n'
                            'Patient details are available only in the dashboard.\n')
        with smtplib.SMTP_SSL(self.host, self.port, timeout=20, context=ssl.create_default_context()) as smtp:
            smtp.login(self.username, self.password)
            refused = smtp.send_message(message)
            if refused:
                raise RuntimeError('Mail service did not accept recipient')


def process_alerts(store, sender, logger, clock=time.time):
    """Claim via optimistic concurrency so multiple Gunicorn workers coexist."""
    accepted = 0
    for entity in store.pending_alerts(float(clock())):
        key = entity['RowKey']
        owner = str(uuid.uuid4())
        claimed = copy.deepcopy(entity)
        claimed.update(state='Sending', readyAt=float(clock() + 300), owner=owner,
                       attempts=entity['attempts'] + 1)
        if not store.replace_alert(entity, claimed):
            continue
        try:
            sender.send(claimed)
        except Exception:
            # Do not log exception text: SMTP errors can include addresses/credentials.
            logger.warning('Email alert retry scheduled; sensitive details suppressed')
            current = store.get('records', key)
            if current and current.get('owner') == owner:
                updated = dict(current)
                updated.update(state='Retry', readyAt=float(clock() + min(3600, 60 * 2 ** min(current['attempts'] - 1, 6))))
                store.replace_alert(current, updated)
            continue
        current = store.get('records', key)
        if current and current.get('owner') == owner:
            updated = dict(current)
            updated.update(state='Accepted', acceptedAt=float(clock()), readyAt=0.0)
            store.replace_alert(current, updated)
        accepted += 1
    return accepted


def configure_alerts(app, store):
    config = app.config
    required = ('SMTP_USERNAME', 'SMTP_PASSWORD', 'ALERT_RECIPIENT', 'SMTP_HOST')
    configured = config['ALERT_EMAIL_ENABLED'] and all(config.get(k) for k in required)
    sender = None
    if configured:
        try:
            sender = config.get('ALERT_SENDER') or SmtpSender(config)
        except (ValueError, TypeError):
            app.logger.error('Email configuration invalid; sensitive details suppressed')
            configured = False
    app.extensions['alerts_configured'] = bool(configured)
    app.extensions['alert_sender'] = sender
    if configured and not config['DEMO'] and config['START_ALERT_WORKER']:
        def work():
            while True:
                try:
                    process_alerts(store, sender, app.logger)
                except Exception:
                    app.logger.warning('Email worker paused after an error; will retry')
                time.sleep(30)
        thread = threading.Thread(target=work, name='referral-alerts', daemon=True)
        thread.start()
        app.extensions['alert_thread'] = thread
