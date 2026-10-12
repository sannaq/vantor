#!/usr/bin/env python3
"""이벤트 결과 채우기 (update_events.py 가 부른다) — 2026-10-12 사용자 결정.

1. 숫자 지표: FRED(미 연준 경제자료, 키 없음) 로 BLS 밖의 지표(소매판매·실업수당·지역 제조업·산업생산·주택·내구재·PCE·GDP·JOLTS·무역수지)
   실제값을 채우고 ForexFactory 예상치와 비교한다. BLS(CPI·PPI·고용)는 update_events.fill_results 가 그대로 맡는다.
2. 시장 반응(e["rx"]): 모든 이벤트(휴장·'참고' 제외)에 발표 뒤 첫 장의 등락을 붙인다 — 야후 일봉(키 없음).
   미국 = S&P500·나스닥·미 10년물(bp)·달러지수, 한국 = 코스피·코스닥·원/달러 + 제목에 회사 이름이 있으면 그 종목.
   같은 날 다른 뉴스도 섞인 반응이라 '원인'이 아니라 '그날 시장' 이다.
표준 라이브러리만 사용.
"""
import csv, io, json, os, re, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KST, ET = timezone(timedelta(hours=9)), ZoneInfo("America/New_York")
UA = {"User-Agent": "Mozilla/5.0 (vantor-events)"}

# ForexFactory 제목 → (FRED 시리즈, 계산, 표시 이름, 단위, 기준 시점, 성격)
#   계산: mm=전월비% · lvl=수준 / 단위: pct · k(건→K) · thM(천→M) · thK(천→K) · mB(백만→B) · idx
#   기준 시점: 숫자 n = 발표 달에서 n달 전 자료 · 'w' = 발표 주 직전 토요일 마감 주 · 'q' = 직전 분기
#   성격: price(높으면 물가 뜨거움) · act(높으면 경기 강함) · rev(높으면 경기 약함)
FRED = {
    "Retail Sales m/m": ("RSAFS", "mm", "소매판매", "pct", 1, "act"),
    "Core Retail Sales m/m": ("RSFSXMV", "mm", "근원 소매판매", "pct", 1, "act"),
    "Unemployment Claims": ("ICSA", "lvl", "신규 실업수당", "k", "w", "rev"),
    "Philly Fed Manufacturing Index": ("GACDFSA066MSFRBPHI", "lvl", "필라델피아 연은 지수", "idx", 0, "act"),
    "Empire State Manufacturing Index": ("GACDINA066MSFRBNY", "lvl", "뉴욕 연은 지수", "idx", 0, "act"),
    "Industrial Production m/m": ("INDPRO", "mm", "산업생산", "pct", 1, "act"),
    "Housing Starts": ("HOUST", "lvl", "주택 착공", "thM", 1, "act"),
    "Building Permits": ("PERMIT", "lvl", "건축 허가", "thM", 1, "act"),
    "New Home Sales": ("HSN1F", "lvl", "신규 주택 판매", "thK", 1, "act"),
    "Durable Goods Orders m/m": ("DGORDER", "mm", "내구재 주문", "pct", 1, "act"),
    "Core Durable Goods Orders m/m": ("ADXTNO", "mm", "근원 내구재 주문", "pct", 1, "act"),
    "Core PCE Price Index m/m": ("PCEPILFE", "mm", "근원 PCE 전월비", "pct", 1, "price"),
    "PCE Price Index m/m": ("PCEPI", "mm", "PCE 전월비", "pct", 1, "price"),
    "Advance GDP q/q": ("A191RL1Q225SBEA", "lvl", "GDP 성장률(연율)", "pct", "q", "act"),
    "Prelim GDP q/q": ("A191RL1Q225SBEA", "lvl", "GDP 성장률(연율)", "pct", "q", "act"),
    "Final GDP q/q": ("A191RL1Q225SBEA", "lvl", "GDP 성장률(연율)", "pct", "q", "act"),
    "JOLTS Job Openings": ("JTSJOL", "lvl", "구인 건수", "thM", 2, "act"),
    "Trade Balance": ("BOPGSTB", "lvl", "무역수지", "mB", 2, "act"),
}
ORDER = list(FRED)


def _get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa
            err = e
            time.sleep(2 * (i + 1))
    raise err


_FRED = {}


