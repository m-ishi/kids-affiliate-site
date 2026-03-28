#!/usr/bin/env python3
"""
NOTE.com 自動投稿スクリプト（非公式API版）
Playwright でログイン → Cookie取得 → API で記事投稿
"""
import os
import sys
import time
import json
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright

NOTE_EMAIL = os.environ.get("NOTE_EMAIL", "doru0102@gmail.com")
NOTE_PASSWORD = os.environ.get("NOTE_PASSWORD", "Masa-251401")
ARTICLES_DIR = Path(__file__).parent / "articles"
COOKIE_FILE = Path(__file__).parent / "note-cookies.json"
POST_LOG_FILE = Path(__file__).parent / "post-log.json"
PUBLISH = "--publish" in sys.argv
POST_INTERVAL = 90

def load_post_log():
    if POST_LOG_FILE.exists():
        return json.loads(POST_LOG_FILE.read_text())
    return {}

def save_post_log(log):
    POST_LOG_FILE.write_text(json.dumps(log, indent=2, ensure_ascii=False))

def get_cookies_via_playwright():
    """Playwright でログインしてCookieを取得"""
    print("Playwright でログイン中...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
        time.sleep(3)

        # ログイン
        page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
        time.sleep(0.5)
        page.fill('input[type="password"]', NOTE_PASSWORD)
        time.sleep(0.5)
        page.click('button:has-text("ログイン")')
        time.sleep(5)

        # ダッシュボードに移動して確認
        page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
        time.sleep(2)

        # Cookie取得
        cookies = page.context.cookies()
        browser.close()

        # 保存
        COOKIE_FILE.write_text(json.dumps(cookies, indent=2))
        print(f"  Cookie {len(cookies)}件 取得・保存")
        return cookies

def cookies_to_session(cookies):
    """PlaywrightのCookieをrequestsのSessionに変換"""
    session = requests.Session()
    auth_token = None
    for c in cookies:
        session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".note.com"))
        if c["name"] == "note_gql_auth_token":
            auth_token = c["value"]

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/145.0.7632.6 Safari/537.36",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://editor.note.com",
        "Referer": "https://editor.note.com/",
        "X-Requested-With": "XMLHttpRequest",
    }
    session.headers.update(headers)
    return session

def verify_login(session):
    """ログイン状態を確認"""
    try:
        resp = session.get("https://note.com/api/v2/current_user")
        if resp.status_code == 200:
            data = resp.json()
            username = data.get("data", {}).get("urlname", "unknown")
            nickname = data.get("data", {}).get("nickname", "unknown")
            print(f"  ログイン確認OK: {nickname} (@{username})")
            return True
    except:
        pass
    return False

def parse_article(filepath):
    """1行目=タイトル、残り=本文"""
    text = filepath.read_text(encoding="utf-8")
    lines = text.strip().split("\n")
    title = lines[0].strip()
    body = "\n".join(lines[1:]).strip()
    return title, body

def text_to_note_body(text):
    """テキストをNOTE APIに適した形式に変換"""
    # NOTE APIはHTML形式の本文を受け付ける
    lines = text.split("\n")
    html_parts = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            html_parts.append("")
            continue
        if stripped.startswith("## "):
            heading = stripped[3:]
            html_parts.append(f"<h3>{heading}</h3>")
        elif stripped.startswith("> "):
            quote = stripped[2:]
            html_parts.append(f"<blockquote>{quote}</blockquote>")
        elif stripped == "---":
            html_parts.append("<hr>")
        elif stripped.startswith("・"):
            html_parts.append(f"<p>{stripped}</p>")
        else:
            html_parts.append(f"<p>{stripped}</p>")

    return "\n".join(html_parts)

def extract_hashtags(title, body):
    """記事内容からハッシュタグを自動生成"""
    tags = set()
    keyword_tags = {
        "知育": "知育玩具", "マグフォーマー": "マグフォーマー",
        "ストライダー": "ストライダー", "レゴ": "レゴ",
        "くもん": "くもん", "将棋": "将棋", "メルちゃん": "メルちゃん",
        "プラレール": "プラレール", "アンパンマン": "アンパンマン",
        "スキップホップ": "ベビーバス", "シュナグル": "ベビーバス",
        "ベビーゲート": "ベビーゲート", "スマートゲイト": "安全対策",
        "リッチェル": "ベビーバス", "フィッシャープライス": "知育玩具",
    }
    full_text = title + " " + body
    for keyword, tag in keyword_tags.items():
        if keyword in full_text:
            tags.add(tag)
    tags.update(["子育て", "育児", "口コミ", "パパ育児"])
    return list(tags)[:10]

