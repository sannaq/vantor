#!/usr/bin/env python3
"""이벤트 요약판 → 디스코드 '주식-이벤트' 채널 (2026-10-12 사용자 결정).

- 월요일: 이번 주 전체 일정 + 지난 거래일 결과
- 화~금: 오늘 일정 + 어제(직전 거래일) 결과 — 결과 = 실제값·예상(BLS·FRED) + 발표 뒤 첫 장 시장 반응
- 주말은 보내지 않는다. 중요도 상관없이 전부.
events.yml 이 이벤트를 갱신한 뒤 부른다. 같은 날 두 번 보내지 않게 feeds/events-sent.json 에 남긴다.
환경변수: DISCORD_EVENT_WEBHOOK (없으면 PNG 만 만들고 전송·기록 안 함), OUT_DIR (기본 /tmp/brief-img), FORCE=1 (오늘 이미 보냈어도)
"""
import html, json, os, re, sys, urllib.request, uuid
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KST = timezone(timedelta(hours=9))
UP, DN, FLAT = "#2ebd85", "#f6465d", "#9aa4b2"
E = lambda s: html.escape(str(s if s is not None else ""))
WD = "월화수목금토일"
FLAG = {"US": "🇺🇸", "KR": "🇰🇷"}
TYPE = {"data": ("경제지표", "#f6465d"), "earnings": ("실적", "#4a9eff"), "policy": ("정책", "#2ebd85"), "event": ("이벤트", "#e0a83e")}


def load(rel):
    try:
        with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa
        return {}


def md(d):
    return f"{int(d[5:7])}/{int(d[8:10])}({WD[datetime.fromisoformat(d).weekday()]})"


def sk(e):
    t = e.get("time", "")
    return (e["date"], t if re.fullmatch(r"\d\d:\d\d", t) else ("08:59" if "개장" in t else "00:00"))


def fc_text(e):
    m = re.search(r"\((예상[^)]*)\)", e.get("note", ""))
    return m.group(1) if m else ""


def rx_text(rx):
    if not rx:
        return ""
    def one(it):
        v, u = it[1], ("bp" if it[2] == "bp" else "%")
        c = UP if v > 0 else DN if v < 0 else FLAT
        return f'{E(it[0])} <b style="color:{c}">{"+" if v > 0 else ""}{v if u == "bp" else f"{v:.2f}"}{u}</b>'
    d = rx["day"]
    return f'<span class="mut">발표 뒤 {int(d[5:7])}/{int(d[8:10])} {"미국장" if rx.get("mk") == "US" else "국내장"}</span> ' + " · ".join(one(i) for i in rx["items"])


def res_text(r):
    if not r:
        return ""
    v = re.sub(r"\*\*", "", r.get("v", ""))
    c = {"hot": DN, "cool": UP, "up": UP, "down": DN}.get(r.get("verdict"), FLAT)
    head, _, word = v.partition(" — ")
    return f'{E(head)}' + (f' — <b style="color:{c}">{E(word)}</b>' if word else "")


def row(e, with_result):
    tp = TYPE.get(e.get("type"), TYPE["event"])
    stars = "★" * (e.get("imp") or 1)
    sub = ""
    if with_result:
        parts = [x for x in (res_text(e.get("result")), rx_text(e.get("rx"))) if x]
        sub = "<br>".join(parts) if parts else ("" if e.get("time") in ("휴장", "참고") else '<span class="mut">결과 집계 전</span>')
    else:
        sub = E(fc_text(e)) if fc_text(e) else ""
    return (f'<div class="ev" style="border-left-color:{tp[1]}"><div class="l1"><span class="tm">{E(e.get("time",""))}</span>'
            f'<span>{FLAG.get(e.get("market"), "🌐")}</span><span class="st">{stars}</span><b>{E(e["title"])}</b>'
            f'<span class="tp" style="color:{tp[1]}">{tp[0]}</span></div>' + (f'<div class="l2">{sub}</div>' if sub else "") + "</div>")


CSS = """*{margin:0;padding:0;box-sizing:border-box}body{background:#0b0f16;font-family:'Noto Sans CJK KR','Apple SD Gothic Neo',sans-serif;color:#e8ecf3}
#card{width:860px;padding:24px 26px 16px;background:#0f141c}.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #222b38;padding-bottom:12px}
.hd h1{font-size:25px;font-weight:800}.hd .src{color:#7d8796;font-size:12.5px;font-weight:700;text-align:right}
.sec{margin-top:16px;font-size:15px;font-weight:800;color:#c6cfdb}.day{margin-top:10px;font-size:13px;font-weight:800;color:#9aa4b2}
.ev{background:#151c27;border:1px solid #222b38;border-left:3px solid;border-radius:10px;padding:8px 12px;margin-top:6px}
.l1{display:flex;gap:8px;align-items:center;font-size:14px}.tm{color:#7d8796;font-size:12px;font-weight:700;width:46px}.st{color:#e0a83e;font-size:11px;letter-spacing:-1px}
.tp{margin-left:auto;font-size:11px;font-weight:700}.l2{font-size:12.5px;color:#c6cfdb;margin:4px 0 0 54px;line-height:1.6}.mut{color:#7d8796}
.none{color:#7d8796;font-size:13px;margin-top:6px}.ft{margin-top:14px;font-size:11px;color:#5f6a79;text-align:center}"""


