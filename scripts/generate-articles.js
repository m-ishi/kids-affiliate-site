const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// 商品リスト
const products = [
  // 知育玩具（5記事）
  { name: "レゴデュプロ はじめてのデュプロ かずあそびトレイン", category: "知育玩具", categoryId: "educational", targetAge: "1.5歳〜3歳" },
  { name: "くもん NEWスタディ将棋", category: "知育玩具", categoryId: "educational", targetAge: "5歳以上" },
  { name: "ボーネルンド マグフォーマー ベーシックセット 62ピース", category: "知育玩具", categoryId: "educational", targetAge: "3歳以上" },
  { name: "学研 ニューブロック たっぷりセット", category: "知育玩具", categoryId: "educational", targetAge: "2歳以上" },
  { name: "エド・インター 森のあそび箱", category: "知育玩具", categoryId: "educational", targetAge: "1.5歳以上" },

  // ベビー用品（5記事）
  { name: "コンビ ネムリラ AUTO SWING", category: "ベビー用品", categoryId: "baby", targetAge: "0ヶ月〜4歳" },
  { name: "エルゴベビー OMNI 360", category: "ベビー用品", categoryId: "baby", targetAge: "0ヶ月〜48ヶ月" },
  { name: "アップリカ ラクーナクッション AB", category: "ベビー用品", categoryId: "baby", targetAge: "1ヶ月〜36ヶ月" },
  { name: "リッチェル ふかふかベビーバス", category: "ベビー用品", categoryId: "baby", targetAge: "0ヶ月〜3ヶ月" },
  { name: "ピジョン 母乳実感 哺乳びん", category: "ベビー用品", categoryId: "baby", targetAge: "0ヶ月〜" },

  // おもちゃ（5記事）
  { name: "タカラトミー プラレール ベストセレクションセット", category: "おもちゃ", categoryId: "toy", targetAge: "3歳以上" },
  { name: "シルバニアファミリー 赤い屋根の大きなお家", category: "おもちゃ", categoryId: "toy", targetAge: "3歳以上" },
  { name: "アンパンマン ブロックラボ たのしいアンパンマンタウン", category: "おもちゃ", categoryId: "toy", targetAge: "1.5歳以上" },
  { name: "メルちゃん おせわだいすきベビーカー", category: "おもちゃ", categoryId: "toy", targetAge: "1.5歳以上" },
  { name: "トミカ でっかく遊ぼう DXトミカタワー", category: "おもちゃ", categoryId: "toy", targetAge: "3歳以上" },

  // 外遊び（3記事）
  { name: "ストライダー スポーツモデル", category: "外遊び", categoryId: "outdoor", targetAge: "1.5歳〜5歳" },
  { name: "アンパンマン うちの子天才 ブランコパークDX", category: "外遊び", categoryId: "outdoor", targetAge: "2歳〜5歳" },
  { name: "ボーネルンド アクアプレイ ロックボックス", category: "外遊び", categoryId: "outdoor", targetAge: "2歳以上" },

  // 安全グッズ（2記事）
  { name: "日本育児 ベビーゲート スマートゲイト2", category: "安全グッズ", categoryId: "safety", targetAge: "6ヶ月〜24ヶ月" },
  { name: "リッチェル ベビーガード コーナークッション", category: "安全グッズ", categoryId: "safety", targetAge: "0ヶ月〜" },
];

async function callGemini(prompt) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      }
    })
  });

  const data = await response.json();
  if (data.candidates && data.candidates[0]) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Gemini API error: ' + JSON.stringify(data));
}

async function generateArticle(product) {
  const prompt = `
あなたは子育て中のパパブロガーです。以下の子供用品について、実際に使用したかのような詳細なレビュー記事を書いてください。

商品名: ${product.name}
カテゴリ: ${product.category}
対象年齢: ${product.targetAge}

以下のJSON形式で出力してください（JSONのみ、他のテキストは不要）:

{
  "productName": "商品名",
  "price": "参考価格（例：¥5,980）",
  "manufacturer": "メーカー名",
  "rating": 4.5,
  "shortDescription": "商品の短い説明（50文字程度）",
  "introduction": "導入文（HTMLタグ使用可、2-3段落）",
  "pros": ["良い点1", "良い点2", "良い点3", "良い点4"],
  "cons": ["気になる点1", "気になる点2"],
  "mainContent": "使用レビュー本文（HTMLタグ使用可、h3見出しを含めて3-4セクション、各セクション2-3段落）",
  "specifications": "商品スペック（HTMLのul/li形式）",
  "recommendation": "おすすめの人（HTMLのul/li形式、4-5項目）",
  "conclusion": "まとめ（2-3段落）"
}

注意:
- 実体験に基づいたようなリアルな感想を書く
- 2歳の男の子と0歳の女の子がいる東京在住のパパ目線で
- 具体的なエピソードを交える
- メリット・デメリット両方を正直に書く
- 価格は実際の市場価格を調査して記載
`;

  const result = await callGemini(prompt);

  // JSONを抽出
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON not found in response');
  }

  return JSON.parse(jsonMatch[0]);
}

