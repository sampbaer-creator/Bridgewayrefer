import copy
import json
import logging
import sqlite3
import tempfile
import time
import unittest
import uuid
from unittest.mock import MagicMock, patch

from app import LocalStore, create_app
from notifications import SmtpSender, new_alert, process_alerts


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = LocalStore(self.tmp.name + '/alerts.sqlite3')
        self.logger = logging.getLogger('test-alerts')
        self.sender = MagicMock()
        self.config = {'TESTING': True, 'DEMO': True, 'STORE':self.store,
            'PUBLIC_ORIGIN':'https://refer.example.com','ACCEPT_REFERRALS':True,
            'ALERT_EMAIL_ENABLED':True,'ALERT_RECIPIENT':'office@example.com',
            'SMTP_USERNAME':'sender@example.com','SMTP_PASSWORD':'fictional-secret',
            'ALERT_SENDER':self.sender,'START_ALERT_WORKER':False}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.headers = {'Origin':'https://refer.example.com'}

    def tearDown(self):
        self.tmp.cleanup()

    def submit(self):
        data={'name':'Fictional Patient','email':'parent@example.com','phone':'8015550100',
              'notes':'PRIVATE TEST NOTES','consent':True,'submissionId':str(uuid.uuid4())}
        return data, self.client.post('/api/referrals',json=data,headers=self.headers)

    def test_submission_atomically_queues_one_generic_alert(self):
        data,response=self.submit()
        self.assertEqual(response.status_code,201)
        self.client.post('/api/referrals',json=data,headers=self.headers)
        records=self.store.list('records',prefix='ref-')
        alerts=self.store.list('records',prefix='alert-')
        self.assertEqual(len(records),1)
        self.assertEqual(len(alerts),1)
        self.assertNotIn('Fictional Patient',json.dumps(alerts))
        self.assertNotIn('parent@example.com',json.dumps(alerts))
        self.assertNotIn('PRIVATE TEST NOTES',json.dumps(alerts))
        self.sender.send.assert_not_called()

    def test_azure_transaction_duplicate_is_idempotent(self):
        from azure.data.tables import TableTransactionError
        data,response=self.submit()
        error=TableTransactionError(message='duplicate')
        error.status_code=409
        with patch.object(self.store,'create_referral',side_effect=error):
            self.assertEqual(self.client.post('/api/referrals',json=data,headers=self.headers).status_code,201)

    def test_transaction_failure_rolls_back_record(self):
        record={'PartitionKey':'records','RowKey':'ref-test'}
        alert=new_alert('alert-existing');self.store.create(alert)
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.create_referral(record,alert)
        self.assertIsNone(self.store.get('records','ref-test'))

    def test_success_is_not_sent_again(self):
        self.submit()
        self.assertEqual(process_alerts(self.store,self.sender,self.logger),1)
        self.assertEqual(process_alerts(self.store,self.sender,self.logger),0)
        self.sender.send.assert_called_once()
        self.assertEqual(self.store.list('records',prefix='alert-')[0]['state'],'Accepted')

    def test_mail_failure_does_not_lose_referral_and_retries(self):
        self.submit()
        self.sender.send.side_effect=RuntimeError('secret password must not be logged')
        with self.assertLogs('test-alerts',level='WARNING') as logs:
            process_alerts(self.store,self.sender,self.logger)
        self.assertNotIn('secret password',str(logs.output))
        self.assertEqual(len(self.store.list('records',prefix='ref-')),1)
        alert=self.store.list('records',prefix='alert-')[0]
        self.assertEqual(alert['state'],'Retry')
        self.assertEqual(process_alerts(self.store,self.sender,self.logger),0)
        self.sender.send.side_effect=None
        self.assertEqual(process_alerts(self.store,self.sender,self.logger,clock=lambda:alert['readyAt']+1),1)

    def test_compare_and_swap_prevents_two_workers_claiming(self):
        alert=new_alert();self.store.create(alert)
        snapshot=copy.deepcopy(alert)
        first=copy.deepcopy(alert);first.update(state='Sending',readyAt=time.time()+300)
        self.assertTrue(self.store.replace_alert(alert,first))
        self.assertFalse(self.store.replace_alert(snapshot,copy.deepcopy(snapshot)))

    def test_expired_worker_lease_is_retried_after_restart(self):
        alert=new_alert();alert.update(state='Sending',readyAt=time.time()+300)
        self.store.create(alert)
        self.assertEqual(process_alerts(self.store,self.sender,self.logger),0)
        self.assertEqual(process_alerts(self.store,self.sender,self.logger,clock=lambda:alert['readyAt']+1),1)

    def test_disabled_alerts_do_not_queue(self):
        self.app.config['ALERT_EMAIL_ENABLED']=False
        self.submit()
        self.assertEqual(self.store.list('records',prefix='alert-'),[])

    def test_test_alert_requires_staff_and_same_origin(self):
        self.assertEqual(self.client.post('/api/staff/alerts/test',json={}).status_code,403)
        production=create_app(dict(self.config,DEMO=False,TENANT_ID='tenant',STAFF_IDS={'staff'})).test_client()
        self.assertEqual(production.post('/api/staff/alerts/test',json={},headers=self.headers).status_code,401)
        self.assertEqual(production.get('/api/staff/alerts').status_code,401)
        self.assertEqual(self.client.post('/api/staff/alerts/test',json={},headers=self.headers).status_code,202)
        self.assertEqual(len(self.store.list('records',prefix='ref-')),0)
        self.assertEqual(len(self.store.list('records',prefix='alert-')),1)

    def test_smtp_message_contains_no_patient_details_and_uses_tls(self):
        config=dict(self.config,SMTP_HOST='smtp.gmail.com',SMTP_PORT='465')
        sender=SmtpSender(config)
        alert=new_alert('alert-private-reference')
        with patch('notifications.smtplib.SMTP_SSL') as smtp:
            session=smtp.return_value.__enter__.return_value
            session.send_message.return_value={}
            sender.send(alert)
            message=session.send_message.call_args.args[0]
            text=message.as_string()
            self.assertIn('https://refer.example.com/staff/login',text)
            self.assertNotIn('private-reference',text)
            self.assertNotIn('Fictional Patient',text)
            self.assertNotIn('PRIVATE TEST NOTES',text)
            self.assertEqual(message['To'],'office@example.com')
            self.assertEqual(message['From'],'sender@example.com')
            self.assertIsNotNone(smtp.call_args.kwargs['context'])
            session.login.assert_called_once_with('sender@example.com','fictional-secret')
            original_id=message['Message-ID']
            sender.send(alert)
            self.assertEqual(session.send_message.call_args.args[0]['Message-ID'],original_id)

    def test_header_injection_in_email_configuration_is_rejected(self):
        with self.assertRaises(ValueError):
            SmtpSender(dict(self.config,SMTP_HOST='smtp.gmail.com',SMTP_PORT=465,
                            ALERT_RECIPIENT='office@example.com\r\nBcc:bad@example.com'))

    def test_azure_pending_query_excludes_sent_and_active_leases(self):
        from app import AzureStore
        store=AzureStore.__new__(AzureStore)
        store.table=MagicMock()
        store.table.query_entities.return_value=[]
        self.assertEqual(store.pending_alerts(1000.0),[])
        args,kwargs=store.table.query_entities.call_args
        self.assertIn("state ne 'Accepted'",args[0])
        self.assertIn('readyAt le @now',args[0])
        self.assertEqual(kwargs['parameters'],{'now':1000.0})

    def test_azure_atomic_write_includes_referral_and_alert(self):
        from app import AzureStore
        store=AzureStore.__new__(AzureStore);store.table=MagicMock()
        record={'PartitionKey':'records','RowKey':'ref-test'};alert=new_alert()
        store.create_referral(record,alert)
        store.table.submit_transaction.assert_called_once_with([('create',record),('create',alert)])


if __name__ == '__main__':
    unittest.main()
