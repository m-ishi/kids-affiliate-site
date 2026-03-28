#!/usr/bin/env python3
"""NOTE APIスニッファ - 全ヘッダー完全キャプチャ"""
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

        text_notes_request = None

        def on_request(request):
            nonlocal text_notes_request
            if "/api/v1/text_notes" in request.url and request.method == "POST":
                text_notes_request = {
                    "method": request.method,
                    "url": request.url,
                    "post_data": request.post_data,
                    "all_headers": request.all_headers(),
                }
                print(f"\n===== CAPTURED: POST /api/v1/text_notes =====")
                print(f"URL: {request.url}")
                print(f"Body: {request.post_data}")
                print(f"ALL HEADERS:")
                for k, v in request.all_headers().items():
                    print(f"  {k}: {v[:200] if len(v) > 200 else v}")

        def on_response(response):
            if "/api/v1/text_notes" in response.url:
                print(f"\n===== RESPONSE: {response.status} =====")
                try:
                    print(f"Body: {response.text()[:500]}")
                except:
                    print("(could not read body)")

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

        # エディタアクセス → text_notesリクエスト発火
        print("エディタにアクセス中...")
        page.goto("https://note.com/notes/new", wait_until="networkidle", timeout=30000)
        time.sleep(8)

        # 保存
        if text_notes_request:
            Path("/tmp/note-text-notes-request.json").write_text(
                json.dumps(text_notes_request, indent=2, ensure_ascii=False, default=str)
            )
            print(f"\n全データ → /tmp/note-text-notes-request.json")
        else:
            print("text_notesリクエストがキャプチャされませんでした")

        browser.close()

if __name__ == "__main__":
    main()
