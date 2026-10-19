#!/usr/bin/env python3
"""공포·탐욕 국면 연구 → feeds/fear-study.json (스터디 '😱 공포·탐욕' 탭, 추천 화면 시장 심리 줄)

질문: "극단적 공포는 지나고 보면 기회였다" 가 숫자로도 맞나? 우리 추천에도 쓸 만한가?
- 지수: S&P500·코스피를 공포탐욕지수(CNN, 2020.9~)·VIX(1990~) 구간별로 나눠 20·60거래일 뒤 수익률을 본다.
- 추천: backtest.mjs 를 BT_DUMP 로 돌린 날짜별 성적(/tmp/vtw/dump 또는 FEAR_DUMP 폴더)이 있으면 국면별 추천 성적도 붙인다.
- 지금 값: 공포탐욕지수·VIX·하이일드 스프레드(FRED) 최근 값과 이번 구간이 과거 몇 번째였는지.
자료는 키 없이 받는다 (CNN dataviz · 야후 일봉 · FRED csv). 매주 토 levels-study.yml 이 다시 계산.
"""
import csv, io, json, math, os, statistics as st, sys, time, urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
KST = timezone(timedelta(hours=9))


def get(url, hdr=None, tries=3):
    for k in range(tries):
        try:
            ua = UA if 'cnn.io' in url else 'Mozilla/5.0 (vantor-fear)'  # 야후는 브라우저 UA 에 429, FRED 는 응답 없음 → CNN 만 브라우저 UA
            req = urllib.request.Request(url.replace('query1', 'query2') if k and 'yahoo' in url else url, headers={'User-Agent': ua, **(hdr or {})})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8')
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 + k * 3)
    raise err


def fng():
    """CNN 공포탐욕지수 일별 {날짜: 값} (미국 날짜)"""
    t = get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2020-09-01',
            {'Accept': 'application/json, text/plain, */*', 'Referer': 'https://edition.cnn.com/', 'Origin': 'https://edition.cnn.com'})
    d = json.loads(t)
    out = {}
    for p in d['fear_and_greed_historical']['data']:
        out[datetime.fromtimestamp(p['x'] / 1000, timezone.utc).strftime('%Y-%m-%d')] = p['y']
    now = d.get('fear_and_greed') or {}
    return out, now


def yahoo(sym, tz):
    loc = os.path.join(os.environ.get('YF_DIR', '/nonexistent'), f'y_{sym}.json')  # 로컬 시험용 저장본
    t = open(loc).read() if os.path.exists(loc) else get(f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1=631152000&period2={int(time.time()) + 86400}&interval=1d')
    r = json.loads(t)['chart']['result'][0]
    off = timedelta(seconds=r['meta'].get('gmtoffset', 0))
    out = []
    for ts, c in zip(r['timestamp'], r['indicators']['quote'][0]['close']):
        if c is None:
            continue
        out.append((datetime.fromtimestamp(ts, timezone.utc).__add__(off).strftime('%Y-%m-%d'), c))
    dd = {}
    for d, c in out:
        dd[d] = c
    return sorted(dd.items())


def fred(sid):
    t = get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}')
    out = []
    for row in csv.reader(io.StringIO(t)):
        if len(row) == 2 and row[0][:2] in ('19', '20'):
            try:
                out.append((row[0], float(row[1])))
            except ValueError:
                pass
    return out


def asof(series_sorted, dates):
    """각 날짜에 대해 그 날짜 '전날까지' 마지막 값 (국장은 미국 전날 장 마감 값을 보고 다음 날 산다)"""
    res, j, last = {}, 0, None
    for d in dates:
        while j < len(series_sorted) and series_sorted[j][0] < d:
            last = series_sorted[j][1]
            j += 1
        res[d] = last
    return res


def same_or_before(series_sorted, dates):
    res, j, last = {}, 0, None
    for d in dates:
        while j < len(series_sorted) and series_sorted[j][0] <= d:
            last = series_sorted[j][1]
            j += 1
        res[d] = last
    return res


def pct(a, q):
    if not a:
        return None
    a = sorted(a)
    k = (len(a) - 1) * q
    f = math.floor(k)
    return a[f] + (a[min(f + 1, len(a) - 1)] - a[f]) * (k - f)


def summ(rets, days):
    """rets: 수익률 목록, days: 같은 순서의 날짜 인덱스 → 독립 구간 수(20거래일 넘게 떨어진 묶음)"""
    if not rets:
        return None
    ep, prev = 0, -999
    for i in days:
        if i - prev > 20:
            ep += 1
        prev = i
    return {'n': len(rets), 'ep': ep, 'avg': round(st.mean(rets) * 100, 2), 'med': round(st.median(rets) * 100, 2),
            'up': round(sum(1 for x in rets if x > 0) / len(rets) * 100), 'p10': round(pct(rets, 0.1) * 100, 1)}


