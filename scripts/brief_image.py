#!/usr/bin/env python3
"""브리핑 요약판 이미지 → 디스코드.

워커가 briefs/<날짜>-<am|noon|pm>.json 을 올리면, 그 브리핑 + 저장소의 수급(feeds/flow.json)·
일정(events.json)을 한 장짜리 요약판으로 그려 PNG 로 찍고 디스코드 웹후크에 올린다. 워커는 건드리지 않는다.

담는 것: 지수·환율(20일 그래프) · 핵심 3줄 · 투자자별 매매 · 상승/하락·52주 신고/신저 ·
외국인·기관 순매수/순매도 TOP5 · 미국장 · 관찰선 · 오늘 일정

사용: python3 scripts/brief_image.py briefs/2026-10-07-pm.json [...]
환경변수: DISCORD_BRIEF_WEBHOOK (없으면 PNG 만 만들고 끝), OUT_DIR (기본 /tmp/brief-img)
"""
import html
import json
import os
import re
import sys
import urllib.request
import uuid

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLOT = {"am": "개장", "noon": "장중", "pm": "장마감"}
UP, DN, FLAT = "#2ebd85", "#f6465d", "#9aa4b2"  # 사이트와 같은 색: 상승 초록 · 하락 빨강

E = lambda s: html.escape(str(s if s is not None else ""))


def load(rel):
    try:
        with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def num(s):
    try:
        return float(str(s).replace(",", "").replace("%", "").replace("+", ""))
    except Exception:
        return None


def col(v):
    return FLAT if v is None or abs(v) < 0.005 else (UP if v > 0 else DN)


def sgn(v, d=2):
    return "—" if v is None else f"{v:+.{d}f}%"


def md(s):  # **굵게** 만 살린다
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", E(s))


def three_lines(lead):
    """문단마다 첫 문장만 — 최대 3줄."""
    out = []
    for para in re.split(r"\n\s*\n", lead or ""):
        para = re.sub(r"\(교육용[^)]*\)", "", para).strip()
        if not para:
            continue
        m = re.match(r"(.+?(?:다|요|음|함)\.)(\s|$)", para)
        out.append((m.group(1) if m else para).strip())
    return out[:3]


def spark(series, w=236, h=40):
    vals = [v for _, v in series if v is not None]
    if len(vals) < 2:
        return ""
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    pts = " ".join(f"{i * w / (len(vals) - 1):.1f},{h - 3 - (v - lo) / rng * (h - 6):.1f}" for i, v in enumerate(vals))
    c = col(vals[-1] - vals[0])
    return (f'<svg width="100%" height="{h}" viewBox="0 0 {w} {h}" preserveAspectRatio="none"><polyline points="{pts}" fill="none" '
            f'stroke="{c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>')


def pill_val(brief, name):
    """kr.pills 의 '코스피 6,804 (-1.98%)' → (6804, -1.98)."""
    for p in (brief.get("kr") or {}).get("pills") or []:
        m = re.match(rf"{name}\s*([\d,\.]+)\s*\(([-+]?[\d\.]+)%\)", p.get("t", ""))
        if m:
            return num(m.group(1)), num(m.group(2))
    return None, None


def breadth(brief):
    for p in (brief.get("kr") or {}).get("pills") or []:
        m = re.search(r"상승\s*([\d,]+)\s*vs\s*하락\s*([\d,]+)", p.get("t", ""))
        if m:
            return int(num(m.group(1))), int(num(m.group(2)))
    m = re.search(r"상승[^\d]{0,10}([\d,]+)개.*?하락[^\d]{0,10}([\d,]+)개", brief.get("lead", ""))
    return (int(num(m.group(1))), int(num(m.group(2)))) if m else (None, None)


def levels(brief):
    body = ((brief.get("core") or {}).get("body") or "") + " " + " ".join(p.get("t", "") for p in (brief.get("kr") or {}).get("pills") or [])
    s = re.search(r"지지\s*\**([\d,]+)", body)
    r = re.search(r"저항\s*\**([\d,]+)", body)
    return (num(s.group(1)) if s else None), (num(r.group(1)) if r else None)


