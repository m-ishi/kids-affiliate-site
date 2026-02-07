#!/usr/bin/env node
/**
 * 大量記事生成スクリプト
 *
 * 使用方法:
 *   node mass-generate.js [--start N] [--limit N] [--delay MS]
 *
 * 例:
 *   node mass-generate.js                    # 全件生成
 *   node mass-generate.js --limit 10         # 10件のみ
 *   node mass-generate.js --start 5 --limit 5 # 6件目から5件
 */

const fs = require('fs');
const path = require('path');

// API設定
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BRAVE_API_KEY || !GEMINI_API_KEY) {
  console.error('❌ 環境変数が設定されていません');
  console.error('  export BRAVE_API_KEY="your-key"');
  console.error('  export GEMINI_API_KEY="your-key"');
  process.exit(1);
}

const AMAZON_TAG = 'kidsgoodslab-22';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const CATEGORY_NAMES = {
  toy: 'おもちゃ', baby: 'ベビー用品', educational: '知育玩具',
  consumable: '消耗品', outdoor: '外遊び', furniture: '家具・収納', safety: '安全グッズ'
};

// 商品情報検索
async function searchProduct(productName) {
  const queries = [`${productName} レビュー`, `${productName} Amazon`];
  let allResults = [];

  for (const query of queries) {
    try {
      const response = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
      });
      const data = await response.json();
      if (data.web?.results) {
        allResults = allResults.concat(data.web.results.map(r => ({ title: r.title, description: r.description })));
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { }
  }
  return allResults;
}

// ASIN検索
async function searchASIN(productName) {
  try {
    const response = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`${productName} site:amazon.co.jp`)}&count=3`, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
    });
    const data = await response.json();
    for (const r of (data.web?.results || [])) {
      const m = r.url.match(/\/dp\/([A-Z0-9]{10})/);
      if (m) return m[1];
    }
  } catch (e) { }
  return null;
}

// 記事生成
async function generateArticle(productName, category, searchResults, customTitle) {
  const searchContext = searchResults.map(r => `- ${r.title}: ${r.description}`).join('\n');
  const titleInstruction = customTitle ? `\n# 記事タイトル\n「${customTitle}」\n` : '';

  const prompt = `
# Role: 子育てリサーチ・スペシャリスト
2歳息子と0歳娘を育てる東京在住パパ。徹底リサーチで商品を分析する研究者スタンス。

# 商品: ${productName}
カテゴリー: ${CATEGORY_NAMES[category]}
${titleInstruction}
# リサーチ結果
${searchContext}

# タイトル生成ルール
- 疑問・謎かけ型、数字型、ストーリー型など
- 「おすすめ」「最強」「レビュー」禁止
- 30〜50文字、好奇心を刺激するフック必須

# 出力（JSONのみ）
{
  "title": "キャッチーなタイトル",
  "metaDescription": "SEO説明文（120文字）",
  "excerpt": "概要（50文字）",
  "introduction": "導入HTML（2段落）",
  "brandStory": "企業ストーリーHTML（h3使用）",
  "pros": ["選定理由1", "選定理由2", "選定理由3"],
  "cons": ["注意点1", "注意点2", "注意点3"],
  "mainContent": "詳細分析HTML（h3で3セクション）",
  "specs": "スペック表HTML",
  "recommendation": "おすすめ家庭HTML",
  "conclusion": "結論HTML",
  "rating": "4.5",
  "price": "価格帯",
  "targetAge": "対象年齢",
  "manufacturer": "メーカー"
}`;

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    })
  });

  const data = await response.json();
  if (data.candidates?.[0]) {
    const text = data.candidates[0].content.parts[0].text;
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonMatch = match[1].match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  }
  throw new Error('API応答エラー');
}