function generateSlug(name) {
  // 日本語をローマ字に変換せず、シンプルなハッシュベースのスラッグを生成
  const hash = name.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const slug = Math.abs(hash).toString(36);
  return slug;
}

function generateStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let stars = '★'.repeat(full);
  if (half) stars += '☆';
  stars += '☆'.repeat(5 - full - (half ? 1 : 0));
  return stars;
}

function generateHTML(product, data, slug) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${data.productName}の詳細レビュー。${data.shortDescription}">
  <meta name="keywords" content="${data.productName},${product.category},子供用品,レビュー">
  <title>${data.productName} レビュー - キッズグッズラボ</title>

  <meta property="og:title" content="${data.productName} レビュー - キッズグッズラボ">
  <meta property="og:description" content="${data.shortDescription}">
  <meta property="og:type" content="article">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧸</text></svg>">
</head>
<body>
  <header class="header">
    <div class="container header-inner">
      <a href="../index.html" class="logo">
        <span class="logo-icon">🧸</span>
        <span class="site-name">キッズグッズラボ</span>
      </a>
      <nav class="nav-menu">
        <a href="../index.html" class="nav-link">ホーム</a>
        <a href="index.html" class="nav-link">商品レビュー</a>
        <a href="../about.html" class="nav-link">運営者情報</a>
        <a href="../contact.html" class="nav-link">お問い合わせ</a>
      </nav>
      <button class="mobile-menu-btn" aria-label="メニュー">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </div>
  </header>

  <section class="article-header">
    <div class="container">
      <div class="article-meta">
        <span class="article-category">${product.category}</span>
        <span class="article-date">${dateStr}</span>
      </div>
      <h1 class="article-title">${data.productName} レビュー</h1>
      <p class="article-excerpt">${data.shortDescription}</p>
    </div>
  </section>

  <section class="article-content">
    <div class="container">
      <div class="article-body">
        <div class="product-info-box">
          <div class="product-image" style="border-radius: var(--radius-md); overflow: hidden; background: #f0f0f0; height: 300px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 4rem;">📦</span>
          </div>

          <dl class="product-specs">
            <dt>商品名</dt>
            <dd>${data.productName}</dd>
            <dt>参考価格</dt>
            <dd>${data.price}</dd>
            <dt>対象年齢</dt>
            <dd>${product.targetAge}</dd>
            <dt>メーカー</dt>
            <dd>${data.manufacturer}</dd>
          </dl>

          <a href="#" class="affiliate-btn" target="_blank" rel="noopener sponsored">
            Amazonで詳細を見る
          </a>
        </div>

        <h2>はじめに</h2>
        ${data.introduction}

        <div class="rating-box">
          <div class="rating-score">${data.rating}</div>
          <div class="rating-stars">${generateStars(data.rating)}</div>
          <p class="rating-label">総合評価</p>
        </div>

        <div class="pros-cons">
          <div class="pros">
            <h4>良い点</h4>
            <ul>
              ${data.pros.map(p => `<li>${p}</li>`).join('\n              ')}
            </ul>
          </div>
          <div class="cons">
            <h4>気になる点</h4>
            <ul>
              ${data.cons.map(c => `<li>${c}</li>`).join('\n              ')}
            </ul>
          </div>
        </div>

        <h2>実際に使ってみた感想</h2>
        ${data.mainContent}

        <h2>商品の詳細スペック</h2>
        ${data.specifications}

        <h2>こんな人におすすめ</h2>
        ${data.recommendation}

        <h2>まとめ</h2>
        ${data.conclusion}

        <div class="product-info-box" style="text-align: center;">
          <h3 style="margin-bottom: 16px;">${data.productName}</h3>
          <p style="color: var(--text-light); margin-bottom: 24px;">${data.shortDescription}</p>
          <a href="#" class="affiliate-btn" target="_blank" rel="noopener sponsored">
            Amazonで購入する
          </a>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="../index.html" class="logo">
            <span class="logo-icon">🧸</span>
            <span class="site-name">キッズグッズラボ</span>
          </a>
          <p>子育てを、もっと楽しく。実際に使って良かった子供用品を紹介するレビューサイトです。</p>
        </div>
        <div>
          <h4 class="footer-title">カテゴリー</h4>
          <ul class="footer-links">
            <li><a href="index.html">おもちゃ</a></li>
            <li><a href="index.html">ベビー用品</a></li>
            <li><a href="index.html">知育玩具</a></li>
            <li><a href="index.html">外遊び</a></li>
          </ul>
        </div>
        <div>
          <h4 class="footer-title">サイト情報</h4>
          <ul class="footer-links">
            <li><a href="../about.html">運営者情報</a></li>
            <li><a href="../privacy.html">プライバシーポリシー</a></li>
            <li><a href="../contact.html">お問い合わせ</a></li>
          </ul>
        </div>
        <div>
          <h4 class="footer-title">お知らせ</h4>
          <ul class="footer-links">
            <li><a href="#">サイトオープンしました</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; 2024 キッズグッズラボ All Rights Reserved.</p>
        <p style="margin-top: 8px; font-size: 0.8rem;">※当サイトはアフィリエイトプログラムに参加しています。</p>
      </div>
    </div>
  </footer>
  <script src="../js/main.js"></script>
