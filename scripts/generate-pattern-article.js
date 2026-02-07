/**
 * パターンベースの記事生成スクリプト
 *
 * 使い方:
 *   node generate-pattern-article.js "商品名" "カテゴリー" "パターン" [ASIN]
 *
 * 例:
 *   node generate-pattern-article.js "パンパース" "consumable" "lowest-price" "B0BYG24S5V"
 *   node generate-pattern-article.js "ストライダー" "outdoor" "age-guide" "B00IZXCB5A"
 *
 * パターン一覧を見る:
 *   node article-patterns.js
 */

const fs = require('fs');
const path = require('path');
const { patterns, generateTitle, getPrompt } = require('./article-patterns');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AFFILIATE_TAG = 'kidsgoodslab-22';

// スラッグ生成用のローマ字マッピング
const romajiMap = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'っ': '',
  'ー': '', '　': '-', ' ': '-'
};

function toRomaji(text) {
  let result = text.toLowerCase();
  // カタカナをひらがなに変換
  result = result.replace(/[\u30A0-\u30FF]/g, char =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
  // ひらがなをローマ字に変換
  for (const [kana, romaji] of Object.entries(romajiMap)) {
    result = result.split(kana).join(romaji);
  }
  // 残りの日本語文字を除去し、英数字とハイフンのみ残す
  result = result.replace(/[^a-z0-9-]/g, '');
  result = result.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return result || 'product';
}

function generateSlug(productName, patternKey) {
  const baseSlug = toRomaji(productName);
  return `${baseSlug}-${patternKey}`;
}

async function searchBrave(query) {
  if (!BRAVE_API_KEY) {
    console.log('BRAVE_API_KEY not set, skipping search');
    return null;
  }

  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { 'X-Subscription-Token': BRAVE_API_KEY }
    });
    const data = await response.json();
    return data.web?.results?.map(r => `${r.title}: ${r.description}`).join('\n') || '';
  } catch (error) {
    console.error('Brave search error:', error.message);
    return null;
  }
}

async function generateArticle(productName, category, patternKey, asin) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const title = generateTitle(category, patternKey, productName);
  const patternPrompt = getPrompt(category, patternKey);

  if (!title || !patternPrompt) {
    throw new Error(`Invalid category "${category}" or pattern "${patternKey}"`);
  }

  console.log(`\n生成するタイトル: ${title}`);
  console.log(`パターン: ${patternPrompt}\n`);

  // Braveで情報収集
  const searchQuery = `${productName} ${patterns[category].patterns[patternKey].name}`;
  console.log(`検索中: ${searchQuery}`);
  const searchResults = await searchBrave(searchQuery);

  const prompt = `
あなたは子育て中のパパ「パパラボ」として、子供用品のレビュー記事を書いています。
2歳の男の子と0歳の女の子がいる設定です。

以下の商品について、指定されたパターンで記事を書いてください。

【商品名】${productName}
【記事タイトル】${title}
【記事の切り口】${patternPrompt}

${searchResults ? `【参考情報】\n${searchResults}` : ''}

【記事の要件】
1. タイトルは必ず「${title}」を使用
2. パパ目線での体験談を交えながら書く
3. SEOを意識し、商品名や関連キーワードを自然に含める
4. 具体的で役立つ情報を提供する
5. 3000〜4000文字程度

【出力形式】
以下の形式でHTMLの記事本文を出力してください（headやbodyタグは不要）:

<excerpt>記事の要約（50文字程度）</excerpt>

<content>
<h2>見出し1</h2>
<p>本文...</p>

<h2>見出し2</h2>
<p>本文...</p>
（以下続く）
</content>
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 8000 }
    })
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Failed to generate article: ' + JSON.stringify(data));
  }

  return { title, content: text };
}

function createHTML(title, excerpt, content, category, asin, slug) {
  const categoryJa = {
    'food': '食品',
    'furniture': '家具・収納',
    'educational': '知育玩具',
    'consumable': '消耗品',
    'outdoor': '外遊び',
    'baby': 'ベビー用品',
    'safety': '安全グッズ'
  }[category] || 'ベビー用品';

  const date = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');

  const imageHTML = asin
    ? `<a href="https://www.amazon.co.jp/dp/${asin}?tag=${AFFILIATE_TAG}" target="_blank" rel="noopener sponsored">
              <img src="https://m.media-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg" alt="${title}" style="max-width:100%;height:auto;display:block;margin:0 auto;" onerror="this.parentElement.innerHTML='📦';">
            </a>`
    : '<span style="font-size:4rem;display:flex;align-items:center;justify-content:center;height:200px;background:#f8f8f8;">📦</span>';

  const affiliateBtn = asin
    ? `<div style="text-align:center;margin:32px 0;">
          <a href="https://www.amazon.co.jp/dp/${asin}?tag=${AFFILIATE_TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored">
            Amazonで詳細を見る
          </a>
        </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${excerpt}">
  <title>${title} - キッズグッズラボ</title>

  <meta property="og:title" content="${title} - キッズグッズラボ">
  <meta property="og:description" content="${excerpt}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://kidsgoodslab.com/products/${slug}.html">

  <link rel="canonical" href="https://kidsgoodslab.com/products/${slug}.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="icon" type="image/png" href="../images/logo.png">
