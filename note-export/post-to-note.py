#!/usr/bin/env python3
"""
NOTE.com 自動投稿スクリプト (Playwright版)
- note-export/*.txt を読み込み
- NOTEにログイン → 記事作成 → 下書き保存 or 公開
"""
import os
import sys
import time
import json
import re
from pathlib import Path

# Playwright import
from playwright.sync_api import sync_playwright

# ==== 設定 ====
NOTE_EMAIL = os.environ.get("NOTE_EMAIL", "doru0102@gmail.com")
NOTE_PASSWORD = os.environ.get("NOTE_PASSWORD", "Masa-251401")
ARTICLES_DIR = Path(__file__).parent / "articles"
STATE_FILE = Path(__file__).parent / "note-auth-state.json"
POST_LOG_FILE = Path(__file__).parent / "post-log.json"
PUBLISH = "--publish" in sys.argv  # --publish フラグで公開、なければ下書き
HEADLESS = "--headless" in sys.argv or True  # サーバーなのでデフォルトheadless

# 投稿間隔（秒） - NOTE のスパム検知回避
POST_INTERVAL = 60

def load_post_log():
    """既に投稿済みの記事を管理"""
    if POST_LOG_FILE.exists():
        return json.loads(POST_LOG_FILE.read_text())
    return {}

def save_post_log(log):
    POST_LOG_FILE.write_text(json.dumps(log, indent=2, ensure_ascii=False))

def parse_article(filepath):
    """
    .txt ファイルからタイトルと本文を抽出
    1行目がタイトル、残りが本文
    """
    text = filepath.read_text(encoding="utf-8")
    lines = text.strip().split("\n")

    title = lines[0].strip()
    # 本文は2行目以降（プロフィール紹介含む）
    body_lines = lines[1:]
    body = "\n".join(body_lines).strip()

    # NOTEでは「---」はセパレーター的に使える
    # Amazonリンクは NOTE では直接クリックできるのでそのまま

    return title, body

def extract_hashtags(title, body):
    """記事内容からハッシュタグを自動生成"""
    tags = []

    # カテゴリベースのタグ
    keyword_tags = {
        "知育玩具": ["知育玩具", "子育て"],
        "マグフォーマー": ["マグフォーマー", "ボーネルンド"],
        "ストライダー": ["ストライダー", "外遊び"],
        "レゴ": ["レゴデュプロ", "LEGO"],
        "くもん": ["くもん", "将棋"],
        "メルちゃん": ["メルちゃん", "人形遊び"],
        "プラレール": ["プラレール", "トーマス"],
        "アンパンマン": ["アンパンマン", "ブロック"],
        "スキップホップ": ["スキップホップ", "ベビーバス"],
        "シュナグル": ["シュナグル", "ベビーバス"],
        "ベビーゲート": ["ベビーゲート", "安全対策"],
        "スマートゲイト": ["スマートゲイト", "安全対策"],
        "リッチェル": ["リッチェル", "ベビーバス"],
        "レインフォレスト": ["フィッシャープライス", "ベビージム"],
    }

    full_text = title + " " + body
    for keyword, tag_list in keyword_tags.items():
        if keyword in full_text:
            tags.extend(tag_list)

    # 共通タグ
    tags.extend(["子育て", "育児", "口コミ", "パパ育児"])

    # 重複除去、最大10個
    seen = set()
    unique_tags = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            unique_tags.append(t)

    return unique_tags[:10]

def login_to_note(page):
    """NOTEにログイン"""
    print("🔐 NOTEにログイン中...")

    # ログインページへ
    page.goto("https://note.com/login", wait_until="networkidle")
    time.sleep(2)

    # メールアドレス入力
    email_input = page.locator('input[name="login"], input[type="email"], input[placeholder*="メール"]').first
    email_input.fill(NOTE_EMAIL)
    time.sleep(0.5)

    # パスワード入力
    pw_input = page.locator('input[name="password"], input[type="password"]').first
    pw_input.fill(NOTE_PASSWORD)
    time.sleep(0.5)

    # ログインボタンクリック
    login_btn = page.locator('button[type="submit"], button:has-text("ログイン")').first
    login_btn.click()

    # ログイン完了待ち
    page.wait_for_url("**/note.com/**", timeout=15000)
    time.sleep(3)

    # 認証状態を保存
    page.context.storage_state(path=str(STATE_FILE))
    print("✅ ログイン成功！認証状態を保存しました。")

