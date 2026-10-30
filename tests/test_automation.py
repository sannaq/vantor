import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from automation_schedule import session_date
from us_brief import pick_slot
from kr_brief import target, build
from unittest.mock import patch

class ScheduleTests(unittest.TestCase):
    def test_kr_midnight_retry(self):
        self.assertEqual(session_date(datetime.fromisoformat('2026-10-31T01:00:00+09:00'), 'KR'), '20261030')
    def test_us_midnight_retry(self):
        self.assertEqual(session_date(datetime.fromisoformat('2026-10-30T01:00:00-04:00'), 'US'), '20261029')
    def test_weekend_and_holiday(self):
        self.assertEqual(session_date(datetime.fromisoformat('2026-11-26T20:00:00-05:00'), 'US'), '20261125')
        self.assertEqual(session_date(datetime.fromisoformat('2026-11-01T10:00:00+09:00'), 'KR'), '20261030')
    def test_delayed_us_brief(self):
        self.assertEqual(pick_slot(datetime.fromisoformat('2026-10-30T15:20:00-04:00')), 'mid')
        self.assertEqual(pick_slot(datetime.fromisoformat('2026-10-30T21:15:00-04:00')), 'close')
    def test_no_fake_premarket_after_open(self):
        self.assertIsNone(pick_slot(datetime.fromisoformat('2026-10-30T10:00:00-04:00')))
    def test_kr_current_slot_only(self):
        day,slot=target(datetime.fromisoformat('2026-10-31T01:00:00+09:00'))
        self.assertEqual((day.isoformat(),slot),('2026-10-30','pm'))
        self.assertEqual(target(datetime.fromisoformat('2026-10-30T14:00:00+09:00'))[1], 'noon')
    def test_stale_kr_source_is_rejected(self):
        now=datetime.fromisoformat('2026-10-30T17:00:00+09:00')
        with patch('kr_brief.get',return_value={'localTradedAt':'2026-10-29T15:30:00+09:00','closePrice':'5000'}):
            with self.assertRaises(RuntimeError):build(now,now.date(),'pm')

if __name__=='__main__':unittest.main()
