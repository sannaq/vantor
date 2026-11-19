import sys
import unittest
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from flow_chain import next_slot, plan, MAX_WAIT_SEC, KST

H = {'2026-12-25'}


def t(s):
    return datetime.fromisoformat(s).replace(tzinfo=KST)


class FlowChainTests(unittest.TestCase):
    def test_intraday_and_evening(self):
        self.assertEqual(next_slot(t('2026-11-19 09:05')), t('2026-11-19 09:30'))
        self.assertEqual(next_slot(t('2026-11-19 16:05')), t('2026-11-19 19:00'))
        self.assertEqual(next_slot(t('2026-11-19 19:05')), t('2026-11-19 20:00'))

    def test_evening_skipped_when_smart_already_in(self):
        self.assertEqual(next_slot(t('2026-11-19 20:05'), skip_evening_today=True), t('2026-11-20 09:00'))

    def test_night_and_weekend_continue_to_next_session(self):
        # 11/19 (목) 밤 → 다음 날 09:00, 11/20 (금) 밤 → 월요일 09:00, 휴장일 건너뜀
        self.assertEqual(next_slot(t('2026-11-19 23:05')), t('2026-11-20 09:00'))
        self.assertEqual(next_slot(t('2026-11-20 23:05')), t('2026-11-23 09:00'))
        self.assertEqual(next_slot(t('2026-12-24 23:05'), H), t('2026-12-28 09:00'))

    def test_far_target_hops_within_limit(self):
        nxt, wait, kind = plan(t('2026-11-19 23:05'), (), False)
        self.assertEqual((nxt, wait, kind), (t('2026-11-20 09:00'), MAX_WAIT_SEC, 'hop'))
        nxt, wait, kind = plan(t('2026-11-20 08:15'), (), False)
        self.assertEqual((nxt, wait, kind), (t('2026-11-20 09:00'), 45 * 60, 'run'))
        self.assertLess(MAX_WAIT_SEC, 200 * 60)  # chain 작업 timeout-minutes(200) 안


if __name__ == '__main__':
    unittest.main()
