#!/usr/bin/env python3
"""수급 데이터 갱신 — feeds/flow.json.

GitHub Actions(.github/workflows/flow.yml)가 장중 30분마다 + 저녁에 실행한다. 출처는 네이버 증권(무료·키 없음).
- inv   : 코스피·코스닥 투자자별 매매(개인·외국인·기관·프로그램, 억원) — 장중 실시간 누적
- h52u/h52d : 52주 신고가·신저가 종목 수 (코스피+코스닥)
- trend : 지수(코스피·코스닥·코스피200)·환율 최근 20거래일 종가 — 지수 카드 그래프
- us    : QQQ·SPY 종가·등락률 (워커 /quotes 가 값을 빠뜨릴 때 대체)
- stock-list.json : 검색용 전체 종목 코드·이름 (주 1회)
- smart : 외국인·기관 순매수/순매도 TOP5 (억원) — 시가총액 상위 종목의 '확정된 직전 거래일' 수급으로 계산.
          날짜가 바뀌었을 때만 다시 계산한다(종목마다 1번씩 요청하므로).
표준 라이브러리만 사용.
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "feeds", "flow.json")
KST = timezone(timedelta(hours=9))
API = "https://m.stock.naver.com/api"
UNIVERSE = {"KOSPI": 150, "KOSDAQ": 50}  # 시가총액 상위 몇 종목으로 TOP5 를 뽑을지


def get(path):
    for i in range(3):
        try:
            req = urllib.request.Request(API + path, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa
            if i == 2:
                raise
            time.sleep(2 + i * 3)


def n(s):
    try:
        return float(str(s).replace(",", "").replace("+", ""))
    except ValueError:
        return 0.0


def investors():
    out = []
    for mkt in ("KOSPI", "KOSDAQ"):
        d = get(f"/index/{mkt}/integration")
        dt, pg = d.get("dealTrendInfo") or {}, d.get("programTrendInfo") or {}
        out.append([mkt, int(n(dt.get("personalValue"))), int(n(dt.get("foreignValue"))),
                    int(n(dt.get("institutionalValue"))), int(n(pg.get("indexTotalReal")))])
        bizdate = dt.get("bizdate", "")
    return out, bizdate


def trend():
    """지수 카드 그래프용 최근 20거래일 종가 [[날짜, 값], ...] 오래된 순."""
    out = {}
    for nm, code in (("KOSPI", "KOSPI"), ("KOSDAQ", "KOSDAQ"), ("KOSPI200", "KPI200")):
        rows = get(f"/index/{code}/price?pageSize=20&page=1")
        out[nm] = [[r["localTradedAt"], n(r["closePrice"])] for r in reversed(rows)]
    fx = get_raw("https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_USDKRW&page=1&pageSize=20")
    out["USD/KRW"] = [[r["localTradedAt"], n(r["closePrice"])] for r in reversed(fx.get("result") or [])]
    return out


def get_raw(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def us_etf():
    """미국 지수 ETF(QQQ·SPY) 종가·등락률 — 워커가 값을 빠뜨릴 때 지수 카드 대체값."""
    out = {}
    for nm, code in (("QQQ", "QQQ.O"), ("SPY", "SPY")):
        d = get_raw(f"https://api.stock.naver.com/stock/{code}/basic")
        out[nm] = {"px": n(d.get("closePrice")), "c": n(d.get("fluctuationsRatio")), "at": d.get("localTradedAt", "")}
    return out


LIST = os.path.join(ROOT, "feeds", "stock-list.json")


def stock_list():
    """검색용 전체 국내 종목 [[코드, 이름, 시장], ...] (코스피·코스닥, ETF 포함). 일주일에 한 번만 다시 만든다."""
    try:
        with open(LIST, encoding="utf-8") as f:
            old = json.load(f)
        # 시장 구분([코드, 이름, 시장])이 없는 옛 형식이면 기간과 무관하게 다시 만든다
        if time.time() - os.path.getmtime(LIST) < 6 * 86400 and len(old) > 1500 and len(old[0]) >= 3:
            return False
    except (OSError, ValueError, IndexError, TypeError):
        pass
    rows, seen = [], set()
    for mkt in ("KOSPI", "KOSDAQ"):
        page = 1
        while True:
            d = get(f"/stocks/marketValue/{mkt}?page={page}&pageSize=50")
            for st in d.get("stocks", []):
                if st["itemCode"] not in seen:
                    seen.add(st["itemCode"])
                    rows.append([st["itemCode"], st["stockName"], mkt])
            if page * 50 >= int(d.get("totalCount") or 0) or not d.get("stocks"):
                break
            page += 1
            time.sleep(0.1)
    if len(rows) < 1500:
        print("종목 목록이 너무 적어 저장 안 함:", len(rows), file=sys.stderr)
        return False
    with open(LIST, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    print("종목 목록 갱신:", len(rows))
    return True


def count(kind):
    return sum(int(get(f"/stocks/{kind}/{m}?page=1&pageSize=1").get("totalCount") or 0) for m in ("KOSPI", "KOSDAQ"))


def smart():
    """시총 상위 종목의 직전 확정 거래일 외국인·기관 순매수 금액(억원) TOP5."""
    rows, day = [], None
    for mkt, size in UNIVERSE.items():
        lst = []
        for page in range(1, size // 50 + 1):  # 한 번에 최대 50개
            lst += get(f"/stocks/marketValue/{mkt}?page={page}&pageSize=50").get("stocks", [])
        for s in lst:
            if s.get("stockEndType") != "stock":
                continue
            try:
                t = get(f"/stock/{s['itemCode']}/trend?pageSize=1")[0]
            except Exception:  # noqa
                continue
            day = max(day or "", t.get("bizdate", ""))
            px = n(t.get("closePrice"))
            rows.append((t.get("bizdate"), s["stockName"],
                         n(t.get("foreignerPureBuyQuant")) * px / 1e8, n(t.get("organPureBuyQuant")) * px / 1e8))
            time.sleep(0.15)
    rows = [r for r in rows if r[0] == day]

    def top(i, rev):
        sel = sorted(rows, key=lambda r: r[i], reverse=rev)[:5]
        return [[r[1], int(round(abs(r[i])))] for r in sel if (r[i] > 0) == rev and abs(r[i]) >= 1]
    return {"date": day, "foreign": top(2, True), "inst": top(3, True),
            "foreignSell": top(2, False), "instSell": top(3, False), "n": len(rows)}


def main():
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except Exception:  # noqa
        old = {}
    new = dict(old)
    try:
        new["inv"], new["invDate"] = investors()
        new["h52u"], new["h52d"] = count("high52week"), count("low52week")
        new["trend"] = trend()
    except Exception as e:  # noqa
        print("지수 수급 실패:", e, file=sys.stderr)
    try:
        new["us"] = us_etf()
    except Exception as e:  # noqa
        print("미국 ETF 실패:", e, file=sys.stderr)
    try:
        stock_list()
    except Exception as e:  # noqa
        print("종목 목록 실패:", e, file=sys.stderr)
    try:
        latest = get("/stock/005930/trend?pageSize=1")[0].get("bizdate")
        if latest and latest != (old.get("smart") or {}).get("date"):
            sm = smart()
            if sm["n"] >= 50:
                new["smart"] = sm
                print("순매수 TOP 재계산:", sm["date"], sm["n"], "종목")
    except Exception as e:  # noqa
        print("순매수 TOP 실패:", e, file=sys.stderr)
    if {k: v for k, v in new.items() if k != "updated"} == {k: v for k, v in old.items() if k != "updated"}:
        print("변경 없음")
        return 0
    new["updated"] = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(new, f, ensure_ascii=False, indent=1)
    print("갱신:", new["updated"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
