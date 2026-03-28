#!/usr/bin/env python3
"""
NOTE.com 自動投稿スクリプト（Playwright自前実装）
- articles/*.txt を読み込み
- NOTEにログイン → 記事作成 → 下書き保存
- 下書き保存後に手動で確認→公開も可能
"""
import os
import sys
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

# ==== 設定 ====
NOTE_EMAIL = os.environ.get("NOTE_EMAIL", "doru0102@gmail.com")
NOTE_PASSWORD = os.environ.get("NOTE_PASSWORD", "Masa-251401")
ARTICLES_DIR = Path(__file__).parent / "articles"
STATE_FILE = Path(__file__).parent / "note-auth-state.json"
POST_LOG_FILE = Path(__file__).parent / "post-log.json"
PUBLISH = "--publish" in sys.argv
POST_INTERVAL = 90  # 秒（スパム検知回避）

def load_post_log():
    if POST_LOG_FILE.exists():
        return json.loads(POST_LOG_FILE.read_text())
    return {}

def save_post_log(log):
    POST_LOG_FILE.write_text(json.dumps(log, indent=2, ensure_ascii=False))

def parse_article(filepath):
    """1行目=タイトル、残り=本文"""
    text = filepath.read_text(encoding="utf-8")
    lines = text.strip().split("\n")
    title = lines[0].strip()
    body = "\n".join(lines[1:]).strip()
    return title, body

def login_to_note(page):
    """NOTEにメール/パスワードでログイン"""
    print("  ログインページへ移動...")
    page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
    time.sleep(3)

    # メールアドレス入力（nameが空なのでplaceholderで特定）
    print("  メールアドレス入力...")
    page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
    time.sleep(0.5)

    # パスワード入力
    print("  パスワード入力...")
    page.fill('input[type="password"]', NOTE_PASSWORD)
    time.sleep(0.5)

    # ログインボタン（type="button"、テキスト「ログイン」）
    print("  ログインボタンクリック...")
    page.click('button:has-text("ログイン")')

    # ログイン完了を待つ
    try:
        page.wait_for_url("**/note.com/**", timeout=20000)
        time.sleep(3)
    except:
        pass

    # ログイン成功確認
    current_url = page.url
    print(f"  現在URL: {current_url}")

    # 認証状態保存
    page.context.storage_state(path=str(STATE_FILE))
    print("  認証状態を保存しました")

def type_body_content(page, body):
    """本文をNOTEエディタに入力"""
    # NOTEのエディタはProseMirror系のcontenteditable div
    # 段落ごとに入力し、Enter で改行
    paragraphs = body.split("\n")

    for i, line in enumerate(paragraphs):
        stripped = line.strip()

        if not stripped:
            # 空行 → Enter
            page.keyboard.press("Enter")
            continue

        # 見出し（## で始まる行）
        if stripped.startswith("## "):
            heading_text = stripped[3:].strip()
            page.keyboard.type(heading_text, delay=3)
            page.keyboard.press("Enter")
            continue

        # 引用（> で始まる行）
        if stripped.startswith("> "):
            quote_text = stripped[2:].strip()
            page.keyboard.type(quote_text, delay=3)
            page.keyboard.press("Enter")
            continue

        # 区切り線（---）
        if stripped == "---":
            page.keyboard.type("---", delay=3)
            page.keyboard.press("Enter")
            continue

        # 通常テキスト
        page.keyboard.type(stripped, delay=3)
        page.keyboard.press("Enter")

        # 定期的にwait（エディタの負荷対策）
        if i % 20 == 0 and i > 0:
            time.sleep(0.5)

