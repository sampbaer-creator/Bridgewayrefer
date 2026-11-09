import base64
import json
import os
import tempfile
import unittest
import uuid
from unittest.mock import patch
from app import create_app, LocalStore


class ReferralTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = LocalStore(self.temp.name + '/test.sqlite3')
        self.config = {'TESTING': True, 'DEMO': True, 'STORE': self.store,
                       'PUBLIC_ORIGIN': 'http://localhost', 'ACCEPT_REFERRALS': True}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.headers = {'Origin': 'http://localhost'}

    def tearDown(self):
        self.temp.cleanup()

    def payload(self, **changes):
        data = dict(name='Fictional Patient', email='parent@example.com', phone='8015550100', notes='',
                    consent=True, submissionId=str(uuid.uuid4()))
        data.update(changes)
        return data

    def post(self, data):
        return self.client.post('/api/referrals', json=data, headers=self.headers)

    def test_referral_attribution_and_status(self):
        result = self.client.post('/api/staff/doctors', json={'name': 'Fictional Dentist'}, headers=self.headers)
        self.assertEqual(result.status_code, 201)
        code = result.json['code']
        self.assertEqual(self.client.get('/r/'+code).status_code, 200)
        self.assertEqual(self.post(self.payload(code=code, notes='<script>bad()</script>')).status_code, 201)
        rows = self.client.get('/api/staff/referrals').json['referrals']
        self.assertEqual(rows[0]['doctorName'], 'Fictional Dentist')
        self.assertNotIn('dob', rows[0])
        key = rows[0]['RowKey']
        response = self.client.patch('/api/staff/referrals/'+key, json={'status':'Scheduled'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.store.get('records', key)['status'], 'Scheduled')
        self.assertTrue(any(e.get('action') == 'status:Scheduled' for e in self.store.list('records')))

    def test_duplicate_is_one_record(self):
        data = self.payload()
        self.assertEqual(self.post(data).status_code, 201)
        self.assertEqual(self.post(data).status_code, 201)
        self.assertEqual(len(self.client.get('/api/staff/referrals').json['referrals']), 1)

    def test_validation(self):
        for change in [{'consent':False}, {'name':''}, {'email':'bad'}, {'phone':'123'}, {'notes':'a'*2001}, {'website':'spam'}, {'code':'unknown-code'}, {'submissionId':'bad'}]:
            data = self.payload();data.update(change)
            self.assertEqual(self.post(data).status_code, 400, change)
        self.assertEqual(self.post([]).status_code, 400)

    def test_csrf(self):
        self.assertEqual(self.client.post('/api/referrals', json=self.payload()).status_code, 403)
        self.assertEqual(self.client.post('/api/referrals', json=self.payload(), headers={'Origin':'https://evil.example'}).status_code, 403)

    def test_rate_limit(self):
        for _ in range(10):
            self.assertEqual(self.post(self.payload()).status_code, 201)
        self.assertEqual(self.post(self.payload()).status_code, 429)

    def test_closed_intake(self):
        self.app.config['ACCEPT_REFERRALS'] = False
        self.assertEqual(self.post(self.payload()).status_code, 503)
        self.assertNotIn('id="referral-form"', self.client.get('/').text)

    def test_disabled_card(self):
        code = self.client.post('/api/staff/doctors', json={'name':'Test'}, headers=self.headers).json['code']
        self.client.patch('/api/staff/doctors/'+code, json={'active':False}, headers=self.headers)
        self.assertEqual(self.client.get('/r/'+code).status_code, 404)
        self.assertEqual(self.post(self.payload(code=code)).status_code, 400)

    def test_security_headers(self):
        response = self.client.get('/')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.headers['Referrer-Policy'], 'same-origin')
        self.assertIn("frame-ancestors 'none'", response.headers['Content-Security-Policy'])

    def test_mobile_heading_keeps_space_when_line_break_is_hidden(self):
        response = self.client.get('/')
        self.assertIn('starts with<br> <em>a smile.</em>', response.text)

    def test_production_auth(self):
        app = create_app(dict(self.config, DEMO=False, TENANT_ID='tenant', STAFF_IDS={'allowed'}))
        client = app.test_client()
        self.assertEqual(client.get('/api/staff/referrals').status_code, 401)
        def headers(oid, tenant='tenant'):
            p={'auth_typ':'aad','claims':[{'typ':'oid','val':oid},{'typ':'tid','val':tenant}]}
            return {'X-MS-CLIENT-PRINCIPAL':base64.b64encode(json.dumps(p).encode()).decode()}
        self.assertEqual(client.get('/api/staff/referrals',headers=headers('other')).status_code,403)
        self.assertEqual(client.get('/api/staff/referrals',headers=headers('allowed','other')).status_code,403)
        self.assertEqual(client.get('/api/staff/referrals',headers=headers('allowed')).status_code,200)
        self.assertEqual(client.get('/api/staff/doctors').status_code,401)
        self.assertEqual(client.get('/staff').status_code,401)
        self.assertEqual(client.get('/').status_code,200)

    def test_demo_refused_on_azure(self):
        with patch.dict(os.environ, {'WEBSITE_INSTANCE_ID':'test'}):
            with self.assertRaises(RuntimeError):
                create_app(self.config)

    def test_production_no_silent_local_fallback(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                create_app({'DEMO':False})


if __name__ == '__main__':
    unittest.main()