// スラグ生成
function generateSlug(name) {
  const map = {
    'パンパース': 'pampers', 'メリーズ': 'merries', 'ムーニー': 'moony', 'グーン': 'goon',
    'アンパンマン': 'anpanman', 'トミカ': 'tomica', 'プラレール': 'plarail', 'レゴ': 'lego',
    'シルバニア': 'sylvanian', 'メルちゃん': 'mell-chan', 'コンビ': 'combi', 'アップリカ': 'aprica',
    'ピジョン': 'pigeon', 'リッチェル': 'richell', 'ボーネルンド': 'bornelund', 'エルゴ': 'ergo',
    'ベビービョルン': 'babybjorn', 'くもん': 'kumon', '学研': 'gakken', 'エドインター': 'edinter',
    'ストライダー': 'strider', 'フィッシャープライス': 'fisher-price', 'タカラトミー': 'takara-tomy',
    'ピープル': 'people', 'カトージ': 'katoji', 'ファミリア': 'familiar', '西松屋': 'nishimatsuya',
    'ニトリ': 'nitori', '無印良品': 'muji', 'IKEA': 'ikea', 'STOKKE': 'stokke', '大和屋': 'yamatoya',
    '和光堂': 'wakodo', '明治': 'meiji', 'キューピー': 'kewpie', 'アイクレオ': 'icreo',
    'ブリヂストン': 'bridgestone', 'パナソニック': 'panasonic', 'Joie': 'joie'
  };
  let s = name.toLowerCase();
  for (const [jp, en] of Object.entries(map)) s = s.replace(new RegExp(jp, 'gi'), en);
  return s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 40) || `product-${Date.now()}`;
}

function generateStars(r) {
  return '★'.repeat(Math.floor(r)) + (r % 1 >= 0.5 ? '☆' : '') + '☆'.repeat(5 - Math.floor(r) - (r % 1 >= 0.5 ? 1 : 0));
}

// HTML生成
function generateHTML(name, category, article, asin, title, slug) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const amazonUrl = asin ? `https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}` : `https://www.amazon.co.jp/s?k=${encodeURIComponent(name)}&tag=${AMAZON_TAG}`;
  const articleTitle = title || article.title || `${name} レビュー`;
  const img = asin
    ? `<a href="${amazonUrl}" target="_blank" rel="noopener sponsored"><img src="https://m.media-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg" alt="${name}" style="max-width:100%;height:auto;display:block;margin:0 auto;" onerror="this.parentElement.innerHTML='📦';"></a>`
    : '📦';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${article.metaDescription}">
  <title>${articleTitle} - キッズグッズラボ</title>
  <link rel="canonical" href="https://kidsgoodslab.com/products/${slug}.html">
  <meta property="og:title" content="${articleTitle} - キッズグッズラボ">
  <meta property="og:description" content="${article.metaDescription}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://kidsgoodslab.com/products/${slug}.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="icon" type="image/png" href="../images/logo.png">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Product","name":"${name}","description":"${article.metaDescription}","brand":{"@type":"Brand","name":"${article.manufacturer}"},"review":{"@type":"Review","reviewRating":{"@type":"Rating","ratingValue":"${article.rating}","bestRating":"5"},"author":{"@type":"Organization","name":"キッズグッズラボ"}}}
  </script>