def post_one_article(page, title, body, publish=False):
    """1記事をNOTEに投稿"""
    # 新規テキスト記事作成ページへ
    page.goto("https://note.com/notes/new", wait_until="networkidle", timeout=30000)
    time.sleep(4)

    # スクリーンショット（デバッグ用）
    page.screenshot(path="/tmp/note-before-input.png")

    # タイトル入力
    print("    タイトル入力中...")
    try:
        # タイトル欄を探す（複数セレクタを試行）
        title_selectors = [
            'textarea[placeholder*="タイトル"]',
            '[data-placeholder*="タイトル"]',
            '.o-newNoteHeader__titleTextarea',
            'textarea:first-of-type',
            '[contenteditable="true"]:first-of-type',
        ]
        title_input = None
        for sel in title_selectors:
            try:
                title_input = page.locator(sel).first
                title_input.wait_for(timeout=5000)
                break
            except:
                continue

        if title_input:
            title_input.click()
            time.sleep(0.3)
            title_input.fill(title)
        else:
            # フォールバック: Tabで移動してタイプ
            page.keyboard.type(title, delay=5)

        time.sleep(1)
    except Exception as e:
        print(f"    タイトル入力エラー: {e}")
        page.keyboard.type(title, delay=5)

    # 本文エリアへ移動（Tabキーで）
    print("    本文入力中...")
    page.keyboard.press("Tab")
    time.sleep(1)

    # 本文入力
    type_body_content(page, body)
    time.sleep(2)

    page.screenshot(path="/tmp/note-after-input.png")

    if publish:
        print("    公開処理中...")
        try:
            # 「公開設定」ボタンを探してクリック
            publish_selectors = [
                'button:has-text("公開")',
                'button:has-text("投稿")',
                'button:has-text("公開設定")',
                '[data-testid*="publish"]',
            ]
            for sel in publish_selectors:
                try:
                    btn = page.locator(sel).first
                    btn.wait_for(timeout=3000)
                    btn.click()
                    time.sleep(3)
                    break
                except:
                    continue

            # 最終確認ボタン
            final_selectors = [
                'button:has-text("投稿する")',
                'button:has-text("公開する")',
            ]
            for sel in final_selectors:
                try:
                    btn = page.locator(sel).first
                    btn.wait_for(timeout=5000)
                    btn.click()
                    time.sleep(3)
                    print("    公開完了!")
                    break
                except:
                    continue
        except Exception as e:
            print(f"    公開エラー: {e}, 下書き保存します")
            page.keyboard.press("Control+s")
            time.sleep(2)
    else:
        # 下書き保存（Ctrl+S）
        print("    下書き保存中...")
        page.keyboard.press("Control+s")
        time.sleep(3)
        print("    下書き保存完了")

    page.screenshot(path="/tmp/note-after-save.png")
    return True

def main():
    post_log = load_post_log()

    article_files = sorted(ARTICLES_DIR.glob("*.txt"))
    if not article_files:
        print("記事ファイルが見つかりません")
        sys.exit(1)

    # 特定記事のみ投稿する場合
    if "--article" in sys.argv:
        idx = sys.argv.index("--article")
        target = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else None
        if target:
            article_files = [f for f in article_files if target in f.stem]

    total = len(article_files)
    print(f"=== NOTE自動投稿 ===")
    print(f"記事数: {total}")
    print(f"モード: {'公開' if PUBLISH else '下書き保存'}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 認証状態があれば再利用
        if STATE_FILE.exists():
            print("保存済み認証状態をロード...")
            context = browser.new_context(storage_state=str(STATE_FILE))
        else:
            context = browser.new_context()

        page = context.new_page()

        # ログイン確認
        page.goto("https://note.com/", wait_until="networkidle", timeout=30000)
        time.sleep(3)

        # ログイン済みかチェック
        logged_in = False
        try:
            # ダッシュボードリンクやアバターがあればログイン済み
            page.locator('a[href*="/dashboard"], a[href*="/mypage"]').first.wait_for(timeout=5000)
            logged_in = True
            print("ログイン済み確認OK")
        except:
            print("ログインが必要です...")
            login_to_note(page)
            logged_in = True

        if not logged_in:
            print("ログインに失敗しました")
            browser.close()
            sys.exit(1)

        # 各記事を投稿
        success = 0
        for i, filepath in enumerate(article_files):
            slug = filepath.stem

            if slug in post_log and post_log[slug].get("status") == "success":
                print(f"[{i+1}/{total}] {slug} - 投稿済み、スキップ")
                continue

            title, body = parse_article(filepath)
            print(f"\n[{i+1}/{total}] {slug}")
            print(f"  タイトル: {title[:50]}")
            print(f"  文字数: {len(body)}")

            try:
                result = post_one_article(page, title, body, publish=PUBLISH)
                if result:
                    post_log[slug] = {
                        "status": "success",
                        "title": title,
                        "mode": "published" if PUBLISH else "draft",
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                    save_post_log(post_log)
                    success += 1
            except Exception as e:
                print(f"  エラー: {e}")
                post_log[slug] = {
                    "status": "error",
                    "error": str(e),
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                save_post_log(post_log)

            # 投稿間隔
            if i < total - 1:
                print(f"  {POST_INTERVAL}秒待機...")
                time.sleep(POST_INTERVAL)

        browser.close()

    print(f"\n=== 完了: {success}/{total} 記事投稿 ===")

if __name__ == "__main__":
    main()
