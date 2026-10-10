#!/usr/bin/env python3
"""종합 평점 추천 → 디스코드 (장마감 후 1회).

feeds/stock-picks.json(scripts/score_all.mjs 결과)을 한 장짜리 이미지로 그려 웹후크에 올린다.
환경변수: DISCORD_RECO_WEBHOOK (없으면 PNG 만 만들고 끝), OUT_DIR (기본 /tmp/brief-img)
         MKT=US → 미장(feeds/stock-picks-us.json, 미국 장마감 뒤 아침 7시 KST)
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
VIEWC = {"추천": UP, "중립": "#f0b90b", "매수 금지": DN}
US = os.environ.get("MKT") == "US"
PARTS = [("모멘텀", 67), ("흑자", 33)] if US else [("안정성", 40), ("고점 근접", 30), ("이익", 30)]  # score-core.js (미장은 W_US)
SFX = "-us" if US else ""
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
    if US:
        mom = "—" if x.get("mom") is None else f'{x["mom"] * 100:+.0f}%'
        mid = (f'${x["px"]:,.2f} <span style="color:{col(x.get("day"))}">{sgn(x.get("day"))}</span> · 20일 <span style="color:{col(x.get("ret20"))}">{sgn(x.get("ret20"), 1)}</span>'
               f' · 1년 모멘텀 {mom} · {per} · 거래대금 ${x["tv20"] * 100:,.0f}M')
    else:
        mid = (f'{x["px"]:,.0f}원 <span style="color:{col(x.get("day"))}">{sgn(x.get("day"))}</span> · 20일 <span style="color:{col(x.get("ret20"))}">{sgn(x.get("ret20"), 1)}</span>'
               f' · 변동 ±{x["vol"] * 100:.1f}% · 고점 대비 {x["hiGap"] * 100:.0f}% · {per} · 거래대금 {x["tv20"]:,}억')
    return f"""<div class="rw">
 <div class="rk">{i}</div>
 <div class="sc" style="--g:{VIEWC[x["view"]]}"><b>{x["total"]}</b><span>{"금지" if x["view"] == "매수 금지" else x["view"]}</span></div>
 <div class="nm"><div class="n1">{E(x["n"])} <small>{E(x["c"])} · {E(x["mk"])}</small></div>
  <div class="n2">{mid}</div>
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
.pb span{width:50px}.pb b{width:20px;text-align:right;color:#d6dce5}
.pt{flex:1;height:6px;background:#1c2431;border-radius:3px;overflow:hidden}.pt div{height:100%;background:#4a9eff;border-radius:3px}
.ft{margin-top:14px;font-size:11px;color:#5f6a79;text-align:center;line-height:1.6}
"""


def bt_line(p):
    """60거래일 보유 검증 한 줄 (feeds/backtest-60.json, 매달 갱신)."""
    try:
        with open(os.path.join(ROOT, f"feeds/backtest{SFX}-60.json"), encoding="utf-8") as f:
            b = json.load(f)
        g = b["all"]["groups"]
        return f'검증({b["all"]["from"][2:4]}.{int(b["all"]["from"][4:6])}~{b["all"]["to"][2:4]}.{int(b["all"]["to"][4:6])}, 60일 보유): 추천 {g["추천"]["x20"]:+.1f}%p · 매수 금지 {g["매수 금지"]["x20"]:+.1f}%p (시장 평균 대비)'
    except Exception:
        return "60일 보유 기준"


def build(p):
    d = p["date"]
    day = f"{int(d[4:6])}월 {int(d[6:8])}일"
    dist = p["dist"]
    title = "미장 종목 추천 TOP 10" if US else "종목 추천 TOP 10"
    uni = f'나스닥·NYSE·AMEX {p["n"]:,}종목 채점' if US else f'코스피·코스닥 {p["n"]:,}종목 채점'
    src = "VANTOR · 미국 장마감 기준" if US else "VANTOR · 장마감 기준"
    rule = "1년 모멘텀 67<br>흑자 33" if US else "안정성 40 · 고점 근접 30<br>이익 30"
    liq = f'20일 평균 거래대금 ${p["minTv"] * 100:,.0f}M 이상' if US else f'20일 평균 거래대금 {p["minTv"]}억 이상'
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div id="card">
<div class="hd"><h1>🧭 {day} {title}</h1><div class="src">{src}<br>{uni}</div></div>
<div class="dist"><div>추천 ({p["cut"]["buy"]}점↑)<b style="color:{UP}">{dist["추천"]:,}</b></div><div>중립<b style="color:#f0b90b">{dist["중립"]:,}</b></div>
<div>매수 금지 ({p["cut"]["ban"]}점 미만)<b style="color:{DN}">{dist["매수 금지"]:,}</b></div><div>평점 기준 (백테스트로 고름)<b style="font-size:13px;line-height:1.5;color:#c6cfdb">{rule}</b></div></div>
<div class="sec">추천 상위 10 <small>{liq} {p["liquidN"]:,}종목 중</small></div>
{"".join(row(x, i + 1) for i, x in enumerate(p["top"]))}
<div class="sec">매수 금지 하위 5 <small>약한 이유</small></div>
{"".join(row(x, i + 1, True) for i, x in enumerate(p["weak"]))}
<div class="ft">추천 = 그날 상위 20% · 매수 금지 = 하위 20% · {bt_line(p)}<br>
교육용 참고 지표이며 매매 신호가 아닙니다 · 투자 판단과 책임은 본인에게 있습니다 · 갱신 {E(p["updated"])}</div>
</div></body></html>"""


def post(webhook, png, p):
    d = p["date"]
    top = p["top"][:3]
    head = f"🇺🇸 **{int(d[4:6])}월 {int(d[6:8])}일(미국) 미장 종목 추천** — 나스닥·NYSE·AMEX {p['n']:,}종목 (미국 장마감 기준)" if US else f"🧭 **{int(d[4:6])}월 {int(d[6:8])}일 종목 추천** — 코스피·코스닥 {p['n']:,}종목 (장마감 기준)"
    lines = [f"{head} · 추천 {p['dist']['추천']} · 매수 금지 {p['dist']['매수 금지']}"]
    lines += [f"{i + 1}. **{x['n']}** {x['total']}점 · {', '.join(x['good'][:2]) or '—'}" for i, x in enumerate(top)]
    lines.append("상세 → https://sannaq.github.io/vantor/  ※ 교육용 참고, 매매 신호 아님")
    boundary = uuid.uuid4().hex
    with open(png, "rb") as f:
        img = f.read()
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"
        + json.dumps({"content": "\n".join(lines), "username": "VANTOR 미장 추천" if US else "VANTOR 종목 추천"}, ensure_ascii=False)
        + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"picks{SFX}-{d}.png\"\r\nContent-Type: image/png\r\n\r\n"
    ).encode() + img + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(webhook, data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "vantor-picks"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"  디스코드 전송 {r.status}")


def main():
    with open(os.path.join(ROOT, f"feeds/stock-picks{SFX}.json"), encoding="utf-8") as f:
        p = json.load(f)
    out_dir = os.environ.get("OUT_DIR", "/tmp/brief-img")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f"picks{SFX}-{p['date']}.png")
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
