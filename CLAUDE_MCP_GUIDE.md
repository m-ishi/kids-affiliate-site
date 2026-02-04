# MCP記事生成ガイド - キッズグッズラボ

このドキュメントは、Claude + MCP filesystem を使って商品レビュー記事を自動生成するためのガイドです。

## 記事生成の方法

### 方法1: テンプレートを使った直接生成

1. `/templates/product-template.html` を読み込む
2. プレースホルダーを実際の値に置換
3. `/products/[商品名].html` として保存

### 方法2: Node.jsスクリプトを使用

```bash
# インタラクティブモード
node scripts/generate-product.js --interactive

# JSONファイルから生成
node scripts/generate-product.js --data product-data.json
```

## テンプレートのプレースホルダー一覧

| プレースホルダー | 説明 | 例 |
|---|---|---|
| `{{PRODUCT_NAME}}` | 商品名 | 知育ブロック 100ピースセット |
| `{{META_DESCRIPTION}}` | メタディスクリプション | 商品の詳細レビュー... |
| `{{KEYWORDS}}` | メタキーワード | 知育玩具,ブロック,レビュー |
| `{{OG_IMAGE}}` | OGP画像URL | https://... |
| `{{PRODUCT_IMAGE}}` | 商品画像URL | https://... |
| `{{PRODUCT_SHORT_DESCRIPTION}}` | 商品の短い説明 | 創造力を育む知育ブロック |
| `{{CATEGORY}}` | カテゴリー名 | 知育玩具 |
| `{{PUBLISH_DATE}}` | 公開日 | 2024.01.01 |
| `{{PRICE}}` | 価格 | ¥3,980（税込） |
| `{{TARGET_AGE}}` | 対象年齢 | 3歳以上 |
| `{{MANUFACTURER}}` | メーカー名 | サンプルトイズ |
| `{{AFFILIATE_LINK}}` | アフィリエイトリンク | https://amazon.co.jp/... |
| `{{RATING}}` | 評価スコア（数値） | 4.5 |
| `{{RATING_STARS}}` | 星評価 | ★★★★☆ |
| `{{INTRODUCTION}}` | 導入文（HTML） | `<p>...</p>` |
| `{{PROS}}` | 良い点（リスト項目） | `<li>...</li>` |
| `{{CONS}}` | 気になる点（リスト項目） | `<li>...</li>` |
| `{{MAIN_CONTENT}}` | 本文（HTML） | `<p>...</p><h3>...</h3>` |
| `{{SPECIFICATIONS}}` | スペック（HTML） | `<ul><li>...</li></ul>` |
| `{{RECOMMENDATION}}` | おすすめの人（HTML） | `<ul><li>...</li></ul>` |
| `{{CONCLUSION}}` | まとめ（HTML） | `<p>...</p>` |
| `{{CTA_TEXT}}` | CTAテキスト | 購入を検討されている方は... |
| `{{ADDITIONAL_AFFILIATE_LINKS}}` | 追加リンク（HTML） | 楽天リンクなど |
| `{{RELATED_PRODUCTS}}` | 関連商品（HTML） | 関連商品カード |

## カテゴリー対応表

| 表示名 | data-category値 |
|---|---|
| おもちゃ | toy |
| ベビー用品 | baby |
| 知育玩具 | educational |
| 外遊び | outdoor |
| 家具・収納 | furniture |
| 安全グッズ | safety |

## 記事生成後のチェックリスト

1. [ ] `/products/index.html` に新しい商品カードを追加
2. [ ] `/index.html` の「最新のレビュー」に追加（任意）
3. [ ] 画像が正しく表示されるか確認
4. [ ] アフィリエイトリンクが正しいか確認
5. [ ] レスポンシブ表示の確認

## JSONデータ形式（スクリプト用）

```json
{
  "productName": "商品名",
  "category": "知育玩具",
  "price": "¥3,980（税込）",
  "targetAge": "3歳以上",
  "manufacturer": "メーカー名",
  "productImage": "https://example.com/image.jpg",
  "affiliateLink": "https://amazon.co.jp/dp/XXXXXXXXXX?tag=your-tag",
  "rating": 4.5,
  "productShortDescription": "商品の短い説明文",
  "pros": [
    "良い点1",
    "良い点2",
    "良い点3"
  ],
  "cons": [
    "気になる点1",
    "気になる点2"
  ],
  "introduction": "<p>導入文のHTML</p>",
  "mainContent": "<p>本文のHTML</p><h3>小見出し</h3><p>続きの文章</p>",
  "specifications": "<ul><li>スペック1</li><li>スペック2</li></ul>",
  "recommendation": "<ul><li>こんな人におすすめ</li></ul>",
  "conclusion": "<p>まとめの文章</p>",
  "ctaText": "購入を検討されている方はぜひチェック！"
}
```

## 商品一覧ページへの追加

`/products/index.html` に以下の形式でカードを追加:

```html
<article class="product-card" data-category="educational">
  <a href="/products/商品ファイル名.html">
    <div class="product-image">
      <img src="画像URL" alt="商品名">
      <span class="product-badge">おすすめ</span>
    </div>
    <div class="product-content">
      <span class="product-category">知育玩具</span>
      <h3 class="product-title">商品タイトル</h3>
      <p class="product-excerpt">商品の短い説明文...</p>
      <div class="product-meta">
        <div class="product-rating">★★★★☆</div>
        <span class="product-date">2024.01.01</span>
      </div>
    </div>
  </a>
</article>
```

## 注意事項

- アフィリエイトリンクには必ず `rel="noopener sponsored"` を付与
- 画像は外部URLまたは `/images/` ディレクトリに配置
- HTMLの特殊文字（`<`, `>`, `&`）は適切にエスケープ
- 日付形式は `YYYY.MM.DD`