def ymd(s):
    s = str(s or "")
    return f"{int(s[4:6])}/{int(s[6:8])}" if len(s) == 8 else s


def index_card(name, val, chg, series, fmt="{:,.2f}", date=None):
    series = list(series)
    # 장중·개장 브리핑이면 20일 흐름 끝에 오늘 값을 붙인다
    if val is not None and date and series and series[-1][0] < date:
        series.append([date, val])
    if val is not None and float(val).is_integer():
        fmt = "{:,.0f}"
    if val is None and series:
        val = series[-1][1]
        if chg is None and len(series) > 1 and series[-2][1]:
            chg = (series[-1][1] / series[-2][1] - 1) * 100
    return (f'<div class="ix"><div class="ixn">{E(name)}</div>'
            f'<div class="ixv">{"—" if val is None else fmt.format(val)}</div>'
            f'<div class="ixc" style="color:{col(chg)}">{sgn(chg)}</div>'
            f'<div class="ixs">{spark(series)}</div><div class="ixf">20일 흐름</div></div>')


def inv_block(flow):
    rows = flow.get("inv") or []
    if not rows:
        return '<div class="empty">투자자별 매매 자료 없음</div>'
    labels = ["개인", "외국인", "기관", "프로그램"]
    mx = max((abs(v) for r in rows for v in r[1:] if v is not None), default=1) or 1
    out = []
    for r in rows[:2]:
        out.append(f'<div class="invm">{"코스피" if r[0] == "KOSPI" else "코스닥"}</div>')
        for lab, v in zip(labels, r[1:]):
            if v is None:
                continue
            pct = abs(v) / mx * 50
            bar = (f'<div class="bar" style="left:50%;width:{pct:.1f}%;background:{UP}"></div>' if v >= 0 else
                   f'<div class="bar" style="right:50%;width:{pct:.1f}%;background:{DN}"></div>')
            out.append(f'<div class="invr"><div class="invl">{lab}</div><div class="track"><div class="mid"></div>{bar}</div>'
                       f'<div class="invv" style="color:{col(v)}">{v:+,.0f}억</div></div>')
    return "".join(out)


def top_list(title, rows, color, sell=False):
    # 순매도 목록은 금액이 양수로 저장돼 있다 → 화면엔 − 로
    items = "".join(f'<div class="tr"><span class="tn">{i + 1}. {E(n)}</span><span style="color:{color}">{(-abs(v) if sell else v):+,.0f}억</span></div>'
                    for i, (n, v) in enumerate((rows or [])[:5]))
    return f'<div class="tl"><div class="tlh">{title}</div>{items or "<div class=empty>없음</div>"}</div>'


def us_block(brief, flow):
    tiles = [(t.get("t"), num(t.get("v"))) for t in (brief.get("us") or {}).get("tiles") or []]
    names = " ".join(n or "" for n, _ in tiles)
    spy = ((flow or {}).get("us") or {}).get("SPY") or {}
    if "S&P" not in names and spy.get("c") is not None:
        tiles.append(("S&P500", spy["c"]))
    if not tiles:
        return '<div class="empty">미국장 자료 없음</div>'
    return "".join(f'<div class="us"><div class="usn">{E(n)}</div><div class="usv" style="color:{col(v)}">{sgn(v)}</div></div>'
                   for n, v in tiles)


