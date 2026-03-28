#!/usr/bin/env python3
"""
NOTE.com APIスニッファ
Playwrightでログイン → 記事エディタを開く → ネットワークリクエストを監視
→ 下書き保存時のAPIリクエストをキャプチャ
"""
import os
import sys
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

NOTE_EMAIL = os.environ.get("NOTE_EMAIL", "doru0102@gmail.com")
NOTE_PASSWORD = os.environ.get("NOTE_PASSWORD", "Masa-251401")
STATE_FILE = Path(__file__).parent / "note-auth-state.json"

captured_requests = []

def on_request(request):
    url = request.url
    if "note.com/api" in url or "note.com/graphql" in url:
        captured_requests.append({
            "method": request.method,
            "url": url,
            "headers": dict(request.headers),
            "post_data": request.post_data[:500] if request.post_data else None,
        })

def on_response(response):
    url = response.url
    if "note.com/api" in url or "note.com/graphql" in url:
        print(f"  [{response.status}] {response.request.method} {url}")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        if STATE_FILE.exists():
            context = browser.new_context(storage_state=str(STATE_FILE))
            print("認証状態ロード済み")
        else:
            context = browser.new_context()

        page = context.new_page()

        # ネットワーク監視開始
        page.on("request", on_request)
        page.on("response", on_response)

        # まずダッシュボードでログイン確認
        print("=== ダッシュボードアクセス ===")
        page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
        time.sleep(3)

        if "login" in page.url:
            print("ログインが必要 → ログイン実行...")
            page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
            time.sleep(3)
            page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
            time.sleep(0.5)
            page.fill('input[type="password"]', NOTE_PASSWORD)
            time.sleep(0.5)
            page.click('button:has-text("ログイン")')
            time.sleep(8)
            page.context.storage_state(path=str(STATE_FILE))
            print(f"ログイン後URL: {page.url}")

        print(f"\n=== 記事エディタ移動 ===")
        captured_requests.clear()
        page.goto("https://note.com/notes/new", wait_until="networkidle", timeout=30000)
        time.sleep(5)
        page.screenshot(path="/tmp/note-editor.png")
        print(f"エディタURL: {page.url}")

        # タイトル入力
        print(f"\n=== タイトル入力 ===")
        captured_requests.clear()

        # テスト用タイトル
        try:
            selectors = [
                'textarea[placeholder*="タイトル"]',
                'input[placeholder*="タイトル"]',
                '[data-placeholder*="タイトル"]',
                'textarea',
            ]
            for sel in selectors:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=2000):
                        el.click()
                        time.sleep(0.3)
                        el.fill("テスト記事タイトル")
                        print(f"  タイトル入力成功: {sel}")
                        break
                except:
                    continue
        except:
            page.keyboard.type("テスト記事タイトル", delay=5)

        time.sleep(2)

        # 本文入力
        print(f"\n=== 本文入力 ===")
        page.keyboard.press("Tab")
        time.sleep(1)
        page.keyboard.type("テスト本文です。これはAPIスニッフィング用のテスト投稿です。", delay=3)
        time.sleep(2)

        # 下書き保存 (Ctrl+S)
        print(f"\n=== 下書き保存 (Ctrl+S) ===")
        captured_requests.clear()
        page.keyboard.press("Control+s")
        time.sleep(5)

        page.screenshot(path="/tmp/note-after-save-sniff.png")
        print(f"保存後URL: {page.url}")

        # キャプチャされたリクエストを表示
        print(f"\n=== キャプチャされたAPIリクエスト ({len(captured_requests)}件) ===")
        for req in captured_requests:
            print(f"  {req['method']} {req['url']}")
            if req['post_data']:
                print(f"    Body: {req['post_data'][:300]}")
            # 認証ヘッダー
            for h in ['authorization', 'x-xsrf-token', 'x-csrf-token', 'x-note-session']:
                if h in req['headers']:
                    print(f"    {h}: {req['headers'][h][:60]}...")

        # 全キャプチャを保存
        Path("/tmp/note-captured-requests.json").write_text(
            json.dumps(captured_requests, indent=2, ensure_ascii=False, default=str)
        )
        print("\n全リクエスト → /tmp/note-captured-requests.json")

        browser.close()

if __name__ == "__main__":
    main()
