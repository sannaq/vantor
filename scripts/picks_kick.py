"""Briefing-driven recommendation dispatch, with duplicate/publication checks."""
import base64
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from automation_schedule import session_date


def kick_plan(now, trigger=""):
    # The KR-only fallback may arrive after midnight; session_date still finds the closed session.
    if trigger == "schedule":
        return "KR", 0
    local = now.astimezone(ZoneInfo('Asia/Seoul'))
    hm = local.hour * 100 + local.minute
    if local.weekday() < 5 and hm >= 1500:
        deadline = local.replace(hour=16, minute=41, second=0, microsecond=0)
        return 'KR', max(0, int((deadline - local).total_seconds()))
    if 2 <= local.isoweekday() <= 6 and 700 <= hm < 1500:
        return 'US', 0
    return None, 0


def main():
    now = datetime.now(timezone.utc)
    market, delay = kick_plan(now, os.environ.get("TRIGGER", ""))
    print(f'KST {now.astimezone(ZoneInfo("Asia/Seoul")).isoformat()} · market={market}', flush=True)
    if not market:
        print('추천 신호 시간대 아님', flush=True)
        return
    if delay:
        print(f'16:41까지 {delay}초 대기', flush=True)
        time.sleep(delay)
    # Read the latest remote publication after waiting, not the initial checkout.
    repo = os.environ['R']
    suffix = '-us' if market == 'US' else ''
    response = subprocess.check_output(['gh', 'api', f'repos/{repo}/contents/feeds/stock-picks{suffix}.json?ref=main'], text=True)
    data = json.loads(base64.b64decode(json.loads(response)['content']))
    target = session_date(datetime.now(timezone.utc), market)
    if data.get('date', '') >= target:
        print(f'{market}: {target} 이미 발행 · 중복 신호 생략', flush=True)
        return
    workflow = 'picks-us.yml' if market == 'US' else 'picks.yml'
    send = os.environ.get('SEND', 'no')
    if send not in ('yes', 'no'):
        raise ValueError('invalid send input')
    subprocess.run(['gh', 'workflow', 'run', workflow, '-R', repo, '--ref', 'main', '-f', f'send={send}', '-f', 'force=no'], check=True)
    print(('미장' if market == 'US' else '국장') + ' 추천 실행 신호 보냄', flush=True)


if __name__ == '__main__':
    main()
