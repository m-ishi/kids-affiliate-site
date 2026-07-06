#!/bin/bash
# ローカル版 TTL article-generator（Mac cron実行）
# Claude CLI + WordPress API + Telegram通知

PROMPT_FILE="$HOME/kids-affiliate-site/scripts/trigger-prompts/ttl-article-generator.md"
DATE=$(date '+%Y-%m-%d')
TELEGRAM_TOKEN=$(grep "^TELEGRAM_TOKEN=" "$(dirname "$0")/.env" | cut -d= -f2)
TELEGRAM_CHAT="7685031090"

send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT}" \
    -d "text=$1" > /dev/null 2>&1
}

send_telegram "📝 TTL記事生成開始 ($DATE)"

# TTLのプロンプトがなければCloudのものをコピー
if [ ! -f "$PROMPT_FILE" ]; then
  echo "TTLプロンプトファイルなし。スキップ。"
  send_telegram "❌ TTL: プロンプトファイルなし"
  exit 1
fi

RESULT=$("$HOME/.local/bin/claude" -p --model sonnet --dangerously-skip-permissions \
  --system-prompt-file "$PROMPT_FILE" \
  "今日は${DATE}です。記事を1本生成してWordPressに公開してください。Telegram通知は不要です（呼び出し元が送ります）。公開したURLとタイトルを最後に報告してください。" \
  2>/dev/null)

# 結果からURLを抽出
URL=$(echo "$RESULT" | grep -oP 'https://tokyotoylab\.com/[^\s"]+' | head -1)

if [ -n "$URL" ]; then
  send_telegram "✅ TTL記事公開: $URL"
else
  SUMMARY=$(echo "$RESULT" | tail -10 | head -c 300)
  send_telegram "📝 TTL記事生成完了
$SUMMARY"
fi
