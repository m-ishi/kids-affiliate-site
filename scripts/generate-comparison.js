#!/usr/bin/env node
/**
 * 比較記事生成スクリプト
 *
 * 使用方法:
 *   node generate-comparison.js "商品1" "商品2" ["商品3"] "カテゴリー"
 *
 * 例:
 *   node generate-comparison.js "パンパース さらさらケア" "メリーズ ファーストプレミアム" "ムーニー エアフィット" "consumable"
 *   node generate-comparison.js "エルゴベビー OMNI 360" "ベビービョルン ONE KAI" "baby"
 */

const fs = require('fs');
const path = require('path');

// API設定
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BRAVE_API_KEY || !GEMINI_API_KEY) {
  console.error('❌ 環境変数が設定されていません');
  console.error('以下を設定してください:');
  console.error('  export BRAVE_API_KEY="your-key"');
  console.error('  export GEMINI_API_KEY="your-key"');
  process.exit(1);
}

const AMAZON_TAG = 'kidsgoodslab-22';
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const CATEGORY_NAMES = {
  toy: 'おもちゃ',
  baby: 'ベビー用品',
  educational: '知育玩具',
  consumable: '消耗品',
  outdoor: '外遊び',
  furniture: '家具・収納',
  safety: '安全グッズ'
};

// Brave Search APIで商品情報を検索
async function searchProducts(products) {
  console.log(`🔍 商品情報を検索中...`);
  const results = {};

  for (const product of products) {
    results[product] = { search: [], asin: null };

    // 商品情報検索
    const queries = [
      `${product} レビュー 口コミ`,
      `${product} 比較 特徴`
    ];

    for (const query of queries) {
      try {
        const response = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=3`, {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': BRAVE_API_KEY
          }
        });

        const data = await response.json();
        if (data.web && data.web.results) {
          results[product].search = results[product].search.concat(
            data.web.results.map(r => ({
              title: r.title,
              description: r.description
            }))
          );
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        console.error(`   検索エラー (${product}): ${error.message}`);
      }
    }

    // ASIN検索
    try {
      const response = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`${product} site:amazon.co.jp`)}&count=2`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_API_KEY
        }
      });

      const data = await response.json();
      if (data.web && data.web.results) {
        for (const result of data.web.results) {
          const asinMatch = result.url.match(/\/dp\/([A-Z0-9]{10})/);
          if (asinMatch) {
            results[product].asin = asinMatch[1];
            break;
          }
        }
      }
    } catch (error) {
      console.error(`   ASIN検索エラー (${product}): ${error.message}`);
    }

    console.log(`   ✓ ${product} (ASIN: ${results[product].asin || 'N/A'})`);
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