</head>
<body>
  <header class="header"><div class="container header-inner">
    <a href="../index.html" class="logo"><img src="../images/logo.png" alt="キッズグッズラボ" class="logo-img"></a>
    <nav class="nav-menu">
      <a href="../index.html" class="nav-link">ホーム</a>
      <a href="index.html" class="nav-link">商品レビュー</a>
      <a href="../about.html" class="nav-link">運営者情報</a>
      <a href="../contact.html" class="nav-link">お問い合わせ</a>
    </nav>
    <button class="mobile-menu-btn" aria-label="メニュー"><span></span><span></span><span></span></button>
  </div></header>

  <section class="article-header"><div class="container">
    <div class="article-meta">
      <span class="article-category">${CATEGORY_NAMES[category]}</span>
      <span class="article-date">${date}</span>
    </div>
    <h1 class="article-title">${articleTitle}</h1>
    <p class="article-excerpt">${article.excerpt}</p>
  </div></section>

  <section class="article-content"><div class="container"><div class="article-body">
    <div class="product-info-box">
      <div class="product-image" style="border-radius:var(--radius-md);overflow:hidden;min-height:200px;display:flex;align-items:center;justify-content:center;background:#f8f8f8;font-size:4rem;">
        ${img}
      </div>
      <dl class="product-specs">
        <dt>商品名</dt><dd>${name}</dd>
        <dt>価格</dt><dd>${article.price}</dd>
        <dt>対象年齢</dt><dd>${article.targetAge}</dd>
        <dt>メーカー</dt><dd>${article.manufacturer}</dd>
      </dl>
      <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">Amazonで詳細を見る</a>
    </div>

    <h2>はじめに</h2>${article.introduction}
    <h2>このブランドのストーリー</h2>${article.brandStory || ''}

    <div class="rating-box">
      <div class="rating-score">${article.rating}</div>
      <div class="rating-stars">${generateStars(parseFloat(article.rating))}</div>
      <p class="rating-label">Kids Goods Lab 評価</p>
    </div>

    <div class="pros-cons">
      <div class="pros"><h4>選定理由</h4><ul>${article.pros.map(p => `<li>${p}</li>`).join('')}</ul></div>
      <div class="cons"><h4>検討前の注意点</h4><ul>${article.cons.map(c => `<li>${c}</li>`).join('')}</ul></div>
    </div>

    <h2>Kids Goods Labの分析</h2>${article.mainContent}
    <h2>商品スペック</h2>${article.specs}
    <h2>こんな家庭に向いています</h2>${article.recommendation}
    <h2>Lab責任者からのメッセージ</h2>${article.conclusion}

    <div class="product-info-box" style="text-align:center;">
      <h3 style="margin-bottom:16px;">${name}</h3>
      <p style="color:var(--text-light);margin-bottom:24px;">詳細はAmazonでチェック！</p>
      <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">Amazonで購入する</a>
    </div>
  </div></div></section>

  <footer class="footer"><div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="../index.html" class="logo"><img src="../images/logo.png" alt="キッズグッズラボ" class="logo-img"></a>
        <p>子育てを、もっと楽しく。人気の子供用品を紹介するレビューサイトです。</p>
      </div>
      <div><h4 class="footer-title">カテゴリー</h4><ul class="footer-links"><li><a href="index.html">おもちゃ</a></li><li><a href="index.html">ベビー用品</a></li><li><a href="index.html">知育玩具</a></li><li><a href="index.html">消耗品</a></li></ul></div>
      <div><h4 class="footer-title">サイト情報</h4><ul class="footer-links"><li><a href="../about.html">運営者情報</a></li><li><a href="../privacy.html">プライバシーポリシー</a></li><li><a href="../contact.html">お問い合わせ</a></li></ul></div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 キッズグッズラボ All Rights Reserved.</p>
      <p style="margin-top:8px;font-size:0.8rem;">※当サイトはアフィリエイトプログラムに参加しています。</p>
    </div>
  </div></footer>
  <script src="../js/main.js"></script>
</body>
</html>`;
}

// メイン
async function main() {
  const args = process.argv.slice(2);
  let start = 0, limit = Infinity, delay = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start') start = parseInt(args[++i], 10);
    if (args[i] === '--limit') limit = parseInt(args[++i], 10);
    if (args[i] === '--delay') delay = parseInt(args[++i], 10);
  }

  const queue = JSON.parse(fs.readFileSync(path.join(__dirname, 'mass-generate-queue.json'), 'utf8'));
  const items = queue.slice(start, start + limit);

  console.log(`\n🚀 大量記事生成開始: ${items.length}件\n`);

  const productsDir = path.join(__dirname, '../products');
  let success = 0, fail = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const slug = generateSlug(item.name);
    console.log(`[${i + 1}/${items.length}] ${item.name}`);

    try {
      const search = await searchProduct(item.name);
      const asin = await searchASIN(item.name);
      console.log(`   ASIN: ${asin || 'N/A'}`);

      const article = await generateArticle(item.name, item.category, search, item.title);
      const html = generateHTML(item.name, item.category, article, asin, item.title, slug);

      fs.writeFileSync(path.join(productsDir, `${slug}.html`), html, 'utf8');
      console.log(`   ✅ ${slug}.html\n`);
      success++;

      if (i < items.length - 1) await new Promise(r => setTimeout(r, delay));
    } catch (e) {
      console.log(`   ❌ ${e.message}\n`);
      fail++;
    }
  }

  console.log(`\n🎉 完了！ 成功: ${success} / 失敗: ${fail}\n`);
}

main();