def build(title, sub, sections):
    body = ""
    for name, groups, with_res in sections:
        body += f'<div class="sec">{name}</div>'
        if not any(evs for _, evs in groups):
            body += '<div class="none">없음</div>'
        for day, evs in groups:
            if not evs:
                continue
            if day:
                body += f'<div class="day">{day}</div>'
            body += "".join(row(e, with_res) for e in evs)
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div id="card">'
            f'<div class="hd"><h1>📅 {E(title)}</h1><div class="src">VANTOR · {E(sub)}</div></div>{body}'
            f'<div class="ft">시간은 한국시간 · 결과의 시장 반응은 그날 시장 전체 움직임(이 이벤트만의 영향 아님) · 교육용 참고</div></div></body></html>')


def shoot(htm, out):
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 860, "height": 1400}, device_scale_factor=2, locale="ko-KR")
        pg.set_content(htm, wait_until="load")
        pg.evaluate("document.fonts.ready")
        pg.locator("#card").screenshot(path=out)
        b.close()


def post(webhook, png, text):
    boundary = uuid.uuid4().hex
    with open(png, "rb") as f:
        img = f.read()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n'
            + json.dumps({"content": text, "username": "VANTOR 이벤트"}, ensure_ascii=False)
            + f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="{os.path.basename(png)}"\r\nContent-Type: image/png\r\n\r\n').encode() + img + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(webhook, data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "vantor-events"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print("  디스코드 전송", r.status)


def main():
    now = datetime.now(KST)
    today = now.date()
    if today.weekday() >= 5 and not os.environ.get("FORCE"):
        print("주말 → 보내지 않음"); return 0
    sent_path = os.path.join(ROOT, "feeds", "events-sent.json")
    sent = load("feeds/events-sent.json")
    webhook = os.environ.get("DISCORD_EVENT_WEBHOOK", "").strip()
    if sent.get("last") == today.isoformat() and not os.environ.get("FORCE"):
        print("오늘 이미 보냄 → 건너뜀"); return 0
    cur, prev = load("events.json"), load("feeds/events-prev.json")
    allev = (prev.get("events") or []) + (cur.get("events") or [])
    # 직전 거래일(주말 건너뜀)
    last = today - timedelta(days=1)
    while last.weekday() >= 5:
        last -= timedelta(days=1)
    tday, lday = today.isoformat(), last.isoformat()
    past = sorted([e for e in allev if e["date"] == lday or (last < datetime.fromisoformat(e["date"]).date() < today)], key=sk)
    if today.weekday() == 0:
        week = sorted(cur.get("events") or [], key=sk)
        days = sorted({e["date"] for e in week})
        groups = [(md(d), [e for e in week if e["date"] == d]) for d in days]
        title, sub = f"이번 주 이벤트 {cur.get('range','')}", "월요일 주간 일정"
        sections = [("이번 주 일정", groups, False), (f"지난 거래일({md(lday)}) 결과", [("", past)], True)]
        top = [e for e in week if (e.get("imp") or 1) >= 3]
        text = f"📅 **이번 주 이벤트 {cur.get('range','')}** — {len(week)}건" + (" · 핵심: " + ", ".join(f"{e['title']}({md(e['date'])} {e['time']})" for e in top[:3]) if top else "")
    else:
        todays = sorted([e for e in allev if e["date"] == tday], key=sk)
        title, sub = f"{md(tday)} 오늘 일정", "매일 아침"
        sections = [("오늘 일정", [("", todays)], False), (f"어제({md(lday)}) 결과", [("", past)], True)]
        key = [e for e in todays if (e.get("imp") or 1) >= 3] or todays
        text = f"📅 **{md(tday)} 오늘 일정 {len(todays)}건**" + (" · 핵심: " + ", ".join(f"{e['title']} {e['time']}" for e in key[:3]) if key else " · 주요 일정 없음")
    out_dir = os.environ.get("OUT_DIR", "/tmp/brief-img")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"events-{tday}.png")
    shoot(build(title, sub, sections), out)
    print(out, os.path.getsize(out) // 1024, "KB ·", text)
    if not webhook:
        print("DISCORD_EVENT_WEBHOOK 비어 있음 → 전송 안 함"); return 0
    post(webhook, out, text + "\n상세 → https://sannaq.github.io/vantor/")
    with open(sent_path, "w", encoding="utf-8") as f:
        json.dump({"last": tday, "at": now.strftime("%Y-%m-%d %H:%M")}, f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