// Gemini APIで比較記事を生成
async function generateComparison(products, category, searchResults) {
  console.log(`✍️  Gemini APIで比較記事生成中...`);

  let searchContext = '';
  for (const [product, data] of Object.entries(searchResults)) {
    searchContext += `\n## ${product}\n`;
    searchContext += data.search.map(r => `- ${r.title}: ${r.description}`).join('\n');
  }

  const prompt = `
# Role: 究極の「子育てリサーチ・スペシャリスト」パパブロガー
あなたは、2歳（息子）と0歳（娘）の育児に奮闘する東京在住のパパです。
複数商品を徹底比較し、読者が自分に合った商品を選べるよう導くガイド記事を作成します。

# Mission
「結局どれがいいの？」という読者の疑問に、明確な基準と根拠を持って答える比較記事を作成する。

# 比較する商品
${products.join('、')}
カテゴリー: ${CATEGORY_NAMES[category]}

# リサーチ結果
${searchContext}

# タイトル生成ルール
以下のパターンでクリックしたくなるタイトルを生成:
- 「〇〇 vs △△ vs □□。徹底比較で見えた"本当の違い"」
- 「3大〇〇を比較。子育てパパが選ぶべき1つとは？」
- 「〇〇選びで後悔しないために。3商品を本気で比べてみた」

# 記事構成（比較ページ専用）
1. **導入**: なぜこの比較が必要なのか（読者の悩みに共感）
2. **比較早見表**: 一目で違いが分かる表
3. **各商品の詳細**: それぞれの特徴・メリット・デメリット
4. **選び方ガイド**: 「こんな人には〇〇」形式の提案
5. **結論**: Lab責任者としての明確な推薦

# 出力形式
以下のJSON形式で出力してください（JSONのみ、他のテキストは不要）:

{
  "title": "キャッチーな比較記事タイトル（40〜60文字）",
  "metaDescription": "SEO用の説明文（120文字以内）",
  "excerpt": "記事の概要（50文字以内）",
  "introduction": "導入文（HTML形式、2段落程度）",
  "comparisonTable": "比較表（HTML table形式、項目：商品名、価格帯、対象年齢、特徴、おすすめ度）",
  "products": [
    {
      "name": "商品名1",
      "rating": "4.5",
      "price": "価格帯",
      "targetAge": "対象年齢",
      "summary": "一言で表す特徴",
      "pros": ["メリット1", "メリット2", "メリット3"],
      "cons": ["デメリット1", "デメリット2"],
      "bestFor": "こんな人におすすめ",
      "detailHTML": "詳細説明（HTML形式、3段落程度）"
    }
  ],
  "selectionGuide": "選び方ガイド（HTML形式、条件別のおすすめを記載）",
  "conclusion": "結論：どれを選ぶべきか（HTML形式、明確な推薦を含む）",
  "winner": "総合的におすすめの商品名（1つ）"
}
`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 10000,
        }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0]) {
      const text = data.candidates[0].content.parts[0].text;
      let jsonStr = text;
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
    if (data.error) {
      console.error('Gemini APIエラー:', data.error);
    }
    throw new Error('Gemini APIからの応答を解析できません');
  } catch (error) {
    throw error;
  }
}

// 星評価を生成
function generateStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '☆' : '') + '☆'.repeat(5 - full - half);
}

