import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path
spec = importlib.util.spec_from_file_location('health', Path(__file__).resolve().parents[1] / 'scripts/automation_health.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

class HealthTest(unittest.TestCase):
    def test_stale_price_despite_recent_save(self):
        self.assertEqual(h.assess('US', {'valuationDate':'20261120','sourceDate':'20261123','updatedAt':'2026-11-24'}, {'date':'20261123'})['status'], 'delayed')
    def test_stale_signal_and_failed_update(self):
        for s in [{'valuationDate':'20261123','lastSignalDate':'20261120'}, {'valuationDate':'20261123','lastSignalDate':'20261123','status':'update_failed'}]:
            self.assertEqual(h.assess('US', s, {'date':'20261123'})['status'], 'delayed')
    def test_current_weekend_and_waiting_ai_are_not_delayed(self):
        self.assertEqual(h.assess('US', {'valuationDate':'20261120','sourceDate':'20261120','status':'waiting_evidence'}, {'date':'20261120'})['status'], 'current')
    def test_missing_source_is_unknown(self):
        self.assertEqual(h.assess('US', {}, {})['status'], 'unknown')
    def test_active_and_cooldown_block_duplicates(self):
        now = datetime(2026,11,24,8,tzinfo=timezone.utc)
        self.assertFalse(h.recovery_allowed([{'status':'queued'}],now)[0])
        self.assertFalse(h.recovery_allowed([{'status':'completed','created_at':'2026-11-24T07:30:00Z'}],now)[0])
        self.assertTrue(h.recovery_allowed([{'status':'completed','created_at':'2026-11-24T06:30:00Z'}],now)[0])

    def test_recovery_requests_once_for_shared_workflow(self):
        import base64
        from unittest.mock import patch
        calls = []
        def fake(path, method='GET', body=None):
            calls.append((path, method))
            if '/contents/' in path:
                value = {'date':'20261123'} if '/stock-' in path else {'valuationDate':'20261120','sourceDate':'20261120'}
                return {'content':base64.b64encode(h.json.dumps(value).encode()).decode()}
            if '/runs?' in path: return {'workflow_runs':[]}
        with patch.dict(h.os.environ, {'GITHUB_REPOSITORY':'test/repo','ALERT_CONFIGURED':'false'}), patch.object(h,'api',side_effect=fake), patch.object(h.Path,'write_text') as write:
            h.main()
            report=h.json.loads(write.call_args.args[0])
        self.assertEqual(sum(method=='POST' and '/paper.yml/' in path for path,method in calls),1)
        self.assertEqual(sum(method=='POST' and '/formula-paper.yml/' in path for path,method in calls),1)
        self.assertFalse(report['failureAlertConfigured'])
        self.assertEqual(len(report['accounts']),3)
        self.assertTrue(all(row['recovery']=='갱신 재요청' for row in report['accounts']))

    def test_read_error_is_public_unknown_without_sensitive_error(self):
        from unittest.mock import patch
        with patch.dict(h.os.environ, {'GITHUB_REPOSITORY':'test/repo','ALERT_CONFIGURED':'true'}), patch.object(h,'api',side_effect=RuntimeError('secret payload must not leak')), patch.object(h.Path,'write_text') as write:
            with self.assertRaises(SystemExit): h.main()
            report=write.call_args.args[0]
        self.assertNotIn('secret payload',report)
        self.assertTrue(all(row['status']=='unknown' for row in h.json.loads(report)['accounts']))