def fred(sid):
    """[(date, value)] 오래된→최근. FRED 는 빨리 연달아 부르면 봇 차단 화면을 주므로 쉬어 가며 받는다."""
    if sid in _FRED:
        return _FRED[sid]
    out = []
    for i in range(3):
        t = _get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={date.today().year - 2}-01-01")
        if t.lstrip().startswith("observation_date") or t.lstrip().startswith("DATE"):
            for row in list(csv.reader(io.StringIO(t)))[1:]:
                try:
                    out.append((date.fromisoformat(row[0]), float(row[1])))
                except (ValueError, IndexError):
                    pass
            break
        time.sleep(5 * (i + 1))
    time.sleep(1.5)
    _FRED[sid] = out
    return out


def num(x):
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(x)))
    except ValueError:
        return None


def want_period(ev_date, ref):
    d = date.fromisoformat(ev_date)
    if ref == "w":  # 목요일 발표 → 직전 토요일 마감 주
        return d - timedelta(days=(d.weekday() - 5) % 7 or 7)
    if ref == "q":
        q0 = (d.month - 1) // 3 * 3 + 1
        y, m = (d.year, q0 - 3) if q0 > 3 else (d.year - 1, 10)
        return date(y, m, 1)
    y, m = d.year, d.month - ref
    while m < 1:
        y, m = y - 1, m + 12
    return date(y, m, 1)


def conv(v, unit):
    """원자료 → FF 와 같은 단위의 (숫자, 표시)."""
    if unit == "pct":
        return round(v, 1), f"{v:.1f}%"
    if unit == "k":
        return round(v / 1000), f"{v / 1000:,.0f}K"
    if unit == "thM":
        return round(v / 1000, 2), f"{v / 1000:.2f}M"
    if unit == "thK":
        return round(v), f"{v:,.0f}K"
    if unit == "mB":
        return round(v / 1000, 1), f"{v / 1000:.1f}B"
    return round(v, 1), f"{v:.1f}"


def fill_fred(evs, today):
    todo = [e for e in evs if e.get("fc") and not e.get("result") and e["date"] < today.isoformat() and any(k in FRED for k in e["fc"])]
    n = 0
    for e in todo:
        keys = sorted((k for k in e["fc"] if k in FRED), key=ORDER.index)
        parts, verdict, kind0 = [], "neutral", None
        for k in keys:
            sid, how, lab, unit, ref, kind = FRED[k]
            try:
                obs = fred(sid)
            except Exception as ex:  # noqa
                print("FRED 실패:", sid, ex, file=sys.stderr)
                continue
            wp = want_period(e["date"], ref)
            i = next((j for j, (d, _) in enumerate(obs) if d == wp), None)
            if i is None:
                continue
            if how == "mm":
                if i == 0:
                    continue
                v = (obs[i][1] / obs[i - 1][1] - 1) * 100
            else:
                v = obs[i][1]
            a, txt = conv(v, unit)
            fc = e["fc"].get(k) or ""
            f = num(fc)
            piece = f"{lab} {txt}" + (f" (예상 {fc})" if fc else "")
            if not parts:
                piece = f"**{lab} {txt}**" + (f" (예상 {fc})" if fc else "")
                kind0 = kind
                if f is not None and a != f:
                    stronger = (a > f) != (kind == "rev")
                    verdict = ("hot" if stronger else "cool") if kind == "price" else ("up" if stronger else "down")
            parts.append(piece)
        if parts:
            word = {"hot": "예상보다 뜨거움 → 금리 부담", "cool": "예상보다 식음 → 금리 부담 완화",
                    "up": "예상보다 강함", "down": "예상보다 약함", "neutral": "예상 수준"}[verdict]
            e["result"] = {"v": " · ".join(parts) + f" — {word}", "verdict": verdict, "src": "FRED"}
            n += 1
    return n


# ── 시장 반응 ───────────────────────────────────────────────
_Y = {}


def yahoo(sym):
    """{날짜: 종가} (거래소 현지 날짜)."""
    if sym in _Y:
        return _Y[sym]
    out = {}
    try:
        j = json.loads(_get("https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(sym) + "?range=3mo&interval=1d"))
        r = j["chart"]["result"][0]
        tz = ZoneInfo(r["meta"].get("exchangeTimezoneName") or "UTC")
        for t, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]):
            if c is not None:
                out[datetime.fromtimestamp(t, tz).date()] = c
    except Exception as ex:  # noqa
        print("시세 실패:", sym, ex, file=sys.stderr)
    _Y[sym] = out
    return out


