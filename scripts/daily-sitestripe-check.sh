#!/bin/bash
# 毎日AM7:00に実行: SiteStripeでアフィリエイトリンク検証
# Chromeデバッグモード起動 → 検証 → Chrome閉じる

SCRIPT_DIR="$HOME/kids-affiliate-site/scripts"
LOG_FILE="$SCRIPT_DIR/logs/sitestripe-check.log"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="/tmp/chrome-debug-profile"

mkdir -p "$SCRIPT_DIR/logs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

log "SiteStripe検証開始"

# プロファイルコピー（ログイン状態を引き継ぐ）
if [ ! -d "$PROFILE" ]; then
  cp -r "$HOME/Library/Application Support/Google/Chrome" "$PROFILE" 2>/dev/null
fi

# Chrome起動（デバッグモード）
"$CHROME" --remote-debugging-port=9222 --user-data-dir="$PROFILE" --no-first-run --headless=new &
CHROME_PID=$!
sleep 10

# 検証実行（直近24h更新分 + 自動修正）
cd "$SCRIPT_DIR"
node verify-with-sitestripe.js --fix >> "$LOG_FILE" 2>&1

# Chrome停止
kill $CHROME_PID 2>/dev/null
wait $CHROME_PID 2>/dev/null

log "SiteStripe検証完了"
