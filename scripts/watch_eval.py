#!/usr/bin/env python3
"""위클리 캘린더·전망 기록 채점 → feeds/watch-eval.json (사이트 이벤트 화면 '🗓 위클리 캘린더'·'🎤 전망·발언 평가')

- feeds/calendar.json 의 지난 일정: 관련 뉴스 제목(feeds/news-all.json 에서 kw 로, 일정 날짜~3일 뒤)을 모아 두고,
  tk(미국 티커)가 있으면 발표 뒤 첫 거래일 주가 반응과 같은 날 나스닥100(QQQ) 대비를 잰다.
  실적 when=A(장 마감 후, 기본)는 다음 거래일 종가/그날 종가, when=B(장 전)는 그날 종가/전날 종가.
- feeds/claims.json 의 checks: 기간이 끝나면 적중·빗나감, 진행 중이면 지금까지 값을 쓴다.
뉴스는 30분마다 바뀌어 사라지므로 한 번 모은 제목은 지우지 않고 쌓는다(일정당 8개까지).
- 뉴스 자동 수집(2026-10-18 사용자 결정 '나'): WATCH 인물 이름 + 따옴표·발언 낱말이 든 기사 제목을 feeds/claims-auto.json 에 쌓고,
  낱말 사전으로 낙관·비관을 나눠 20거래일 뒤 지수(한국 인물 = 코스피, 그 밖 = S&P500) 방향으로 채점한다. 자동 분류라 틀릴 수 있다.
--news-only: 뉴스만 모은다(news.yml, 30분). 기본: 뉴스 + 시세 채점(events.yml, 매일 아침).
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone, timedelta, date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KST = timezone(timedelta(hours=9))
NEWS_ONLY = '--news-only' in sys.argv


def load(p, d=None):
    try:
        return json.load(open(os.path.join(ROOT, p), encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return d if d is not None else {}


_YC = {}


def yahoo(sym):
    """[(미국/현지 날짜, 종가)] 최근 2년"""
    if sym in _YC:
        return _YC[sym]
    out = []
    for k in range(3):
        try:
            host = 'query1' if k == 0 else 'query2'
            url = f'https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(sym)}?range=2y&interval=1d'
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (vantor-watch)'}), timeout=30) as r:
                j = json.loads(r.read().decode())['chart']['result'][0]
            off = timedelta(seconds=j['meta'].get('gmtoffset', 0))
            m = {}
            for ts, c in zip(j['timestamp'], j['indicators']['quote'][0]['close']):
                if c is not None:
                    m[(datetime.fromtimestamp(ts, timezone.utc) + off).strftime('%Y-%m-%d')] = c
            out = sorted(m.items())
            break
        except Exception:  # noqa: BLE001
            time.sleep(2 + 3 * k)
    time.sleep(0.6)
    _YC[sym] = out
    return out


def on_or_before(px, d):
    r = None
    for x in px:
        if x[0] <= d:
            r = x
        else:
            break
    return r


def idx_of(px, d):
    """d 당일(없으면 그 전) 위치"""
    k = None
    for i, x in enumerate(px):
        if x[0] <= d:
            k = i
        else:
            break
    return k


def reaction(tk, d, when):
    px = yahoo(tk)
    if not px:
        return None
    i = idx_of(px, d)
    if i is None:
        return None
    if when == 'B':  # 장 전 발표 → 그날 종가 / 전날 종가
        if px[i][0] != d or i == 0:
            return None
        a, b = px[i - 1], px[i]
    else:  # 장 마감 후 → 다음 거래일 종가 / 그날 종가
        if px[i][0] != d or i + 1 >= len(px):
            return None
        a, b = px[i], px[i + 1]
    return {'day': b[0], 'r': round((b[1] / a[1] - 1) * 100, 2), 'a': a[0]}


def vs_qqq(rx):
    q = yahoo('QQQ')
    a, b = on_or_before(q, rx['a']), on_or_before(q, rx['day'])
    if not a or not b or a[0] != rx['a'] or b[0] != rx['day']:
        return None
    return round(rx['r'] - (b[1] / a[1] - 1) * 100, 2)


def collect_news(kw, d0, old):
    """일정 날짜 하루 전 ~ 3일 뒤 사이 기사 중 kw 가 들어간 제목 (KR·USKO·US 전부)"""
    nw = load('feeds/news-all.json')
    lo = datetime.fromisoformat(d0).replace(tzinfo=KST) - timedelta(days=1)
    hi = lo + timedelta(days=5)
    got = {n['link']: n for n in (old or [])}
    for k in ('USKO', 'KR', 'US'):
        for n in nw.get(k) or []:
            t = datetime.fromtimestamp(n['t'] / 1000, KST)
            if not (lo <= t <= hi):
                continue
            ti = n.get('title', '')
            if any(w.lower() in ti.lower() for w in kw):
                got.setdefault(n['link'], {'title': ti, 'link': n['link'], 'src': n.get('src'), 't': n['t']})
    return sorted(got.values(), key=lambda x: x['t'])[:8]


def cmp(v, op, th):
    return v > th if op == '>' else v < th


def check(c, today):
    """→ {st: wait|hit|miss|nodata, val, txt}"""
    px = yahoo(c['sym'])
    if not px:
        return {'st': 'nodata'}
    last = px[-1][0]
    k = c['kind']
    if k == 'ret':
        a = on_or_before(px, c['from'])
        if not a or c['from'] > last:
            return {'st': 'wait', 'txt': '시작 전'}
        done = c['to'] <= last
        b = on_or_before(px, c['to']) if done else px[-1]
        v = round((b[1] / a[1] - 1) * 100, 2)
        return {'st': ('hit' if cmp(v, c['op'], c['v']) else 'miss') if done else 'wait', 'val': v, 'txt': f"{a[0]}→{b[0]} {v:+.2f}%"}
    if k == 'avg':
        xs = [p for d, p in px if c['from'] <= d <= c['to']]
        if not xs:
            return {'st': 'wait', 'txt': '시작 전'}
        v = round(sum(xs) / len(xs), 2)
        done = c['to'] <= last
        return {'st': ('hit' if cmp(v, c['op'], c['v']) else 'miss') if done else 'wait', 'val': v, 'txt': f"{len(xs)}일 평균 {v}"}
    if k == 'bottom':
        w0, w1 = c['win']
        seg = [(d, p) for d, p in px if w0 <= d <= c['to']]
        if not seg:
            return {'st': 'wait', 'txt': '시작 전'}
        lo = min(seg, key=lambda x: x[1])
        done = c['to'] <= last
        inwin = w0 <= lo[0] <= w1
        up = round((seg[-1][1] / lo[1] - 1) * 100, 2)
        txt = f"지금까지 최저 {lo[0]} ({lo[1]:,.0f}) · 그 뒤 {up:+.1f}%"
        if done:
            return {'st': 'hit' if inwin and up >= c['up'] else 'miss', 'val': up, 'txt': txt}
        return {'st': 'wait', 'val': up, 'txt': txt}
    if k == 'yearret':
        y = c['year']
        a = on_or_before(px, f'{y - 1}-12-31')
        if not a or last < f'{y}-01-02':
            return {'st': 'wait', 'txt': f'{y}년 시작 전'}
        done = last >= f'{y}-12-31' or today > date(y, 12, 31)
        b = on_or_before(px, f'{y}-12-31')
        v = round((b[1] / a[1] - 1) * 100, 2)
        return {'st': ('hit' if cmp(v, c['op'], c['v']) else 'miss') if done else 'wait', 'val': v, 'txt': f"{y}년 지금까지 {v:+.2f}%"}
    return {'st': 'nodata'}


# 지켜볼 인물: [표시 이름, 시장(KR=코스피·US=S&P500), 제목에서 찾을 낱말들]
WATCH = [
    ['폴 튜더 존스', 'US', ['튜더 존스', 'Tudor Jones']], ['워런 버핏', 'US', ['버핏', 'Buffett']], ['제이미 다이먼', 'US', ['다이먼', 'Dimon']],
    ['스탠리 드러켄밀러', 'US', ['드러켄밀러', 'Druckenmiller']], ['레이 달리오', 'US', ['달리오', 'Dalio']], ['캐시 우드', 'US', ['캐시 우드', 'Cathie Wood']],
    ['빌 애크먼', 'US', ['애크먼', 'Ackman']], ['마이클 버리', 'US', ['마이클 버리', 'Burry']], ['제러미 시겔', 'US', ['시겔', 'Siegel']],
    ['톰 리', 'US', ['톰 리', 'Tom Lee']], ['마이크 윌슨(모건스탠리)', 'US', ['마이크 윌슨', 'Mike Wilson']], ['데이비드 코스틴(골드만)', 'US', ['코스틴', 'Kostin']],
    ['제롬 파월', 'US', ['파월', 'Powell']], ['연준 의장', 'US', ['연준 의장', 'Fed Chair']], ['스콧 베센트', 'US', ['베센트', 'Bessent']],
    ['젠슨 황', 'US', ['젠슨 황', 'Jensen Huang']], ['일론 머스크', 'US', ['머스크', 'Musk']], ['래리 핑크', 'US', ['래리 핑크', 'Larry Fink']],
    ['이창용', 'KR', ['이창용']], ['신현송', 'KR', ['신현송']],
]
SAY = ['"', '“', '”', "'", '‘', '’', '말했', '밝혔', '전망', '경고', '예상', '예측', '주장', 'says', 'said', 'warns', 'predicts', 'sees', 'expects', 'thinks', 'believes']
BULL = ['랠리', '상승', '강세', '반등', '기회', '매수', '낙관', '호황', '오른다', '사라', '저점', '바닥', 'rally', 'bull', 'buy', 'upside', 'record high', 'optimis', 'opportunity', 'soar', 'boom']
BEAR = ['하락', '약세', '경고', '위기', '침체', '버블', '거품', '폭락', '조정', '하방', '우려', '매도', '최악', '비관', '위험', '팔아', 'bear', 'crash', 'recession', 'bubble', 'warn', 'downside', 'correction', 'sell', 'risk', 'worst', 'plunge', 'pessimis']


def tone(t):
    lo = t.lower()
    b = sum(1 for w in BULL if w.lower() in lo)
    r = sum(1 for w in BEAR if w.lower() in lo)
    return 1 if b > r else -1 if r > b else 0


def auto_collect(now):
    """news-all.json → claims-auto.json (쌓기만, 지우지 않음)"""
    A = load('feeds/claims-auto.json', {'v': 1, 'items': []})
    have = {x['link'] for x in A['items']}
    nw = load('feeds/news-all.json')
    for k in ('USKO', 'KR', 'US'):
        for n in nw.get(k) or []:
            ti = n.get('title', '')
            ko = any('가' <= ch <= '힣' for ch in ti)
            say = SAY if ko else ['"', '“', ' says', ' said', ' warns', ' predicts', ' sees ', ' expects', ' thinks', ' believes']  # 영어 제목의 ' 는 소유격이라 뺀다
            if n.get('link') in have or not any(w in ti or w in ti.lower() for w in say):
                continue
            for nm, mk, kws in WATCH:
                if any(w.lower() in ti.lower() for w in kws):
                    d = datetime.fromtimestamp(n['t'] / 1000, KST).strftime('%Y-%m-%d')
                    if sum(1 for x in A['items'] if x['who'] == nm and x['d'] == d) >= 3:  # 같은 사람·같은 날 3개까지
                        break
                    A['items'].append({'d': d, 'who': nm, 'mk': mk, 'title': ti, 'link': n['link'], 'src': n.get('src'), 'tone': tone(ti)})
                    have.add(n['link'])
                    break
    A['items'].sort(key=lambda x: x['d'], reverse=True)
    A['updated'] = now.strftime('%Y-%m-%d %H:%M')
    return A


def auto_eval(A, H=20):
    """낙관(+1)·비관(−1) 기사: 기사 날짜 종가(국장은 다음 거래일 기준 없이 그날·직전 종가) → H 거래일 뒤 지수 방향으로 채점"""
    for x in A['items']:
        if x.get('st') in ('hit', 'miss') or not x.get('tone'):
            continue
        px = yahoo('^KS11' if x['mk'] == 'KR' else '^GSPC')
        i = idx_of(px, x['d'])
        if i is None:
            continue
        if i + H < len(px):
            r = px[i + H][1] / px[i][1] - 1
            x['r'] = round(r * 100, 2)
            x['st'] = 'hit' if r * x['tone'] > 0 else 'miss'
        else:
            x['r'] = round((px[-1][1] / px[i][1] - 1) * 100, 2)
            x['st'] = 'wait'
            x['left'] = i + H - (len(px) - 1)
    sc = {}
    for x in A['items']:
        s = sc.setdefault(x['who'], {'n': 0, 'hit': 0, 'miss': 0, 'bull': 0, 'bear': 0})
        s['n'] += 1
        if x.get('tone') == 1:
            s['bull'] += 1
        elif x.get('tone') == -1:
            s['bear'] += 1
        if x.get('st') in ('hit', 'miss'):
            s[x['st']] += 1
    A['who'] = sc
    return A


def main():
    now = datetime.now(KST)
    today = now.date()
    cal, cl = load('feeds/calendar.json'), load('feeds/claims.json')
    old = load('feeds/watch-eval.json', {'cal': {}, 'claims': {}})
    res = {'v': 1, 'updated': now.strftime('%Y-%m-%d %H:%M'), 'cal': old.get('cal', {}), 'claims': old.get('claims', {}), 'earn': old.get('earn', {}), 'who': old.get('who', {})}
    # ① 캘린더 일정
    for w in cal.get('weeks', []):
        for d, items in w.get('days', {}).items():
            for i, it in enumerate(items):
                key = f'{d}#{i}'
                o = res['cal'].get(key, {})
                o['t'] = it['t']
                if it.get('kw') and d <= (today + timedelta(days=1)).isoformat():
                    o['news'] = collect_news(it['kw'], d, o.get('news'))
                if not NEWS_ONLY and it.get('tk') and d < today.isoformat():
                    rx = o.get('rx') or {}
                    for tk in it['tk'].split(','):
                        if tk in rx:
                            continue
                        r = reaction(tk, d, it.get('when') or ('A' if it['c'] == 'earn' else 'B'))  # 이벤트·발언은 그날 종가 / 전날 종가
                        if r:
                            r['x'] = vs_qqq(r)
                            rx[tk] = r
                    if rx:
                        o['rx'] = rx
                res['cal'][key] = o
    if not NEWS_ONLY:
        for e in cal.get('earnings', []):
            if e['d'] < today.isoformat() and e.get('tk') and e['tk'] not in res['earn']:
                r = reaction(e['tk'], e['d'], e.get('when', 'A'))
                if r:
                    r['x'] = vs_qqq(r)
                    res['earn'][e['tk'] + '@' + e['d']] = r
        # ② 전망 채점
        for it in cl.get('items', []):
            out = []
            for c in it.get('checks', []):
                out.append(check(c, today))
            res['claims'][it['id']] = out
        # 출처별 성적
        score = {}
        for it in cl.get('items', []):
            s = score.setdefault(it['who'], {'hit': 0, 'miss': 0, 'wait': 0})
            for r in res['claims'].get(it['id'], []):
                if r['st'] in s:
                    s[r['st']] += 1
        res['who'] = score
    json.dump(res, open(os.path.join(ROOT, 'feeds/watch-eval.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    A = auto_collect(now)
    if not NEWS_ONLY:
        A = auto_eval(A)
    json.dump(A, open(os.path.join(ROOT, 'feeds/claims-auto.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('자동 발언', len(A['items']), '건')
    print('캘린더', len(res['cal']), '· 실적 반응', len(res['earn']), '· 전망', {k: v for k, v in (res.get('who') or {}).items()})


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print('채점 실패 — 지난 결과 유지:', repr(e))
