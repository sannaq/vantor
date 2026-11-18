"""수급 디스코드 알림 (2026-11-18 사용자 결정: 장중 시장 전체 급변 + 저녁 종목별 확정 수급, 브리핑 채널).

flow.yml 에서 update_flow.py 직후에 돈다. 커밋 전 feeds/flow.json(새 값)을 git HEAD 의 것(직전 값)과 비교한다.
- 장중(09:00~15:40): 같은 날 직전 갱신 대비 외국인·기관 순매수가 기준 이상 움직이면 한 번 보낸다.
  지금 자료는 코스피·코스닥 시장 합계뿐이라 종목 이름은 없다 (종목별 장중 잠정치는 받지 않음).
- 종목별 확정 수급(smart)의 날짜가 바뀌면 외국인·기관 순매수·순매도 상위를 보낸다 (보통 19:00 실행).
DISCORD_BRIEF_WEBHOOK 이 없으면 보내지 않고 출력만 한다. 실패해도 갱신 작업은 막지 않는다.
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')
OUT = 'feeds/flow.json'
# 30분 사이 움직임 기준 (억원). 너무 자주 오면 올리고, 안 오면 내린다.
STEP = {'KOSPI': 1500, 'KOSDAQ': 400}
WHO = ((2, '외국인'), (3, '기관'))


def old_flow():
    try:
        return json.loads(subprocess.check_output(['git', 'show', f'HEAD:{OUT}'], text=True))
    except Exception:
        return {}


def eok(v):
    return f"{'+' if v > 0 else ''}{v:,}억"


def intraday(old, new, now):
    if not (9 * 60 <= now.hour * 60 + now.minute <= 15 * 60 + 40):
        return None
    if not new.get('invDate') or new.get('invDate') != old.get('invDate') or new['invDate'] != now.strftime('%Y%m%d'):
        return None  # 그날 첫 갱신은 비교 기준이 없다
    prev = {r[0]: r for r in old.get('inv') or []}
    lines = []
    for r in new.get('inv') or []:
        p = prev.get(r[0])
        if not p:
            continue
        for i, nm in WHO:
            d = r[i] - p[i]
            if abs(d) >= STEP.get(r[0], 10 ** 9):
                lines.append(f"**{r[0]} {nm}** 직전 갱신 뒤 {eok(d)} → 누적 {eok(r[i])} ({'순매수' if d > 0 else '순매도'} 쪽으로)")
    if not lines:
        return None
    return f"⚡ 장중 수급 급변 · {now:%H:%M}\n" + '\n'.join(lines)


def evening(old, new):
    sm, osm = new.get('smart') or {}, old.get('smart') or {}
    if not sm.get('date') or sm.get('date') == osm.get('date'):
        return None
    d = sm['date']
    top = lambda k: ' · '.join(f"{n} {v:,}" for n, v in (sm.get(k) or [])[:5]) or '—'
    return (f"📊 종목별 수급 확정 ({int(d[4:6])}/{int(d[6:8])}, 억원)\n"
            f"외국인 순매수: {top('foreign')}\n외국인 순매도: {top('foreignSell')}\n"
            f"기관 순매수: {top('inst')}\n기관 순매도: {top('instSell')}")


def post(text):
    hook = os.environ.get('DISCORD_BRIEF_WEBHOOK', '').strip()
    print(text, flush=True)
    if not hook:
        print('(웹훅 없음 · 보내지 않음)')
        return
    body = json.dumps({'content': text[:1900]}).encode()
    req = urllib.request.Request(hook, data=body, method='POST',
                                 headers={'Content-Type': 'application/json', 'User-Agent': 'vantor-flow-alert'})
    urllib.request.urlopen(req, timeout=20).read()


def main():
    try:
        new = json.load(open(OUT, encoding='utf-8'))
    except Exception as e:
        print('flow.json 읽기 실패:', e)
        return 0
    old, now = old_flow(), datetime.now(KST)
    for msg in (intraday(old, new, now), evening(old, new)):
        if msg:
            try:
                post(msg)
            except Exception as e:
                print('디스코드 전송 실패:', e, file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
