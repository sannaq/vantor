#!/usr/bin/env python3
"""이번주 주요 이벤트 자동 갱신 — events.json(주식) + feeds/coin-events.json(코인).

GitHub Actions(.github/workflows/events.yml)가 매일 아침 실행한다.
- 미국 일정: ForexFactory 주간 피드(무료·키 없음)에서 USD 중요/보통 일정을 가져온다.
- 한국 휴장: 아래 KRX_HOLIDAYS 표.
- 한글 제목·해설: TITLE_KO 사전 → 없으면 GitHub Models(GITHUB_TOKEN) 번역 → 그래도 실패하면 영문 그대로.
- 같은 주에 손으로 넣은 이벤트(src 없음)·해설·결과는 지우지 않고 그대로 둔다.
  같은 날짜·시각에 손으로 넣은 미국 이벤트가 있으면 자동 이벤트는 추가하지 않는다.
표준 라이브러리만 사용.
"""
import json, os, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KST = timezone(timedelta(hours=9))
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# KRX 휴장일 (주말 제외). 해마다 12월에 다음 해 분을 추가.
KRX_HOLIDAYS = {
    "2026-10-09": "한글날", "2026-12-25": "성탄절", "2026-12-31": "연말 휴장",
    "2027-01-01": "신정", "2027-02-08": "설날 연휴", "2027-02-09": "설날 연휴",
    "2027-03-01": "삼일절", "2027-05-05": "어린이날", "2027-05-13": "부처님오신날",
    "2027-06-03": "지방선거", "2027-08-16": "광복절 대체휴일", "2027-09-14": "추석 연휴",
    "2027-09-15": "추석 연휴", "2027-09-16": "추석 연휴", "2027-10-04": "개천절 대체휴일",
    "2027-10-11": "한글날 대체휴일", "2027-12-31": "연말 휴장",
}

# 영문 제목 → (한글 제목, 중요도 보정, 종류, 주식 해설, 코인 해설)
TITLE_KO = [
    (r"^CPI m/m|^CPI y/y|^Core CPI", ("소비자물가(CPI)", 3, "data", "연준 금리 경로의 핵심. 예상보다 높으면 금리·달러↑ → 기술주·외국인 수급 부담.", "물가가 뜨거우면 리스크오프로 하락 압력, 식으면 안도.")),
    (r"^PPI m/m|^Core PPI", ("생산자물가(PPI)", 2, "data", "CPI 선행 성격. 기업 원가 압력 확인.", "물가 선행지표 — 금리 기대를 흔듦.")),
    (r"^Core PCE|^PCE Price", ("PCE 물가지수", 3, "data", "연준이 가장 중시하는 물가. 뜨거우면 인상 확률↑.", "연준 핵심 물가 — 금리·달러 민감한 크립토에 직결.")),
    (r"^Non-Farm Employment Change", ("고용보고서 (비농업 고용)", 3, "data", "주 최대 지표. 강하면 금리↑, 약하면 경기 우려와 인하 기대가 교차.", "고용 강/약이 금리 경로를 흔들어 변동성 확대.")),
    (r"^Unemployment Rate", ("실업률", 3, "data", "고용보고서와 함께 발표. 상승 시 경기 둔화 신호.", None)),
    (r"^Average Hourly Earnings", ("시간당 임금", 2, "data", "임금발 물가 압력 확인.", None)),
    (r"^ADP Non-Farm", ("ADP 민간고용", 2, "data", "고용보고서 전 민간 고용 미리보기.", "고용 미리보기 — 금리 기대 변화.")),
    (r"^JOLTS", ("JOLTS 구인·이직", 2, "data", "고용시장 열기 확인.", None)),
    (r"^Unemployment Claims", ("주간 신규 실업수당 청구건수", 2, "data", "고용 둔화를 가장 빨리 보여주는 주간 지표.", None)),
    (r"^ISM Services PMI", ("ISM 서비스업 PMI", 2, "data", "미국 경제의 몸통(서비스) 체감 경기. 50 위·아래와 가격지수 확인.", None)),
    (r"^ISM Manufacturing PMI", ("ISM 제조업 PMI", 2, "data", "제조업 체감 경기. 반도체·수출주 심리에 영향.", None)),
    (r"Retail Sales", ("소매판매", 2, "data", "소비 체력 확인. 강하면 금리 부담.", None)),
    (r"^Advance GDP|^Prelim GDP|^Final GDP|^GDP", ("GDP 성장률", 3, "data", "경기 전체 성적표.", "경기 방향 — 위험자산 심리에 영향.")),
    (r"^FOMC Meeting Minutes", ("FOMC 의사록 공개", 3, "policy", "직전 회의에서 추가 인상·인하 논의가 얼마나 강했는지. 매파적이면 금리·달러↑.", "연준 톤 변화 — 매파면 크립토 하락 압력.")),
    (r"^Federal Funds Rate|^FOMC Statement", ("FOMC 금리 결정", 3, "policy", "금리 결정과 성명 문구. 주 최대 이벤트.", "금리 결정 — 크립토 변동성 최대 구간.")),
    (r"^FOMC Press Conference", ("연준 의장 기자회견", 3, "policy", "향후 경로 힌트.", "의장 발언에 따라 급변동 가능.")),
    (r"^Fed Chair .* Speaks", ("연준 의장 발언", 3, "policy", "금리 경로 힌트. 발언 톤에 시장 민감.", "의장 발언 — 크립토 변동성 주의.")),
    (r"^FOMC Member (\w+) Speaks", ("연준 위원 발언 ({0})", 2, "policy", "개별 위원의 금리 시각 참고.", None)),
    (r"^President Trump Speaks", ("트럼프 대통령 연설", 2, "event", "관세·정책 발언에 따라 변동성 확대 가능.", "정책 발언 — 크립토 관련 언급 주의.")),
    (r"UoM Consumer Sentiment", ("미시간대 소비자심리", 2, "data", "소비 심리와 함께 나오는 기대 인플레이션이 관건.", None)),
    (r"UoM Inflation Expectations", ("미시간대 기대 인플레이션", 2, "data", "기대 물가가 오르면 금리 부담.", None)),
    (r"^CB Consumer Confidence", ("컨퍼런스보드 소비자신뢰지수", 2, "data", "소비 심리.", None)),
    (r"^Empire State|^Philly Fed", ("지역 제조업 지수", 1, "data", "제조업 체감 경기 참고.", None)),
    (r"Treasury.*Auction|Bond Auction", ("미 국채 입찰", 2, "event", "입찰 수요가 약하면 장기금리↑ → 성장주 부담.", None)),
]