</head>
<body>
  <header class="header">
    <div class="container header-inner">
      <a href="../index.html" class="logo">
        <img src="../images/logo.png" alt="キッズグッズラボ" class="logo-img">
      </a>
      <nav class="nav-menu">
        <a href="../index.html" class="nav-link">ホーム</a>
        <a href="index.html" class="nav-link">商品レビュー</a>
        <a href="../about.html" class="nav-link">運営者情報</a>
        <a href="../contact.html" class="nav-link">お問い合わせ</a>
      </nav>
      <button class="mobile-menu-btn" aria-label="メニュー">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <section class="article-header">
    <div class="container">
      <div class="article-meta">
        <span class="article-category">${categoryJa}</span>
        <span class="article-date">${date}</span>
      </div>
      <h1 class="article-title">${title}</h1>
      <p class="article-excerpt">${excerpt}</p>
    </div>
  </section>

  <section class="article-content">
    <div class="container">
      <div class="article-body">
        <div class="product-info-card">
          <div class="product-image" style="border-radius:var(--radius-md);overflow:hidden;">
            ${imageHTML}
          </div>
        </div>

        ${content}

        ${affiliateBtn}
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-logo">キッズグッズラボ</div>
        <nav class="footer-nav">
          <a href="../about.html">運営者情報</a>
          <a href="../contact.html">お問い合わせ</a>
          <a href="../privacy.html">プライバシーポリシー</a>
        </nav>
        <p class="footer-copy">&copy; 2025 キッズグッズラボ All Rights Reserved.</p>
        <p class="footer-affiliate">※当サイトはアフィリエイトプログラムに参加しています</p>
      </div>
    </div>
  </footer>
  <script src="../js/main.js"></script>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('使い方: node generate-pattern-article.js "商品名" "カテゴリー" "パターン" [ASIN]');
    console.log('\nカテゴリー: food, furniture, educational, consumable, outdoor, baby, safety');
    console.log('\nパターン一覧を見るには: node article-patterns.js');
    process.exit(1);
  }

  const [productName, category, patternKey, asin] = args;

  if (!patterns[category]) {
    console.error(`エラー: カテゴリー "${category}" が見つかりません`);
    console.log('有効なカテゴリー:', Object.keys(patterns).join(', '));
    process.exit(1);
  }

  if (!patterns[category].patterns[patternKey]) {
    console.error(`エラー: パターン "${patternKey}" が見つかりません`);
    console.log(`${category} の有効なパターン:`, Object.keys(patterns[category].patterns).join(', '));
    process.exit(1);
  }

  console.log(`\n=== 記事生成開始 ===`);
  console.log(`商品: ${productName}`);
  console.log(`カテゴリー: ${category} (${patterns[category].name})`);
  console.log(`パターン: ${patternKey} (${patterns[category].patterns[patternKey].name})`);
  if (asin) console.log(`ASIN: ${asin}`);

  try {
    const { title, content } = await generateArticle(productName, category, patternKey, asin);

    // 記事本文を抽出
    const excerptMatch = content.match(/<excerpt>([\s\S]*?)<\/excerpt>/);
    const contentMatch = content.match(/<content>([\s\S]*?)<\/content>/);

    const excerpt = excerptMatch ? excerptMatch[1].trim() : `${productName}を徹底解説！`;
    const articleContent = contentMatch ? contentMatch[1].trim() : content;

    const slug = generateSlug(productName, patternKey);
    const html = createHTML(title, excerpt, articleContent, category, asin, slug);

    const outputPath = path.join(__dirname, '..', 'products', `${slug}.html`);
    fs.writeFileSync(outputPath, html, 'utf8');

    console.log(`\n✅ 記事を生成しました: ${outputPath}`);
    console.log(`タイトル: ${title}`);

    // インデックス更新
    console.log('\nインデックスを更新中...');
    require('./rebuild-index.js');

  } catch (error) {
    console.error('エラー:', error.message);
    process.exit(1);
  }
}

main();