def level_block(cur, sup, res):
    if sup is None or res is None:
        return '<div class="empty">관찰선 없음</div>'
    lo, hi = min(sup, res), max(sup, res)
    pad = (hi - lo) * 0.6 or 50
    a, b = lo - pad, hi + pad
    pos = lambda v: max(0, min(100, (v - a) / (b - a) * 100))
    cur_mark = (f'<div class="lvc" style="left:{pos(cur):.1f}%"><div class="lvcd"></div><div class="lvct">현재 {cur:,.0f}</div></div>'
                if cur is not None else "")
    where = ""
    if cur is not None:
        where = ("지지선 아래 — 관점 무효 구간" if cur < sup else "저항선 위 — 상방 재개 구간" if cur > res
                 else f"지지까지 {cur - sup:,.0f}p · 저항까지 {res - cur:,.0f}p")
    return (f'<div class="lv"><div class="lvbar"></div>'
            f'<div class="lvk" style="left:{pos(sup):.1f}%;--c:{DN}"><div class="lvl"></div><div class="lvt">지지 {sup:,.0f}</div></div>'
            f'<div class="lvk" style="left:{pos(res):.1f}%;--c:{UP}"><div class="lvl"></div><div class="lvt">저항 {res:,.0f}</div></div>'
            f'{cur_mark}</div><div class="lvw">{E(where)}</div>')


def events_block(ev, date):
    rows = [e for e in (ev or {}).get("events") or [] if e.get("date") == date and (e.get("imp") or 0) >= 2]
    if not rows:
        return '<div class="empty">오늘 주요 일정 없음</div>'
    order = lambda e: (0, e["time"]) if re.match(r"\d\d:\d\d", e.get("time", "")) else (-1, e.get("time", ""))
    rows = sorted(rows, key=lambda e: (-(e.get("imp") or 0), order(e)))[:6]
    rows.sort(key=order)
    out = []
    for e in rows:
        flag = "🇰🇷" if e.get("market") == "KR" else "🇺🇸"
        res = f' <span class="evr">결과 {E(e["actual"])}</span>' if e.get("actual") else ""
        out.append(f'<div class="ev"><span class="evt">{E(e.get("time"))}</span><span>{flag}</span>'
                   f'<span class="evn">{E(e.get("title"))}{res}</span><span class="evs">{"★" * (e.get("imp") or 0)}</span></div>')
    return "".join(out)


CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0f16;font-family:'Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#e8ecf3}
#card{width:860px;padding:26px 28px 18px;background:#0f141c}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #222b38;padding-bottom:14px}
.hd h1{font-size:28px;font-weight:800;letter-spacing:-.5px}
.hd .slot{display:inline-block;font-size:13px;font-weight:800;color:#0b0f16;background:#4a9eff;border-radius:6px;padding:3px 9px;margin-right:10px;vertical-align:5px}
.hd .src{color:#7d8796;font-size:13px;font-weight:700;text-align:right;line-height:1.5}
.row{display:flex;gap:12px;margin-top:14px}
.box{background:#151c27;border:1px solid #222b38;border-radius:14px;padding:14px 16px;flex:1;min-width:0}
.bh{font-size:14px;font-weight:800;color:#c6cfdb;margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline}
.bh small{font-size:11.5px;color:#6f7a89;font-weight:600}
.ix{flex:1;min-width:0;background:#151c27;border:1px solid #222b38;border-radius:14px;padding:13px 15px}
.ixn{font-size:13px;color:#9aa4b2;font-weight:700}.ixv{font-size:26px;font-weight:800;margin-top:2px;letter-spacing:-.5px}
.ixc{font-size:15px;font-weight:800}.ixs{margin-top:6px}.ixf{font-size:10.5px;color:#5f6a79}
.sum .ln{font-size:14.5px;line-height:1.6;color:#d6dce5;padding-left:16px;position:relative;margin-bottom:4px}
.sum .ln:before{content:'';position:absolute;left:2px;top:10px;width:6px;height:6px;border-radius:50%;background:#4a9eff}
.invm{font-size:12px;font-weight:800;color:#7d8796;margin:6px 0 3px}
.invr{display:flex;align-items:center;gap:8px;height:22px}
.invl{width:52px;font-size:12.5px;color:#c6cfdb}.invv{width:84px;text-align:right;font-size:12.5px;font-weight:800}
.track{flex:1;position:relative;height:10px;background:#1c2431;border-radius:5px}
.mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#3a4556}
.bar{position:absolute;top:0;bottom:0;border-radius:5px}
.br{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:4px 0 6px}
.brl{display:flex;justify-content:space-between;font-size:13px;font-weight:800}
.brn{font-size:12.5px;color:#9aa4b2;margin-top:2px}.brn b{color:#e8ecf3}
.k52{display:flex;gap:10px;margin-top:12px}.k52 div{flex:1;background:#1c2431;border-radius:10px;padding:8px 10px;font-size:12px;color:#9aa4b2}
.k52 b{display:block;font-size:20px;margin-top:2px}
.tops{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px}
.tlh{font-size:12px;font-weight:800;color:#9aa4b2;margin-bottom:5px}
.tr{display:flex;justify-content:space-between;gap:6px;font-size:12.5px;line-height:1.85;font-weight:700}
.tn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d6dce5;font-weight:500}
.uss{display:flex;gap:8px}.us{flex:1;background:#1c2431;border-radius:10px;padding:9px 11px}
.usn{font-size:12px;color:#9aa4b2}.usv{font-size:19px;font-weight:800}
.lv{position:relative;height:58px;margin:4px 10px 0}
.lvbar{position:absolute;left:0;right:0;top:22px;height:6px;border-radius:3px;background:#1c2431}
.lvk{position:absolute;top:12px;transform:translateX(-50%)}.lvl{width:2px;height:26px;background:var(--c);margin:0 auto}
.lvt{font-size:11.5px;font-weight:800;color:var(--c);white-space:nowrap;margin-top:2px;transform:translateX(-0%)}
.lvc{position:absolute;top:0;transform:translateX(-50%);text-align:center}
.lvcd{width:14px;height:14px;border-radius:50%;background:#4a9eff;border:3px solid #0f141c;margin:15px auto 0}
.lvct{position:absolute;top:-4px;left:50%;transform:translate(-50%,-100%);font-size:11.5px;font-weight:800;color:#4a9eff;white-space:nowrap}
.lvw{font-size:12.5px;color:#9aa4b2;margin-top:2px}
.ev{display:flex;gap:9px;align-items:center;font-size:13px;line-height:1.95}
.evt{width:58px;color:#7d8796;font-weight:700;font-size:12px}.evn{flex:1;color:#d6dce5}
.evs{color:#f0b90b;font-size:11px;letter-spacing:-1px}.evr{color:#4a9eff;font-weight:800;font-size:12px}
.empty{font-size:12.5px;color:#6f7a89}
.ft{margin-top:14px;font-size:11px;color:#5f6a79;text-align:center}
"""


def build(brief, flow, ev):
    flow = flow or {}
    tr = flow.get("trend") or {}
    kv, kc = pill_val(brief, "코스피")
    qv, qc = pill_val(brief, "코스닥")
    up, dn = breadth(brief)
    sup, res = levels(brief)
    sm = flow.get("smart") or {}
    upd = flow.get("updated", "")
    inv_when = ymd(flow.get("invDate"))
    lines = three_lines(brief.get("lead"))

    br = ""
    if up is not None:
        tot = (up + dn) or 1
        br = (f'<div class="brl"><span style="color:{UP}">상승 {up:,}</span><span style="color:{DN}">하락 {dn:,}</span></div>'
              f'<div class="br"><div style="width:{up / tot * 100:.1f}%;background:{UP}"></div>'
              f'<div style="flex:1;background:{DN}"></div></div>'
              f'<div class="brn">오른 종목 비율 <b>{up / tot * 100:.0f}%</b> · '
              + (f'하락이 상승의 <b>{dn / up:.1f}배</b>' if up and dn > up else f'상승이 하락의 <b>{up / dn:.1f}배</b>' if dn and up > dn else '상승·하락 비슷') + '</div>')
    k52 = (f'<div class="k52"><div>52주 신고가<b style="color:{UP}">{flow.get("h52u", "—")}</b></div>'
           f'<div>52주 신저가<b style="color:{DN}">{flow.get("h52d", "—")}</b></div></div>')

    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div id="card">
<div class="hd"><h1><span class="slot">{E(SLOT.get(brief.get("slot"), ""))}</span>{E(brief.get("title") or "증시 브리핑")}</h1>
<div class="src">VANTOR<br>{E(brief.get("date"))}</div></div>
<div class="row">
 {index_card("코스피", kv, kc, tr.get("KOSPI") or [], date=brief.get("date"))}
 {index_card("코스닥", qv, qc, tr.get("KOSDAQ") or [], date=brief.get("date"))}
 {index_card("원/달러", None, None, tr.get("USD/KRW") or [], "{:,.1f}")}
</div>
<div class="row"><div class="box sum"><div class="bh">핵심 3줄</div>{"".join(f'<div class="ln">{md(l)}</div>' for l in lines) or '<div class="empty">요약 없음</div>'}</div></div>
<div class="row">
 <div class="box" style="flex:1.25"><div class="bh">투자자별 매매 <small>{E(inv_when)} 기준 · 억원</small></div>{inv_block(flow)}</div>
 <div class="box"><div class="bh">시장 폭</div>{br}{k52}</div>
</div>
<div class="row"><div class="box"><div class="bh">수급 상위 5 <small>{E(ymd(sm.get("date")))} 확정 · 시총 상위 200 중</small></div><div class="tops">
 {top_list("외국인 순매수", sm.get("foreign"), UP)}{top_list("외국인 순매도", sm.get("foreignSell"), DN, True)}
 {top_list("기관 순매수", sm.get("inst"), UP)}{top_list("기관 순매도", sm.get("instSell"), DN, True)}
</div></div></div>
<div class="row">
 <div class="box"><div class="bh">간밤 미국장</div><div class="uss">{us_block(brief, flow)}</div></div>
 <div class="box"><div class="bh">코스피 관찰선</div>{level_block(kv, sup, res)}</div>
</div>
<div class="row"><div class="box"><div class="bh">오늘 일정 <small>★★ 이상 · 한국 시각</small></div>{events_block(ev, brief.get("date"))}</div></div>
<div class="ft">VANTOR 브리핑 · 수급 갱신 {E(upd)} · 교육용 참고이며 매매 신호가 아닙니다</div>
</div></body></html>"""


def post(webhook, png, data):
    title = data.get("title") or "증시 브리핑"
    content = f"🖼 **{title}** 요약판\nhttps://sannaq.github.io/vantor/#brief"
    boundary = uuid.uuid4().hex
    with open(png, "rb") as f:
        img = f.read()
    name = os.path.basename(png)
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\n"
        f"Content-Type: application/json\r\n\r\n"
        + json.dumps({"content": content, "username": "VANTOR 브리핑"}, ensure_ascii=False)
        + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{name}\"\r\n"
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + img + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        webhook, data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "vantor-brief-image"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"  디스코드 전송 {r.status}")


def main(paths):
    webhook = os.environ.get("DISCORD_BRIEF_WEBHOOK", "").strip()
    out_dir = os.environ.get("OUT_DIR", "/tmp/brief-img")
    os.makedirs(out_dir, exist_ok=True)
    if not webhook:
        print("DISCORD_BRIEF_WEBHOOK 비어 있음 → 이미지만 만들고 전송 안 함")
    flow, ev = load("feeds/flow.json"), load("events.json")
    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 860, "height": 1400}, device_scale_factor=2, locale="ko-KR")
        for rel in paths:
            try:
                data = load(rel)
                if not data:
                    raise ValueError("브리핑 파일을 읽지 못함")
                out = os.path.join(out_dir, os.path.basename(rel).replace(".json", ".png"))
                page.set_content(build(data, flow, ev), wait_until="load")
                page.evaluate("document.fonts.ready")
                page.locator("#card").screenshot(path=out)
                print(f"{rel} → {out} ({os.path.getsize(out) // 1024}KB)")
                if webhook:
                    post(webhook, out, data)
            except Exception as e:  # 한 건 실패가 나머지를 막지 않게
                failed += 1
                print(f"{rel} 실패: {e}")
        browser.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
