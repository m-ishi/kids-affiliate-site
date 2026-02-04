# キッズグッズラボ - 子供用品アフィリエイトサイト

子育てに役立つ子供用品（おもちゃ、ベビー用品、知育玩具など）をレビューするアフィリエイトサイトです。

## 特徴

- 静的サイト（HTML/CSS/JS）- Cloudflare Pagesに最適化
- レスポンシブデザイン対応
- MCP対応の記事自動生成システム
- SEO対応（構造化データ、OGP）

## ディレクトリ構成

```
kids-affiliate-site/
├── index.html              # トップページ
├── privacy.html            # プライバシーポリシー
├── about.html              # 運営者情報
├── contact.html            # お問い合わせ
├── css/
│   └── style.css           # メインスタイルシート
├── js/
│   └── main.js             # メインJavaScript
├── products/
│   ├── index.html          # 商品一覧ページ
│   └── [商品名].html       # 各商品レビューページ
├── templates/
│   └── product-template.html  # 商品ページテンプレート
├── scripts/
│   └── generate-product.js    # 記事生成スクリプト
├── images/                 # 画像ファイル
├── site-config.json        # サイト設定
├── CLAUDE_MCP_GUIDE.md     # MCP記事生成ガイド
└── README.md               # このファイル
```

## セットアップ

### ローカル開発

任意のHTTPサーバーでファイルを配信できます。

```bash
# Python
python -m http.server 8000

# Node.js (npx)
npx serve

# PHP
php -S localhost:8000
```

### Cloudflare Pagesへのデプロイ

1. GitHubリポジトリにプッシュ
2. Cloudflare Dashboardでプロジェクト作成
3. GitHubリポジトリを接続
4. ビルド設定:
   - ビルドコマンド: なし（静的サイト）
   - 出力ディレクトリ: `/`（ルート）

## サイト名の変更方法

サイト名を変更する場合は、以下のファイルを編集してください：

1. `site-config.json` - 設定ファイル
2. 各HTMLファイルの以下の箇所:
   - `<title>` タグ
   - ヘッダーの `.logo` 部分
   - フッターの `.footer-brand` 部分
   - `<meta>` タグ

一括置換する場合:
```bash
# macOS/Linux
find . -name "*.html" -exec sed -i '' 's/キッズグッズラボ/新しいサイト名/g' {} \;
```

## 記事の追加方法

### 方法1: テンプレートから手動作成

1. `templates/product-template.html` をコピー
2. プレースホルダーを実際の値に置換
3. `products/` ディレクトリに保存
4. `products/index.html` に商品カードを追加

### 方法2: スクリプトで生成

```bash
# インタラクティブモード
node scripts/generate-product.js --interactive

# JSONファイルから生成
node scripts/generate-product.js --data product.json
```

### 方法3: Claude + MCP filesystem

`CLAUDE_MCP_GUIDE.md` を参照してください。

## カスタマイズ

### カラーの変更

`css/style.css` の `:root` セクションでCSS変数を編集:

```css
:root {
  --primary-color: #FF6B9D;     /* メインカラー */
  --secondary-color: #4ECDC4;   /* アクセントカラー */
  --accent-color: #FFE66D;      /* ハイライトカラー */
  /* ... */
}
```

### フォントの変更

1. Google Fontsなどからフォントを選択
2. HTMLの `<head>` 内にフォントのリンクを追加
3. `css/style.css` の `--font-main` を変更

### お問い合わせフォーム

デフォルトではFormspreeを使用する設定です。

1. [Formspree](https://formspree.io/) でフォームを作成
2. `contact.html` の `action` 属性を更新:
   ```html
   <form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```

## ライセンス

このテンプレートは自由に使用・改変できます。

## 更新履歴

- 2024.01.01 - 初期リリース