def post_article(page, title, body, hashtags, publish=False):
    """
    1記事をNOTEに投稿
    """
    print(f"📝 投稿開始: {title[:40]}...")

    # 新規テキスト記事作成ページへ
    page.goto("https://note.com/notes/new", wait_until="networkidle")
    time.sleep(3)

    # タイトル入力
    title_input = page.locator('[placeholder*="タイトル"], [data-placeholder*="タイトル"], .o-newNoteHeader__titleTextarea, textarea').first
    title_input.click()
    time.sleep(0.5)
    title_input.fill(title)
    time.sleep(0.5)

    # 本文エリアをクリック
    # NOTEの本文エリアはcontenteditable divまたはProseMirror等のリッチエディタ
    body_area = page.locator('[contenteditable="true"], .ProseMirror, .o-newNoteBody__editor, [role="textbox"]').first
    body_area.click()
    time.sleep(0.5)

    # 本文を入力（長いテキストを段落ごとに入力）
    paragraphs = body.split("\n\n")
    for i, para in enumerate(paragraphs):
        if not para.strip():
            continue

        # 段落内の改行処理
        lines = para.split("\n")
        for j, line in enumerate(lines):
            if line.strip():
                page.keyboard.type(line.strip(), delay=5)
            if j < len(lines) - 1:
                page.keyboard.press("Shift+Enter")  # 段落内改行

        if i < len(paragraphs) - 1:
            page.keyboard.press("Enter")  # 段落間改行
            page.keyboard.press("Enter")

        # 大量テキストの負荷軽減
        if i % 5 == 0:
            time.sleep(0.3)

    time.sleep(2)

    if publish:
        # 公開フロー
        # 「公開設定」or「投稿」ボタンを押す
        publish_btn = page.locator('button:has-text("公開"), button:has-text("投稿"), button:has-text("公開設定")').first
        publish_btn.click()
        time.sleep(2)

        # ハッシュタグ入力
        try:
            tag_input = page.locator('input[placeholder*="タグ"], input[placeholder*="ハッシュタグ"]').first
            for tag in hashtags[:5]:  # NOTEのタグ上限に注意
                tag_input.fill(tag)
                time.sleep(0.3)
                page.keyboard.press("Enter")
                time.sleep(0.3)
        except Exception as e:
            print(f"  ⚠️ タグ入力スキップ: {e}")

        # 最終公開ボタン
        try:
            final_btn = page.locator('button:has-text("投稿する"), button:has-text("公開する")').first
            final_btn.click()
            time.sleep(3)
            print(f"  ✅ 公開完了!")
        except Exception as e:
            print(f"  ⚠️ 公開ボタンが見つからない: {e}")
            # 下書き保存にフォールバック
            save_draft(page)
    else:
        # 下書き保存
        save_draft(page)

    return True

def save_draft(page):
    """下書きを保存"""
    try:
        # Ctrl+S で保存を試みる
        page.keyboard.press("Control+s")
        time.sleep(2)
        print(f"  💾 下書き保存完了")
    except Exception as e:
        print(f"  ⚠️ 下書き保存エラー: {e}")

def main():
    post_log = load_post_log()

    # 記事ファイル一覧
    article_files = sorted(ARTICLES_DIR.glob("*.txt"))
    if not article_files:
        print("❌ 記事ファイルが見つかりません")
        sys.exit(1)

    print(f"📚 {len(article_files)}件の記事を検出")
    print(f"📌 モード: {'公開' if PUBLISH else '下書き保存'}")
    print(f"🖥️ ヘッドレス: {HEADLESS}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)

        # 保存済みの認証状態があれば使う
        if STATE_FILE.exists():
            context = browser.new_context(storage_state=str(STATE_FILE))
            print("🔄 保存済み認証状態をロード")
        else:
            context = browser.new_context()

        page = context.new_page()

        # ログイン確認
        page.goto("https://note.com/", wait_until="networkidle")
        time.sleep(2)

        # ログイン済みかチェック
        try:
            # ログインしていればプロフィールアイコンやマイページリンクがある
            page.locator('[href*="/mypage"], [href*="/dashboard"], .o-globalHeader__avatar').first.wait_for(timeout=5000)
            print("✅ 既にログイン済み")
        except:
            # ログインが必要
            login_to_note(page)

        # 各記事を投稿
        success_count = 0
        for i, filepath in enumerate(article_files):
            slug = filepath.stem

            # 投稿済みチェック
            if slug in post_log and post_log[slug].get("status") == "success":
                print(f"⏭️  [{i+1}/{len(article_files)}] {slug} - 投稿済み、スキップ")
                continue

            try:
                title, body = parse_article(filepath)
                hashtags = extract_hashtags(title, body)

                print(f"\n{'='*60}")
                print(f"[{i+1}/{len(article_files)}] {slug}")
                print(f"  タイトル: {title[:50]}...")
                print(f"  文字数: {len(body)}文字")
                print(f"  タグ: {', '.join(hashtags[:5])}")

                result = post_article(page, title, body, hashtags, publish=PUBLISH)

                if result:
                    post_log[slug] = {
                        "status": "success",
                        "title": title,
                        "mode": "published" if PUBLISH else "draft",
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "chars": len(body)
                    }
                    save_post_log(post_log)
                    success_count += 1

                # 投稿間隔
                if i < len(article_files) - 1:
                    print(f"  ⏰ {POST_INTERVAL}秒待機（スパム検知回避）...")
                    time.sleep(POST_INTERVAL)

            except Exception as e:
                print(f"  ❌ エラー: {e}")
                post_log[slug] = {
                    "status": "error",
                    "error": str(e),
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                save_post_log(post_log)

        browser.close()

    print(f"\n{'='*60}")
    print(f"✨ 完了！ {success_count}/{len(article_files)} 記事を投稿しました")
    print(f"📋 ログ: {POST_LOG_FILE}")

if __name__ == "__main__":
    main()