// HTMLファイルを生成
function generateHTML(products, category, article, searchResults) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');

  // 各商品の詳細セクションを生成
  let productDetails = '';
  let ctaButtons = '';

  for (const product of article.products) {
    const searchData = searchResults[product.name] || {};
    const amazonUrl = searchData.asin
      ? `https://www.amazon.co.jp/dp/${searchData.asin}?tag=${AMAZON_TAG}`
      : `https://www.amazon.co.jp/s?k=${encodeURIComponent(product.name)}&tag=${AMAZON_TAG}`;

    const isWinner = product.name === article.winner;

    productDetails += `
        <div class="comparison-product-card">
          <h3>${product.name}${isWinner ? '<span class="winner-badge">おすすめNo.1</span>' : ''}</h3>
          <div class="product-rating">
            <span class="rating-score">${product.rating}</span>
            <span class="rating-stars">${generateStars(parseFloat(product.rating))}</span>
          </div>
          <p><strong>価格帯:</strong> ${product.price} / <strong>対象:</strong> ${product.targetAge}</p>
          <p><strong>特徴:</strong> ${product.summary}</p>

          <div class="comparison-pros-cons">
            <div class="pros">
              <h4>良い点</h4>
              <ul>
                ${product.pros.map(p => `<li>${p}</li>`).join('\n                ')}
              </ul>
            </div>
            <div class="cons">
              <h4>注意点</h4>
              <ul>
                ${product.cons.map(c => `<li>${c}</li>`).join('\n                ')}
              </ul>
            </div>
          </div>

          <p><strong>こんな人におすすめ:</strong> ${product.bestFor}</p>

          ${product.detailHTML}

          <div style="text-align: center; margin-top: 16px;">
            <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">
              ${product.name}をAmazonで見る
            </a>
          </div>
        </div>`;

    ctaButtons += `
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">
            ${product.name}
          </a>`;
  }

  // スラグ生成（日本語対応）
  const romanize = {
    'パンパース': 'pampers', 'メリーズ': 'merries', 'ムーニー': 'moony',
    'グーン': 'goon', 'エルゴ': 'ergo', 'ベビービョルン': 'babybjorn',
    'コンビ': 'combi', 'アップリカ': 'aprica', 'ピジョン': 'pigeon',
    'リッチェル': 'richell', 'トミカ': 'tomica', 'レゴ': 'lego',
    'アンパンマン': 'anpanman', 'シルバニア': 'sylvanian'
  };

  const slug = products.map(p => {
    let s = p.toLowerCase();
    for (const [jp, en] of Object.entries(romanize)) {
      s = s.replace(new RegExp(jp, 'gi'), en);
    }
    return s.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 20).replace(/-+$/, '');
  }).filter(s => s).join('-vs-') || `comparison-${Date.now()}`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${article.metaDescription}">
  <title>${article.title} - キッズグッズラボ</title>

  <meta property="og:title" content="${article.title} - キッズグッズラボ">
  <meta property="og:description" content="${article.metaDescription}">
  <meta property="og:type" content="article">

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
        <span class="article-category">${CATEGORY_NAMES[category]}</span>
        <span class="article-date">${date}</span>
      </div>
      <h1 class="article-title">${article.title}</h1>
      <p class="article-excerpt">${article.excerpt}</p>
    </div>
  </section>

  <section class="article-content">
    <div class="container">
      <div class="article-body">

        <h2>はじめに</h2>
        ${article.introduction}

        <h2>比較早見表</h2>
        <div class="comparison-table-wrapper">
          ${article.comparisonTable}
        </div>

        <h2>各商品の詳細</h2>
        ${productDetails}

        <h2>あなたに合った選び方</h2>
        <div class="selection-guide">
          ${article.selectionGuide}
        </div>

        <h2>Lab責任者の結論</h2>
        ${article.conclusion}

        <div class="comparison-cta">
          ${ctaButtons}
        </div>

      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="../index.html" class="logo">
            <img src="../images/logo.png" alt="キッズグッズラボ" class="logo-img">
          </a>
          <p>子育てを、もっと楽しく。人気の子供用品を紹介するレビューサイトです。</p>
        </div>
        <div>
          <h4 class="footer-title">カテゴリー</h4>
          <ul class="footer-links">
            <li><a href="index.html">おもちゃ</a></li>
            <li><a href="index.html">ベビー用品</a></li>
            <li><a href="index.html">知育玩具</a></li>
            <li><a href="index.html">消耗品</a></li>
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
      </div>
      <div class="footer-bottom">
        <p>&copy; 2026 キッズグッズラボ All Rights Reserved.</p>
        <p style="margin-top: 8px; font-size: 0.8rem;">※当サイトはアフィリエイトプログラムに参加しています。</p>
      </div>
    </div>
  </footer>

  <script src="../js/main.js"></script>
</body>
</html>`;

  return { html, slug };
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('使用方法: node generate-comparison.js "商品1" "商品2" ["商品3"] "カテゴリー"');
    console.log('カテゴリー: toy, baby, educational, consumable, outdoor, furniture, safety');
    console.log('');
    console.log('例:');
    console.log('  node generate-comparison.js "パンパース" "メリーズ" "ムーニー" "consumable"');
    process.exit(1);
  }

  const category = args[args.length - 1];
  const products = args.slice(0, -1);

  if (!CATEGORY_NAMES[category]) {
    console.error(`無効なカテゴリー: ${category}`);
    console.log('有効なカテゴリー:', Object.keys(CATEGORY_NAMES).join(', '));
    process.exit(1);
  }

  console.log(`\n📝 比較記事生成開始`);
  console.log(`   商品: ${products.join(' vs ')}`);
  console.log(`   カテゴリー: ${CATEGORY_NAMES[category]}\n`);

  try {
    // 1. 商品情報を検索
    const searchResults = await searchProducts(products);

    // 2. 比較記事を生成
    const article = await generateComparison(products, category, searchResults);

    // 3. HTMLファイルを生成
    const { html, slug } = generateHTML(products, category, article, searchResults);

    // 4. ファイルを保存
    const productsDir = path.join(__dirname, '../products');
    const filePath = path.join(productsDir, `${slug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');

    console.log(`\n🎉 完了！`);
    console.log(`ファイル: products/${slug}.html`);
    console.log(`タイトル: ${article.title}`);

  } catch (error) {
    console.error(`\n❌ エラー: ${error.message}`);
    process.exit(1);
  }
}

main();
