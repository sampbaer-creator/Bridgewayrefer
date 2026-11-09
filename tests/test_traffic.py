import base64
import json
import tempfile
import unittest
import uuid
from datetime import date
from app import create_app, LocalStore, AzureStore
from reporting import build_month_report
from unittest.mock import MagicMock

class TrafficTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store=LocalStore(self.temp.name+'/db')
        self.store.create({'PartitionKey':'doctors','RowKey':'office1234','name':'Example Dental','active':True})
        self.config={'TESTING':True,'DEMO':True,'STORE':self.store,'PUBLIC_ORIGIN':'http://localhost','ACCEPT_REFERRALS':True,'START_ALERT_WORKER':False}
        self.client=create_app(self.config).test_client()
        self.headers={'Origin':'http://localhost'}

    def test_open_retries_count_once_without_patient_data(self):
        event={'code':'office1234','eventId':str(uuid.uuid4()),'name':'DO NOT STORE','email':'DO NOT STORE'}
        self.assertEqual(self.client.post('/api/link-opens',json=event,headers=self.headers).status_code,201)
        self.assertEqual(self.client.post('/api/link-opens',json=event,headers=self.headers).status_code,200)
        rows=self.store.list('traffic',None)
        self.assertEqual(len(rows),1)
        self.assertEqual(set(rows[0]),{'PartitionKey','RowKey','doctorCode','doctorName','createdAt'})
        self.assertNotIn('DO NOT STORE',str(rows))
        self.assertEqual(self.client.get('/api/staff/referrals').json['referrals'],[])

    def test_event_validation_and_origin(self):
        event={'code':'office1234','eventId':str(uuid.uuid4())}
        self.assertEqual(self.client.post('/api/link-opens',json=event).status_code,403)
        for bad in [{},[],dict(event,eventId='bad'),dict(event,code='unknown123')]:
            self.assertIn(self.client.post('/api/link-opens',json=bad,headers=self.headers).status_code,(400,404))
        self.assertEqual(self.store.list('traffic'),[])
        doctor=self.store.get('doctors','office1234');doctor['active']=False
        with self.store.connect() as db: db.execute('UPDATE entities SET data=? WHERE p=? AND k=?',(json.dumps(doctor),'doctors','office1234'))
        self.assertEqual(self.client.post('/api/link-opens',json=event,headers=self.headers).status_code,404)

    def test_page_get_does_not_count_automated_fetches(self):
        self.assertEqual(self.client.get('/r/office1234').status_code,200)
        self.assertEqual(self.store.list('traffic'),[])
        self.assertIn('data-office-code="office1234"',self.client.get('/r/office1234').text)

    def test_tracking_rate_limit_does_not_block_form_submission(self):
        for _ in range(300):
            self.assertTrue(self.store.allow_request('same',limit=300))
        self.assertFalse(self.store.allow_request('same',limit=300))
        self.assertTrue(self.store.allow_request('different'))

    def test_missing_session_page_offers_sign_in_api_stays_401(self):
        app=create_app(dict(self.config,DEMO=False,TENANT_ID='tenant',STAFF_IDS={'staff'}))
        client=app.test_client()
        page=client.get('/staff');self.assertEqual(page.status_code,401)
        self.assertIn('Sign in to the office dashboard',page.text)
        self.assertEqual(client.get('/api/staff/session').status_code,401)
        self.assertEqual(client.get('/api/staff/analytics').status_code,401)
        principal={'auth_typ':'aad','claims':[{'typ':'oid','val':'staff'},{'typ':'tid','val':'tenant'}]}
        auth={'X-MS-CLIENT-PRINCIPAL':base64.b64encode(json.dumps(principal).encode()).decode()}
        self.assertEqual(client.get('/api/staff/session',headers=auth).json,{'ok':True})
        principal['claims'][0]['val']='unauthorized'
        auth['X-MS-CLIENT-PRINCIPAL']=base64.b64encode(json.dumps(principal).encode()).decode()
        self.assertEqual(client.get('/api/staff/session',headers=auth).status_code,403)

    def test_monthly_opens_and_forms_are_independent_with_history(self):
        doctors=[{'RowKey':'office1234','name':'Example Dental','active':False}]
        opens=[{'doctorCode':'office1234','doctorName':'Example Dental','createdAt':'2026-11-01T05:59:00Z'},
               {'doctorCode':'office1234','doctorName':'Example Dental','createdAt':'2026-11-01T06:01:00Z'},
               {'doctorCode':'office1234','doctorName':'Example Dental','createdAt':'2026-11-03T18:00:00Z'}]
        # In Mountain Time the first open is October; the other two are November.
        forms=[{'doctorCode':'office1234','doctorName':'Example Dental','createdAt':'2026-11-04T18:00:00Z'}]
        report=build_month_report(forms,doctors,'2026-11',date(2026,11,6),opens=opens)
        self.assertEqual((report['linkOpens'],report['total']),(2,1))
        self.assertEqual(report['offices'][0]['opens'],2)
        self.assertFalse(report['offices'][0]['active'])
        self.assertEqual(report['trend'][-2]['opens'],1)
        self.assertEqual(report['trend'][-1]['officeOpens']['office1234'],2)
        empty=build_month_report([],doctors,'2026-10',date(2026,11,6),opens=opens)
        self.assertEqual((empty['total'],empty['linkOpens']),(0,1))

    def test_azure_traffic_projection_is_paginated_without_patient_fields(self):
        store=AzureStore.__new__(AzureStore);store.table=MagicMock()
        store.iter_open_summaries()
        kwargs=store.table.query_entities.call_args.kwargs
        self.assertEqual(set(kwargs['select']),{'doctorCode','doctorName','createdAt'})
        self.assertIn("PartitionKey eq 'traffic'",store.table.query_entities.call_args.args[0])
