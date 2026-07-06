#!/bin/bash
# ローカル版 site-manager（Mac cron実行）
# Claude CLI + Telegram通知

SCRIPT_DIR="$HOME/kids-affiliate-site/scripts"
LOG_DIR="$HOME/kids-affiliate-site/logs/manager"
PROMPT_FILE="$SCRIPT_DIR/.site-manager-prompt.txt"
DATE=$(date '+%Y-%m-%d')
LOG_FILE="$LOG_DIR/$DATE.md"
TELEGRAM_TOKEN=$(grep "^TELEGRAM_TOKEN=" "$(dirname "$0")/.env" | cut -d= -f2)
TELEGRAM_CHAT="7685031090"

mkdir -p "$LOG_DIR"

# Telegram送信
send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT}" \
    -d "text=$1" > /dev/null 2>&1
}

send_telegram "📊 Site Manager 開始 ($DATE)"

# Claude CLIでsite-manager実行
export HOME="/Users/masa"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cd "$HOME/kids-affiliate-site"
git pull --quiet 2>/dev/null

RESULT=$("$HOME/.local/bin/claude" -p --model sonnet --dangerously-skip-permissions \
  --system-prompt-file "$SCRIPT_DIR/trigger-prompts/site-manager.md" \
  "今日は${DATE}です。日次タスクを実行してください。結果をMarkdownで出力してください。Telegram通知は不要です（呼び出し元が送ります）。git pushも不要です（呼び出し元が実行します）。" \
  2>&1)

echo "Claude出力文字数: ${#RESULT}" >> "$LOG_DIR/../logs/cron-manager.log"

# ログ保存
echo "$RESULT" > "$LOG_FILE"

# git push
git add logs/manager/ products/ images/ index.html products/index.html sitemap.xml 2>/dev/null
git commit -m "site-manager: $DATE 日次レポート" 2>/dev/null
git push 2>/dev/null

# Telegramにサマリー送信（最初の500文字）
SUMMARY=$(echo "$RESULT" | head -30 | sed 's/[#*`]//g' | head -c 500)
send_telegram "$SUMMARY"
send_telegram "✅ Site Manager 完了 ($DATE)"
