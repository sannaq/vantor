#!/usr/bin/env python3
"""미장 브리핑 (장 전 · 장 중 · 장 마감) — 2026-10-10 사용자 결정: 규칙 기반 문장, 사이트엔 3번, 디스코드는 장 전·장 마감만(미장 전용 채널).

자료(키 없음): 네이버 증권 해외(api.stock.naver.com) 지수·선물·시가총액 상위 종목, 나스닥 실적 달력,
events.json(이번 주 일정), feeds/stock-picks-us.json(미장 추천), feeds/flow.json(환율 없음 → 생략).
출력: briefs-us/<미국날짜>-<slot>.json + briefs-us/index.json (사이트 브리핑 화면 '미장 브리핑')
     slot = pre(장 전, 미국 08:40~09:50) · mid(장 중, 12:00~13:50) · close(장 마감, 17:00~18:50) — 미국 동부 시간 기준이라 서머타임은 자동.
환경변수: DISCORD_US_BRIEF_WEBHOOK (pre·close 만 전송, 없으면 이미지만), SLOT(강제), FORCE=1(시간·휴장 검사 생략, 시험용)
교육용 참고이며 매매 신호가 아니다.
"""
import html
import json
import os
import sys
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "briefs-us")
NY, KST = ZoneInfo("America/New_York"), ZoneInfo("Asia/Seoul")
B = "https://api.stock.naver.com"
# NYSE 휴장일 (매년 12월 다음 해 추가)
HOLIDAYS = {"2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
            "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"}
SLOTS = {"pre": ("장 전", (8, 40), (9, 50)), "mid": ("장 중", (12, 0), (13, 50)), "close": ("장 마감", (17, 0), (18, 50))}
E = lambda s: html.escape(str(s if s is not None else ""))


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if i == tries - 1:
                return None


def num(s):
    try:
        return float(str(s).replace(",", "").replace("%", ""))
    except Exception:
        return None


def sg(v, d=2):
    return "—" if v is None else f"{v:+.{d}f}%"


def pick_slot(now_ny):
    if os.environ.get("SLOT"):
        return os.environ["SLOT"]
    m = now_ny.hour * 60 + now_ny.minute
    for k, (_, a, b) in SLOTS.items():
        if a[0] * 60 + a[1] <= m <= b[0] * 60 + b[1]:
            return k
    return None


# ── 자료 ──
def indices():
    out = {}
    for x in get(f"{B}/index/nation/USA") or []:
        out[x.get("reutersCode")] = {"v": num(x.get("closePrice")), "c": num(x.get("fluctuationsRatio"))}
    return out


def futures():
    out = {}
    for x in get(f"{B}/futures/nation/USA") or []:
        out[x.get("reutersCode")] = {"v": num(x.get("closePrice")), "c": num(x.get("fluctuationsRatio")), "at": x.get("localTradedAt")}
    return out


def big_stocks(pages=5):
    """시가총액 상위 종목(나스닥·NYSE 각 pages×100) — 등락·업종·장전/장후 시세."""
    rows = []
    for mkt in ("NASDAQ", "NYSE"):
        for p in range(1, pages + 1):
            d = get(f"{B}/stock/exchange/{mkt}/marketValue?page={p}&pageSize=100") or {}
            for s in d.get("stocks") or []:
                if s.get("stockEndType") != "stock":
                    continue
                om = s.get("overMarketPriceInfo") or {}
                rows.append({"c": s.get("symbolCode"), "n": s.get("stockName") or s.get("stockNameEng"), "cap": num(s.get("marketValue")) or 0,
                             "ch": num(s.get("fluctuationsRatio")), "px": num(s.get("closePrice")),
                             "ind": (s.get("industryCodeType") or {}).get("industryGroupKor"),
                             "om": num(om.get("fluctuationsRatio")) if om else None, "omType": (om.get("tradingSessionType") or "") if om else ""})
    rows.sort(key=lambda r: -r["cap"])
    return rows