def bucket_study(px, sig, buckets, hs=(20, 60), since=None):
    """px: [(날짜, 종가)], sig: {날짜: 신호값} → 구간별 h 일 뒤 수익률"""
    out = []
    dates = [d for d, _ in px]
    for nm, lo, hi in buckets:
        row = {'nm': nm}
        for h in hs:
            r, ix = [], []
            for i in range(len(px) - h):
                d = dates[i]
                if since and d < since:
                    continue
                v = sig.get(d)
                if v is None or not (lo <= v < hi):
                    continue
                r.append(px[i + h][1] / px[i][1] - 1)
                ix.append(i)
            row[f'h{h}'] = summ(r, ix)
        out.append(row)
    base = {'nm': '전체(아무 날)'}
    for h in hs:
        r, ix = [], []
        for i in range(len(px) - h):
            if since and dates[i] < since:
                continue
            if sig.get(dates[i]) is None:
                continue
            r.append(px[i + h][1] / px[i][1] - 1)
            ix.append(i)
        base[f'h{h}'] = summ(r, ix)
    return out + [base]


def first_entry(px, sig, thr, gap=60, h=(20, 60)):
    """신호가 thr 아래로 '처음' 들어간 날(직전 gap 거래일 안에 없던 경우)마다 h 일 뒤 수익률 — 사건 목록"""
    dates = [d for d, _ in px]
    ev, last = [], -9999
    for i, d in enumerate(dates):
        v = sig.get(d)
        if v is None or v >= thr:
            continue
        if i - last > gap:
            e = {'d': d, 'v': round(v, 1)}
            for k in h:
                e[f'r{k}'] = round((px[i + k][1] / px[i][1] - 1) * 100, 1) if i + k < len(px) else None
            # 이후 60거래일 안 최저점(더 빠졌는지)
            lo = min(p for _, p in px[i:i + 61]) if i + 1 < len(px) else px[i][1]
            e['dd'] = round((lo / px[i][1] - 1) * 100, 1)
            ev.append(e)
        last = i
    return ev


def picks_by_regime(dump, sig, buckets):
    """backtest dump [날짜, 시장 f, 추천 f, 금지 f, 시장 f5, 추천 f5] 를 신호 구간별로 → 추천 절대·시장 대비 성적"""
    out = []
    for nm, lo, hi in buckets:
        rows = [r for r in dump if sig.get(r[0]) is not None and lo <= sig[r[0]] < hi]
        if not rows:
            out.append({'nm': nm, 'n': 0})
            continue
        ex = [r[2] - r[1] for r in rows]
        out.append({'nm': nm, 'n': len(rows), 'mkt': round(st.mean(r[1] for r in rows) * 100, 2),
                    'pick': round(st.mean(r[2] for r in rows) * 100, 2), 'ex': round(st.mean(ex) * 100, 2),
                    'win': round(sum(1 for x in ex if x > 0) / len(ex) * 100), 'weak': round(st.mean(r[3] - r[1] for r in rows) * 100, 2)})
    return out


FNG_B = [('극단적 공포 (10 미만)', 0, 10), ('극단적 공포 (10~25)', 10, 25), ('공포 (25~45)', 25, 45), ('중립 (45~55)', 45, 55), ('탐욕 (55~75)', 55, 75), ('극단적 탐욕 (75 이상)', 75, 101)]
FNG_B2 = [('극단적 공포 (25 미만)', 0, 25), ('공포 (25~45)', 25, 45), ('중립 (45~55)', 45, 55), ('탐욕 (55 이상)', 55, 101)]
VIX_B = [('15 미만 (안정)', 0, 15), ('15~20', 15, 20), ('20~30 (주의)', 20, 30), ('30~40 (공포)', 30, 40), ('40 이상 (패닉)', 40, 999)]


