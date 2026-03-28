#!/usr/bin/env python3
"""
NOTE.com 自動投稿スクリプト v2（Playwright UI操作版）
- ログイン → 記事エディタ → タイトル/本文入力 → 下書き保存
- APIが変更されていたため、完全UI操作方式に切替
"""
import os
import sys
import time
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

NOTE_EMAIL = os.environ.get("NOTE_EMAIL", "doru0102@gmail.com")
NOTE_PASSWORD = os.environ.get("NOTE_PASSWORD", "Masa-251401")
ARTICLES_DIR = Path(__file__).parent / "articles"
STATE_FILE = Path(__file__).parent / "note-auth-state.json"
POST_LOG_FILE = Path(__file__).parent / "post-log.json"
PUBLISH = "--publish" in sys.argv
POST_INTERVAL = 90

def load_post_log():
    if POST_LOG_FILE.exists():
        return json.loads(POST_LOG_FILE.read_text())
    return {}

def save_post_log(log):
    POST_LOG_FILE.write_text(json.dumps(log, indent=2, ensure_ascii=False))

def parse_article(filepath):
    text = filepath.read_text(encoding="utf-8")
    lines = text.strip().split("\n")
    title = lines[0].strip()
    body = "\n".join(lines[1:]).strip()
    return title, body

def login_to_note(page):
    """NOTEにログイン"""
    print("  ログインページへ移動...")
    page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
    time.sleep(3)

    # スクリーンショット（デバッグ用）
    page.screenshot(path="/tmp/note-login-page.png")

    # メールアドレス入力
    print("  メールアドレス入力...")
    page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
    time.sleep(0.5)

    # パスワード入力
    print("  パスワード入力...")
    page.fill('input[type="password"]', NOTE_PASSWORD)
    time.sleep(0.5)

    # ログインボタン
    print("  ログインボタンクリック...")
    page.click('button:has-text("ログイン")')

    # ログイン完了待ち
    time.sleep(8)
    page.screenshot(path="/tmp/note-after-login.png")

    current_url = page.url
    print(f"  現在URL: {current_url}")

    # ダッシュボードに行けるか確認
    page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
    time.sleep(3)
    page.screenshot(path="/tmp/note-dashboard.png")
    print(f"  ダッシュボードURL: {page.url}")

    # 認証状態保存
    page.context.storage_state(path=str(STATE_FILE))
    print("  認証状態を保存")