def sectors(rows, key="ch", top=1000):
    g = {}
    for r in rows[:top]:
        v = r.get(key)
        if v is None or not r["ind"]:
            continue
        a = g.setdefault(r["ind"], [0.0, 0.0, 0])
        a[0] += v * r["cap"]
        a[1] += r["cap"]
        a[2] += 1
    s = [(k, a[0] / a[1], a[2]) for k, a in g.items() if a[2] >= 5 and a[1] > 0]
    s.sort(key=lambda x: -x[1])
    return s


def earnings(day):
    d = get(f"https://api.nasdaq.com/api/calendar/earnings?date={day}") or {}
    rows = ((d.get("data") or {}).get("rows")) or []
    cap = lambda r: num(str(r.get("marketCap", "")).replace("$", "")) or 0
    rows.sort(key=lambda r: -cap(r))
    return [(r.get("symbol"), r.get("name"), "장 전" if "pre" in (r.get("time") or "") else "장 후" if "after" in (r.get("time") or "") else "", r.get("epsForecast") or "") for r in rows[:8]]


def us_events(now_kst, hours=14):
    try:
        ev = json.load(open(os.path.join(ROOT, "events.json"), encoding="utf-8")).get("events") or []
    except Exception:
        return []
    out = []
    for e in ev:
        if e.get("market") != "US" or not e.get("date"):
            continue
        t = e.get("time") or ""
        try:
            at = datetime.strptime(e["date"] + " " + (t if ":" in t else "09:00"), "%Y-%m-%d %H:%M").replace(tzinfo=KST)
        except Exception:
            continue
        if now_kst - timedelta(hours=1) <= at <= now_kst + timedelta(hours=hours):
            out.append({"k": f'{at.month}/{at.day} {t}', "b": f'**{e.get("title")}**' + ("★" * int(e.get("imp") or 0) and " " + "★" * int(e.get("imp") or 0)) + (f' — {e.get("note")}' if e.get("note") else "")})
    return out[:6]


def picks():
    try:
        return json.load(open(os.path.join(ROOT, "feeds/stock-picks-us.json"), encoding="utf-8"))
    except Exception:
        return None


# ── 문장 (규칙 기반) ──
def mood(c):
    if c is None:
        return "확인되지 않았어요"
    if c >= 1:
        return "강하게 올랐어요"
    if c >= 0.25:
        return "올랐어요"
    if c > -0.25:
        return "보합이었어요"
    if c > -1:
        return "내렸어요"
    return "크게 내렸어요"