def main():
    fg, fg_now = fng()
    # 매수·매도 규칙 백테스트(scripts/levels_study.mjs)가 날짜별 심리 구간을 쓰도록 전체 일별 값을 따로 저장 (2026-10-19)
    with open(os.path.join(ROOT, 'feeds', 'fear-daily.json'), 'w', encoding='utf-8') as f:
        json.dump({'updated': datetime.now(KST).strftime('%Y-%m-%d %H:%M'), 'fg': [[k, round(v, 1)] for k, v in sorted(fg.items())]}, f, separators=(',', ':'))
    fg_s = sorted(fg.items())
    spx = yahoo('%5EGSPC', 'US')
    ks = yahoo('%5EKS11', 'KR')
    vix = yahoo('%5EVIX', 'US')
    try:
        hy = fred('BAMLH0A0HYM2')
    except Exception:  # noqa: BLE001
        hy = []
    if not hy:  # FRED 가 Actions 에서 막히면 지난 값을 그대로 쓴다
        try:
            hy = [tuple(x) for x in json.load(open(os.path.join(ROOT, 'feeds/fear-study.json'))).get('hyTrend') or []]
        except Exception:  # noqa: BLE001
            hy = []
    vix_s = vix
    # 미장: 그날 장 마감 지수와 그날 공포탐욕(장 마감 값)을 같이 본다. 국장: 미국 전날 값.
    sig_spx_fg = same_or_before(fg_s, [d for d, _ in spx])
    sig_ks_fg = asof(fg_s, [d for d, _ in ks])
    sig_spx_vix = same_or_before(vix_s, [d for d, _ in spx])
    sig_ks_vix = asof(vix_s, [d for d, _ in ks])
    fg0 = fg_s[0][0]
    res = {
        'v': 1, 'updated': datetime.now(KST).strftime('%Y-%m-%d %H:%M'),
        'now': {
            'fg': round(fg_now.get('score', fg_s[-1][1]), 1), 'fgRating': fg_now.get('rating'), 'fgDate': fg_s[-1][0],
            'fgPrev1w': round(fg_now.get('previous_1_week') or 0, 1), 'fgPrev1m': round(fg_now.get('previous_1_month') or 0, 1),
            'vix': round(vix_s[-1][1], 2), 'vixDate': vix_s[-1][0],
            'hy': round(hy[-1][1], 2) if hy else None, 'hyDate': hy[-1][0] if hy else None,
            'hy20': round(hy[-1][1] - hy[-21][1], 2) if len(hy) > 21 else None,
        },
        'fgTrend': [[d, round(v, 1)] for d, v in fg_s[-260:]],
        'vixTrend': [[d, round(v, 2)] for d, v in vix_s[-260:]],
        'hyTrend': [[d, v] for d, v in hy[-520:]],  # 21줄 차이(hy20)는 이 목록으로 계산
        'fgFrom': fg0,
        'spxFg': bucket_study(spx, sig_spx_fg, FNG_B, since=fg0),
        'ksFg': bucket_study(ks, sig_ks_fg, FNG_B, since=fg0),
        'spxVix': bucket_study(spx, sig_spx_vix, VIX_B),
        'ksVix': bucket_study(ks, sig_ks_vix, VIX_B, since='2000-01-01'),
        'spxEvents': first_entry(spx, sig_spx_fg, 25),
        'ksEvents': first_entry(ks, sig_ks_fg, 25),
        'spxVixEvents': [],
    }
    # VIX 30 '돌파' 사건 (1990~): 30 위로 처음 올라선 날
    inv = {d: -v for d, v in sig_spx_vix.items() if v is not None}
    res['spxVixEvents'] = first_entry(spx, inv, -30)
    for e in res['spxVixEvents']:
        e['v'] = -e['v']
    # 지금 구간: 공포탐욕 25 아래로 들어온 지 며칠째
    run = 0
    for d, v in reversed(fg_s):
        if v < 25:
            run += 1
        else:
            break
    res['now']['fgRun'] = run

    v = res['now']['fg']
    res['now']['zone'] = '극단적 공포' if v < 25 else '공포' if v < 45 else '중립' if v < 55 else '탐욕' if v < 75 else '극단적 탐욕'
    res['now']['vixZone'] = '안정' if vix_s[-1][1] < 20 else '주의' if vix_s[-1][1] < 30 else '공포'

    dump_dir = os.environ.get('FEAR_DUMP', '/tmp/fear-dump')
    picks = {}
    for k in ('kr20', 'kr60', 'us20', 'us60'):
        f = os.path.join(dump_dir, f'{k}.json')
        if not os.path.exists(f):
            continue
        dump = json.load(open(f))
        for r in dump:  # 백테스트 날짜는 YYYYMMDD → YYYY-MM-DD
            if '-' not in r[0]:
                r[0] = f'{r[0][:4]}-{r[0][4:6]}-{r[0][6:]}'
        dts = [r[0] for r in dump]
        sig = (same_or_before if k.startswith('us') else asof)(fg_s, dts)
        sigv = (same_or_before if k.startswith('us') else asof)(vix_s, dts)
        picks[k] = {'from': dts[0], 'to': dts[-1], 'fg': picks_by_regime([r for r in dump if r[0] >= fg0], sig, FNG_B2),
                    'vix': picks_by_regime(dump, sigv, [('VIX 20 미만', 0, 20), ('VIX 20~30', 20, 30), ('VIX 30 이상', 30, 999)]),
                    'all': picks_by_regime(dump, {r[0]: 0 for r in dump}, [('전체', -1, 1)])[0]}
    if picks:
        res['picks'] = picks
    else:  # 매주 자동 실행에선 백테스트 덤프가 없을 수 있다 → 지난 결과 유지
        try:
            old = json.load(open(os.path.join(ROOT, 'feeds/fear-study.json')))
            if old.get('picks'):
                res['picks'] = old['picks']
        except Exception:  # noqa: BLE001
            pass
    json.dump(res, open(os.path.join(ROOT, 'feeds/fear-study.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    if '-q' not in sys.argv:
        print(json.dumps({k: v for k, v in res.items() if not k.endswith('Trend')}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001  CNN·야후가 막혀도 지난 파일은 그대로 두고 다른 단계는 진행
        print('공포·탐욕 연구 실패 — 지난 결과 유지:', repr(e))
        sys.exit(0)
