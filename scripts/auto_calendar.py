#!/usr/bin/env python3
"""위클리 캘린더 자동 생성 (2026-10-26).

feeds/calendar.json 의 weeks 는 원래 소몽카페 위클리 캘린더 사진을 보고 손으로 채웠다.
사진이 없는 주에는 지난주가 그대로 보여서, 이 스크립트가 이번 주 칸을 자동으로 만든다.

- 손으로 넣은 주(auto 표시 없음)는 절대 건드리지 않는다. 사진이 오면 그 주를 손 정리로 덮어쓰면 끝.
- 자동 주(auto: true)는 매일 다시 만든다(실적 날짜가 바뀌거나 결과가 붙으므로).
- 일정: events.json(미국 지표·연준, 한국 정기 일정) + ForexFactory 주간 피드의 주요국 금리 결정.
- 실적: 나스닥 실적 일정에서 시총 큰 순. 날짜는 미국 날짜(장 전 / 장 마감 후) — 손 정리와 같은 기준.
- earnings(아래 실적 목록): 시총 상위 종목의 앞으로 4주 실적일을 채우고, 3주 지난 것은 뺀다.
- 연간 행사 표(feeds/events-annual.json): 기업 행사·정상회의·휴장을 그 주 칸과 앞으로 일정(60일)에 올린다.
- upcoming: 지난 일정은 뺀다.

로컬 시험: FF_FILE=ff.json NASDAQ_DIR=dir python3 scripts/auto_calendar.py
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
ET = ZoneInfo("America/New_York")
CAL = "feeds/calendar.json"
ANNUAL = "feeds/events-annual.json"
UPCOMING_DAYS = 60
FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
NQ_URL = "https://api.nasdaq.com/api/calendar/earnings?date={}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

WEEK_MIN_CAP = 40e9     # 주간 칸에 올릴 실적: 시총 400억 달러 이상
WEEK_MAX_PER_SLOT = 6   # 하루·장 전/후 한 칸에 최대 종목 수
LIST_MIN_CAP = 400e9    # 아래 실적 목록: 시총 4천억 달러 이상(빅테크급)
LIST_AHEAD = 28
KEEP_WEEKS = 8
KR_TOP = 100            # 국장 실적: 시총 100위 안은 바로 보이고, 나머지는 '전체 보기' 안
US_LO_CAP = 5e9         # 미국 실적: 50억 달러 이상은 '전체 보기' 안에

# 미국 대형주 한글 이름 (없으면 영문 회사명 앞부분)
KO = {
    "AAPL": "애플", "MSFT": "마이크로소프트", "GOOGL": "알파벳", "GOOG": "알파벳", "AMZN": "아마존", "META": "메타",
    "NVDA": "엔비디아", "TSLA": "테슬라", "AVGO": "브로드컴", "ORCL": "오라클", "AMD": "AMD", "INTC": "인텔",
    "QCOM": "퀄컴", "TXN": "텍사스인스트루먼트", "MU": "마이크론", "AMAT": "어플라이드머티리얼즈", "LRCX": "램리서치",
    "KLAC": "KLA", "ASML": "ASML", "TSM": "TSMC", "ARM": "ARM", "ADI": "아날로그디바이스", "MRVL": "마벨",
    "NFLX": "넷플릭스", "SHW": "셔윈윌리엄즈", "WHR": "월풀", "FCX": "프리포트맥모란", "JCI": "존슨컨트롤즈", "AMT": "아메리칸타워",
    "ECL": "에코랩", "HLT": "힐튼", "ITW": "일리노이툴웍스", "MMM": "3M", "RCL": "로열캐리비안", "ROP": "로퍼", "CRM": "세일즈포스", "ADBE": "어도비", "NOW": "서비스나우", "IBM": "IBM", "CSCO": "시스코",
    "PLTR": "팔란티어", "SHOP": "쇼피파이", "UBER": "우버", "ABNB": "에어비앤비", "PYPL": "페이팔", "SPOT": "스포티파이",
    "INTU": "인튜이트", "ISRG": "인튜이티브서지컬", "PANW": "팔로알토", "CRWD": "크라우드스트라이크", "FTNT": "포티넷",
    "ANET": "아리스타", "APH": "암페놀", "DELL": "델", "SMCI": "슈퍼마이크로", "WDC": "웨스턴디지털", "STX": "씨게이트",
    "NET": "클라우드플레어", "SNOW": "스노우플레이크", "COIN": "코인베이스", "HOOD": "로빈후드", "MSTR": "스트래티지",
    "SPCX": "스페이스X", "TMUS": "T모바일", "VZ": "버라이즌", "T": "AT&T", "CMCSA": "컴캐스트", "DIS": "디즈니",
    "JPM": "JP모건", "BAC": "뱅크오브아메리카", "WFC": "웰스파고", "C": "씨티", "GS": "골드만삭스", "MS": "모건스탠리",
    "BLK": "블랙록", "SCHW": "찰스슈왑", "AXP": "아멕스", "V": "비자", "MA": "마스터카드", "BRK.B": "버크셔",
    "UNH": "유나이티드헬스", "LLY": "일라이릴리", "JNJ": "존슨앤드존슨", "ABBV": "애브비", "MRK": "머크", "PFE": "화이자",
    "AMGN": "암젠", "GILD": "길리어드", "BMY": "BMS", "TMO": "써모피셔", "ABT": "애보트", "DHR": "다나허", "NVO": "노보노디스크",
    "WMT": "월마트", "COST": "코스트코", "HD": "홈디포", "LOW": "로우스", "TGT": "타깃", "MCD": "맥도날드", "SBUX": "스타벅스",
    "NKE": "나이키", "KO": "코카콜라", "PEP": "펩시코", "PG": "P&G", "PM": "필립모리스", "MO": "알트리아", "CL": "콜게이트",
    "XOM": "엑슨모빌", "CVX": "셰브런", "COP": "코노코필립스", "SLB": "슐럼버거", "PSX": "필립스66",
    "CAT": "캐터필러", "DE": "디어", "GE": "GE에어로스페이스", "GEV": "GE버노바", "HON": "허니웰", "BA": "보잉",
    "LMT": "록히드마틴", "RTX": "RTX", "NOC": "노스롭그루먼", "GD": "제너럴다이내믹스", "UNP": "유니온퍼시픽", "UPS": "UPS",
    "FDX": "페덱스", "ETN": "이튼", "VRT": "버티브", "CEG": "컨스텔레이션에너지", "VST": "비스트라", "NEE": "넥스트에라",
    "LIN": "린데", "SPGI": "S&P글로벌", "ADP": "ADP", "BKNG": "부킹홀딩스", "MELI": "메르카도리브레", "BABA": "알리바바",
    "PDD": "PDD", "SONY": "소니", "TM": "도요타", "SAP": "SAP", "AZN": "아스트라제네카", "NVS": "노바티스", "SHEL": "셸",
    "HSBC": "HSBC", "UBS": "UBS", "SAN": "산탄데르", "GSK": "GSK", "BBVA": "BBVA", "RDDT": "레딧", "APP": "앱러빈",
    "WELL": "웰타워", "NUE": "뉴코어", "PSA": "퍼블릭스토리지", "GLW": "코닝", "HCA": "HCA헬스케어", "NXPI": "NXP",
    "OKE": "원오크", "SNDK": "샌디스크", "SYK": "스트라이커", "BP": "BP", "SNY": "사노피", "ABEV": "암베브", "CVE": "세노버스",
    "BRK.A": "버크셔", "TTE": "토탈에너지스", "RIO": "리오틴토", "BHP": "BHP", "UL": "유니레버", "TD": "TD은행", "RY": "RBC",
    "SNPS": "시놉시스", "CDNS": "케이던스", "MDLZ": "몬델리즈", "CME": "CME", "ICE": "ICE", "WM": "웨이스트매니지먼트",
}

# 주요국 금리 결정 (ForexFactory 제목 → 한글, 중요도)
CB = {
    ("EUR", "Main Refinancing Rate"): ("유럽중앙은행(ECB) 금리 결정", 2, ["ECB", "유럽중앙은행", "라가르드"]),
    ("JPY", "BOJ Policy Rate"): ("일본은행(BOJ) 금리 결정", 3, ["BOJ", "일본은행", "일본 금리", "우에다"]),
    ("GBP", "Official Bank Rate"): ("영란은행(BOE) 금리 결정", 2, ["BOE", "영란은행"]),
    ("CAD", "Overnight Rate"): ("캐나다 중앙은행 금리 결정", 1, ["캐나다 중앙은행", "BOC"]),
    ("CNY", "1-y Loan Prime Rate"): ("중국 대출우대금리(LPR)", 1, ["LPR", "인민은행"]),
}

# 중앙은행 인사 발언·기자회견 (ForexFactory). 미국은 전부, 그 밖은 총재 발언·기자회견만.
SPEAKER_KO = {
    "Powell": "파월", "Jefferson": "제퍼슨", "Waller": "월러", "Bowman": "보우먼", "Barr": "바", "Cook": "쿡",
    "Kugler": "쿠글러", "Miran": "미란", "Williams": "윌리엄스", "Logan": "로건", "Daly": "데일리", "Musalem": "무살렘",
    "Hammack": "해맥", "Kashkari": "카시카리", "Goolsbee": "굴스비", "Bostic": "보스틱", "Schmid": "슈미드",
    "Collins": "콜린스", "Harker": "하커", "Barkin": "바킨", "Paulson": "폴슨", "Hassett": "해싯", "Warsh": "워시",
    "Bessent": "베센트", "Lagarde": "라가르드", "Ueda": "우에다", "Bailey": "베일리", "Macklem": "매클럼",
}
TALK_ORG = {"USD": "연준", "EUR": "ECB", "JPY": "일본은행", "GBP": "영란은행"}
PRESS_KO = {("EUR", "ECB Press Conference"): "ECB 총재 기자회견", ("JPY", "BOJ Press Conference"): "일본은행 총재 기자회견",
            ("GBP", "BOE Press Conference"): "영란은행 기자회견"}


def talk_of(e):
    """FF 일정 → (제목, 중요도, kw) 또는 None"""
    c, t = e.get("country"), e.get("title") or ""
    if (c, t) in PRESS_KO:
        return PRESS_KO[(c, t)], 2, [PRESS_KO[(c, t)].split()[0]]
    if c not in TALK_ORG or not any(w in t for w in ("Speaks", "Testifies")):
        return None
    name = next((n for n in SPEAKER_KO if n in t), None)
    head = t.replace(" Speaks", "").replace(" Testifies", "")
    if c != "USD" and not any(w in head for w in ("President", "Gov ", "Governor")) or (c != "USD" and "Member" in head):
        return None
    role = "의장" if "Chair" in head and "Vice" not in head else "부의장" if "Vice Chair" in head else \
        "재무장관" if "Treasury" in head else "총재" if c != "USD" else "위원"
    org = "미 재무부" if role == "재무장관" else TALK_ORG[c]
    nm = SPEAKER_KO.get(name, name or head.split()[-1])
    imp = 3 if role == "의장" else 2 if role in ("부의장", "재무장관", "총재") else 0
    if "Testifies" in t:
        imp, act = max(imp, 2), "의회 증언"
    else:
        act = "발언"
    return f"{org} {nm} {role} {act}", imp, [nm, name] if name else [nm]


def kr_earn_by_day():
    """국장 실적 발표일(네이버 IR 일정, picks.yml 이 feeds/earn.json 갱신) — 시총 순위 표(stock-list.json) 상위만"""
    e = (load("feeds/earn.json", {}) or {}).get("items") or {}
    rank = {c[0]: (i, c[1]) for i, c in enumerate(load("feeds/stock-list.json", []) or [])}
    out = {}
    for code, v in e.items():
        if code not in rank:
            continue
        d = f"{v[0][:4]}-{v[0][4:6]}-{v[0][6:8]}"
        out.setdefault(d, []).append(rank[code])
    return {d: sorted(v) for d, v in out.items()}


# 중요도 낮은 미국 지표(ForexFactory Low) 한글 이름 — 칸에서는 '전체 보기' 안에 들어간다 (2026-10-26)
LOW_KO = [
    ("Durable Goods", "내구재주문"), ("New Home Sales", "신규주택매매"), ("Pending Home Sales", "잠정주택매매"),
    ("Existing Home Sales", "기존주택매매"), ("Building Permits", "건축허가"), ("Housing Starts", "주택착공"),
    ("S&P/CS Composite-20 HPI", "S&P 코어로직/CS 주택가격지수"), ("HPI m/m", "주택가격지수(FHFA)"),
    ("Richmond Manufacturing", "리치몬드 연은 제조업지수"), ("Philly Fed", "필라델피아 연은 제조업지수"),
    ("Empire State", "뉴욕 연은 제조업지수"), ("Chicago PMI", "시카고 PMI"), ("ADP Weekly", "주간 ADP 취업자 변동"),
    ("ADP Non-Farm", "ADP 민간고용"), ("Goods Trade Balance", "상품수지"), ("Trade Balance", "무역수지"),
    ("Wholesale Inventories", "도매재고"), ("Business Inventories", "기업재고"), ("Crude Oil Inventories", "EIA 원유재고"),
    ("API Weekly", "API 원유재고"), ("Natural Gas Storage", "천연가스 재고"), ("Personal Income", "개인소득"),
    ("Personal Spending", "개인소비"), ("Factory Orders", "공장주문"), ("Industrial Production", "산업생산"),
    ("Import Prices", "수입물가"), ("Current Account", "경상수지"), ("Consumer Credit", "소비자신용"),
    ("Note Auction", "국채 입찰"), ("Bond Auction", "국채 입찰"), ("Bill Auction", "단기국채 입찰"),
    ("Revised UoM", "미시간대 소비자심리(확정)"), ("Prelim UoM", "미시간대 소비자심리(예비)"), ("Inflation Expectations", "기대인플레이션"),
    ("JOLTS", "JOLTS 구인건수"), ("Challenger", "챌린저 감원"), ("Beige Book", "베이지북"), ("FOMC Meeting Minutes", "FOMC 의사록"),
    ("Federal Budget", "재정수지"), ("NFIB", "NFIB 소기업 낙관지수"), ("Final GDP", "GDP(확정)"), ("Prelim GDP", "GDP(잠정)"),
    ("Flash Manufacturing PMI", "S&P 제조업 PMI(예비)"), ("Flash Services PMI", "S&P 서비스업 PMI(예비)"),
    ("ISM Manufacturing", "ISM 제조업지수"), ("ISM Services", "ISM 서비스업지수"), ("Retail Sales", "소매판매"),
    ("Empire", "뉴욕 연은 제조업지수"), ("Kansas", "캔자스시티 연은 제조업지수"), ("Dallas", "댈러스 연은 제조업지수"),
]


def low_ko(en):
    for k, v in LOW_KO:
        if k in en:
            return v
    return None


KR_MACRO_KEY = ("국내총생산", "국민소득", "소비자물가", "고용동향", "국제수지", "산업활동동향")
MODS_KEEP = ("소비자물가", "고용동향", "산업활동", "가계동향", "온라인쇼핑", "서비스업동향", "경제활동인구", "인구동향")


def _get_text(url, enc="utf-8", legacy_tls=False):
    import ssl
    ctx = ssl.create_default_context()
    if legacy_tls:  # 38커뮤니케이션은 옛 TLS 설정이라 기본값으로는 악수 실패
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        return r.read().decode(enc, "ignore")


def kr_macro_by_day(days):
    """국내 지표 공표 일정 — 한국은행 통계공표일정(연간 표) + 국가데이터처(옛 통계청) 보도계획(월별). {날짜: [(시각, 제목)]}"""
    import re
    out = {}
    years = sorted({d[:4] for d in days})
    for y in years:
        try:
            t = _get_text(f"https://www.bok.or.kr/portal/stats/statsPublictSchdul/listCldr.do?menuNo=200775&year={y}")
            for d, tm, ti in re.findall(r'<td>(\d{4}-\d\d-\d\d)</td>\s*<td>([^<]*)</td>\s*<td class="title">\s*<p>\s*(.*?)\s*</p>', t, re.S):
                if d in days:
                    out.setdefault(d, []).append((tm.strip(), re.sub(r"<[^>]+>", "", ti).strip()))
        except Exception as e:  # noqa
            print("한은 공표일정 실패:", e, file=sys.stderr)
    for ym in sorted({d[:7] for d in days}):
        try:
            t = _get_text(f"https://mods.go.kr/newsPln.es?mid=a10305000000&act=list&oa_mm={ym[5:]}")
            h = re.findall(r"(\d{4})년\s*(\d+)월 보도계획", t)
            if not h or f"{h[0][0]}-{int(h[0][1]):02d}" != ym:
                continue  # 다른 해 표면 버림
            for mm, dd, tm, ti in re.findall(r'<td class="center"\s*>(\d\d)\.(\d\d)\.\(\s*\S+\s*\)</td>\s*<td class="center"\s*>([^<]*)</td>\s*<td>(.*?)</td>', t, re.S):
                d = f"{ym[:4]}-{mm}-{dd}"
                ti = re.sub(r"<[^>]+>", "", ti).strip()
                if d in days and any(k in ti for k in MODS_KEEP):
                    out.setdefault(d, []).append((tm.strip(), ti))
        except Exception as e:  # noqa
            print("국가데이터처 보도계획 실패:", e, file=sys.stderr)
    return out


def ipo_by_day():
    """38커뮤니케이션 공모주 일정 — 신규상장일·공모청약(시작일). {날짜: {'list': [...], 'sub': [(이름, 끝)]}}"""
    import re
    out = {}
    def rows(o):
        try:
            t = _get_text(f"https://www.38.co.kr/html/fund/index.htm?o={o}", "euc-kr", legacy_tls=True)
        except Exception as e:  # noqa
            print("38 받기 실패:", o, e, file=sys.stderr)
            return []
        res = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", t, flags=re.S | re.I):
            cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c)).replace("&nbsp;", "").strip()
                     for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S | re.I)]
            if len(cells) >= 4 and cells[0]:
                res.append(cells)
        return res
    for c in rows("nw"):  # 신규상장: [이름, 2026/11/04, ...]
        m = re.match(r"(20\d\d)/(\d\d)/(\d\d)$", c[1])
        if m:
            out.setdefault(f"{m[1]}-{m[2]}-{m[3]}", {}).setdefault("list", []).append(c[0])
    for c in rows("k"):  # 공모청약: [이름, 2026.11.05~11.06, ...]
        m = re.match(r"(20\d\d)\.(\d\d)\.(\d\d)~(\d\d)\.(\d\d)$", c[1])
        if m:
            out.setdefault(f"{m[1]}-{m[2]}-{m[3]}", {}).setdefault("sub", []).append((c[0], f"{int(m[4])}/{int(m[5])}"))
    return out


TYPE_C = {"policy": "pol", "data": "data", "earnings": "earn", "event": "ev"}


def get_json(url, headers=None, tries=(0, 20, 60)):
    for wait in tries:
        time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
            print("받기 실패:", url, e, file=sys.stderr)
    return None


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def cap(row):
    try:
        return float((row.get("marketCap") or "0").replace("$", "").replace(",", "") or 0)
    except ValueError:
        return 0.0


_nq_cache = {}


def nasdaq_day(d):
    """그날(미국 날짜) 실적 발표 목록 [(심볼, 이름, 시총, 'B'|'A'|'')], 시총 큰 순. 실패하면 None."""
    if d in _nq_cache:
        return _nq_cache[d]
    js = None
    if os.environ.get("NASDAQ_DIR"):
        js = load(os.path.join(os.environ["NASDAQ_DIR"], d + ".json"), None)
    if js is None:
        js = get_json(NQ_URL.format(d), {"Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"}, (0, 5))
        time.sleep(0.6)
    if js is None:
        _nq_cache[d] = None
        return None
    rows = ((js.get("data") or {}).get("rows")) or []
    out, seen = [], set()
    for r in sorted(rows, key=lambda r: -cap(r)):
        sym = (r.get("symbol") or "").strip().upper()
        name = (r.get("name") or "").strip()
        sym = sym.replace("/", ".")
        if sym == "GOOG":
            sym = "GOOGL"
        if sym == "BRK.A":
            sym = "BRK.B"
        if not sym or sym in seen:
            continue
        seen.add(sym)
        t = r.get("time") or ""
        when = "B" if "pre" in t else "A" if "after" in t else ""
        out.append((sym, name, cap(r), when))
    _nq_cache[d] = out
    return out


def ko_name(sym, name):
    if sym in KO:
        return KO[sym]
    n = name.replace(",", "").replace("(The)", "").split(" ")
    stop = {"Inc.", "Inc", "Corporation", "Corp.", "Corp", "Company", "Co.", "plc", "Ltd.", "Ltd", "S.A.", "N.V.", "AG", "Holdings", "Group"}
    n = [w for w in n if w not in stop][:2]
    return " ".join(n) or sym


def us_date_of(ev):
    """events.json 의 한국 시각을 미국 동부 날짜로 (손 정리 캘린더와 같은 기준)."""
    tm = ev.get("time") or ""
    if len(tm) == 5 and tm[2] == ":" and ev.get("market") == "US":
        dt = datetime.fromisoformat(ev["date"] + "T" + tm).replace(tzinfo=KST).astimezone(ET)
        return dt.date().isoformat(), f"한국시간 {int(ev['date'][5:7])}/{int(ev['date'][8:])} {tm}"
    return ev["date"], (f"한국시간 {tm}" if len(tm) == 5 and tm[2] == ":" else "")


def kw_of(title):
    return [w for w in title.replace("(", " ").replace(")", " ").split() if len(w) >= 2][:3]


def build_week(monday, events_doc, ff):
    days = [(monday + timedelta(days=i)).isoformat() for i in range(7)]
    out = {d: [] for d in days}
    focus3, n_earn_days = [], 0

    for ev in (events_doc.get("events") or []):
        if (ev.get("imp") or 0) < 2:
            continue
        d, sub = us_date_of(ev)
        if d not in out:
            continue
        it = {"c": TYPE_C.get(ev.get("type"), "ev"), "t": ev["title"]}
        if ev.get("imp", 0) >= 3:
            it["imp"] = 3
            focus3.append(ev["title"])
        if sub:
            it["sub"] = sub
        kw = kw_of(ev["title"])
        if kw:
            it["kw"] = kw
        out[d].append(it)

    for e in (ff or []):
        k = (e.get("country"), e.get("title"))
        if k not in CB:
            continue
        dt = datetime.fromisoformat(e["date"])
        d = dt.astimezone(ET).date().isoformat()
        if d not in out:
            continue
        t, imp, kw = CB[k]
        it = {"c": "pol", "t": t, "kw": kw, "sub": "한국시간 " + dt.astimezone(KST).strftime("%-m/%-d %H:%M")}
        if imp >= 2:
            it["imp"] = imp
        if imp >= 3:
            focus3.append(t)
        out[d].append(it)

    for e in (ff or []):
        tk = talk_of(e)
        if not tk:
            continue
        dt = datetime.fromisoformat(e["date"])
        d = dt.astimezone(ET).date().isoformat()
        if d not in out:
            continue
        t, imp, kw = tk
        it = {"c": "talk", "t": t, "kw": [k for k in kw if k], "sub": "한국시간 " + dt.astimezone(KST).strftime("%-m/%-d %H:%M")}
        if imp:
            it["imp"] = imp
        out[d].append(it)

    # upcoming(앞으로의 큰 일정, 손으로 모아 둔 것)에 이번 주 날짜가 있으면 그날 칸에도 올린다
    for u in (load(CAL, {}).get("upcoming") or []):
        if u.get("auto"):
            continue  # 연간 행사 표에서 온 것은 아래에서 따로 (기간·부가 설명 포함)
        words = [w for w in kw_of(u.get("t", "")) if not w[:-1].isdigit() and w not in ("미", "미국", "한국")]
        if u.get("d") in out and not any(i.get("t") == u.get("t") or any(w in i.get("t", "") for w in words)
                                         for i in out[u["d"]]):
            it = {"c": u.get("c", "ev"), "t": u["t"]}
            if u.get("approx"):
                it["sub"] = "날짜 대략"
            kw = kw_of(u["t"])
            if kw:
                it["kw"] = kw
            out[u["d"]].append(it)

    # 연간 행사 표(feeds/events-annual.json) — 기업 행사·정상회의·휴장 등. 여러 날짜 행사는 이번 주 첫 날짜 칸에 '(~끝)' 으로
    for a in (load(ANNUAL, {}).get("items") or []):
        st, en = a.get("d", ""), a.get("end") or a.get("d", "")
        if en < days[0] or st > days[6]:
            continue
        d = st if st >= days[0] else days[0]
        words = [w for w in (a.get("kw") or []) if len(w) >= 3]
        if any(i.get("t") == a["t"] or (a.get("c") == "pol" and any(w in i.get("t", "") for w in words)) for i in out[d]):
            continue  # FOMC 처럼 이벤트 일정에 이미 있으면 건너뜀
        it = {"c": a.get("c", "ev"), "t": a["t"] + (f" (~{int(en[5:7])}/{int(en[8:])})" if en != st else "")}
        for k in ("imp", "sub", "kw", "tk"):
            if a.get(k):
                it[k] = a[k]
        if st < days[0]:
            it["sub"] = ((it.get("sub") or "") + " · 진행 중").strip(" ·")
        if a.get("sure") is False:
            it["sub"] = ((it.get("sub") or "") + " · 날짜 대략").strip(" ·")
        if it.get("imp", 0) >= 3:
            focus3.append(it["t"])
        out[d].append(it)

    kr = kr_earn_by_day()
    kr_big = []
    for d in days[:5]:
        allk = kr.get(d) or []
        pick = [x for x in allk if x[0] < KR_TOP][:WEEK_MAX_PER_SLOT]
        rest = [x for x in allk if x not in pick]
        if pick:
            out[d].append({"c": "earn", "t": "·".join(n for _, n in pick) + " (국내)", "kw": [n for _, n in pick]})
            kr_big += [(r, n) for r, n in pick if r < 10]
        if rest:
            out[d].append({"c": "earn", "lo": 1, "t": "국내 실적 " + str(len(rest)) + "곳: " + "·".join(n for _, n in rest), "kw": [n for _, n in rest]})

    # 미국 지표 중 이벤트 일정(중요도 보통 이상)에 없는 것 = 펼치기 (ForexFactory Low 포함)
    have = {(ev.get("src") or "")[3:] for ev in (events_doc.get("events") or [])}
    seen = set()
    for e in (ff or []):
        if e.get("country") != "USD" or e.get("title") in have or talk_of(e) or (e.get("country"), e.get("title")) in CB:
            continue
        if e.get("impact") not in ("Low", "Medium", "High"):
            continue
        ko = low_ko(e["title"])
        if not ko:
            continue
        dt = datetime.fromisoformat(e["date"])
        d = dt.astimezone(ET).date().isoformat()
        if d not in out or (d, ko) in seen:
            continue
        seen.add((d, ko))
        out[d].append({"c": "data", "lo": 1, "t": "美 " + ko, "sub": "한국시간 " + dt.astimezone(KST).strftime("%-m/%-d %H:%M"), "kw": [ko.split("(")[0]]})

    # 국내 지표 (한은·국가데이터처 공표 일정) — GDP·물가·고용·국제수지·산업활동은 바로, 나머지는 펼치기
    import re as _re
    for d, lst in kr_macro_by_day(days).items():
        for tm, ti in lst:
            t = "韓 " + _re.sub(r"^20\d\d년\s*", "", ti)
            if any(i.get("t") == t for i in out[d]):
                continue
            it = {"c": "data", "t": t, "kw": [_re.sub(r"^20\d\d년\s*|\(.*?\)", "", ti).strip()[:12]]}
            if tm:
                it["sub"] = "한국시간 " + (tm if len(tm) == 5 else "0" + tm)
            if any(k in ti for k in KR_MACRO_KEY):
                if "국내총생산" in ti:
                    it["imp"] = 3
                    focus3.append(t)
            else:
                it["lo"] = 1
            out[d].append(it)

    # 신규상장·공모청약 (38커뮤니케이션) = 펼치기
    ipo = ipo_by_day()
    for d in days[:5]:
        x = ipo.get(d) or {}
        if x.get("list"):
            out[d].append({"c": "ipo", "lo": 1, "t": "신규상장: " + "·".join(x["list"]), "kw": x["list"]})
        if x.get("sub"):
            out[d].append({"c": "ipo", "lo": 1, "t": "공모청약: " + "·".join(f"{n}(~{e})" for n, e in x["sub"]), "kw": [n for n, _ in x["sub"]]})

    big_earn = []
    for d in days[:5]:
        rows = nasdaq_day(d)
        if not rows:
            continue
        n_earn_days += 1
        for when, label in (("B", "장 전"), ("A", "장 마감 후"), ("", "시간 미정")):
            floor = WEEK_MIN_CAP if when else WEEK_MIN_CAP * 2.5  # 시간 미정은 더 큰 종목만
            pick = [r for r in rows if r[3] == when and r[2] >= floor][:WEEK_MAX_PER_SLOT]
            if not pick:
                continue
            it = {"c": "earn", "t": "·".join(ko_name(s, n) for s, n, _, _ in pick) + f" ({label})",
                  "tk": ",".join(s for s, _, _, _ in pick)}
            if when == "B":
                it["when"] = "B"
            out[d].append(it)
            big_earn += [(c, ko_name(s, n)) for s, n, c, _ in pick]
        shown = set(t for i in out[d] if i.get("c") == "earn" and i.get("tk") for t in i["tk"].split(","))
        rest = [r for r in rows if r[2] >= US_LO_CAP and r[0] not in shown]
        if rest:  # 시총 큰 순 20곳까지 이름, 나머지는 '외 N곳' (tk 는 안 붙임 — 반응 집계가 수백 종목으로 불어남)
            lab = {"B": "(전)", "A": "(후)", "": ""}
            names = "·".join(ko_name(s, n) + lab[w] for s, n, _, w in rest[:20]) + (f" 외 {len(rest) - 20}곳" if len(rest) > 20 else "")
            out[d].append({"c": "earn", "lo": 1, "t": "미국 실적 " + str(len(rest)) + "곳: " + names})

    focus = []
    for t in focus3:
        if t not in focus and len(focus) < 3:
            focus.append(t)
    big = [n for c, n in sorted(big_earn, key=lambda x: -x[0]) if c >= LIST_MIN_CAP]
    if big:
        focus.append("빅테크 실적 (" + "·".join(dict.fromkeys(big[:4])) + ")")
    if kr_big:
        focus.append("국내 실적 (" + "·".join(n for _, n in sorted(kr_big)[:4]) + ")")
    src = "자동 정리 — 이벤트·발언·연간 행사·나스닥/국내 IR 실적 일정" + ("" if n_earn_days else " (실적 일정 못 받음)")
    return {"from": days[0], "to": days[6], "src": src, "auto": True, "focus": focus,
            "days": {d: v for d, v in out.items() if v}}, n_earn_days


def refresh_earnings(cal, today):
    """아래 실적 목록: 지난 3주 + 앞으로 4주, 시총 상위 종목 자동 추가. 날짜가 바뀐 예정 건은 고친다."""
    keep_from = (today - timedelta(days=21)).isoformat()
    lst = [e for e in (cal.get("earnings") or []) if e.get("d", "") >= keep_from]
    got_any = False
    found = {}
    for i in range(LIST_AHEAD + 1):
        d = (today + timedelta(days=i))
        if d.weekday() >= 5:
            continue
        rows = nasdaq_day(d.isoformat())
        if rows is None:
            continue
        got_any = True
        for s, n, c, w in rows:
            if c >= LIST_MIN_CAP and s not in found:
                found[s] = (d.isoformat(), ko_name(s, n), w)
    if not got_any:
        return lst
    for s, (d, n, w) in found.items():
        cur = [e for e in lst if e.get("tk") == s and e["d"] >= today.isoformat()]
        if cur:
            for e in cur:
                e["d"] = d
                if w:
                    e["when"] = w
        elif not any(e.get("tk") == s and e["d"] == d for e in lst):
            e = {"d": d, "n": n, "tk": s, "auto": True}
            if w:
                e["when"] = w
            lst.append(e)
    # 같은 종목이 같은 날 두 번 → 하나만
    uniq = {}
    for e in lst:
        uniq.setdefault((e.get("tk"), e["d"]), e)
    return sorted(uniq.values(), key=lambda e: (e["d"], e.get("tk", "")))


def main():
    today = datetime.now(KST).date()
    monday = today - timedelta(days=today.weekday())
    cal = load(CAL, None)
    if not cal:
        print("calendar.json 을 못 읽음", file=sys.stderr)
        return 1
    events_doc = load("events.json", {})
    ff = None
    # update_events.py 가 받아 둔 피드를 쓴다(같은 피드를 또 부르면 429)
    for path in (os.environ.get("FF_FILE"), "/tmp/ff_week.json"):
        if ff is None and path and os.path.exists(path):
            ff = load(path, None)
    if ff is None:
        ff = get_json(FF_URL, tries=(0, 60))

    weeks = cal.get("weeks") or []
    mon = monday.isoformat()
    hand = [w for w in weeks if w.get("from") == mon and not w.get("auto")]
    if hand:
        print("이번 주는 손 정리가 있어 그대로 둠")
    else:
        wk, n = build_week(monday, events_doc, ff)
        old = [w for w in weeks if w.get("from") == mon]
        if ff is None and old:  # 피드를 못 받았으면 지난번에 넣은 주요국 금리 결정은 살린다
            cbt = {v[0] for v in CB.values()}
            for d, items in (old[0].get("days") or {}).items():
                keep = [i for i in items if i.get("t") in cbt or i.get("c") == "talk"]
                if keep:
                    wk["days"].setdefault(d, []).extend(keep)
        # 실적 일정을 하나도 못 받았으면 이미 만들어 둔 자동 주를 덮지 않는다(빈칸 방지)
        if old and n == 0:
            print("실적 일정을 못 받아 기존 자동 주 유지", file=sys.stderr)
        else:
            weeks = [w for w in weeks if w.get("from") != mon] + [wk]
            print("이번 주 자동 생성:", mon, sum(len(v) for v in wk["days"].values()), "건 · 실적일", n)
    weeks.sort(key=lambda w: w["from"])
    cal["weeks"] = weeks[-KEEP_WEEKS:]

    cal["earnings"] = refresh_earnings(cal, today)
    cal["earningsNote"] = "장 전 / 장 마감 후는 미국 시간 기준 → 장 마감 후 발표는 다음 거래일에 반응"
    # 앞으로 일정 = 손으로 넣은 것 + 연간 행사 표의 60일 안 일정(auto, 매일 다시 채움). 지난 일정은 뺀다.
    t0, t1 = today.isoformat(), (today + timedelta(days=UPCOMING_DAYS)).isoformat()
    hand_up = [u for u in (cal.get("upcoming") or []) if not u.get("auto") and u.get("d", "") >= t0]
    auto_up = []
    for a in (load(ANNUAL, {}).get("items") or []):
        if not (t0 <= a.get("d", "") <= t1) or a.get("c") == "earn":
            continue
        words = [w for w in (a.get("kw") or []) if len(w) >= 3]
        if any(abs((date.fromisoformat(u["d"]) - date.fromisoformat(a["d"])).days) <= 1 and any(w in u.get("t", "") for w in words) for u in hand_up):
            continue
        u = {"d": a["d"], "c": a.get("c", "ev"), "t": a["t"], "auto": True}
        if a.get("sure") is False:
            u["approx"] = True
        auto_up.append(u)
    cal["upcoming"] = sorted(hand_up + auto_up, key=lambda u: u["d"])
    cal["note"] = ("위클리 캘린더·실적 일정. 손으로 넣은 주(auto 없음)가 우선이고, 없는 주는 scripts/auto_calendar.py 가 "
                   "매일 자동으로 만든다(auto: true — 사진 정리로 덮어쓰면 됨). scripts/watch_eval.py 가 지난 일정의 관련 뉴스(news-all.json)와 "
                   "발표 뒤 주가 반응을 feeds/watch-eval.json 에 채운다. c = ev 주요 이벤트 · pol 정책/통화 · data 지표 · earn 실적 · talk 발언. "
                   "실적 when = B 장 전 / A 장 마감 후 (미국 시간).")
    with open(CAL, "w", encoding="utf-8") as f:
        json.dump(cal, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