def build(slot, now_ny, now_kst):
    lab = SLOTS[slot][0]
    ix, fu, rows = indices(), futures(), big_stocks()
    spx, ndq, dji, sox, vix = (ix.get(k, {}) for k in (".INX", ".IXIC", ".DJI", ".SOX", ".VIX"))
    es, nq = fu.get("EScv1", {}), fu.get("NQcv1", {})
    key = "om" if slot == "pre" and sum(1 for r in rows[:50] if r["om"] is not None) >= 10 else "ch"  # 장 전엔 프리마켓 등락(있으면)
    secs = sectors(rows, key)
    live = [r for r in rows[:300] if r.get(key) is not None]
    up = sorted(live, key=lambda r: -r[key])[:5]
    dn = sorted(live, key=lambda r: r[key])[:5]
    top10 = rows[:10]
    breadth = [r for r in rows[:1000] if r.get("ch") is not None]
    nu, nd = sum(1 for r in breadth if r["ch"] > 0), sum(1 for r in breadth if r["ch"] < 0)
    p = picks() or {}
    spy = p.get("spy") or {}
    day = now_ny.strftime("%Y-%m-%d")
    ern = earnings(day if slot != "close" else (now_ny + timedelta(days=1 if now_ny.weekday() < 4 else 3)).strftime("%Y-%m-%d"))

    lead = []
    if slot == "pre":
        fc = es.get("c")
        fm = "확인되지 않았어요" if fc is None else "상승 출발이 예상돼요" if fc >= 0.25 else "하락 출발이 예상돼요" if fc <= -0.25 else "보합 출발이 예상돼요"
        lead.append(f"미국장 개장 전이에요. 지수 선물은 S&P500 {sg(es.get('c'))}, 나스닥100 {sg(nq.get('c'))}로 {fm}.")
        lead.append(f"전날 정규장은 S&P500 {sg(spx.get('c'))}, 나스닥 {sg(ndq.get('c'))}, 반도체 지수 {sg(sox.get('c'))}로 마감했어요.")
    else:
        when = "지금" if slot == "mid" else "오늘"
        lead.append(f"{when} 미국 증시는 S&P500 {sg(spx.get('c'))}, 나스닥 {sg(ndq.get('c'))}, 다우 {sg(dji.get('c'))}로 {mood(spx.get('c'))}.")
        lead.append(f"반도체 지수는 {sg(sox.get('c'))}, 공포지수(VIX)는 {vix.get('v') or '—'}({sg(vix.get('c'))})예요. 시가총액 상위 1,000종목 중 상승 {nu} · 하락 {nd}로 " + ("오른 종목이 많았어요." if nu > nd * 1.2 else "내린 종목이 많았어요." if nd > nu * 1.2 else "엇비슷했어요."))
    if secs:
        lead.append(f"업종은 {secs[0][0]}({sg(secs[0][1])})·{secs[1][0]}({sg(secs[1][1])})이 강하고, {secs[-1][0]}({sg(secs[-1][1])})이 약해요.")
    if spy.get("below"):
        lead.append(f"⚠ S&P500이 200일선보다 {abs(spy['gap'])}% 아래라 하락장 경계가 필요해요.")
    if ern:
        lead.append(f"{'오늘' if slot != 'close' else '다음 거래일'} 실적 발표: " + ", ".join(f"{s}({t})" if t else s for s, _, t, _ in ern[:4]) + ".")

    fv = lambda x: f"{x:,.2f}" if x else ""
    tiles = ([{"t": "S&P500 선물", "v": sg(es.get("c")), "s": fv(es.get("v"))}, {"t": "나스닥100 선물", "v": sg(nq.get("c")), "s": fv(nq.get("v"))}] if slot == "pre" else []) + [
        {"t": "S&P500", "v": sg(spx.get("c")), "s": fv(spx.get("v"))},
        {"t": "나스닥", "v": sg(ndq.get("c")), "s": fv(ndq.get("v"))},
        {"t": "다우", "v": sg(dji.get("c")), "s": fv(dji.get("v"))},
        {"t": "반도체(SOX)", "v": sg(sox.get("c")), "s": ""},
        {"t": "VIX", "v": f"{vix.get('v') or '—'}", "s": sg(vix.get("c"))}]
    mv = "프리마켓 " if key == "om" else ""
    d = {
        "date": day, "slot": slot, "title": f"{now_ny.month}월 {now_ny.day}일(미국) 미장 {lab} 브리핑", "src": "VANTOR · 규칙 기반 자동 작성",
        "made": now_kst.strftime("%Y-%m-%d %H:%M KST"), "lead": " ".join(lead),
        "us": {"title": "지수" + (" · 선물" if slot == "pre" else ""), "tiles": tiles,
               "cpuTitle": f"🔥 {mv}강한 종목 (시총 상위 300)", "cpu": [f"**{r['n']}** {r['c']} {sg(r[key])}" for r in up],
               "quietTitle": f"🧊 {mv}약한 종목", "quiet": [f"**{r['n']}** {r['c']} {sg(r[key])}" for r in dn],
               "note": ("전날 정규장 기준" if slot == "pre" and key == "ch" else "")},
        "big": [{"n": r["n"], "c": r["c"], "ch": r.get(key)} for r in top10],
        "sectors": {"up": [[k, round(v, 2), n] for k, v, n in secs[:5]], "down": [[k, round(v, 2), n] for k, v, n in secs[-5:][::-1]]},
        "breadth": [nu, nd] if slot != "pre" else None,
        "events": us_events(now_kst),
        "earnings": [{"s": s, "n": n, "t": t, "eps": e} for s, n, t, e in ern],
        "picks": [{"n": x["n"], "c": x["c"], "total": x["total"], "hot": any(str(b).startswith("⚠ 과열") for b in x.get("bad") or [])} for x in (p.get("top") or [])[:5]],
        "spy": spy or None,
        "checks": {"pre": ["개장 30분 방향 — 선물 흐름이 정규장에서 이어지는지", "반도체·빅테크 동조 여부", "오늘 밤 지표 발표 직후 금리·달러 반응", "실적 발표 종목의 장 전 반응"],
                   "mid": ["오전 고점·저점 돌파 여부", "업종 순환(강한 업종이 바뀌는지)", "VIX 방향", "장 마감 1시간 전 거래량"],
                   "close": ["장 후 실적 발표 종목 시간외 반응", "다음 날 한국장 반도체·2차전지 영향", "지수 선물 야간 흐름", "다음 날 지표 일정"]}[slot],
    }
    return d


