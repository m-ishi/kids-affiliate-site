# キッズグッズラボ - プロジェクト設定

## サイト情報
- **サイト名**: キッズグッズラボ
- **URL**: https://kidsgoodslab.com
- **GitHub**: https://github.com/m-ishi/kids-affiliate-site
- **ホスティング**: Cloudflare Pages

## 運営者情報
- 2児の父（2歳男の子、0歳女の子）
- 東京在住
- ニックネーム: パパラボ

## 技術スタック
- 静的サイト（HTML/CSS/JS）
- Gemini API（記事生成）
- GitHub → Cloudflare Pages（自動デプロイ）

## ディレクトリ構成
```
kids-affiliate-site/
├── index.html              # トップページ
├── products/               # 商品レビュー記事
│   ├── index.html          # 一覧ページ
│   └── [slug].html         # 各記事
├── css/style.css           # スタイル
├── js/main.js              # JavaScript
├── scripts/
│   └── generate-articles.js # 記事生成スクリプト
└── templates/
    └── product-template.html # テンプレート
```

## よく使うコマンド

### 環境変数を設定（初回のみ）
```bash
export BRAVE_API_KEY="your-brave-api-key"
export GEMINI_API_KEY="your-gemini-api-key"
```

### 記事を追加する
```bash
cd ~/kids-affiliate-site/scripts
node auto-generate-article.js "商品名" "カテゴリー" "記事タイトル"
```

### バッチ処理（複数記事）
```bash
cd ~/kids-affiliate-site/scripts
node batch-generate.js --limit 3
```

### デプロイする
```bash
cd ~/kids-affiliate-site
git add -A
git commit -m "記事追加"
git push
```

## Claudeへの依頼例

### 新しい記事を追加
「〇〇（商品名）のレビュー記事を作成して」

### 既存記事を改善
「products/rx68j0.html の記事をもっと売れる内容に改善して」

### 記事の改善ポイント
「〇〇の記事に以下を追加して：
- 実際の使用シーン
- 他商品との比較
- 購入の決め手になるポイント」

### 一括で記事改善
「全記事に対して以下の改善を実施して：
- CTAボタンの文言を強化
- 緊急性を出す表現を追加」

## 売れる記事にするための改善ポイント

1. **具体的な体験談**を追加
2. **比較表**で他商品との違いを明確に
3. **デメリットも正直に**書いて信頼性UP
4. **購入の後押し**になる文言（限定、人気、在庫わずか等）
5. **画像**を追加（Amazonから取得）
6. **関連商品**のリンクを追加

## API情報
- APIキーは環境変数で管理（セキュリティのためコードにはハードコードしない）
- scripts/.env.example を参照

## Amazonアソシエイト
- Store ID: kidsgoodslab-22
- 登録済み

## 次のTODO
- [ ] PA-API取得（審査通過後）
- [ ] 安値速報機能の実装
- [ ] 商品画像を追加
