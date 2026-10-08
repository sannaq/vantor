#!/usr/bin/env python3
"""종합 평점 추천 → 디스코드 (장마감 후 1회).

feeds/stock-picks.json(scripts/score_all.mjs 결과)을 한 장짜리 이미지로 그려 웹후크에 올린다.
환경변수: DISCORD_RECO_WEBHOOK (없으면 PNG 만 만들고 끝), OUT_DIR (기본 /tmp/brief-img)
"""
import html
import json
import os
import sys
import urllib.request
import uuid

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UP, DN, FLAT = "#2ebd85", "#f6465d", "#9aa4b2"
GRADE = {"A": "#2ebd85", "B": "#7bd389", "C": "#f0b90b", "D": "#f08a4b", "E": "#f6465d"}
VIEWC = {"긍정": UP, "중립": "#f0b90b", "주의": DN}
PARTS = [("추세", 40), ("수급", 25), ("가치", 20), ("위험", 15)]
E = lambda s: html.escape(str(s if s is not None else ""))


def sgn(v, d=2):
    return "—" if v is None else f"{v:+.{d}f}%"


def col(v):
    return FLAT if v is None or abs(v) < 0.005 else (UP if v > 0 else DN)


def bars(parts):
    out = []
    for (lab, mx), v in zip(PARTS, parts):
        w = max(0, min(100, v / mx * 100))
        out.append(f'<div class="pb"><span>{lab}</span><div class="pt"><div style="width:{w:.0f}%"></div></div><b>{v:g}</b></div>')
    return "".join(out)


def row(x, i, weak=False):
    why = x["bad"] if weak else x["good"]
    why = why or (x["good"] if weak else x["bad"]) or ["뚜렷한 특징 없음"]
    per = f'PER {x["per"]:.1f}' if x.get("per") else "PER —"
    return f"""<div class="rw">
 <div class="rk">{i}</div>
 <div class="sc" style="--g:{GRADE.get(x["grade"], FLAT)}"><b>{x["total"]}</b><span>{x["grade"]}</span></div>
 <div class="nm"><div class="n1">{E(x["n"])} <small>{E(x["c"])} · {E(x["mk"])}</small></div>
  <div class="n2"><span style="color:{VIEWC[x["view"]]};font-weight:800">{x["view"]}</span> · {x["px"]:,.0f}원
   <span style="color:{col(x.get("day"))}">{sgn(x.get("day"))}</span> · 20일 <span style="color:{col(x.get("ret20"))}">{sgn(x.get("ret20"), 1)}</span>
   · {per} · 거래대금 {x["tv20"]:,}억</div>
  <div class="why">{" · ".join(E(w) for w in why[:3])}</div></div>
 <div class="pbs">{bars(x["parts"])}</div>
</div>"""


CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0f16;font-family:'Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#e8ecf3}
#card{width:900px;padding:26px 28px 18px;background:#0f141c}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #222b38;padding-bottom:14px}
.hd h1{font-size:27px;font-weight:800;letter-spacing:-.5px}.hd .src{color:#7d8796;font-size:12.5px;font-weight:700;text-align:right;line-height:1.55}
.dist{display:flex;gap:10px;margin-top:14px}.dist div{flex:1;background:#151c27;border:1px solid #222b38;border-radius:12px;padding:10px 14px;font-size:12.5px;color:#9aa4b2}
.dist b{display:block;font-size:22px;margin-top:2px}
.sec{margin-top:16px;font-size:15px;font-weight:800;color:#c6cfdb;display:flex;justify-content:space-between;align-items:baseline}
.sec small{font-size:11.5px;color:#6f7a89;font-weight:600}
.rw{display:flex;gap:12px;align-items:center;background:#151c27;border:1px solid #222b38;border-radius:12px;padding:10px 14px;margin-top:8px}
.rk{width:20px;font-size:14px;font-weight:800;color:#6f7a89;text-align:center}
.sc{width:56px;height:56px;border-radius:12px;border:2px solid var(--g);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none}
.sc b{font-size:21px;line-height:1}.sc span{font-size:11px;font-weight:800;color:var(--g);margin-top:2px}
.nm{flex:1;min-width:0}.n1{font-size:16px;font-weight:800}.n1 small{font-size:11.5px;color:#6f7a89;font-weight:600}
.n2{font-size:12px;color:#9aa4b2;margin-top:2px}.why{font-size:12.5px;color:#d6dce5;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pbs{width:178px;flex:none}.pb{display:flex;align-items:center;gap:6px;font-size:11px;color:#9aa4b2;height:15px}
.pb span{width:26px}.pb b{width:20px;text-align:right;color:#d6dce5}
.pt{flex:1;height:6px;background:#1c2431;border-radius:3px;overflow:hidden}.pt div{height:100%;background:#4a9eff;border-radius:3px}
.ft{margin-top:14px;font-size:11px;color:#5f6a79;text-align:center;line-height:1.6}
"""


def build(p):
    d = p["date"]
    day = f"{int(d[4:6])}월 {int(d[6:8])}일"
    dist = p["dist"]
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div id="card">
<div class="hd"><h1>🧭 {day} 종합 평점 TOP 10</h1><div class="src">VANTOR · 장마감 기준<br>코스피·코스닥 {p["n"]:,}종목 채점</div></div>
<div class="dist"><div>긍정 관점<b style="color:{UP}">{dist["긍정"]:,}</b></div><div>중립<b style="color:#f0b90b">{dist["중립"]:,}</b></div>
<div>주의<b style="color:{DN}">{dist["주의"]:,}</b></div><div>평점 기준<b style="font-size:13px;line-height:1.5;color:#c6cfdb">추세 40 · 수급 25<br>가치 20 · 위험 15</b></div></div>
<div class="sec">긍정 관점 상위 10 <small>20일 평균 거래대금 {p["minTv"]}억 이상 {p["liquidN"]:,}종목 중</small></div>
{"".join(row(x, i + 1) for i, x in enumerate(p["top"]))}
<div class="sec">주의 관점 하위 5 <small>약한 이유</small></div>
{"".join(row(x, i + 1, True) for i, x in enumerate(p["weak"]))}
<div class="ft">등급 A 75↑ · B 62↑ · C 50↑ · D 38↑ · E · 긍정 62점 이상 · 주의 50점 미만<br>
교육용 참고 지표이며 매매 신호가 아닙니다 · 투자 판단과 책임은 본인에게 있습니다 · 갱신 {E(p["updated"])}</div>
</div></body></html>"""


def post(webhook, png, p):
    d = p["date"]
    top = p["top"][:3]
    lines = [f"🧭 **{int(d[4:6])}월 {int(d[6:8])}일 종합 평점** — 코스피·코스닥 {p['n']:,}종목 (장마감 기준)"]
    lines += [f"{i + 1}. **{x['n']}** {x['total']}점({x['grade']}) · {', '.join(x['good'][:2]) or '—'}" for i, x in enumerate(top)]
    lines.append("상세 → https://sannaq.github.io/vantor/  ※ 교육용 참고, 매매 신호 아님")
    boundary = uuid.uuid4().hex
    with open(png, "rb") as f:
        img = f.read()
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"
        + json.dumps({"content": "\n".join(lines), "username": "VANTOR 종합 평점"}, ensure_ascii=False)
        + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"picks-{d}.png\"\r\nContent-Type: image/png\r\n\r\n"
    ).encode() + img + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(webhook, data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "vantor-picks"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"  디스코드 전송 {r.status}")


def main():
    with open(os.path.join(ROOT, "feeds/stock-picks.json"), encoding="utf-8") as f:
        p = json.load(f)
    out_dir = os.environ.get("OUT_DIR", "/tmp/brief-img")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"picks-{p['date']}.png")
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 900, "height": 1600}, device_scale_factor=2, locale="ko-KR")
        pg.set_content(build(p), wait_until="load")
        pg.evaluate("document.fonts.ready")
        pg.locator("#card").screenshot(path=out)
        b.close()
    print(f"{out} ({os.path.getsize(out) // 1024}KB)")
    webhook = os.environ.get("DISCORD_RECO_WEBHOOK", "").strip()
    if webhook:
        post(webhook, out, p)
    else:
        print("DISCORD_RECO_WEBHOOK 비어 있음 → 전송 안 함")


if __name__ == "__main__":
    main()