# ── 이미지 · 디스코드 ──
UP, DN = "#2ebd85", "#f6465d"


def col(s):
    v = num(s)
    return "#9aa4b2" if v is None or abs(v) < 0.005 else (UP if v > 0 else DN)


def card_html(d):
    md = lambda s: E(s).replace("**", "")
    tiles = "".join(f'<div class="t"><div class="a">{E(t["t"])}</div><div class="b" style="color:{col(t["v"]) if "%" in t["v"] else "#e8ecf3"}">{E(t["v"])}</div><div class="c">{E(t["s"])}</div></div>' for t in d["us"]["tiles"])
    li = lambda a: "".join(f"<div>{md(x)}</div>" for x in a)
    secs = "".join(f'<div>{E(k)} <b style="color:{col(v)}">{v:+.2f}%</b></div>' for k, v, _ in d["sectors"]["up"][:4]) + "<hr>" + "".join(f'<div>{E(k)} <b style="color:{col(v)}">{v:+.2f}%</b></div>' for k, v, _ in d["sectors"]["down"][:3])
    ev = "".join(f'<div>📅 {E(e["k"])} {md(e["b"])[:90]}</div>' for e in d["events"][:4]) + "".join(f'<div>📊 {E(e["s"])} {E(e["n"])[:28]} {E(e["t"])} · EPS 예상 {E(e["eps"])}</div>' for e in d["earnings"][:5])
    pk = " · ".join(f'{E(x["n"])} {x["total"]}점' + (" ⚠과열" if x["hot"] else "") for x in d["picks"][:5])
    warn = f'<div class="w">⚠ 하락장 주의 — S&amp;P500이 200일선보다 {abs(d["spy"]["gap"])}% 아래</div>' if d.get("spy") and d["spy"].get("below") else ""
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}body{{background:#0b0f16;font-family:'Noto Sans CJK KR','Apple SD Gothic Neo',sans-serif;color:#e8ecf3}}
#card{{width:860px;padding:24px 26px 16px;background:#0f141c}}h1{{font-size:25px;font-weight:800}}.src{{color:#7d8796;font-size:12px;margin-top:4px}}
.lead{{font-size:14px;line-height:1.7;color:#d6dce5;margin-top:12px;background:#151c27;border:1px solid #222b38;border-radius:12px;padding:12px 14px}}
.ts{{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}}.t{{flex:1;min-width:110px;background:#151c27;border:1px solid #222b38;border-radius:12px;padding:9px 12px}}
.a{{font-size:11.5px;color:#9aa4b2}}.b{{font-size:19px;font-weight:800;margin-top:2px}}.c{{font-size:11px;color:#6f7a89}}
.g{{display:flex;gap:10px;margin-top:12px}}.g>div{{flex:1;background:#151c27;border:1px solid #222b38;border-radius:12px;padding:10px 13px;font-size:12.5px;line-height:1.75;color:#d6dce5}}
h3{{font-size:13px;color:#c6cfdb;margin-bottom:4px}}hr{{border:none;border-top:1px solid #222b38;margin:4px 0}}
.w{{margin-top:12px;padding:9px 13px;border:1px solid {DN};border-radius:12px;background:rgba(246,70,93,.1);font-size:13px}}
.ft{{margin-top:12px;font-size:11px;color:#5f6a79;text-align:center}}</style></head><body><div id="card">
<h1>🇺🇸 {E(d["title"])}</h1><div class="src">{E(d["src"])} · {E(d["made"])}</div>{warn}
<div class="lead">{md(d["lead"])}</div><div class="ts">{tiles}</div>
<div class="g"><div><h3>{E(d["us"]["cpuTitle"])}</h3>{li(d["us"]["cpu"])}</div><div><h3>{E(d["us"]["quietTitle"])}</h3>{li(d["us"]["quiet"])}</div><div><h3>🏭 업종 (시총 가중)</h3>{secs}</div></div>
{f'<div class="g"><div><h3>🗓 일정 · 실적 발표</h3>{ev}</div></div>' if ev else ''}
{f'<div class="g"><div><h3>🧭 미장 추천 TOP 5 (전날 기준)</h3>{pk}</div></div>' if pk else ''}
<div class="ft">VANTOR 미장 브리핑 · 규칙 기반 자동 작성 · 교육용 참고이며 매매 신호가 아닙니다 · 시세는 네이버 증권(선물 10분 지연)</div></div></body></html>"""


def render(d, path):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 860, "height": 1400}, device_scale_factor=2, locale="ko-KR")
        pg.set_content(card_html(d), wait_until="load")
        pg.evaluate("document.fonts.ready")
        pg.locator("#card").screenshot(path=path)
        b.close()


def post(webhook, png, d):
    content = f"🇺🇸 **{d['title']}**\n{d['lead'][:600]}\n상세 → https://sannaq.github.io/vantor/  ※ 교육용 참고, 매매 신호 아님"
    bd = uuid.uuid4().hex
    img = open(png, "rb").read()
    body = (f"--{bd}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"
            + json.dumps({"content": content, "username": "VANTOR 미장 브리핑"}, ensure_ascii=False)
            + f"\r\n--{bd}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"us-brief-{d['date']}-{d['slot']}.png\"\r\nContent-Type: image/png\r\n\r\n").encode() + img + f"\r\n--{bd}--\r\n".encode()
    req = urllib.request.Request(webhook, data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={bd}", "User-Agent": "vantor-us-brief"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print("  디스코드 전송", r.status)


def main():
    now = datetime.fromisoformat(os.environ["AS_OF"]) if os.environ.get("AS_OF") else datetime.now(timezone.utc)  # AS_OF = 시험·재작성용 (예: 2026-10-09T21:30:00+00:00)
    now_ny, now_kst = now.astimezone(NY), now.astimezone(KST)
    force = os.environ.get("FORCE") == "1"
    slot = pick_slot(now_ny)
    if not slot:
        print(f"브리핑 시간이 아님 (미국 {now_ny:%H:%M})")
        return
    if not force and (now_ny.weekday() >= 5 or now_ny.strftime("%Y-%m-%d") in HOLIDAYS):
        print("미국 휴장일 → 건너뜀")
        return
    os.makedirs(OUT, exist_ok=True)
    name = f"{now_ny:%Y-%m-%d}-{slot}.json"
    if not force and os.path.exists(os.path.join(OUT, name)):
        print("이미 만듦", name)
        return
    d = build(slot, now_ny, now_kst)
    json.dump(d, open(os.path.join(OUT, name), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    idx_p = os.path.join(OUT, "index.json")
    idx = json.load(open(idx_p, encoding="utf-8")) if os.path.exists(idx_p) else []
    idx = [x for x in idx if x.get("file") != name] + [{"date": d["date"], "slot": slot, "title": d["title"], "file": name}]
    idx.sort(key=lambda x: (x["date"], ["pre", "mid", "close"].index(x["slot"])), reverse=True)
    json.dump(idx[:90], open(idx_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("저장", name, "·", d["lead"][:120])
    out_dir = os.environ.get("OUT_DIR", "/tmp/brief-img")
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, name.replace(".json", ".png").replace(d["date"], "us-" + d["date"]))
    if slot in ("pre", "close") or os.environ.get("IMG") == "1":
        render(d, png)
        print("이미지", png)
        wh = os.environ.get("DISCORD_US_BRIEF_WEBHOOK", "").strip()
        if wh and slot in ("pre", "close"):
            post(wh, png, d)
        elif slot in ("pre", "close"):
            print("DISCORD_US_BRIEF_WEBHOOK 비어 있음 → 전송 안 함")


if __name__ == "__main__":
    main()
