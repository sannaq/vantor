#!/usr/bin/env python3
"""위클리 캘린더·전망 기록 채점 → feeds/watch-eval.json (사이트 이벤트 화면 '🗓 위클리 캘린더'·'🎤 전망·발언 평가')

- feeds/calendar.json 의 지난 일정: 관련 뉴스 제목(feeds/news-all.json 에서 kw 로, 일정 날짜~3일 뒤)을 모아 두고,
  tk(미국 티커)가 있으면 발표 뒤 첫 거래일 주가 반응과 같은 날 나스닥100(QQQ) 대비를 잰다.
  실적 when=A(장 마감 후, 기본)는 다음 거래일 종가/그날 종가, when=B(장 전)는 그날 종가/전날 종가.
- feeds/claims.json 의 checks: 기간이 끝나면 적중·빗나감, 진행 중이면 지금까지 값을 쓴다.
뉴스는 30분마다 바뀌어 사라지므로 한 번 모은 제목은 지우지 않고 쌓는다(일정당 8개까지).
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


def main():
    now = datetime.now(KST)
    today = now.date()
    cal, cl = load('feeds/calendar.json'), load('feeds/claims.json')
    old = load('feeds/watch-eval.json', {'cal': {}, 'claims': {}})
    res = {'v': 1, 'updated': now.strftime('%Y-%m-%d %H:%M'), 'cal': old.get('cal', {}), 'claims': old.get('claims', {}), 'earn': old.get('earn', {})}
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
    print('캘린더', len(res['cal']), '· 실적 반응', len(res['earn']), '· 전망', {k: v for k, v in (res.get('who') or {}).items()})


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print('채점 실패 — 지난 결과 유지:', repr(e))
