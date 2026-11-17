"""수급 갱신 이어 달리기 (2026-11-17).

깃허브 예약(cron)이 몇 시간씩 밀려 장중 30분 갱신이 하루 2~3번만 돌았다.
flow.yml 이 끝날 때마다 다음 정해진 시각까지 기다렸다가 자기 자신을 다시 실행시킨다.
첫 시작은 국장 브리핑 push(09:20·15:45, 지연 없음)이 걸어 준다. 예약은 백업으로 남긴다.
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')


def slots(day):
    out = []
    for h in range(9, 16):
        for m in (0, 30):
            if (h, m) <= (15, 30):
                out.append(day.replace(hour=h, minute=m, second=0, microsecond=0))
    out.append(day.replace(hour=16, minute=0, second=0, microsecond=0))
    out.append(day.replace(hour=19, minute=0, second=0, microsecond=0))
    return out


def next_slot(now_kst, holidays=()):
    """지금 이후 첫 갱신 시각. 주말·휴장일이면 None (다음 날 시작은 브리핑 push 가 맡는다)."""
    if now_kst.weekday() >= 5 or now_kst.strftime('%Y-%m-%d') in holidays:
        return None
    for s in slots(now_kst):
        if s > now_kst + timedelta(seconds=60):
            return s
    return None


def others_waiting(repo, self_id):
    out = subprocess.check_output(['gh', 'run', 'list', '-R', repo, '-w', 'flow.yml', '-L', '10',
                                   '--json', 'databaseId,status'], text=True)
    return any(r['databaseId'] != self_id and r['status'] in ('queued', 'pending', 'waiting', 'requested')
               for r in json.loads(out))


def main():
    sys.path.insert(0, os.path.dirname(__file__))
    try:
        from update_events import KRX_HOLIDAYS
    except Exception:
        KRX_HOLIDAYS = {}
    now = datetime.now(timezone.utc).astimezone(KST)
    nxt = next_slot(now, KRX_HOLIDAYS)
    if not nxt:
        print('오늘 남은 갱신 시각 없음 · 이어 달리기 종료', flush=True)
        return
    repo, self_id = os.environ['R'], int(os.environ.get('RUN_ID', '0'))
    wait = int((nxt - now).total_seconds())
    print(f'다음 갱신 {nxt:%H:%M} KST · {wait}초 대기', flush=True)
    time.sleep(wait)
    if others_waiting(repo, self_id):
        print('이미 대기 중인 수급 갱신이 있어 이어 달리기 생략', flush=True)
        return
    subprocess.run(['gh', 'workflow', 'run', 'flow.yml', '-R', repo, '--ref', 'main', '-f', 'chain=yes'], check=True)
    print('다음 수급 갱신 실행 신호 보냄', flush=True)


if __name__ == '__main__':
    main()
