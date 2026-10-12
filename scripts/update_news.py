#!/usr/bin/env python3
"""뉴스 모으기 — 여러 언론 RSS 를 직접 받아 feeds/news-all.json 하나로 (2026-10-12 사용자 결정).

브라우저의 rss2json 은 새 출처를 짧은 시간에 여러 개 부르면 막혀서, 깃허브 Actions(news.yml, 30분마다)가 모아 둔다.
- KR: 국내 경제·증권 / US: 미국 영문 / USKO: 한글로 쓴 미국·해외 증시 기사(국내 출처 중 미국 키워드 + 한경 국제)
- 같은 기사(제목이 거의 같은 것)는 하나로 묶고 다른 출처 수를 dup 에 적는다.
표준 라이브러리만 사용.
"""
import html, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "feeds", "news-all.json")
KST = timezone(timedelta(hours=9))
KEEP = 80  # 분류마다 최근 몇 개

FEEDS = [  # (분류, 출처 이름, 주소)
    ("KR", "연합뉴스", "https://www.yna.co.kr/rss/economy.xml"),
    ("KR", "한국경제", "https://www.hankyung.com/feed/finance"),
    ("KR", "매일경제", "https://www.mk.co.kr/rss/30100041/"),
    ("KR", "연합인포맥스", "https://news.einfomax.co.kr/rss/allArticle.xml"),
    ("KR", "이데일리", "https://rss.edaily.co.kr/stock_news.xml"),
    ("KR", "머니투데이", "https://rss.mt.co.kr/mt_news.xml"),
    ("KR", "서울경제", "https://www.sedaily.com/rss/finance"),
    ("KR", "조선비즈", "https://biz.chosun.com/arc/outboundfeeds/rss/category/stock/?outputType=xml"),
    ("KR", "파이낸셜뉴스", "https://www.fnnews.com/rss/r20/fn_realnews_stock.xml"),
    ("KR", "헤럴드경제", "https://biz.heraldcorp.com/rss/google/economy"),
    ("KR", "뉴시스", "https://www.newsis.com/RSS/economy.xml"),
    ("KR", "아시아경제", "https://www.asiae.co.kr/rss/stock.htm"),
    ("USKO", "한경 국제", "https://www.hankyung.com/feed/international"),
    ("US", "CNBC", "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
    ("US", "CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    ("US", "CNBC", "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    ("US", "MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("US", "WSJ", "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"),
    ("US", "Investing.com", "https://www.investing.com/rss/news_25.rss"),
    ("US", "Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Markets"),
]
# 한글 기사 중 '미국·해외 증시' 로 볼 낱말
US_KW = re.compile(r"뉴욕증시|뉴욕 증시|美\s?증시|미 증시|미국 증시|미증시|월가|나스닥|S&P|다우|필라델피아 반도체|엔비디아|테슬라|애플|마이크로소프트|아마존|알파벳|구글|메타|브로드컴|팔란티어|TSMC|"
                   r"연준|파월|워시|FOMC|미 국채|미국채|달러인덱스|서학개미|미장|해외주식|빅테크|매그니피센트")
# 연예·스포츠가 섞여 오는 종합 피드는 경제 낱말이 있는 기사만
MIXED = {"머니투데이"}
ECON_KW = re.compile(r"증시|주가|주식|코스피|코스닥|금리|환율|실적|증권|투자|상장|매출|영업이익|반도체|수출|경제|기업|은행|금융|부동산|물가|원화|달러|채권|펀드|ETF|IPO|공모|배당|시총|M&A|인수|특징주|급등|급락|상한가|하한가|\d+억|\d+조")
KANA = re.compile(r"[぀-ヿ]")  # 조선비즈 피드에 일본어판 기사가 섞여 온다


def get(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (vantor-news)"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa
            err = e
            time.sleep(2 * (i + 1))
    raise err


def clean(t):
    t = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", t or "", flags=re.S)
    t = re.sub(r"<[^>]+>", "", t)
    for _ in range(2):
        t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def when(s):
    s = clean(s)
    if not s:
        return None
    try:
        d = parsedate_to_datetime(re.sub(r"^(\w{3}),(\d)", r"\1, \2", s))
    except Exception:  # noqa
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
        except Exception:  # noqa
            return None
    if d.tzinfo is None:  # 시간대 없는 국내 피드 = 한국시간
        d = d.replace(tzinfo=KST)
    return int(d.timestamp() * 1000)


def parse(xml):
    out = []
    for body in re.findall(r"<(?:item|entry)(?:\s[^>]*)?>(.*?)</(?:item|entry)>", xml, re.S):
        def tag(name):
            m = re.search(rf"<{name}(?:\s[^>]*)?>(.*?)</{name}>", body, re.S)
            return m.group(1) if m else ""
        title = clean(tag("title"))
        link = clean(tag("link"))
        if not link:
            m = re.search(r'<link[^>]*href="([^"]+)"', body)
            link = m.group(1) if m else ""
        t = when(tag("pubDate") or tag("dc:date") or tag("published") or tag("updated"))
        if title and link and t:
            out.append({"title": title, "link": link, "t": t})
    return out


def norm(t):
    return re.sub(r"[\W_]+", "", re.sub(r"\[[^\]]*\]|\([^)]*\)|【[^】]*】", "", t)).lower()


def grams(s):
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) > 1 else {s}


def dedupe(items):
    """제목이 거의 같으면(글자 2개씩 겹침 60%↑) 하나로. 가장 먼저 나온 기사를 남기고 다른 출처를 붙인다."""
    items.sort(key=lambda x: x["t"])
    kept = []
    for x in items:
        g = grams(norm(x["title"]))
        hit = None
        for k in kept[-200:]:
            if abs(k["t"] - x["t"]) > 2 * 86400e3:
                continue
            u = len(g | k["_g"])
            if u and len(g & k["_g"]) / u >= 0.6:
                hit = k
                break
        if hit:
            if x["src"] != hit["src"] and x["src"] not in hit["also"]:
                hit["also"].append(x["src"])
        else:
            kept.append({**x, "_g": g, "also": []})
    kept.sort(key=lambda x: -x["t"])
    return [{k: v for k, v in x.items() if k != "_g"} for x in kept]


def main():
    now = int(time.time() * 1000)

    def one(f):
        cat, src, url = f
        try:
            return f, parse(get(url))
        except Exception as e:  # noqa
            print("실패:", src, url, e, file=sys.stderr)
            return f, []

    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(one, FEEDS))
    buckets = {"KR": [], "US": [], "USKO": []}
    stat = {}
    for (cat, src, _), items in res:
        stat[src] = stat.get(src, 0) + len(items)
        for it in items:
            if it["t"] > now + 10 * 60e3 or it["t"] < now - 3 * 86400e3:  # 미래·3일 지난 기사 제외
                continue
            if cat != "US" and KANA.search(it["title"]):
                continue
            if src in MIXED and not ECON_KW.search(it["title"]):
                continue
            row = {**it, "src": src}
            if cat in ("USKO", "KR") and US_KW.search(it["title"]):
                buckets["USKO"].append(dict(row))
            if cat in ("KR", "US"):
                buckets[cat].append(row)
    ok = sum(1 for v in stat.values() if v)
    if ok < len(stat) // 2:
        print(f"받아진 출처가 너무 적음 ({ok}/{len(stat)}) → 저장 안 함", file=sys.stderr)
        return 1
    out = {"updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M"), "sources": stat}
    for k, v in buckets.items():
        out[k] = dedupe(v)[:KEEP]
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("뉴스:", {k: len(out[k]) for k in buckets}, "· 출처", stat)
    return 0


if __name__ == "__main__":
    sys.exit(main())
