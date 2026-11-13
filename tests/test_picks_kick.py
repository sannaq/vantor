import base64
import json
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from picks_kick import kick_plan, main

class KickTests(unittest.TestCase):
    def test_windows(self):
        for stamp, expected in [
            ('2026-11-13T09:20:00+09:00', ('US', 0)),
            ('2026-11-13T15:45:00+09:00', ('KR', 56*60)),
            ('2026-11-13T15:00:00+09:00', ('KR', 101*60)),
            ('2026-11-13T16:41:00+09:00', ('KR', 0)),
            ('2026-11-13T17:00:00+09:00', ('KR', 0)),
            ('2026-11-14T09:20:00+09:00', ('US', 0)),
            ('2026-11-14T16:41:00+09:00', (None, 0)),
            ('2026-11-16T09:20:00+09:00', (None, 0)),
            ('2026-11-13T06:59:00+09:00', (None, 0))]:
            with self.subTest(stamp=stamp):
                self.assertEqual(kick_plan(datetime.fromisoformat(stamp)), expected)
    def test_duplicate_and_no_message_recovery(self):
        for published, calls in [('20261113', 0), ('20261112', 1)]:
            response=json.dumps({'content':base64.b64encode(json.dumps({'date':published}).encode()).decode()})
            with patch.dict(os.environ, {'R':'sannaq/vantor','SEND':'no'}), patch('picks_kick.kick_plan', return_value=('KR', 0)), patch('picks_kick.session_date', return_value='20261113'), patch('picks_kick.subprocess.check_output', return_value=response), patch('picks_kick.subprocess.run') as run:
                main()
                self.assertEqual(run.call_count, calls)
                if calls:
                    self.assertIn('send=no',run.call_args.args[0])
                    self.assertIn('force=no',run.call_args.args[0])
                    self.assertIn('picks.yml',run.call_args.args[0])
    def test_failed_publication_read_never_dispatches(self):
        with patch.dict(os.environ, {'R':'sannaq/vantor'}), patch('picks_kick.kick_plan', return_value=('US', 0)), patch('picks_kick.subprocess.check_output', side_effect=RuntimeError('unavailable')), patch('picks_kick.subprocess.run') as run:
            with self.assertRaises(RuntimeError):main()
            run.assert_not_called()
