#!/usr/bin/env python3
"""NOTE APIスニッファ v3 - リクエストボディを詳細にキャプチャ"""
import os
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

NOTE_EMAIL = os.environ.get("NOTE_EMAIL", "doru0102@gmail.com")
NOTE_PASSWORD = os.environ.get("NOTE_PASSWORD", "Masa-251401")
STATE_FILE = Path(__file__).parent / "note-auth-state.json"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        if STATE_FILE.exists():
            context = browser.new_context(storage_state=str(STATE_FILE))
        else:
            context = browser.new_context()

        page = context.new_page()

        captured = []

        def on_request(request):
            url = request.url
            if "note.com" in url and "/api" in url:
                entry = {
                    "method": request.method,
                    "url": url,
                    "post_data": request.post_data,
                    "headers": {k: v for k, v in request.headers.items()
                               if k.lower() in ('authorization', 'content-type', 'x-xsrf-token',
                                                'x-note-client-code', 'x-note-device', 'cookie',
                                                'origin', 'referer')},
                }
                captured.append(entry)
                print(f"\n>> {request.method} {url}")
                if request.post_data:
                    print(f"   Body: {request.post_data[:500]}")
                for k, v in entry["headers"].items():
                    if k != "cookie":
                        print(f"   {k}: {v[:100]}")

        def on_response(response):
            url = response.url
            if "note.com" in url and "/api" in url:
                status = response.status
                try:
                    body = response.text()[:500]
                except:
                    body = "(unreadable)"
                print(f"<< [{status}] {url}")
                print(f"   Body: {body[:300]}")

        page.on("request", on_request)
        page.on("response", on_response)

        # ログイン確認
        page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
        time.sleep(3)
        if "login" in page.url:
            page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
            time.sleep(3)
            page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
            time.sleep(0.5)
            page.fill('input[type="password"]', NOTE_PASSWORD)
            time.sleep(0.5)
            page.click('button:has-text("ログイン")')
            time.sleep(8)
            page.context.storage_state(path=str(STATE_FILE))

        # エディタにアクセス
        print("\n\n========== エディタアクセス ==========")
        captured.clear()
        page.goto("https://note.com/notes/new", wait_until="networkidle", timeout=30000)
        time.sleep(8)

        print(f"\nFinal URL: {page.url}")

        # 全キャプチャ保存
        Path("/tmp/note-captured-v3.json").write_text(
            json.dumps(captured, indent=2, ensure_ascii=False, default=str)
        )
        print(f"\n{len(captured)}件キャプチャ → /tmp/note-captured-v3.json")

        browser.close()

if __name__ == "__main__":
    main()