def post_one_article(page, title, body, publish=False):
    """1記事をNOTEに投稿（UI操作）"""
    print(f"    新規記事ページへ移動...")
    page.goto("https://note.com/notes/new", wait_until="networkidle", timeout=30000)
    time.sleep(5)

    page.screenshot(path="/tmp/note-editor-initial.png")

    # ページのHTML構造を確認（デバッグ）
    try:
        # タイトル入力欄を探す
        # 方法1: placeholder
        title_filled = False
        selectors_to_try = [
            'textarea[placeholder*="タイトル"]',
            'input[placeholder*="タイトル"]',
            '[data-placeholder*="タイトル"]',
            '.o-newNoteHeader__titleTextarea',
            'textarea',
        ]
        for sel in selectors_to_try:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=3000):
                    print(f"    タイトル欄発見: {sel}")
                    el.click()
                    time.sleep(0.3)
                    el.fill(title)
                    title_filled = True
                    break
            except:
                continue

        if not title_filled:
            # 方法2: 最初のcontenteditable要素
            print("    タイトル欄: contenteditable探索...")
            try:
                editable = page.locator('[contenteditable="true"]').first
                editable.click()
                time.sleep(0.3)
                page.keyboard.type(title, delay=5)
                title_filled = True
            except:
                # 方法3: タブキーで移動
                print("    タイトル欄: keyboard.type fallback...")
                page.keyboard.type(title, delay=5)
                title_filled = True

        time.sleep(1)
        print(f"    タイトル入力完了: {title[:40]}...")

    except Exception as e:
        print(f"    タイトル入力エラー: {e}")
        return False

    # 本文エリアへ移動
    print("    本文入力開始...")

    # 本文エリアを探す
    body_filled = False
    body_selectors = [
        '.ProseMirror',
        '[contenteditable="true"]:nth-of-type(2)',
        '[role="textbox"]',
        '.o-newNoteBody__editor',
    ]

    # まずTabキーで本文エリアに移動を試行
    page.keyboard.press("Tab")
    time.sleep(1)

    # 本文を段落ごとに入力
    paragraphs = body.split("\n")
    char_count = 0
    for i, line in enumerate(paragraphs):
        stripped = line.strip()

        if not stripped:
            page.keyboard.press("Enter")
            continue

        # 見出し（## で始まる）
        if stripped.startswith("## "):
            heading = stripped[3:].strip()
            page.keyboard.type(heading, delay=3)
            page.keyboard.press("Enter")
            char_count += len(heading)
            continue

        # 引用（> で始まる）
        if stripped.startswith("> "):
            quote = stripped[2:].strip()
            page.keyboard.type(quote, delay=3)
            page.keyboard.press("Enter")
            char_count += len(quote)
            continue

        # 区切り線
        if stripped == "---":
            page.keyboard.type("---", delay=3)
            page.keyboard.press("Enter")
            continue

        # 通常テキスト
        page.keyboard.type(stripped, delay=3)
        page.keyboard.press("Enter")
        char_count += len(stripped)

        # 定期的にウェイト（エディタ負荷対策）
        if i % 30 == 0 and i > 0:
            time.sleep(0.5)

        # 進捗表示
        if i % 50 == 0 and i > 0:
            print(f"      {i}/{len(paragraphs)} 行入力済み ({char_count}文字)...")

    time.sleep(2)
    print(f"    本文入力完了 ({char_count}文字)")

    page.screenshot(path="/tmp/note-after-body.png")

    if publish:
        print("    公開処理...")
        try:
            # 公開ボタンを探す
            for sel in ['button:has-text("公開")', 'button:has-text("投稿")', 'button:has-text("公開設定")']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=3000):
                        btn.click()
                        time.sleep(3)
                        break
                except:
                    continue

            # 最終確認ボタン
            for sel in ['button:has-text("投稿する")', 'button:has-text("公開する")']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=5000):
                        btn.click()
                        time.sleep(3)
                        print("    公開完了!")
                        break
                except:
                    continue
        except Exception as e:
            print(f"    公開エラー: {e}")
            # 下書きにフォールバック
            page.keyboard.press("Control+s")
            time.sleep(3)
    else:
        # 下書き保存
        print("    下書き保存中...")
        page.keyboard.press("Control+s")
        time.sleep(3)

        page.screenshot(path="/tmp/note-after-save.png")

        # 保存確認（URLにnoteのキーが含まれるか）
        current_url = page.url
        print(f"    保存後URL: {current_url}")

        if "/notes/new" not in current_url or "n/" in current_url:
            print("    下書き保存成功!")
        else:
            # 別の保存方法を試す
            print("    保存ボタンを探索中...")
            for sel in ['button:has-text("下書き")', 'button:has-text("保存")', '[data-testid*="save"]']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=3000):
                        btn.click()
                        time.sleep(3)
                        print("    保存ボタンクリック完了")
                        break
                except:
                    continue

    return True

def main():
    post_log = load_post_log()

    article_files = sorted(ARTICLES_DIR.glob("*.txt"))
    if not article_files:
        print("記事ファイルが見つかりません")
        sys.exit(1)

    # 特定記事のみ
    if "--article" in sys.argv:
        idx = sys.argv.index("--article")
        target = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else None
        if target:
            article_files = [f for f in article_files if target in f.stem]

    total = len(article_files)
    print(f"=== NOTE Playwright投稿 v2 ===")
    print(f"記事数: {total}")
    print(f"モード: {'公開' if PUBLISH else '下書き'}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 認証状態復元
        if STATE_FILE.exists():
            print("認証状態ロード...")
            context = browser.new_context(storage_state=str(STATE_FILE))
        else:
            context = browser.new_context()

        page = context.new_page()

        # ログイン確認
        page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
        time.sleep(3)

        current_url = page.url
        print(f"ダッシュボード: {current_url}")

        if "login" in current_url or "note.com/dashboard" not in current_url:
            print("ログインが必要...")
            login_to_note(page)
            # ダッシュボード再確認
            page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
            time.sleep(3)
            if "login" in page.url:
                print("ログイン失敗")
                browser.close()
                sys.exit(1)
            print("ログイン成功!")
        else:
            print("ログイン済み確認OK")

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
                        "chars": len(body),
                    }
                    save_post_log(post_log)
                    success += 1
            except Exception as e:
                print(f"  エラー: {e}")
                page.screenshot(path=f"/tmp/note-error-{slug}.png")
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
