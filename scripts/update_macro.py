#!/usr/bin/env python3
"""맨 위 '지수' 줄용 시장 지표 → feeds/macro.json (news.yml 30분마다, 하루 종일).

- idx : 미국 실제 지수(나스닥 종합·S&P500·다우·나스닥100) 값·등락률·전일 종가·장 상태
- fut : 미국 지수 선물(나스닥100·S&P500 미니) — 미국장이 닫혀 있을 때 화면이 이걸 보여준다
- VIX, US10Y(미국 10년물 금리)
자료 = 네이버(키 없음). 브라우저에서 직접 부르면 CORS 로 막혀서 여기서 모은다.
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "feeds", "macro.json")
KST = timezone(timedelta(hours=9))


def get(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:  # noqa
            if i == 2:
                raise
            time.sleep(2 + i * 3)


def n(s):
    try:
        return float(str(s).replace(",", "").replace("+", ""))
    except (TypeError, ValueError):
        return None


def main():
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except Exception:  # noqa
        old = {}
    out = dict(old)
    try:
        idx = {}
        for x in get("https://api.stock.naver.com/index/nation/USA"):
            rc = x.get("reutersCode")
            if rc in (".IXIC", ".INX", ".DJI", ".NDX"):
                idx[rc] = {"v": n(x.get("closePrice")), "c": n(x.get("fluctuationsRatio")), "prev": n(x.get("lastClosePrice")),
                           "st": x.get("marketStatus", ""), "at": x.get("localTradedAt", "")}
            if rc == ".VIX":
                out["VIX"] = {"v": n(x.get("closePrice")), "c": n(x.get("fluctuationsRatio")), "at": x.get("localTradedAt", "")}
        if idx:
            out["idx"] = idx
    except Exception as e:  # noqa
        print("미국 지수 실패:", e, file=sys.stderr)
    try:
        fut = {}
        for x in get("https://api.stock.naver.com/futures/nation/USA"):
            rc = x.get("reutersCode")
            if rc in ("NQcv1", "EScv1", "YMcv1"):
                fut[rc] = {"v": n(x.get("closePrice")), "c": n(x.get("fluctuationsRatio")), "at": x.get("localTradedAt", "")}
        if fut:
            out["fut"] = fut
    except Exception as e:  # noqa
        print("선물 실패:", e, file=sys.stderr)
    try:
        b = get("https://m.stock.naver.com/front-api/marketIndex/productDetail?category=bond&reutersCode=US10YT%3DRR").get("result") or {}
        out["US10Y"] = {"v": n(b.get("closePrice")), "d": n(b.get("fluctuations")), "c": n(b.get("fluctuationsRatio")), "at": b.get("localTradedAt", "")}
    except Exception as e:  # noqa
        print("10년물 실패:", e, file=sys.stderr)
    out["updated"] = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("macro.json", out["updated"], sorted(k for k in out if k != "updated"))


if __name__ == "__main__":
    main()