</body>
</html>`;
}

function generateCardHTML(product, data, slug) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  return `
        <article class="product-card" data-category="${product.categoryId}">
          <a href="products/${slug}.html">
            <div class="product-image">
              <span style="font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f8f8;">📦</span>
            </div>
            <div class="product-content">
              <span class="product-category">${product.category}</span>
              <h3 class="product-title">${data.productName}</h3>
              <p class="product-excerpt">${data.shortDescription}</p>
              <div class="product-meta">
                <div class="product-rating">${generateStars(data.rating)}</div>
                <span class="product-date">${dateStr}</span>
              </div>
            </div>
          </a>
        </article>`;
}

async function main() {
  console.log('🚀 記事生成を開始します...\n');

  const productsDir = path.join(__dirname, '../products');
  const generatedArticles = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] ${product.name} を生成中...`);

    try {
      const data = await generateArticle(product);
      const slug = generateSlug(product.name);
      const html = generateHTML(product, data, slug);

      // HTMLファイルを保存
      const filePath = path.join(productsDir, `${slug}.html`);
      fs.writeFileSync(filePath, html, 'utf8');

      generatedArticles.push({ product, data, slug });
      console.log(`   ✓ 保存完了: ${slug}.html`);

      // API制限を避けるため少し待機
      await new Promise(r => setTimeout(r, 2000));

    } catch (error) {
      console.error(`   ✗ エラー: ${error.message}`);
    }
  }

  // products/index.html を更新
  console.log('\n📝 商品一覧ページを更新中...');

  const cardsHTML = generatedArticles.map(({ product, data, slug }) => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    return `
        <article class="product-card" data-category="${product.categoryId}">
          <a href="${slug}.html">
            <div class="product-image">
              <span style="font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f8f8;">📦</span>
            </div>
            <div class="product-content">
              <span class="product-category">${product.category}</span>
              <h3 class="product-title">${data.productName}</h3>
              <p class="product-excerpt">${data.shortDescription}</p>
              <div class="product-meta">
                <div class="product-rating">${generateStars(data.rating)}</div>
                <span class="product-date">${dateStr}</span>
              </div>
            </div>
          </a>
        </article>`;
  }).join('\n');

  // index.html のカード部分用（最新6件）
  const topCardsHTML = generatedArticles.slice(0, 6).map(({ product, data, slug }) => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    return `
        <article class="product-card" data-category="${product.categoryId}">
          <a href="products/${slug}.html">
            <div class="product-image">
              <span style="font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f8f8;">📦</span>
            </div>
            <div class="product-content">
              <span class="product-category">${product.category}</span>
              <h3 class="product-title">${data.productName}</h3>
              <p class="product-excerpt">${data.shortDescription}</p>
              <div class="product-meta">
                <div class="product-rating">${generateStars(data.rating)}</div>
                <span class="product-date">${dateStr}</span>
              </div>
            </div>
          </a>
        </article>`;
  }).join('\n');

  // 結果を出力（手動で更新用）
  fs.writeFileSync(path.join(__dirname, 'generated-cards.html'), cardsHTML, 'utf8');
  fs.writeFileSync(path.join(__dirname, 'generated-top-cards.html'), topCardsHTML, 'utf8');

  console.log('\n✅ 完了！');
  console.log(`   生成された記事: ${generatedArticles.length}件`);
  console.log('   カード用HTML: scripts/generated-cards.html');
  console.log('   トップページ用HTML: scripts/generated-top-cards.html');
}

main().catch(console.error);
