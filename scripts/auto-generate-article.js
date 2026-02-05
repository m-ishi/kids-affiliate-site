#!/usr/bin/env node
/**
 * 自動記事生成スクリプト
 *
 * 使用方法:
 *   node auto-generate-article.js "商品名" "カテゴリー" ["記事タイトル"]
 *
 * 例:
 *   node auto-generate-article.js "エルゴベビー OMNI 360" "baby"
 *   node auto-generate-article.js "エルゴベビー OMNI 360" "baby" "なぜエルゴじゃなく『あのブランド』なのか？開発秘話を知って、僕が娘に選んだ抱っこ紐の正体。"
 *
 * カテゴリー: toy, baby, educational, consumable, outdoor, furniture, safety
 */

const fs = require('fs');
const path = require('path');

// API設定
// APIキーは環境変数から取得（セキュリティのため）
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
async function searchProduct(productName) {
  console.log(`🔍 Brave APIで検索中: ${productName}`);

  const queries = [
    `${productName} レビュー 口コミ`,
    `${productName} Amazon 価格`,
    `${productName} メリット デメリット`
  ];

  let allResults = [];

  for (const query of queries) {
    try {
      const response = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_API_KEY
        }
      });

      const data = await response.json();
      if (data.web && data.web.results) {
        allResults = allResults.concat(data.web.results.map(r => ({
          title: r.title,
          description: r.description,
          url: r.url
        })));
      }

      // レート制限対策
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`検索エラー: ${error.message}`);
    }
  }

  console.log(`   ${allResults.length}件の検索結果を取得`);
  return allResults;
}

