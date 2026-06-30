# キッズグッズラボ - プロジェクト設定

## サイト情報
- **サイト名**: キッズグッズラボ
- **URL**: https://kidsgoodslab.com
- **GitHub**: https://github.com/m-ishi/kids-affiliate-site
- **ホスティング**: Cloudflare Pages

## 運営者情報
- 2児の父（3歳男の子、1歳女の子）
- 東京在住
- ニックネーム: パパラボ

## 技術スタック
- 静的サイト（HTML/CSS/JS）
- Gemini API（記事生成）
- Brave Search API（商品情報・ASIN取得）
- GitHub → Cloudflare Pages（自動デプロイ）

## ディレクトリ構成
```
kids-affiliate-site/
├── index.html              # トップページ
├── products/               # 商品レビュー記事（110+）
│   ├── index.html          # 一覧ページ
│   └── [slug].html         # 各記事
├── drafts/                 # 下書き記事（gitignore対象）
├── css/style.css           # スタイル
├── js/main.js              # JavaScript
├── images/ogp/             # OGP画像（1200x630 PNG）
├── functions/api/          # Cloudflare Functions（お問い合わせ）
├── scripts/
│   ├── pipeline-generate.js    # 統合パイプライン（推奨）
│   ├── auto-generate-article.js # 単一記事生成エンジン
│   ├── batch-generate.js       # バッチ処理
│   ├── fix-amazon-links.js     # ASIN自動修正
│   ├── generate-ogp-image.js   # OGP画像生成
│   ├── generate-all-ogp.js     # 全記事OGP一括生成
│   ├── pattern-sections.js     # 29パターンセクション構成
│   ├── rebuild-index.js        # インデックス再構築
│   ├── update-sitemap.js       # サイトマップ更新
│   ├── products-queue.json     # 生成キュー
│   ├── products-done.json      # 生成済みリスト
│   ├── logs/                   # パイプラインログ（gitignore対象）
│   └── archive/                # 旧スクリプト（gitignore対象）
├── archive/                # 旧ファイル（gitignore対象）
├── sitemap.xml
├── robots.txt
└── templates/
    └── product-template.html
```

## 記事生成フロー

### パス A: 統合パイプライン（量産 + 自動品質チェック）
```bash
cd ~/kids-affiliate-site/scripts

# 通常生成（デプロイまで自動）
node pipeline-generate.js "商品名" "カテゴリー" "記事タイトル"

# テスト（デプロイなし）
node pipeline-generate.js --dry-run "商品名" "カテゴリー"
```

フロー: Brave Search → ASIN取得 → Gemini生成 → OGP画像 → Critic/Safety/SEOチェック → ASIN検証 → インデックス更新 → git push

### パス B: Claude Code エージェント（高品質記事）
```
Kids Writer → Kids Critic（プッシュバック） → Kids Safety → Kids SEO → QA → デプロイ
```
購入履歴ベースの記事、安全系記事、恐怖クエリ記事はこちら推奨。

### パス C: 単一記事生成（シンプル）
```bash
node auto-generate-article.js "商品名" "カテゴリー" "記事タイトル" "ASIN"
```

### パス D: バッチ処理
```bash
node batch-generate.js --limit 3
```
products-queue.json から読み込み。

## カテゴリ
toy, baby, educational, consumable, outdoor, furniture, safety

## エージェント定義
- `~/.claude/agents/kids-writer.md` - 記事ライター（パパラボペルソナ）
- `~/.claude/agents/kids-critic.md` - 批評家（5軸プッシュバック）
- `~/.claude/agents/kids-safety.md` - 安全審査
- `~/.claude/agents/kids-seo.md` - SEO最適化
- `~/.claude/agents/kids-patrol.md` - 週次鮮度パトロール
- `~/.claude/agents/kids-radar.md` - 日次市場スキャナー

## 品質基準
- 最低1,500文字（比較記事は2,000字以上）
- CTA最大2箇所（冒頭+末尾）
- 「安全です」「安心です」の断言禁止（根拠リンク必須）
- 水道水等の不安煽り禁止
- schema.org構造化データ必須（Product + Article）
- 内部リンク3本以上、公的機関外部リンク必須
- Amazonリンクに rel="noopener sponsored" 必須

## デプロイ
```bash
# 必要なファイルのみステージング（git add -A は使わない）
git add products/ images/ogp/ index.html sitemap.xml
git commit -m "記事追加"
git push
```

## セキュリティ
- APIキーは scripts/.env で管理（.gitignore対象）
- git add -A は禁止（不要ファイル混入防止）
- scripts/logs/ は .gitignore 対象

## Amazonアソシエイト
- Store ID: kidsgoodslab-22
- ASIN取得: Brave Search APIで自動（fix-amazon-links.jsで修正可能）

## TODO
- [ ] PA-API取得（審査通過後）
- [ ] 既存101記事へのschema.org遡及適用
- [ ] CSS/JS最小化
- [ ] スケジューラー導入（cron/GitHub Actions）
- [ ] 監視・アラート体制（Telegram通知）
- [ ] 記事定期更新メカニズム