COIN_KEEP = 3  # 코인 피드는 중요도 3 + 연준 이벤트만


def ko_title(en):
    for pat, (ko, imp, typ, note, cnote) in TITLE_KO:
        m = re.search(pat, en)
        if m:
            return ko.format(*m.groups()) if m.groups() else ko, imp, typ, note, cnote
    return None


def fetch_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "vantor-events/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def ai(prompt):
    """GitHub Models 로 짧은 JSON 응답. 실패하면 None."""
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok:
        return None
    try:
        body = json.dumps({"model": "openai/gpt-4o-mini", "temperature": 0.3,
                           "response_format": {"type": "json_object"},
                           "messages": [{"role": "user", "content": prompt}]}).encode()
        j = fetch_json("https://models.github.ai/inference/chat/completions", body,
                       {"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
        return json.loads(j["choices"][0]["message"]["content"])
    except Exception as e:  # noqa
        print("AI 실패:", e, file=sys.stderr)
        return None


def week_label(monday):
    thu = monday + timedelta(days=3)
    return f"{thu.year}년 {thu.month}월 {(thu.day - 1) // 7 + 1}주차"


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save(path, d):
    with open(path, "w", encoding="utf-8") as f:
        f.write("{\n")
        items = list(d.items())
        for i, (k, v) in enumerate(items):
            end = "," if i < len(items) - 1 else ""
            if k == "events":
                f.write('  "events": [\n')
                f.write(",\n".join("    " + json.dumps(e, ensure_ascii=False) for e in v))
                f.write("\n  ]" + end + "\n")
            else:
                f.write(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}{end}\n")
        f.write("}\n")


def main():
    now = datetime.now(KST)
    today = now.date()
    monday = today - timedelta(days=today.weekday())
    if today.weekday() >= 5:  # 주말엔 다음 주를 준비
        monday += timedelta(days=7)
    friday = monday + timedelta(days=4)
    days = {(monday + timedelta(days=i)).isoformat() for i in range(7)}

    ff = None
    if os.environ.get("FF_FILE"):  # 로컬 시험용
        ff = load(os.environ["FF_FILE"])
    for wait in (0, 60, 180):  # 피드는 요청이 잦으면 429 — 잠시 쉬고 재시도
        if ff:
            break
        time.sleep(wait)
        try:
            ff = fetch_json(FF_URL)
        except Exception as e:  # noqa
            print("일정 피드 실패:", e, file=sys.stderr)
    if not ff:
        print("일정 피드를 못 받아 이번 실행은 건너뜀", file=sys.stderr)
        return 1
    auto = []
    unknown = []
    for e in ff:
        if e.get("country") != "USD" or e.get("impact") not in ("High", "Medium"):
            continue
        dt = datetime.fromisoformat(e["date"]).astimezone(KST)
        if dt.date().isoformat() not in days:
            continue
        k = ko_title(e["title"])
        imp = 3 if e["impact"] == "High" else 2
        ev = {"date": dt.date().isoformat(), "time": dt.strftime("%H:%M"), "market": "US",
              "type": "data", "imp": imp, "title": e["title"], "note": "", "src": "ff:" + e["title"]}
        if k:
            ev["title"], kimp, ev["type"], ev["note"], cnote = k
            ev["imp"] = max(imp, kimp) if imp == 3 else kimp
            ev["_cnote"] = cnote
        else:
            unknown.append(ev)
        extra = " · ".join(x for x in [f"예상 {e['forecast']}" if e.get("forecast") else "",
                                       f"직전 {e['previous']}" if e.get("previous") else ""] if x)
        if extra:
            ev["note"] = (ev["note"] + " " if ev["note"] else "") + f"({extra})"
        auto.append(ev)

    if unknown:
        res = ai("다음 미국 경제 일정 영문 제목을 한국 투자자용 짧은 한글 제목과 한 문장 해설로 바꿔라. "
                 'JSON {"items":[{"en":..,"ko":..,"note":..}]} 로만 답하라.\n'
                 + "\n".join(u["title"] for u in unknown))
        tr = {i.get("en"): i for i in (res or {}).get("items", []) if isinstance(i, dict)}
        for u in unknown:
            t = tr.get(u["title"])
            if t and t.get("ko"):
                u["title"] = t["ko"]
                u["note"] = (t.get("note", "") + " " + u["note"]).strip()

    for d, name in KRX_HOLIDAYS.items():
        if d in days and monday.isoformat() <= d <= friday.isoformat():
            auto.append({"date": d, "time": "휴장", "market": "KR", "type": "event", "imp": 2,
                         "title": f"{name} — 국내 증시 휴장", "note": "직전 영업일 이후 해외 변수는 다음 개장일에 한꺼번에 반영.",
                         "src": "krx:" + d})

    rng = f"{monday.month}/{monday.day}~{friday.month}/{friday.day}"
    if not any(a["market"] == "US" for a in auto):
        print("이번 주 미국 일정이 0건 — 피드가 아직 새 주로 안 바뀐 것으로 보고 건너뜀", file=sys.stderr)
        return 1
    changed = False
    for path, market in ((os.path.join(ROOT, "events.json"), None),
                         (os.path.join(ROOT, "feeds", "coin-events.json"), "COIN")):
        old = load(path)
        same_week = old.get("range") == rng
        keep = [e for e in old.get("events", []) if same_week and e.get("date") in days]
        manual = [e for e in keep if not e.get("src")]
        prev_auto = {e["src"]: e for e in keep if e.get("src")}
        taken = {(e["date"], e["time"]) for e in manual}

        evs = list(manual)
        for a in auto:
            if market == "COIN":
                if a["market"] != "US" or not (a["imp"] >= COIN_KEEP or a["type"] == "policy"):
                    continue
                a = {**a, "market": "COIN", "note": a.get("_cnote") or a["note"]}
            if (a["date"], a["time"]) in taken:
                continue
            p = prev_auto.get(a["src"])
            n = {k: v for k, v in a.items() if not k.startswith("_")}
            if p:  # 손으로 고친 해설·결과는 유지
                for k in ("note", "result", "title", "imp"):
                    if k in p:
                        n[k] = p[k]
            evs.append(n)
        evs.sort(key=lambda e: (e["date"], e["time"]))

        new = dict(old) if same_week else {}
        new.update({"week": week_label(monday), "range": rng})
        if market is None and not same_week:
            new["intro"] = ""
        new["events"] = evs
        if market is None and not same_week:
            top = [e for e in evs if e["imp"] >= 3] or evs[:3]
            res = ai("한국 개인투자자용 '이번주 증시 이벤트' 요약을 써라. 교육용 관찰 톤, 매수·매도 권유 금지. "
                     '**굵게** 마크업 사용 가능. JSON {"intro":"2문장","keys":[{"t":"짧은 제목","b":"한두 문장"}] (3개),'
                     '"lens":{"cool":{"title":..,"body":..},"hot":{"title":..,"body":..}}} 로만 답하라.\n'
                     + "\n".join(f"{e['date']} {e['time']} {e['market']} ★{e['imp']} {e['title']} {e['note']}" for e in top))
            if res and res.get("intro"):
                new["intro"] = res["intro"] + " (★★★ = 매우 중요)"
                keys = [k for k in res.get("keys") or [] if isinstance(k, dict) and k.get("t") and k.get("b")]
                if keys:
                    new["keys"] = keys[:3]
                lens = res.get("lens")
                if isinstance(lens, dict) and all(isinstance(lens.get(k), dict) and lens[k].get("title") and lens[k].get("body") for k in ("cool", "hot")):
                    new["lens"] = lens
            if not new["intro"]:
                new["intro"] = "이번 주 핵심: " + ", ".join(f"**{e['title']}**" for e in top[:3]) + " (★★★ = 매우 중요)"
            new.setdefault("dayNotes", {})
        cmp_old = {k: v for k, v in old.items() if k != "updated"}
        cmp_new = {k: v for k, v in new.items() if k != "updated"}
        if cmp_old != cmp_new:
            new["updated"] = today.isoformat()
            order = ["week", "range", "updated", "intro", "dayNotes", "events", "keys", "lens"]
            new = {k: new[k] for k in order if k in new} | {k: v for k, v in new.items() if k not in order}
            save(path, new)
            changed = True
            print("갱신:", os.path.relpath(path, ROOT), len(evs), "건")
        else:
            print("변경 없음:", os.path.relpath(path, ROOT))
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--ai-check"]:  # 수동 실행 시 AI 연결 점검
        print("AI 점검:", ai('JSON {"ok":true} 로만 답하라.'))
        sys.exit(0)
    sys.exit(main())