// Amazon ASINを検索
async function searchAmazonASIN(productName) {
  console.log(`🛒 Amazon ASINを検索中...`);

  try {
    const response = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`${productName} site:amazon.co.jp`)}&count=3`, {
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
          console.log(`   ASIN: ${asinMatch[1]}`);
          return asinMatch[1];
        }
      }
    }
  } catch (error) {
    console.error(`ASIN検索エラー: ${error.message}`);
  }

  return null;
}

// Gemini APIで記事を生成
async function generateArticle(productName, category, searchResults, asin, customTitle = null) {
  console.log(`✍️  Gemini APIで記事生成中...`);

  const searchContext = searchResults.map(r => `- ${r.title}: ${r.description}`).join('\n');

  const titleInstruction = customTitle
    ? `\n# 記事タイトル（この雰囲気・切り口で執筆すること）\n「${customTitle}」\n`
    : '';

  const prompt = `
# Role: 究極の「子育てリサーチ・スペシャリスト」パパブロガー
あなたは、2歳（息子）と0歳（娘）の育児に奮闘する東京在住のパパです。
単なる紹介者ではなく、「自分の家族にとって最高の一品を見つけるために、企業の歴史から海外のレビューまで徹底的に調べ尽くす研究者（Lab責任者）」というスタンスで執筆してください。

# Mission
読者が「自分で調べる手間が省けた！これなら安心して買える」と即決できるレベルの、納得感とストーリー性のある記事を作成する。

# Context & Principles
- **実体験レビューは書かない**: 実際に使用した嘘をつくのではなく、「なぜこれを選定候補の筆頭にしたのか」「スペックや背景から何が予見できるか」という「プロの選定眼」で語る。
- **ストーリーを重視**: 企業の創業秘話、開発者の想い、製品が誕生した背景を必ず含め、ブランドへの信頼感を醸成する。
- **2人の子供の存在**: 「元気すぎる2歳の息子ならこうなるはず」「繊細な0歳の娘にはここが助かる」といった、具体的な生活シーンを想像して書く。
- **誠実なベネフィット提示**: 良い点だけでなく、スペックから読み取れる「人によってはデメリットになる部分（サイズ感、価格、メンテナンス性など）」を正直に伝える。

# 記事を書く商品
商品名: ${productName}
カテゴリー: ${CATEGORY_NAMES[category]}
${titleInstruction}
# リサーチ結果
${searchContext}

# Output Structure（この構造でHTMLを生成）
1. **導入：子育ての「あるある」悩みから開始**
   （例：東京の狭い玄関でベビーカーが邪魔になる問題など、具体的シーンから）
2. **物語：この製品・企業の知られざるストーリー**
   （なぜこの製品は作られたのか？企業のこだわりは何か？）
3. **分析：Kids Goods Labによる3つの選定理由**
   （リサーチに基づいた客観的メリットと、パパ目線の主観的期待値）
4. **正直な考察：検討前に知っておくべき「注意点」**
   （「こういう家庭には合わないかも」という誠実なアドバイス）
5. **結論：迷っている背中を優しく押す一言**
   （「僕なら、明日の朝の笑顔のためにこれを選びます」など）

# Tone & Style
- 親しみやすいが、知的なパパ（敬語、時々少しだけ感傷的）。
- 「最高」「最強」といった安易な言葉は避け、「〇〇の課題を解決する最適解」といった論理的な表現を好む。
- 読者に寄り添いつつも、プロとして断言すべきところは断言する。

# Constraints
- 未使用の商品を「使った」と嘘をつかないこと。
- 「徹底的に調べた結果、確信している」というスタンスを貫くこと。

# 出力形式
以下のJSON形式で出力してください（JSONのみ、他のテキストは不要）:

{
  "metaDescription": "SEO用の説明文（120文字以内）",
  "excerpt": "記事の概要（50文字以内）",
  "introduction": "導入：子育ての悩みから開始（HTML形式、2-3段落）",
  "brandStory": "物語：企業・製品のストーリー（HTML形式、h3タグ使用）",
  "pros": ["選定理由1", "選定理由2", "選定理由3"],
  "cons": ["注意点1", "注意点2", "注意点3"],
  "mainContent": "分析：詳細な選定理由（HTML形式、h3タグで3セクション）",
  "specs": "商品スペック（HTML tableタグ形式）",
  "recommendation": "こんな家庭におすすめ / 合わないかもしれない家庭（HTML形式）",
  "conclusion": "結論：背中を押す一言（HTML形式、感傷的でも良い）",
  "rating": "4.5",
  "price": "価格帯（例：約3,000円〜5,000円）",
  "targetAge": "対象年齢（例：3歳〜）",
  "manufacturer": "メーカー名"
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
          maxOutputTokens: 8192,
        }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0]) {
      const text = data.candidates[0].content.parts[0].text;
      // JSONを抽出（コードブロック内のJSONにも対応）
      let jsonStr = text;
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          console.error('JSON解析エラー:', parseError.message);
          console.error('受信したテキスト:', text.substring(0, 500));
        }
      }
    }
    if (data.error) {
      console.error('Gemini APIエラー:', data.error);
    }
    throw new Error('Gemini APIからの応答を解析できません');
  } catch (error) {
    console.error(`記事生成エラー: ${error.message}`);
    throw error;
  }
}

// ファイル名を生成（SEOフレンドリー）
function generateSlug(productName) {
  // 日本語をローマ字に変換する簡易マッピング
  const romanize = {
    'パンパース': 'pampers',
    'メリーズ': 'merries',
    'ムーニー': 'moony',
    'グーン': 'goon',
    'マミーポコ': 'mamypoko',
    'レゴ': 'lego',
    'デュプロ': 'duplo',
    'アンパンマン': 'anpanman',
    'トミカ': 'tomica',
    'プラレール': 'plarail',
    'シルバニア': 'sylvanian',
    'コンビ': 'combi',
    'アップリカ': 'aprica',
    'ピジョン': 'pigeon',
    'リッチェル': 'richell',
    'ストライダー': 'strider',
    'ボーネルンド': 'bornelund',
    'ベビービョルン': 'babybjorn',
    'エルゴ': 'ergo',
    'こどもちゃれんじ': 'kodomo-challenge',
    'しまじろう': 'shimajiro',
    'くもん': 'kumon',
    '学研': 'gakken',
    'さらさら': 'sarasara',
    'まっさらさら': 'sarasara',
    'テープ': 'tape',
    'パンツ': 'pants',
  };

  let slug = productName.toLowerCase();

  // 既知の単語を置換
  for (const [jp, en] of Object.entries(romanize)) {
    slug = slug.replace(new RegExp(jp, 'gi'), en);
  }

  // 残りの日本語や特殊文字を処理
  slug = slug
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  // 空の場合はタイムスタンプ
  if (!slug || slug === '-') {
    slug = `product-${Date.now()}`;
  }

  return slug;
}

// 星評価を生成
function generateStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '☆' : '') + '☆'.repeat(5 - full - half);
}

// HTMLファイルを生成
function generateHTML(productName, category, article, asin, customTitle = null) {
  const slug = generateSlug(productName);
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const amazonUrl = asin
    ? `https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`
    : `https://www.amazon.co.jp/s?k=${encodeURIComponent(productName)}&tag=${AMAZON_TAG}`;

  const articleTitle = customTitle || `${productName} レビュー`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${article.metaDescription}">
  <title>${articleTitle} - キッズグッズラボ</title>

  <meta property="og:title" content="${articleTitle} - キッズグッズラボ">
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
      <h1 class="article-title">${articleTitle}</h1>
      <p class="article-excerpt">${article.excerpt}</p>
    </div>
  </section>

  <section class="article-content">
    <div class="container">
      <div class="article-body">
        <div class="product-info-box">
          <div class="product-image" style="border-radius: var(--radius-md); overflow: hidden;">
            <span style="font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 200px; background: #f8f8f8;">📦</span>
          </div>
          <dl class="product-specs">
            <dt>商品名</dt>
            <dd>${productName}</dd>
            <dt>価格</dt>
            <dd>${article.price}</dd>
            <dt>対象年齢</dt>
            <dd>${article.targetAge}</dd>
            <dt>メーカー</dt>
            <dd>${article.manufacturer}</dd>
          </dl>
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">
            Amazonで詳細を見る
          </a>
        </div>

        <h2>はじめに</h2>
        ${article.introduction}

        <h2>このブランドのストーリー</h2>
        ${article.brandStory || ''}

        <div class="rating-box">
          <div class="rating-score">${article.rating}</div>
          <div class="rating-stars">${generateStars(parseFloat(article.rating))}</div>
          <p class="rating-label">Kids Goods Lab 評価</p>
        </div>

        <div class="pros-cons">
          <div class="pros">
            <h4>選定理由</h4>
            <ul>
              ${article.pros.map(p => `<li>${p}</li>`).join('\n              ')}
            </ul>
          </div>
          <div class="cons">
            <h4>検討前の注意点</h4>
            <ul>
              ${article.cons.map(c => `<li>${c}</li>`).join('\n              ')}
            </ul>
          </div>
        </div>

        <h2>Kids Goods Labの分析</h2>
        ${article.mainContent}

        <h2>商品スペック</h2>
        ${article.specs}

        <h2>こんな家庭に向いています</h2>
        ${article.recommendation}

        <h2>Lab責任者からのメッセージ</h2>
        ${article.conclusion}

        <div class="product-info-box" style="text-align: center;">
          <h3 style="margin-bottom: 16px;">${productName}</h3>
          <p style="color: var(--text-light); margin-bottom: 24px;">詳細はAmazonでチェック！</p>
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">
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

  return { html, slug, date };
}

