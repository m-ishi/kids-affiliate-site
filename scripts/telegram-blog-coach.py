#!/usr/bin/env python3
"""Telegram → Claude Code ブリッジ（ブログコーチ）"""

import json, subprocess, time, urllib.request, urllib.parse, os, sys
from datetime import datetime

BOT_TOKEN = "***REVOKED-TELEGRAM-TOKEN***"
CHAT_ID = 7685031090
SCRIPT_DIR = os.path.expanduser("~/kids-affiliate-site/scripts")
OFFSET_FILE = os.path.join(SCRIPT_DIR, ".telegram-offset")
REVIEW_DIR = os.path.join(SCRIPT_DIR, "purchase-reviews")
SESSION_FILE = os.path.join(SCRIPT_DIR, ".telegram-session.json")
LOG_FILE = os.path.join(SCRIPT_DIR, "logs", "telegram-coach.log")
PROMPT_FILE = os.path.join(SCRIPT_DIR, ".coach-system-prompt.txt")

os.makedirs(REVIEW_DIR, exist_ok=True)
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

# システムプロンプト
with open(PROMPT_FILE, "w") as f:
    f.write("""あなたはキッズグッズラボのブログコーチです。パパ（2児の父、2歳男の子と0歳女の子、東京在住）と雑談しながら、アフィリエイト記事のネタを自然に拾います。

ルール:
- 雑談として自然に返す。インタビューしない
- 商品購入・困りごと・比較の話が出たら深掘り
- 十分な情報が集まったら「記事にしませんか？OKなら /article と送ってください」と提案
- Telegramなので短く返す（3-4文以内）
- 日本語で返す""")

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{ts}] {msg}\n")

def send_msg(text):
    data = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text}).encode()
    try:
        urllib.request.urlopen(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", data, timeout=10)
    except Exception as e:
        log(f"送信エラー: {e}")

def get_updates(offset):
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?offset={offset}&timeout=30"
        resp = urllib.request.urlopen(url, timeout=35)
        return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        log(f"取得エラー: {e}")
        return None

def load_session():
    if os.path.exists(SESSION_FILE):
        try:
            with open(SESSION_FILE) as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except (json.JSONDecodeError, ValueError):
            pass
    return []

def save_session(session):
    with open(SESSION_FILE, "w") as f:
        json.dump(session, f, ensure_ascii=False, indent=2)

def ask_claude(text):
    session = load_session()
    session.append({"role": "user", "text": text})

    # 直近10件の文脈
    context = "\n".join(f"{m['role']}: {m['text']}" for m in session[-10:])

    try:
        result = subprocess.run(
            ["claude", "-p", "--model", "sonnet", "--system-prompt-file", PROMPT_FILE,
             f"会話履歴:\n{context}\n\n最新メッセージに返信:"],
            capture_output=True, text=True, timeout=60
        )
        reply = result.stdout.strip()
        if not reply:
            reply = "ちょっとエラーでした。もう一度お願いします。"
    except subprocess.TimeoutExpired:
        reply = "応答に時間がかかりすぎました。もう一度お願いします。"
    except Exception as e:
        reply = f"エラー: {e}"

    session.append({"role": "assistant", "text": reply})
    save_session(session)
    return reply

def handle_article():
    today = datetime.now().strftime("%Y-%m-%d")
    idea_file = os.path.join(REVIEW_DIR, f"idea-{today}-{int(time.time())}.json")

    session = load_session()
    with open(idea_file, "w") as f:
        json.dump({"date": today, "conversation": session, "status": "ready"}, f, ensure_ascii=False, indent=2)

    # git push
    repo = os.path.expanduser("~/kids-affiliate-site")
    subprocess.run(["git", "add", idea_file], cwd=repo, capture_output=True)
    subprocess.run(["git", "commit", "-m", "blog-coach: ヒアリングデータ追加"], cwd=repo, capture_output=True)
    subprocess.run(["git", "push"], cwd=repo, capture_output=True)

    save_session([])
    send_msg(f"会話を保存しました。次回のarticle-generatorが記事化します。")
    log(f"記事化: {idea_file}")

def load_offset():
    if os.path.exists(OFFSET_FILE):
        with open(OFFSET_FILE) as f:
            return int(f.read().strip())
    return 0

def save_offset(offset):
    with open(OFFSET_FILE, "w") as f:
        f.write(str(offset))

def main():
    offset = load_offset()
    log("ブログコーチ起動")
    send_msg("ブログコーチ起動しました。いつでも話しかけてください。")

    while True:
        data = get_updates(offset)
        if not data or not data.get("ok"):
            time.sleep(10)
            continue

        for update in data.get("result", []):
            uid = update["update_id"]
            offset = uid + 1
            save_offset(offset)

            msg = update.get("message", {})
            if msg.get("chat", {}).get("id") != CHAT_ID:
                continue

            text = msg.get("text", "")
            if not text:
                continue

            log(f"受信: {text}")

            if text.strip().lower().startswith("/article"):
                handle_article()
            else:
                reply = ask_claude(text)
                send_msg(reply)
                log(f"送信: {reply}")

if __name__ == "__main__":
    main()
