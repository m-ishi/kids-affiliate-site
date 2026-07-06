#!/bin/bash
# ローカル版 kids-article-generator（Mac cron実行）
# Claude CLI + Telegram通知

SCRIPT_DIR="$HOME/kids-affiliate-site/scripts"
PROMPT_FILE="$SCRIPT_DIR/trigger-prompts/kids-article-generator.md"
DATE=$(date '+%Y-%m-%d')
TELEGRAM_TOKEN=$(grep "^TELEGRAM_TOKEN=" "$(dirname "$0")/.env" | cut -d= -f2)
TELEGRAM_CHAT="7685031090"

# Telegram送信
send_telegram() {
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT}" \
    -d "text=$1" > /dev/null 2>&1
}

send_telegram "📝 記事生成エージェント開始 ($DATE)"

cd "$HOME/kids-affiliate-site"
git pull --quiet 2>/dev/null

RESULT=$("$HOME/.local/bin/claude" -p --model sonnet --dangerously-skip-permissions \
  --system-prompt-file "$PROMPT_FILE" \
  "今日は${DATE}です。記事を1本生成してください。Telegram通知は不要です（呼び出し元が送ります）。git pushも不要です（呼び出し元が実行します）。生成した記事のslugとタイトルを最後に報告してください。" \
  2>/dev/null)

# 生成結果からslugを抽出
SLUG=$(echo "$RESULT" | grep -oP 'slug[：:]\s*\K[\w-]+' | head -1)

# OGP画像生成（CLIが生成してない場合のフォールバック）
if [ -n "$SLUG" ] && [ ! -f "images/ogp/${SLUG}.png" ]; then
  node scripts/generate-ogp-image.js "" "" "" "$SLUG" 2>/dev/null
fi

# インデックス・サイトマップ更新
node scripts/rebuild-index.js 2>/dev/null
node scripts/update-sitemap.js 2>/dev/null

# git push
git add products/ images/ogp/ index.html products/index.html sitemap.xml scripts/topic-queue.json scripts/purchase-reviews/ 2>/dev/null
git commit -m "feat: 記事追加 ($DATE)" 2>/dev/null
git push 2>/dev/null

# ライブ検証
if [ -n "$SLUG" ]; then
  sleep 90
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://kidsgoodslab.com/products/${SLUG}.html")
  OGP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://kidsgoodslab.com/images/ogp/${SLUG}.png")

  if [ "$HTTP_CODE" = "200" ] && [ "$OGP_CODE" = "200" ]; then
    send_telegram "✅ 記事公開完了: ${SLUG}
https://kidsgoodslab.com/products/${SLUG}.html
ライブ検証: PASS"
  else
    send_telegram "⚠️ ライブ検証に問題あり
記事: HTTP ${HTTP_CODE}
OGP: HTTP ${OGP_CODE}
${SLUG}"
  fi
else
  send_telegram "📝 記事生成完了（slug検出できず）
詳細:
$(echo "$RESULT" | tail -10 | head -c 300)"
fi