// index.htmlに商品カードを追加
function addToIndex(slug, productName, category, excerpt, rating, indexPath) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');

  const cardHTML = `        <article class="product-card" data-category="${category}">
          <a href="${indexPath.includes('products') ? '' : 'products/'}${slug}.html">
            <div class="product-image">
              <span style="font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f8f8;">📦</span>
            </div>
            <div class="product-content">
              <span class="product-category">${CATEGORY_NAMES[category]}</span>
              <h3 class="product-title">${productName}</h3>
              <p class="product-excerpt">${excerpt}</p>
              <div class="product-meta">
                <div class="product-rating">${generateStars(parseFloat(rating))}</div>
                <span class="product-date">${date}</span>
              </div>
            </div>
          </a>
        </article>`;

  let indexContent = fs.readFileSync(indexPath, 'utf8');

  // products-gridの最後に追加
  const gridEndMatch = indexContent.match(/([ \t]*)<\/div>\s*<\/div>\s*<\/section>\s*<!-- About Section|<!-- No Results|<!-- Footer/);
  if (gridEndMatch) {
    const insertPos = indexContent.lastIndexOf('</article>', gridEndMatch.index) + '</article>'.length;
    indexContent = indexContent.slice(0, insertPos) + '\n' + cardHTML + indexContent.slice(insertPos);
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    return true;
  }

  return false;
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('使用方法: node auto-generate-article.js "商品名" "カテゴリー" ["記事タイトル"]');
    console.log('カテゴリー: toy, baby, educational, consumable, outdoor, furniture, safety');
    console.log('');
    console.log('例:');
    console.log('  node auto-generate-article.js "エルゴベビー OMNI 360" "baby"');
    console.log('  node auto-generate-article.js "エルゴベビー OMNI 360" "baby" "開発秘話を知って、僕が娘に選んだ抱っこ紐"');
    process.exit(1);
  }

  const [productName, category, customTitle] = args;

  if (!CATEGORY_NAMES[category]) {
    console.error(`無効なカテゴリー: ${category}`);
    console.log('有効なカテゴリー:', Object.keys(CATEGORY_NAMES).join(', '));
    process.exit(1);
  }

  console.log(`\n📝 記事生成開始: ${productName}\n`);

  try {
    // 1. 商品情報を検索
    const searchResults = await searchProduct(productName);

    // 2. Amazon ASINを検索
    const asin = await searchAmazonASIN(productName);

    // 3. 記事を生成
    const article = await generateArticle(productName, category, searchResults, asin, customTitle);

    // 4. HTMLファイルを生成
    const { html, slug, date } = generateHTML(productName, category, article, asin, customTitle);

    // 5. ファイルを保存
    const productsDir = path.join(__dirname, '../products');
    const filePath = path.join(productsDir, `${slug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ 記事を保存: products/${slug}.html`);

    // 6. index.htmlに追加
    const rootIndex = path.join(__dirname, '../index.html');
    const productsIndex = path.join(productsDir, 'index.html');

    addToIndex(slug, productName, category, article.excerpt, article.rating, rootIndex);
    addToIndex(slug, productName, category, article.excerpt, article.rating, productsIndex);
    console.log('✅ インデックスページを更新');

    console.log(`\n🎉 完了！\n`);
    console.log(`ファイル: products/${slug}.html`);
    console.log(`Amazon URL: https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`);

  } catch (error) {
    console.error(`\n❌ エラー: ${error.message}`);
    process.exit(1);
  }
}

main();
