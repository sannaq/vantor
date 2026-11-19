"""수급 갱신 이어 달리기 (2026-11-17).

깃허브 예약(cron)이 몇 시간씩 밀려 장중 30분 갱신이 하루 2~3번만 돌았다.
flow.yml 이 끝날 때마다 다음 정해진 시각까지 기다렸다가 자기 자신을 다시 실행시킨다. 예약은 백업으로 남긴다.

(11/19 사용자 결정) 종목별 수급(smart)은 19:00 에도 안 올라오는 날이 많아(11/16치 22:02, 11/17치 다음 날 00:46)
20:00~23:00 매시 정각에 다시 확인한다. 그날치가 이미 들어왔으면 그날 저녁 확인은 건너뛴다.

(11/19 고장 수리) 예전엔 하루 마지막 실행 뒤 사슬이 끊기고, 다음 날 첫 시작을 국장 아침 브리핑 push 에 맡겼다.
11/19 아침 브리핑이 안 올라오자 12:31 점심 브리핑까지 장중 수급이 한 번도 안 돌았다.
→ 이제 밤·주말에도 사슬을 끊지 않는다. 다음 시각이 대기 상한보다 멀면 상한만큼 기다렸다가 '건너뛰기(hop)' 실행을
  걸어 사슬만 이어 간다(hop 실행은 수급을 받지 않고 바로 다음 대기로 넘어간다). 공개 저장소라 실행 시간 비용은 없다.
→ 국장 브리핑 누락 복구(kr-brief.yml)도 깃허브 예약이 밀려 하루 3번쯤만 돌았다. 브리핑이 올라올 시각 뒤의
  갱신 때 복구 작업을 같이 걸어 준다(복구 작업은 이미 올라온 브리핑이면 스스로 건너뛴다).
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')
# chain 작업 timeout-minutes(200) 안에서 끝나야 한다.
MAX_WAIT_SEC = 185 * 60
# 19:00 확정 + 종목별 수급이 늦는 날을 위한 저녁 재확인 (11/19)
EVENING_HOURS = (19, 20, 21, 22, 23)
# 국장 브리핑(개장 09:20·장중 12:30·장마감 15:45) 이 올라올 시각 뒤 — 이때 누락 복구를 같이 건다
BRIEF_CHECK = {(9, 30), (10, 0), (12, 30), (13, 0), (16, 0)}


def slots(day):
    out = []
    for h in range(9, 16):
        for m in (0, 30):
            if (h, m) <= (15, 30):
                out.append(day.replace(hour=h, minute=m, second=0, microsecond=0))
    out.append(day.replace(hour=16, minute=0, second=0, microsecond=0))
    for h in EVENING_HOURS:
        out.append(day.replace(hour=h, minute=0, second=0, microsecond=0))
    return out


def is_session(day, holidays=()):
    return day.weekday() < 5 and day.strftime('%Y-%m-%d') not in holidays


def next_slot(now_kst, holidays=(), skip_evening_today=False):
    """지금 이후 첫 갱신 시각 (주말·휴장일은 건너뛰고 다음 거래일까지 본다)."""
    for d in range(0, 15):
        day = now_kst + timedelta(days=d)
        if not is_session(day, holidays):
            continue
        for s in slots(day):
            if s <= now_kst + timedelta(seconds=60):
                continue
            if d == 0 and skip_evening_today and s.hour >= 20:
                continue
            return s
    return None


def smart_date(repo):
    """main 에 올라간 feeds/flow.json 의 종목별 수급 날짜(YYYYMMDD). 못 읽으면 None."""
    try:
        out = subprocess.check_output(['gh', 'api', f'repos/{repo}/contents/feeds/flow.json?ref=main',
                                       '-H', 'Accept: application/vnd.github.raw'], text=True, timeout=60)
        return (json.loads(out).get('smart') or {}).get('date')
    except Exception as e:
        print('종목별 수급 날짜 확인 실패 · 저녁 확인은 계속:', e, flush=True)
        return None


def others_waiting(repo, self_id):
    out = subprocess.check_output(['gh', 'run', 'list', '-R', repo, '-w', 'flow.yml', '-L', '10',
                                   '--json', 'databaseId,status'], text=True)
    return any(r['databaseId'] != self_id and r['status'] in ('queued', 'pending', 'waiting', 'requested')
               for r in json.loads(out))


def plan(now, holidays, smart_today):
    """(목표 시각, 기다릴 초, 'run'|'hop'). 목표가 대기 상한보다 멀면 상한만 기다리고 hop."""
    nxt = next_slot(now, holidays, skip_evening_today=smart_today)
    if not nxt:
        return None, 0, None
    wait = int((nxt - now).total_seconds())
    if wait > MAX_WAIT_SEC:
        return nxt, MAX_WAIT_SEC, 'hop'
    return nxt, wait, 'run'


def main():
    sys.path.insert(0, os.path.dirname(__file__))
    try:
        from update_events import KRX_HOLIDAYS
    except Exception:
        KRX_HOLIDAYS = {}
    repo, self_id = os.environ['R'], int(os.environ.get('RUN_ID', '0'))
    now = datetime.now(timezone.utc).astimezone(KST)
    smart_today = False
    nxt = next_slot(now, KRX_HOLIDAYS)
    if nxt and nxt.date() == now.date() and nxt.hour >= 20:
        smart_today = smart_date(repo) == now.strftime('%Y%m%d')
        if smart_today:
            print(f'오늘({now:%m/%d}) 종목별 수급이 이미 들어옴 · 오늘 저녁 확인은 건너뜀', flush=True)
    nxt, wait, kind = plan(now, KRX_HOLIDAYS, smart_today)
    if not nxt:
        print('앞으로 2주 안에 갱신할 거래일이 없음 · 이어 달리기 종료', flush=True)
        return
    if kind == 'hop':
        print(f'다음 갱신 {nxt:%m/%d %H:%M} KST 까지 {int((nxt - now).total_seconds()) // 60}분 · '
              f'{wait // 60}분 뒤 건너뛰기 실행으로 사슬만 잇는다', flush=True)
    else:
        print(f'다음 갱신 {nxt:%m/%d %H:%M} KST · {wait}초 대기', flush=True)
    time.sleep(wait)
    if others_waiting(repo, self_id):
        print('이미 대기 중인 수급 갱신이 있어 이어 달리기 생략', flush=True)
        return
    subprocess.run(['gh', 'workflow', 'run', 'flow.yml', '-R', repo, '--ref', 'main',
                    '-f', f"chain={'hop' if kind == 'hop' else 'yes'}"], check=True)
    print('다음 수급 ' + ('건너뛰기' if kind == 'hop' else '갱신') + ' 실행 신호 보냄', flush=True)
    if kind == 'run' and (nxt.hour, nxt.minute) in BRIEF_CHECK:
        r = subprocess.run(['gh', 'workflow', 'run', 'kr-brief.yml', '-R', repo, '--ref', 'main', '-f', 'send=yes'])
        print('국장 브리핑 누락 확인 ' + ('신호 보냄' if r.returncode == 0 else '신호 실패'), flush=True)


if __name__ == '__main__':
    main()
