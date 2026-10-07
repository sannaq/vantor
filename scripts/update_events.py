#!/usr/bin/env python3
"""이번주 주요 이벤트 자동 갱신 — events.json(주식) + feeds/coin-events.json(코인).

GitHub Actions(.github/workflows/events.yml)가 매일 아침 실행한다.
- 미국 일정: ForexFactory 주간 피드(무료·키 없음)에서 USD 중요/보통 일정을 가져온다.
- 한국 휴장: 아래 KRX_HOLIDAYS 표. 한국 정기 일정: 수출입동향(1일)·옵션 만기(둘째 목)·금통위(BOK_MPC 표)·잠정실적 시즌.
- 결과: 미 노동통계국(BLS) 무료 API 로 CPI·PPI·고용·실업률·임금 실제값을 채우고 예상 대비 뜨거움/식음 판정.
- 한글 제목·해설: TITLE_KO 사전. 사전에 없는 일정은 영문 제목 그대로(사전에 한 줄 추가하면 다음 실행부터 한글).
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
    (r"CPI m/m|CPI y/y|Core CPI", ("소비자물가(CPI)", 3, "data", "연준 금리 경로의 핵심. 예상보다 높으면 금리·달러↑ → 기술주·외국인 수급 부담.", "물가가 뜨거우면 리스크오프로 하락 압력, 식으면 안도.")),
    (r"PPI m/m|Core PPI", ("생산자물가(PPI)", 2, "data", "CPI 선행 성격. 기업 원가 압력 확인.", "물가 선행지표 — 금리 기대를 흔듦.")),
    (r"Core PCE|PCE Price", ("PCE 물가지수", 3, "data", "연준이 가장 중시하는 물가. 뜨거우면 인상 확률↑.", "연준 핵심 물가 — 금리·달러 민감한 크립토에 직결.")),
    (r"^Non-Farm Employment Change", ("고용보고서 (비농업 고용)", 3, "data", "주 최대 지표. 강하면 금리↑, 약하면 경기 우려와 인하 기대가 교차.", "고용 강/약이 금리 경로를 흔들어 변동성 확대.")),
    (r"^Unemployment Rate", ("실업률", 3, "data", "고용보고서와 함께 발표. 상승 시 경기 둔화 신호.", None)),
    (r"^Average Hourly Earnings", ("시간당 임금", 2, "data", "임금발 물가 압력 확인.", None)),
    (r"^ADP Non-Farm", ("ADP 민간고용", 2, "data", "고용보고서 전 민간 고용 미리보기.", "고용 미리보기 — 금리 기대 변화.")),
    (r"^JOLTS", ("JOLTS 구인·이직", 2, "data", "고용시장 열기 확인.", None)),
    (r"^Unemployment Claims", ("주간 신규 실업수당 청구건수", 2, "data", "고용 둔화를 가장 빨리 보여주는 주간 지표.", None)),
    (r"^ISM Services PMI", ("ISM 서비스업 PMI", 2, "data", "미국 경제의 몸통(서비스) 체감 경기. 50 위·아래와 가격지수 확인.", None)),
    (r"^ISM Manufacturing PMI", ("ISM 제조업 PMI", 2, "data", "제조업 체감 경기. 반도체·수출주 심리에 영향.", None)),
    (r"Retail Sales", ("소매판매", 2, "data", "소비 체력 확인. 강하면 금리 부담.", None)),
    (r"^(Advance |Prelim |Final )?GDP q/q", ("GDP 성장률", 3, "data", "경기 전체 성적표.", "경기 방향 — 위험자산 심리에 영향.")),
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
    (r"Durable Goods Orders", ("내구재 주문", 2, "data", "기업 설비투자 흐름.", None)),
    (r"New Home Sales|Existing Home Sales|Pending Home Sales|Housing Starts|Building Permits", ("주택 지표", 1, "data", "금리 민감한 주택 경기 확인.", None)),
    (r"Flash Manufacturing PMI", ("S&P 제조업 PMI(속보)", 2, "data", "제조업 체감 경기 속보치.", None)),
    (r"Flash Services PMI", ("S&P 서비스업 PMI(속보)", 2, "data", "서비스업 체감 경기 속보치.", None)),
    (r"Industrial Production", ("산업생산", 1, "data", "제조업 실물 경기.", None)),
    (r"Beige Book", ("연준 베이지북", 2, "policy", "지역별 경기 진단 — 다음 FOMC 판단 재료.", None)),
    (r"Employment Cost Index", ("고용비용지수(ECI)", 2, "data", "임금발 물가 압력.", None)),
    (r"Trade Balance", ("무역수지", 1, "data", "관세 영향 참고.", None)),
    (r"Chicago PMI", ("시카고 PMI", 1, "data", "제조업 체감 경기 참고.", None)),
    (r"Nonfarm Productivity|Unit Labor Costs", ("노동생산성·단위노동비용", 1, "data", "임금·물가 압력 참고.", None)),
    (r"GDP Price Index", ("GDP 물가지수", 2, "data", "성장 속 물가 압력.", None)),
    (r"Crude Oil Inventories", ("원유 재고", 1, "data", "유가·물가 기대 참고.", None)),
    (r"Treasury.*Auction|Bond Auction", ("미 국채 입찰", 2, "event", "입찰 수요가 약하면 장기금리↑ → 성장주 부담.", None)),
]

# 한은 금통위 기준금리 결정일. 다음 해 일정은 한은이 매년 10~11월에 발표 → 그때 추가.
BOK_MPC = {"2026-10-22", "2026-11-26"}

# ForexFactory 제목 → (BLS 시리즈, 계산법, 표시 이름). 계산: mm=전월비% yy=전년비% chg=전월 대비 증감(천명) lvl=수준
BLS = {
    "CPI m/m": ("CUSR0000SA0", "mm", "전월비"),
    "CPI y/y": ("CUUR0000SA0", "yy", "전년비"),
    "Core CPI m/m": ("CUSR0000SA0L1E", "mm", "근원 전월비"),
    "PPI m/m": ("WPSFD4", "mm", "전월비"),
    "Core PPI m/m": ("WPSFD49104", "mm", "근원 전월비"),
    "Non-Farm Employment Change": ("CES0000000001", "chg", "비농업 고용"),
    "Unemployment Rate": ("LNS14000000", "lvl", "실업률"),
    "Average Hourly Earnings m/m": ("CES0500000003", "mm", "전월비"),
}
HEADLINE = ["CPI m/m", "PPI m/m", "Non-Farm Employment Change", "Unemployment Rate", "Average Hourly Earnings m/m"]
REVERSED = {"Unemployment Rate"}  # 높을수록 경기 '식음'

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



def num(x):
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(x)))
    except ValueError:
        return None


def bls_values(series):
    """{시리즈: [(연, 월, 값), ...] 최신순}. 무료 v1 API(하루 25회) — 하루 1번만 부른다."""
    year = datetime.now(KST).year
    body = json.dumps({"seriesid": sorted(series), "startyear": str(year - 1), "endyear": str(year)}).encode()
    j = fetch_json("https://api.bls.gov/publicAPI/v1/timeseries/data/", body, {"Content-Type": "application/json"})
    out = {}
    for ser in j.get("Results", {}).get("series", []):
        out[ser["seriesID"]] = [(int(x["year"]), int(x["period"][1:]), float(x["value"]))
                                for x in ser["data"] if x["period"].startswith("M") and x["period"] != "M13"
                                and num(x["value"]) is not None]
    return out


def bls_actual(vals, how, want):
    """want=(연,월) 자료가 나왔으면 계산값, 아니면 None."""
    if not vals or (vals[0][0], vals[0][1]) != want:
        return None
    v = vals[0][2]
    if how == "lvl":
        return v
    if how in ("mm", "chg"):
        prev = vals[1][2] if len(vals) > 1 else None
        if prev is None:
            return None
        return v - prev if how == "chg" else (v / prev - 1) * 100
    if how == "yy":
        ago = next((x[2] for x in vals if (x[0], x[1]) == (want[0] - 1, want[1])), None)
        return None if ago is None else (v / ago - 1) * 100


def fmt(v, how):
    return f"{v:+,.0f}K".replace("+", "+") if how == "chg" else f"{v:.1f}%"


def fill_results(evs, today):
    """지난 미국 지표 이벤트에 실제값·판정(result)을 채운다."""
    todo = [e for e in evs if e.get("fc") and not e.get("result") and e["date"] < today.isoformat()
            and any(k in BLS for k in e["fc"])]
    if not todo:
        return 0
    try:
        data = bls_values({BLS[k][0] for e in todo for k in e["fc"] if k in BLS})
    except Exception as ex:  # noqa
        print("BLS 실패:", ex, file=sys.stderr)
        return 0
    n = 0
    for e in todo:
        y, m = int(e["date"][:4]), int(e["date"][5:7])
        want = (y, m - 1) if m > 1 else (y - 1, 12)  # 발표 달의 전달 자료
        parts, verdict = [], "neutral"
        keys = sorted((k for k in e["fc"] if k in BLS), key=lambda k: HEADLINE.index(k) if k in HEADLINE else 99)
        for k in keys:
            ser, how, lab = BLS[k]
            a = bls_actual(data.get(ser), how, want)
            if a is None:
                continue
            f = num(e["fc"][k])
            txt = f"{lab} {fmt(a, how)}" + (f" (예상 {e['fc'][k]})" if e["fc"][k] else "")
            if not parts:
                txt = "**" + txt.split(" (")[0] + "**" + (" (" + txt.split(" (", 1)[1] if " (" in txt else "")
                if f is not None:
                    r = round(a, 1 if how != "chg" else 0)
                    d = (r - f) if how != "chg" else (r - f)
                    if k in REVERSED:
                        d = -d
                    verdict = "hot" if d > 0 else "cool" if d < 0 else "neutral"
            parts.append(txt)
        if parts:
            word = {"hot": "예상보다 뜨거움 → 금리 부담", "cool": "예상보다 식음 → 금리 부담 완화", "neutral": "예상 수준"}[verdict]
            e["result"] = {"v": " · ".join(parts) + f" — {word}", "verdict": verdict}
            n += 1
    return n


def kr_events(days, monday):
    """한국 정기 일정 (날짜 규칙·표 기반)."""
    out = []
    week = sorted(d for d in days if datetime.fromisoformat(d).weekday() < 5)
    for d in week:
        dt = datetime.fromisoformat(d)
        if dt.day == 1:
            pm = 12 if dt.month == 1 else dt.month - 1
            out.append({"date": d, "time": "09:00", "market": "KR", "type": "data", "imp": 2,
                        "title": f"{pm}월 수출입동향", "note": "반도체 수출이 국내 대형주 실적 기대에 직결. 수출 증가율·반도체 비중 확인.",
                        "src": f"kr:trade:{d}"})
        if d in BOK_MPC:
            out.append({"date": d, "time": "10:00", "market": "KR", "type": "policy", "imp": 3,
                        "title": "한은 금통위 기준금리 결정", "note": "기준금리와 총재 기자회견 톤. 원화·채권금리·은행주에 직접 영향.",
                        "src": f"kr:mpc:{d}"})
    # 옵션 만기: 매월 둘째 목요일(휴장이면 직전 영업일). 3·6·9·12월은 선물 동시만기.
    for first in {monday.replace(day=1), (monday + timedelta(days=4)).replace(day=1)}:
        thu = first + timedelta(days=(3 - first.weekday()) % 7 + 7)
        while thu.isoformat() in KRX_HOLIDAYS or thu.weekday() >= 5:
            thu -= timedelta(days=1)
        if thu.isoformat() in week:
            q = thu.month in (3, 6, 9, 12)
            out.append({"date": thu.isoformat(), "time": "15:20", "market": "KR", "type": "event", "imp": 3 if q else 2,
                        "title": "선물·옵션 동시만기" if q else "옵션 만기일",
                        "note": "장 막판 프로그램 매매로 지수 변동이 커지기 쉬움(관찰용).", "src": f"kr:exp:{thu.isoformat()}"})
    # 잠정실적 시즌: 1·4·7·10월 7일이 들어 있는 주
    seventh = [monday + timedelta(days=i) for i in range(7) if (monday + timedelta(days=i)).day == 7
               and (monday + timedelta(days=i)).month in (1, 4, 7, 10)]
    if seventh and week:
        out.append({"date": week[0], "time": "참고", "market": "KR", "type": "earnings", "imp": 3,
                    "title": "삼성전자·LG전자 잠정실적 (이번 주 발표 예상)",
                    "note": "분기 첫 대형주 실적. 정확한 날짜는 회사 공시로 확정 — 숫자보다 발표 후 외국인 수급과 반도체 업황 코멘트가 관건.",
                    "src": f"kr:earn:{week[0]}"})
    return out


def sort_time(t):
    """'휴장'·'참고'는 그날 맨 앞, '개장 전'은 09:00 앞, 나머지는 HH:MM 그대로."""
    if re.match(r"^\d\d:\d\d$", t):
        return t
    return "08:59" if "개장" in t else "00:00"


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
    # 주말에도 지난 주를 유지 — 금요일 밤 발표(고용보고서 등) 결과를 토요일 아침에 채운다. 새 주 교체는 월요일 아침.
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
        extra = " · ".join(x for x in [f"예상 {e['forecast']}" if e.get("forecast") else "",
                                       f"직전 {e['previous']}" if e.get("previous") else ""] if x)
        if extra:
            ev["note"] = (ev["note"] + " " if ev["note"] else "") + f"({extra})"
        if e["title"] in BLS:
            ev["_fc"] = {e["title"]: e.get("forecast", "")}
        auto.append(ev)


    for d, name in KRX_HOLIDAYS.items():
        if d in days and monday.isoformat() <= d <= friday.isoformat():
            auto.append({"date": d, "time": "휴장", "market": "KR", "type": "event", "imp": 2,
                         "title": f"{name} — 국내 증시 휴장", "note": "직전 영업일 이후 해외 변수는 다음 개장일에 한꺼번에 반영.",
                         "src": "krx:" + d})

    auto += kr_events(days, monday)

    # CPI m/m·y/y·Core 처럼 한 발표가 여러 줄이면 하나로 묶고 예상치는 모은다
    merged = {}
    for a in auto:
        k = (a["date"], a["time"], a["title"])
        if k in merged:
            merged[k].setdefault("_fc", {}).update(a.get("_fc", {}))
        else:
            merged[k] = a
    auto = list(merged.values())
    for a in auto:
        if a.get("_fc"):
            a["fc"] = a.pop("_fc")

    rng = f"{monday.month}/{monday.day}~{friday.month}/{friday.day}"
    if not any(a["market"] == "US" for a in auto):
        print("이번 주 미국 일정이 0건 — 피드가 아직 새 주로 안 바뀐 것으로 보고 건너뜀")
        return 0
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
            if (a["date"], a["time"]) in taken or (a["date"], a["time"], a["title"]) in taken:
                continue
            if a["src"].startswith("kr:earn:") and any("잠정실적" in m.get("title", "") for m in manual):
                continue
            taken.add((a["date"], a["time"], a["title"]))  # CPI m/m·y/y·Core 처럼 한 발표가 여러 줄이면 한 번만
            p = prev_auto.get(a["src"])
            n = {k: v for k, v in a.items() if not k.startswith("_")}
            if p:  # 손으로 고친 해설·결과는 유지
                for k in ("note", "result", "title", "imp"):
                    if k in p:
                        n[k] = p[k]
            evs.append(n)
        evs.sort(key=lambda e: (e["date"], sort_time(e.get("time", ""))))
        if market is None:
            filled = fill_results(evs, today)
            if filled:
                print("결과 채움:", filled, "건")
            stock_results = {e["src"]: e["result"] for e in evs if e.get("src") and e.get("result")}
        else:
            for e in evs:
                if e.get("src") in stock_results and not e.get("result"):
                    e["result"] = stock_results[e["src"]]

        new = dict(old) if same_week else {}
        new.update({"week": week_label(monday), "range": rng})
        if market is None and not same_week:
            new["intro"] = ""
        new["events"] = evs
        if market is None and not same_week:
            top = [e for e in evs if e["imp"] >= 3] or evs[:3]
            new["intro"] = "이번 주 핵심: " + ", ".join(f"**{e['title']}**" for e in top[:3]) + " (★★★ = 매우 중요)"
            new["keys"] = [{"t": f"{e['title']} ({int(e['date'][5:7])}/{int(e['date'][8:])} {e['time']})", "b": e["note"]}
                           for e in [x for x in evs if x["imp"] >= 3][:3] if e.get("note")]
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
    sys.exit(main())
