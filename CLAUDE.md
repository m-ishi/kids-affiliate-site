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

### 記事を追加する
```bash
cd ~/kids-affiliate-site
GEMINI_API_KEY="AIzaSyBwWnuOMohF6nPvUliBEoCfIfjuM5aXpUc" node scripts/generate-articles.js
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
- Gemini API Key: AIzaSyBwWnuOMohF6nPvUliBEoCfIfjuM5aXpUc

## 次のTODO
- [ ] Amazonアソシエイト登録
- [ ] 残り3記事を追加
- [ ] 商品画像を追加
- [ ] アフィリエイトリンクを実際のURLに更新
