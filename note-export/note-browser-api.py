#!/usr/bin/env python3
"""
NOTE.com 自動投稿スクリプト v3（Playwright + ブラウザ内fetch API版）
- PlaywrightでNOTEエディタページを開く
- ブラウザ内でfetch()を使ってAPIを叩く（CORS/WAFを回避）
- これによりブラウザと同じ認証・ヘッダーでAPIアクセスが可能
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
POST_INTERVAL = 60

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

def text_to_note_body(text):
    """テキストをNOTEエディタのHTML形式に変換"""
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
        else:
            html_parts.append(f"<p>{stripped}</p>")

    return "\n".join(html_parts)

def extract_hashtags(title, body):
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

def post_via_browser(page, title, body_text, hashtags, publish=False):
    """ブラウザ内fetch APIで記事を投稿"""

    body_html = text_to_note_body(body_text)

    # Step 1: 空の下書き作成
    print("    Step 1: 下書き作成...")
    result = page.evaluate("""
        async () => {
            try {
                const resp = await fetch('https://note.com/api/v1/text_notes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'include',
                    body: JSON.stringify({template_key: null}),
                });
                const data = await resp.json();
                return {status: resp.status, data: data};
            } catch(e) {
                return {error: e.message};
            }
        }
    """)
    print(f"    Step 1 result: {json.dumps(result, ensure_ascii=False)[:300]}")

    if result.get("error"):
        return {"success": False, "error": result["error"]}

    if result.get("status") not in (200, 201):
        return {"success": False, "error": f"status={result.get('status')}"}

    note_data = result.get("data", {}).get("data", result.get("data", {}))
    note_key = note_data.get("key", "")
    note_id = note_data.get("id", "")
    print(f"    下書き作成成功! key={note_key}, id={note_id}")

    if not note_key:
        return {"success": False, "error": "no note_key in response"}

    # Step 2: 本文・タイトル更新
    print("    Step 2: 本文更新...")

    # body_htmlをJavaScriptに安全に渡す
    escaped_title = json.dumps(title)
    escaped_body = json.dumps(body_html)
    escaped_hashtags = json.dumps([{"hashtag": {"name": t}} for t in hashtags])

    update_result = page.evaluate(f"""
        async () => {{
            try {{
                const resp = await fetch('https://note.com/api/v1/text_notes/{note_key}', {{
                    method: 'PUT',
                    headers: {{
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    }},
                    credentials: 'include',
                    body: JSON.stringify({{
                        name: {escaped_title},
                        body: {escaped_body},
                        hashtag_notes: {escaped_hashtags},
                    }}),
                }});
                const text = await resp.text();
                let data;
                try {{ data = JSON.parse(text); }} catch(e) {{ data = text; }}
                return {{status: resp.status, data: data}};
            }} catch(e) {{
                return {{error: e.message}};
            }}
        }}
    """)
    print(f"    Step 2 result: status={update_result.get('status')}")

    if update_result.get("status") not in (200, 204):
        # v2 APIも試す
        print("    v1 update失敗, v2を試行...")
        update_result2 = page.evaluate(f"""
            async () => {{
                try {{
                    const resp = await fetch('https://note.com/api/v2/notes/{note_key}', {{
                        method: 'PUT',
                        headers: {{
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        }},
                        credentials: 'include',
                        body: JSON.stringify({{
                            name: {escaped_title},
                            body: {escaped_body},
                            hashtag_notes: {escaped_hashtags},
                        }}),
                    }});
                    const text = await resp.text();
                    let data;
                    try {{ data = JSON.parse(text); }} catch(e) {{ data = text; }}
                    return {{status: resp.status, data: data}};
                }} catch(e) {{
                    return {{error: e.message}};
                }}
            }}
        """)
        print(f"    v2 result: status={update_result2.get('status')}")

    if publish:
        print("    Step 3: 公開...")
        pub_result = page.evaluate(f"""
            async () => {{
                try {{
                    const resp = await fetch('https://note.com/api/v2/notes/{note_key}/publish', {{
                        method: 'PUT',
                        headers: {{
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        }},
                        credentials: 'include',
                    }});
                    return {{status: resp.status}};
                }} catch(e) {{
                    return {{error: e.message}};
                }}
            }}
        """)
        print(f"    Publish result: {pub_result}")

    note_url = f"https://note.com/n/{note_key}"
    return {"success": True, "key": note_key, "url": note_url}

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
    print(f"=== NOTE Browser API投稿 v3 ===")
    print(f"記事数: {total}")
    print(f"モード: {'公開' if PUBLISH else '下書き'}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        if STATE_FILE.exists():
            print("認証状態ロード...")
            context = browser.new_context(storage_state=str(STATE_FILE))
        else:
            context = browser.new_context()

        page = context.new_page()

        # ログイン確認
        page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
        time.sleep(3)

        if "login" in page.url:
            print("ログインが必要...")
            page.goto("https://note.com/login", wait_until="networkidle", timeout=30000)
            time.sleep(3)
            page.fill('input[placeholder*="mail"]', NOTE_EMAIL)
            time.sleep(0.5)
            page.fill('input[type="password"]', NOTE_PASSWORD)
            time.sleep(0.5)
            page.click('button:has-text("ログイン")')
            time.sleep(8)
            page.context.storage_state(path=str(STATE_FILE))
            page.goto("https://note.com/dashboard", wait_until="networkidle", timeout=30000)
            time.sleep(3)
            if "login" in page.url:
                print("ログイン失敗")
                browser.close()
                sys.exit(1)

        print(f"ログイン確認OK (URL: {page.url})")

        # エディタページに移動（editor.note.comからのfetchでないとCORS通らない）
        print("エディタページに移動...")
        page.goto("https://editor.note.com/new", wait_until="networkidle", timeout=30000)
        time.sleep(5)
        print(f"エディタURL: {page.url}")

        # 各記事を投稿
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

            result = post_via_browser(page, title, body, hashtags, publish=PUBLISH)

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
                print(f"    投稿成功! {result.get('url', '')}")
            else:
                post_log[slug] = {
                    "status": "error",
                    "error": result.get("error", "unknown"),
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                print(f"    投稿失敗: {result.get('error', '')}")

            save_post_log(post_log)

            if i < total - 1:
                print(f"  {POST_INTERVAL}秒待機...")
                time.sleep(POST_INTERVAL)

        browser.close()

    print(f"\n=== 完了: {success}/{total} 記事投稿 ===")

if __name__ == "__main__":
    main()
