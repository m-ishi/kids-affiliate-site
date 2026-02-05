# 自動記事生成スクリプト

## セットアップ

### 環境変数（オプション）
```bash
export BRAVE_API_KEY="your-brave-api-key"
export GEMINI_API_KEY="your-gemini-api-key"
```

## 使い方

### 単一記事を生成
```bash
node auto-generate-article.js "商品名" "カテゴリー"
```

カテゴリー:
- `toy` - おもちゃ
- `baby` - ベビー用品
- `educational` - 知育玩具
- `consumable` - 消耗品
- `outdoor` - 外遊び
- `furniture` - 家具・収納
- `safety` - 安全グッズ

例:
```bash
node auto-generate-article.js "パンパース さらさらケア テープ M" "consumable"
```

### バッチ処理（複数記事を一括生成）
```bash
node batch-generate.js --limit 5
```

`products-queue.json` に商品を追加しておくと、自動で処理されます。

## Cron設定（miniPC用）

### 週次実行（毎週月曜 9:00）
```bash
crontab -e
```

以下を追加:
```
0 9 * * 1 cd /path/to/kids-affiliate-site/scripts && node batch-generate.js --limit 3 >> /var/log/article-gen.log 2>&1
```

### 月次実行（毎月1日 9:00）
```
0 9 1 * * cd /path/to/kids-affiliate-site/scripts && node batch-generate.js --limit 10 >> /var/log/article-gen.log 2>&1
```

## ファイル構成

- `auto-generate-article.js` - 単一記事生成
- `batch-generate.js` - バッチ処理
- `products-queue.json` - 生成待ちの商品リスト
- `products-done.json` - 生成済みの商品リスト（自動作成）

## 商品リストの追加

`products-queue.json` を編集:
```json
[
  { "name": "商品名", "category": "カテゴリー" },
  { "name": "別の商品", "category": "baby" }
]
```
