#!/usr/bin/env python3
"""브리핑 이미지 → 디스코드.

워커가 briefs/<날짜>-<am|noon|pm>.json 을 올리면, 사이트와 같은 모양(app.js 의 _briefHTML)으로
브리핑 카드를 그려 PNG 로 찍고 디스코드 웹후크에 올린다. 워커는 건드리지 않는다.

사용: python3 scripts/brief_image.py briefs/2026-10-07-pm.json [...]
환경변수: DISCORD_BRIEF_WEBHOOK (없으면 PNG 만 만들고 끝), OUT_DIR (기본 /tmp/brief-img)
"""
import functools
import http.server
import json
import os
import sys
import threading
import urllib.request
import uuid

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLOT = {"am": "개장", "noon": "장중", "pm": "장마감"}


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render(page, base, data, out):
    page.goto(base + "/index.html", wait_until="domcontentloaded")
    page.wait_for_function("typeof _briefHTML === 'function'", timeout=30000)
    page.evaluate(
        """d => {
          // 사이트 CSS 가 카드 모양을 덮지 않게 브리핑 전용 스타일만 남긴다
          document.querySelectorAll('style:not(#brfStyle), link[rel=stylesheet]').forEach(n => n.remove());
          document.body.innerHTML = '<div id="shot" style="width:720px;padding:0;margin:0"></div>';
          document.body.style.cssText = 'margin:0;padding:0;background:#fff';
          document.getElementById('shot').innerHTML = _briefHTML(d);
        }""",
        data,
    )
    page.evaluate("document.fonts.ready")
    page.locator("#shot .brf").screenshot(path=out)


def post(webhook, png, data):
    title = data.get("title") or "증시 브리핑"
    content = f"🖼 **{title}** · {SLOT.get(data.get('slot'), '')} 브리핑 이미지\nhttps://sannaq.github.io/vantor/#brief"
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
    srv = serve()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 760, "height": 1200}, device_scale_factor=2, locale="ko-KR")
        for rel in paths:
            try:
                with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                    data = json.load(f)
                out = os.path.join(out_dir, os.path.basename(rel).replace(".json", ".png"))
                render(page, base, data, out)
                print(f"{rel} → {out} ({os.path.getsize(out) // 1024}KB)")
                if webhook:
                    post(webhook, out, data)
            except Exception as e:  # 한 건 실패가 나머지를 막지 않게
                failed += 1
                print(f"{rel} 실패: {e}")
        browser.close()
    srv.shutdown()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