US_RX = [("S&P500", "^GSPC", "pct"), ("나스닥", "^IXIC", "pct"), ("미 10년물", "^TNX", "bp"), ("달러지수", "DX-Y.NYB", "pct")]
KR_RX = [("코스피", "^KS11", "pct"), ("코스닥", "^KQ11", "pct"), ("원/달러", "KRW=X", "pct")]


def chg(sym, day, how):
    s = yahoo(sym)
    if day not in s:
        return None
    prev = [d for d in s if d < day]
    if not prev:
        return None
    a, b = s[max(prev)], s[day]
    return round((b - a) * 100) if how == "bp" else round((b / a - 1) * 100, 2)


_NAMES = None


def company(title):
    """제목 속 국내 종목 (가장 긴 이름) → (이름, 야후 기호)."""
    global _NAMES
    if _NAMES is None:
        try:
            with open(os.path.join(ROOT, "feeds/stock-list.json"), encoding="utf-8") as f:
                lst = json.load(f)
            lst = lst.get("items", lst) if isinstance(lst, dict) else lst
            _NAMES = sorted(((x[1], x[0], x[2]) for x in lst if len(x[1]) >= 3 and re.fullmatch(r"\d{6}", x[0])), key=lambda t: -len(t[0]))
        except Exception:  # noqa
            _NAMES = []
    hits = [t for t in _NAMES if t[0] in title]
    if not hits or "·" in title.split(hits[0][0])[1][:1]:  # '삼성전자·LG전자' 처럼 여러 회사면 생략
        return None
    nm, code, mk = hits[0]
    return nm, code + (".KQ" if mk == "KOSDAQ" else ".KS")


def rx_day(e, now):
    """발표 뒤 첫 장 날짜와 시장. 아직 그 장이 안 끝났으면 None."""
    t = e.get("time", "")
    if e.get("market") == "US":
        if not re.fullmatch(r"\d\d:\d\d", t):
            return None
        et = datetime.fromisoformat(f"{e['date']}T{t}").replace(tzinfo=KST).astimezone(ET)
        days = sorted(yahoo("^GSPC"))
        cand = [d for d in days if (d > et.date() if et.hour >= 16 else d >= et.date())]
        if not cand:
            return None
        d = cand[0]
        n_et = now.astimezone(ET)
        if d > n_et.date() or (d == n_et.date() and n_et.hour < 17):
            return None
        return d, "US"
    if e.get("market") == "KR":
        if t in ("휴장", "참고") or not (re.fullmatch(r"\d\d:\d\d", t) or "개장" in t):
            return None
        d0 = date.fromisoformat(e["date"])
        late = re.fullmatch(r"\d\d:\d\d", t) and t >= "15:30"
        days = sorted(yahoo("^KS11"))
        cand = [d for d in days if (d > d0 if late else d >= d0)]
        if not cand:
            return None
        d = cand[0]
        n_k = now.astimezone(KST)
        if d > n_k.date() or (d == n_k.date() and (n_k.hour, n_k.minute) < (15, 40)):
            return None
        return d, "KR"
    return None


def fill_rx(evs, now):
    n = 0
    for e in evs:
        if e.get("rx") or e.get("market") not in ("US", "KR"):
            continue
        r = rx_day(e, now)
        if not r:
            continue
        d, mk = r
        items = []
        for lab, sym, how in (US_RX if mk == "US" else KR_RX):
            v = chg(sym, d, how)
            if v is not None:
                items.append([lab, v, how])
        if mk == "KR":
            co = company(e.get("title", ""))
            if co:
                v = chg(co[1], d, "pct")
                if v is not None:
                    items.insert(0, [co[0], v, "pct"])
        if len(items) >= 2:
            e["rx"] = {"day": d.isoformat(), "mk": mk, "items": items}
            n += 1
    return n


def fill_all(evs, now):
    a = fill_fred(evs, now.astimezone(KST).date())
    b = fill_rx(evs, now)
    if a or b:
        print(f"FRED 결과 {a}건 · 시장 반응 {b}건")
    return a + b


if __name__ == "__main__":  # 시험: python3 scripts/event_results.py events.json
    p = sys.argv[1]
    d = json.load(open(p, encoding="utf-8"))
    fill_all(d["events"], datetime.now(KST))
    for e in d["events"]:
        print(e["date"], e.get("time"), e["title"], "|", (e.get("result") or {}).get("v"), "|", e.get("rx"))
