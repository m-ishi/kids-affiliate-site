#!/bin/bash
# Telegram → Claude Code ブリッジ（ブログコーチ）

BOT_TOKEN="8754086846:AAETbMUvQtBTVjOgGOkLMAbCgzgMHTmLmKI"
CHAT_ID="7685031090"
SCRIPT_DIR="$HOME/kids-affiliate-site/scripts"
OFFSET_FILE="$SCRIPT_DIR/.telegram-offset"
REVIEW_DIR="$SCRIPT_DIR/purchase-reviews"
SESSION_FILE="$SCRIPT_DIR/.telegram-session.json"
LOG_FILE="$SCRIPT_DIR/logs/telegram-coach.log"
PROMPT_FILE="$SCRIPT_DIR/.coach-system-prompt.txt"

mkdir -p "$REVIEW_DIR" "$SCRIPT_DIR/logs"

cat > "$PROMPT_FILE" << 'PROMPT'
あなたはキッズグッズラボのブログコーチです。パパ（2児の父、2歳男の子と0歳女の子、東京在住）と雑談しながら、アフィリエイト記事のネタを自然に拾います。

ルール:
- 雑談として自然に返す。インタビューしない
- 商品購入・困りごと・比較の話が出たら深掘り
- 十分な情報が集まったら「記事にしませんか？OKなら /article と送ってください」と提案
- Telegramなので短く返す（3-4文以内）
- 日本語で返す
PROMPT

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

send_msg() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" -d "text=$1" > /dev/null 2>&1
}

ask_claude() {
  local text="$1"
  [ ! -f "$SESSION_FILE" ] && echo '[]' > "$SESSION_FILE"

  # 履歴にユーザーメッセージ追加
  local h=$(jq --arg m "$text" '. += [{"role":"user","text":$m}]' "$SESSION_FILE")
  echo "$h" > "$SESSION_FILE"

  # 直近10件の文脈
  local ctx=$(jq -r '.[-10:] | map(.role + ": " + .text) | join("\n")' "$SESSION_FILE")

  # Claude CLI
  local reply
  reply=$(claude -p --model sonnet --system-prompt-file "$PROMPT_FILE" \
    "会話履歴:
$ctx

最新メッセージに返信:" 2>/dev/null)

  [ -z "$reply" ] && reply="ちょっとエラーでした。もう一度お願いします。"

  # 履歴にアシスタント応答追加
  jq --arg m "$reply" '. += [{"role":"assistant","text":$m}]' "$SESSION_FILE" > "${SESSION_FILE}.tmp"
  mv "${SESSION_FILE}.tmp" "$SESSION_FILE"

  echo "$reply"
}

handle_article() {
  local today=$(date '+%Y-%m-%d')
  local f="${REVIEW_DIR}/idea-${today}-$(date +%s).json"
  cp "$SESSION_FILE" "$f"
  cd "$HOME/kids-affiliate-site"
  git add "$f" && git commit -m "blog-coach: ヒアリングデータ追加" && git push
  echo '[]' > "$SESSION_FILE"
  send_msg "会話を保存しました。次回のarticle-generatorが記事化します。"
  log "記事化: $f"
}

# offset初期化
[ -f "$OFFSET_FILE" ] && OFFSET=$(cat "$OFFSET_FILE") || OFFSET=0

log "ブログコーチ起動"
send_msg "ブログコーチ起動しました。いつでも話しかけてください。"

while true; do
  RESULT=$(curl -s --max-time 35 \
    "https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${OFFSET}&timeout=30" 2>/dev/null)

  [ $? -ne 0 ] || [ -z "$RESULT" ] && { sleep 10; continue; }

  # メッセージを1件ずつ処理（サブシェルを使わない）
  COUNT=$(echo "$RESULT" | jq '.result | length' 2>/dev/null)
  [ -z "$COUNT" ] || [ "$COUNT" = "0" ] || [ "$COUNT" = "null" ] && continue

  for i in $(seq 0 $((COUNT - 1))); do
    MSG=$(echo "$RESULT" | jq ".result[$i]")
    CID=$(echo "$MSG" | jq -r '.message.chat.id // empty')
    TEXT=$(echo "$MSG" | jq -r '.message.text // empty')
    UID=$(echo "$MSG" | jq -r '.update_id')

    OFFSET=$((UID + 1))
    echo "$OFFSET" > "$OFFSET_FILE"

    [ "$CID" != "$CHAT_ID" ] && continue
    [ -z "$TEXT" ] && continue

    log "受信: $TEXT"

    if echo "$TEXT" | grep -qi "^/article"; then
      handle_article
    else
      REPLY=$(ask_claude "$TEXT")
      send_msg "$REPLY"
      log "送信: $REPLY"
    fi
  done
done
