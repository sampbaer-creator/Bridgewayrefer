import tempfile
import unittest
from datetime import date
from unittest.mock import MagicMock

from app import LocalStore, AzureStore, create_app
from reporting import build_month_report

TODAY=date(2026,11,5)
DOCTORS=[{'RowKey':'office-a','name':'Office A','active':True},
         {'RowKey':'office-b','name':'Office B','active':False},
         {'RowKey':'office-zero','name':'Zero Office','active':True}]


def referral(key,office,created,status='New'):
    return {'PartitionKey':'records','RowKey':'ref-'+key,'doctorCode':office,
            'doctorName':'Snapshot '+office,'createdAt':created,'status':status,
            'name':'PRIVATE PATIENT','email':'PRIVATE EMAIL','phone':'PRIVATE PHONE','notes':'PRIVATE NOTES'}


class ReportingTests(unittest.TestCase):
    def test_twelve_month_trend_and_previous_month_comparison(self):
        rows=[referral('a','office-a','2025-12-15T15:00:00+00:00'),
              referral('b','office-b','2026-10-15T15:00:00+00:00'),
              referral('c','office-a','2026-11-03T15:00:00+00:00')]
        report=build_month_report(rows,DOCTORS,'2026-11',TODAY)
        self.assertEqual(len(report['trend']),12)
        self.assertEqual(report['trend'][0]['month'],'2025-12')
        self.assertEqual(report['trend'][-1]['month'],'2026-11')
        self.assertEqual(report['previousTotal'],1)
        self.assertEqual(report['trend'][1]['total'],0)
        self.assertEqual(report['trend'][-2]['offices']['office-b'],1)
        self.assertEqual(report['trend'][-1]['offices']['office-b'],0)
        self.assertNotIn('PRIVATE',str(report['trend']))


    def test_office_counts_and_running_totals_are_based_on_submission(self):
        rows=[referral('1','office-a','2026-11-01T15:00:00+00:00','Closed'),
              referral('2','office-a','2026-11-03T15:00:00+00:00','Scheduled'),
              referral('3','office-b','2026-11-03T15:00:00+00:00'),
              referral('4','office-b','2026-10-15T15:00:00+00:00')]
        report=build_month_report(rows,DOCTORS,'2026-11',TODAY)
        offices={r['officeId']:r for r in report['offices']}
        self.assertEqual(report['total'],3)
        self.assertEqual(report['referringOffices'],2)
        self.assertEqual(offices['office-a']['cumulative'],[1,1,2,2,2])
        self.assertEqual(offices['office-b']['count'],1)
        self.assertEqual(offices['office-zero']['count'],0)
        self.assertFalse(offices['office-b']['active'])
        self.assertNotIn('PRIVATE',str(report))

    def test_mountain_time_month_boundaries_before_and_after_dst(self):
        rows=[referral('1','office-a','2026-11-01T05:59:59Z'), # Oct 31 11:59 MDT
              referral('2','office-a','2026-11-01T06:00:00Z'), # Nov 1 midnight MDT
              referral('3','office-b','2026-12-01T06:59:59Z'), # Nov 30 11:59 MST
              referral('4','office-b','2026-12-01T07:00:00Z')] # Dec 1 midnight MST
        self.assertEqual(build_month_report(rows,DOCTORS,'2026-10',TODAY)['total'],1)
        self.assertEqual(build_month_report(rows,DOCTORS,'2026-11',TODAY)['total'],2)
        december=build_month_report(rows,DOCTORS,'2026-12',TODAY)
        self.assertEqual(december['total'],1)
        self.assertEqual(len(december['days']),31)

    def test_previous_months_have_their_own_counts(self):
        rows=[referral('1','office-a','2026-09-15T15:00:00Z'),referral('2','office-b','2026-10-15T15:00:00Z')]
        september=build_month_report(rows,DOCTORS,'2026-09',TODAY)
        october=build_month_report(rows,DOCTORS,'2026-10',TODAY)
        self.assertEqual(september['offices'][0]['officeId'],'office-a')
        self.assertEqual(october['offices'][0]['officeId'],'office-b')
        self.assertEqual(len(september['days']),30)
        self.assertEqual(build_month_report(rows,DOCTORS,'2026-08',TODAY)['total'],0)
        self.assertIn('2026-08',september['availableMonths'])

    def test_counts_are_not_truncated_by_inbox_limit(self):
        report=build_month_report((referral(str(i),'office-a','2026-11-02T15:00:00Z') for i in range(12002)),DOCTORS,'2026-11',TODAY)
        self.assertEqual(report['total'],12002)

    def test_card_id_not_name_defines_office(self):
        doctors=[{'RowKey':'a','name':'Same Name'},{'RowKey':'b','name':'Same Name'}]
        report=build_month_report([referral('1','a','2026-11-03T15:00:00Z'),referral('2','b','2026-11-03T15:00:00Z')],doctors,'2026-11',TODAY)
        self.assertEqual(len(report['offices']),2)
        self.assertEqual([r['count'] for r in report['offices']],[1,1])

    def test_direct_and_former_offices_retain_history(self):
        report=build_month_report([referral('1','','2026-11-03T15:00:00Z'),referral('2','former','2026-11-03T15:00:00Z')],[],'2026-11',TODAY)
        self.assertEqual(report['total'],2)
        self.assertEqual(report['referringOffices'],1)
        self.assertEqual({r['name'] for r in report['offices']},{'Direct requests','Snapshot former'})

    def test_empty_months_and_leap_year(self):
        report=build_month_report([],[],'2024-02',TODAY)
        self.assertEqual(report['total'],0)
        self.assertEqual(len(report['days']),29)
        self.assertEqual(len(build_month_report([],[],None,TODAY)['availableMonths']),12)

    def test_invalid_dates_are_reported_without_patient_values(self):
        report=build_month_report([referral('1','office-a','broken')],DOCTORS,'2026-11',TODAY)
        self.assertEqual(report['invalidDates'],1)
        self.assertEqual(report['total'],0)
        self.assertNotIn('PRIVATE',str(report))

    def test_azure_projection_includes_no_patient_fields_or_page_cap(self):
        store=AzureStore.__new__(AzureStore);store.table=MagicMock()
        marker=iter([{'createdAt':'2026-11-03T15:00:00Z'}]);store.table.query_entities.return_value=marker
        self.assertIs(store.iter_referral_summaries(),marker)
        _,kwargs=store.table.query_entities.call_args
        self.assertEqual(kwargs['select'],['RowKey','doctorCode','doctorName','createdAt'])

    def test_api_auth_validation_and_audit(self):
        with tempfile.TemporaryDirectory() as directory:
            store=LocalStore(directory+'/test.sqlite3')
            store.create(referral('1','office-a','2026-11-03T15:00:00Z'))
            app=create_app({'TESTING':True,'DEMO':True,'STORE':store,'ALERT_EMAIL_ENABLED':False})
            client=app.test_client()
            response=client.get('/api/staff/analytics?month=2026-11')
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json['total'],1)
            self.assertNotIn('PRIVATE',response.text)
            self.assertTrue(any(e.get('action')=='monthly-referral-counts' for e in store.list('records')))
            for month in ['bad','2026-00','2026-13','9999-12','../../x']:
                self.assertEqual(client.get('/api/staff/analytics',query_string={'month':month}).status_code,400)
            locked=create_app({'TESTING':True,'DEMO':False,'STORE':store,'TENANT_ID':'tenant','STAFF_IDS':{'staff'}}).test_client()
            self.assertEqual(locked.get('/api/staff/analytics').status_code,401)


if __name__=='__main__':unittest.main()
