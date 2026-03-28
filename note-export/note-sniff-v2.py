#!/usr/bin/env python3
"""
NOTE.com APIスニッファ v2
editor.note.com も含めて監視
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

captured = []

def on_request(request):
    url = request.url
    if "note.com" in url and ("/api" in url or "/graphql" in url):
        captured.append({
            "method": request.method,
            "url": url,
            "headers": dict(request.headers),
            "post_data": request.post_data[:1000] if request.post_data else None,
        })
        print(f"  >> {request.method} {url}")

def on_response(response):
    url = response.url
    if "note.com" in url and ("/api" in url or "/graphql" in url):
        body = ""
        try:
            body = response.text()[:300]
        except:
            pass
        print(f"  << [{response.status}] {url} -> {body[:100]}")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        if STATE_FILE.exists():
            context = browser.new_context(storage_state=str(STATE_FILE))
            print("認証状態ロード済み")
        else:
            context = browser.new_context()

        page = context.new_page()
        page.on("request", on_request)
        page.on("response", on_response)

        # ダッシュボード確認
        print("=== ダッシュボード ===")
        page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
        time.sleep(3)

        if "login" in page.url:
            print("ログイン必要...")
            page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
            time.sleep(3)
            page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
            time.sleep(0.5)
            page.fill('input[type="password"]', NOTE_PASSWORD)
            time.sleep(0.5)
            page.click('button:has-text("ログイン")')
            time.sleep(8)
            page.context.storage_state(path=str(STATE_FILE))

        # editor.note.com にアクセス
        print("\n=== エディタアクセス (editor.note.com) ===")
        captured.clear()
        page.goto("https://editor.note.com/new", wait_until="networkidle", timeout=30000)
        time.sleep(5)
        page.screenshot(path="/tmp/note-editor-v2.png")
        print(f"URL: {page.url}")

        # ページの構造を確認
        print("\n=== ページ構造 ===")
        # textarea, input, contenteditable要素を探す
        for sel in ['textarea', 'input', '[contenteditable="true"]', '[role="textbox"]', '.ProseMirror']:
            count = page.locator(sel).count()
            if count > 0:
                for i in range(min(count, 3)):
                    el = page.locator(sel).nth(i)
                    try:
                        tag = el.evaluate("e => e.tagName")
                        ph = el.evaluate("e => e.placeholder || e.getAttribute('data-placeholder') || ''")
                        cls = el.evaluate("e => e.className || ''")
                        print(f"  {sel}[{i}]: tag={tag}, placeholder='{ph}', class='{cls[:50]}'")
                    except:
                        print(f"  {sel}[{i}]: (eval failed)")

        # タイトル入力
        print("\n=== タイトル入力 ===")
        captured.clear()
        try:
            # textareaを試す
            textarea = page.locator('textarea').first
            if textarea.is_visible(timeout=3000):
                textarea.click()
                time.sleep(0.3)
                textarea.fill("テスト記事 - APIスニッフ v2")
                print("  textarea に入力成功")
            else:
                raise Exception("textarea not visible")
        except:
            try:
                editable = page.locator('[contenteditable="true"]').first
                editable.click()
                time.sleep(0.3)
                page.keyboard.type("テスト記事 - APIスニッフ v2", delay=5)
                print("  contenteditable に入力成功")
            except Exception as e:
                print(f"  入力失敗: {e}")

        time.sleep(2)

        # 本文入力
        print("\n=== 本文入力 ===")
        page.keyboard.press("Tab")
        time.sleep(1)
        page.keyboard.type("テスト本文です。APIリクエストを確認中。", delay=3)
        time.sleep(2)

        # 自動保存を待つ（NOTEは自動保存機能がある可能性）
        print("\n=== 自動保存待ち (10秒) ===")
        time.sleep(10)

        # Ctrl+S で保存
        print("\n=== Ctrl+S 保存 ===")
        page.keyboard.press("Control+s")
        time.sleep(5)

        page.screenshot(path="/tmp/note-after-save-v2.png")
        print(f"URL: {page.url}")

        # キャプチャされたリクエスト
        print(f"\n=== キャプチャ ({len(captured)}件) ===")
        for req in captured:
            print(f"\n  {req['method']} {req['url']}")
            if req['post_data']:
                print(f"    Body: {req['post_data'][:500]}")
            auth = req['headers'].get('authorization', '')
            if auth:
                print(f"    Authorization: {auth[:80]}...")

        # 全データ保存
        Path("/tmp/note-captured-v2.json").write_text(
            json.dumps(captured, indent=2, ensure_ascii=False, default=str)
        )

        browser.close()

if __name__ == "__main__":
    main()