def post_article_api(session, title, body_text, hashtags, publish=False):
    """非公式APIで記事を投稿"""

    body_html = text_to_note_body(body_text)

    # Step 1: POST /api/v1/text_notes で下書き作成
    # エディタと同じペイロード
    payload = {
        "template_key": None,
    }

    print(f"    Step 1: 下書き作成中...")
    resp = session.post("https://note.com/api/v1/text_notes", json=payload)
    print(f"    Response: status={resp.status_code}")

    if resp.status_code in (200, 201):
        data = resp.json()
        print(f"    Response data keys: {list(data.keys())}")
        note_data = data.get("data", data)
        note_key = note_data.get("key", note_data.get("note_key", ""))
        note_id = note_data.get("id", "")
        print(f"    下書き作成成功! key={note_key}, id={note_id}")

        if note_key:
            # Step 2: PUT で本文・タイトルを更新
            print(f"    Step 2: 本文更新中...")
            update_payload = {
                "name": title,
                "body": body_html,
                "hashtag_notes": [{"hashtag": {"name": t}} for t in hashtags],
            }
            update_resp = session.put(
                f"https://note.com/api/v1/text_notes/{note_key}",
                json=update_payload
            )
            print(f"    Update response: status={update_resp.status_code}")

            if update_resp.status_code not in (200, 204):
                # v2 APIも試す
                print(f"    v1 update失敗、v2を試行...")
                update_resp = session.put(
                    f"https://note.com/api/v2/notes/{note_key}",
                    json=update_payload
                )
                print(f"    v2 Update response: status={update_resp.status_code}")

            if publish:
                # Step 3: 公開
                print(f"    Step 3: 公開中...")
                pub_resp = session.put(f"https://note.com/api/v2/notes/{note_key}/publish")
                print(f"    Publish response: status={pub_resp.status_code}")
                if pub_resp.status_code in (200, 204):
                    print(f"    公開完了!")
                else:
                    print(f"    公開失敗、下書きのまま")

            note_url = f"https://note.com/n/{note_key}"
            return {"success": True, "key": note_key, "url": note_url}

    # Fallback: レスポンスを詳しく表示
    print(f"    投稿失敗: status={resp.status_code}")
    try:
        print(f"    response headers: {dict(resp.headers)}")
        print(f"    response body: {resp.text[:500]}")
    except:
        pass
    return {"success": False, "error": f"status={resp.status_code}"}

def main():
    post_log = load_post_log()

    article_files = sorted(ARTICLES_DIR.glob("*.txt"))
    if not article_files:
        print("記事ファイルが見つかりません")
        sys.exit(1)

    if "--article" in sys.argv:
        idx = sys.argv.index("--article")
        target = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else None
        if target:
            article_files = [f for f in article_files if target in f.stem]

    total = len(article_files)
    print(f"=== NOTE API投稿 ===")
    print(f"記事数: {total}")
    print(f"モード: {'公開' if PUBLISH else '下書き'}")
    print()

    # Cookie取得（キャッシュがあれば再利用）
    if COOKIE_FILE.exists():
        cookies = json.loads(COOKIE_FILE.read_text())
        print(f"キャッシュCookie {len(cookies)}件 ロード")
    else:
        cookies = get_cookies_via_playwright()

    session = cookies_to_session(cookies)

    # ログイン確認
    if not verify_login(session):
        print("Cookie期限切れ、再ログイン...")
        cookies = get_cookies_via_playwright()
        session = cookies_to_session(cookies)
        if not verify_login(session):
            print("ログインに失敗しました")
            sys.exit(1)

    # 記事投稿
    success = 0
    for i, filepath in enumerate(article_files):
        slug = filepath.stem

        if slug in post_log and post_log[slug].get("status") == "success":
            print(f"[{i+1}/{total}] {slug} - 投稿済み、スキップ")
            continue

        title, body = parse_article(filepath)
        hashtags = extract_hashtags(title, body)
        print(f"\n[{i+1}/{total}] {slug}")
        print(f"  タイトル: {title[:50]}")
        print(f"  文字数: {len(body)}")
        print(f"  タグ: {', '.join(hashtags[:5])}")

        result = post_article_api(session, title, body, hashtags, publish=PUBLISH)

        if result["success"]:
            post_log[slug] = {
                "status": "success",
                "title": title,
                "mode": "published" if PUBLISH else "draft",
                "key": result.get("key", ""),
                "url": result.get("url", ""),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            success += 1
        else:
            post_log[slug] = {
                "status": "error",
                "error": result.get("error", "unknown"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            }

        save_post_log(post_log)

        if i < total - 1:
            print(f"  {POST_INTERVAL}秒待機...")
            time.sleep(POST_INTERVAL)

    print(f"\n=== 完了: {success}/{total} 記事投稿 ===")

if __name__ == "__main__":
    main()
