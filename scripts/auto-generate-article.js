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

// .envファイルから環境変数を読み込み
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

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
const { generateOGP } = require('./generate-ogp-image');
const { getSectionPrompt } = require('./pattern-sections');

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

// リトライ付きBrave API呼び出し
async function fetchBraveWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_API_KEY
        }
      });

      if (response.status === 429) {
        const waitTime = attempt * 3000;
        console.log(`   ⚠️ レート制限 (429)。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Brave API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`   ⚠️ ${error.message}。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
      } else {
        throw error;
      }
    }
  }
  return null;
}

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
      const data = await fetchBraveWithRetry(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5&search_lang=jp&country=jp`);

      if (data && data.web && data.web.results) {
        allResults = allResults.concat(data.web.results.map(r => ({
          title: r.title,
          description: r.description,
          url: r.url
        })));
      }

      // レート制限対策（1秒間隔）
      await new Promise(r => setTimeout(r, 1500));
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
    const data = await fetchBraveWithRetry(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`${productName} site:amazon.co.jp`)}&count=3&search_lang=jp&country=jp`);

    if (data && data.web && data.web.results) {
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

// 記事中盤にCTAを挿入
function insertMidArticleCTAs(content, productName, amazonUrl) {
  const ctaSmall = `
<div style="background:#fff3cd;border:2px solid #ffc107;padding:20px;border-radius:10px;margin:24px 0;text-align:center;">
  <p style="margin:0 0 12px;font-weight:600;">📦 ${productName}をチェック</p>
  <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#ff9900;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Amazonで見る →</a>
</div>`;

  const ctaMedium = `
<div style="background:linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%);padding:24px;border-radius:12px;margin:32px 0;text-align:center;">
  <p style="font-size:1.1rem;font-weight:600;margin-bottom:12px;">🛒 今すぐ価格をチェック！</p>
  <p style="margin-bottom:16px;color:#555;">在庫状況や最新価格はAmazonで確認できます</p>
  <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#4caf50;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:1rem;">${productName}の詳細を見る</a>
</div>`;

  // h2タグで分割
  const sections = content.split(/<h2>/i);
  if (sections.length < 4) return content;

  let result = sections[0];
  for (let i = 1; i < sections.length; i++) {
    result += '<h2>' + sections[i];
    if (i === 2) result += ctaSmall;  // 2番目のh2の後
    if (i === 5) result += ctaMedium; // 5番目のh2の後
  }
  return result;
}

// Gemini APIで記事を生成（パターン別セクション構成・5000-7000文字）
async function generateArticle(productName, category, searchResults, asin, customTitle = null, patternKey = null) {
  console.log(`✍️  Gemini APIで記事生成中...`);
  if (patternKey) console.log(`   📋 パターン: ${patternKey}`);

  const searchContext = searchResults.map(r => `- ${r.title}: ${r.description}`).join('\n');

  const titleInstruction = customTitle
    ? `\n【参考タイトル例】\n${customTitle}\n`
    : '';

  // パターン別のセクション構成を取得
  const sectionPrompt = getSectionPrompt(patternKey || 'reviews', productName);
  const patternInstruction = patternKey
    ? `\n【記事の切り口（パターン）】\nパターン: ${patternKey}\nこのパターンの視点を記事全体に反映させること\n`
    : '';

  const prompt = `
あなたは高CVRアフィリエイト記事の専門ライター「パパラボ」です。
2歳男の子と0歳女の子を育てている子育てパパとして記事を書きます。

【重要：記事の視点ルール】
★「調査・比較・検討」の視点で書く
★「口コミを調べた」「友人に聞いた」「店頭でチェックした」「比較検討した」というスタンス
★購入を検討している人に向けて、調べた情報をまとめる形式

【絶対禁止の表現】
- 「愛用」という単語自体を使わない
- 「我が家で使っています」「うちで使っている」
- 「実際に使ってみた」「使ってみました」
- 「〜ヶ月使った感想」「〜年使った」
- 「リピート」「リピ買い」
- その他「自分や他人が継続使用している」ことを示す表現すべて

【推奨する表現】
- 「口コミを調べてみると」「評判をまとめると」
- 「友人ママに聞いたところ」「ママ友の間では」
- 「店頭で実物をチェックしたら」
- 「比較検討した結果」「調べてわかったこと」
- 「購入を検討している方へ」

【商品情報】
商品名: ${productName}
カテゴリー: ${CATEGORY_NAMES[category]}
${patternInstruction}${titleInstruction}
【参考情報】
${searchContext || '（検索結果なし）'}

【記事構成ルール（9セクション・5000-7000文字厳守）】

★★★ 見出しルール ★★★
- 全ての<h2>見出しは、読者が「読みたい！」と思う具体的で自然な日本語にすること
- 見出しは疑問形、感嘆、具体的な数字を使って興味を引く
- 「導入文」「まとめ」「商品概要」等の抽象的ワードは絶対禁止
- 以下の見出し例は参考。そのまま使わず、内容に合わせてアレンジすること

【パターン専用の記事構成】

${sectionPrompt}
【出力形式】
<title>キャッチーなタイトル（32文字以内）</title>
<excerpt>記事要約（60文字）</excerpt>
<content>
<h2>読者の心を掴む具体的な見出し</h2>
<p>本文...</p>
</content>

【厳守事項】
- 必ず5000文字以上書く
${patternKey ? `- パターン「${patternKey}」の視点を全体に反映\n` : ''}- 具体的なエピソード・数値を必ず含める
- 断定的な表現を使う（「〜かもしれません」より「〜です」）
- ★絶対禁止ワード★ 以下は見出しに使用禁止：
  「導入文」「商品概要」「目次的導入」「事実・データパート」「メインコンテンツ」「実践的アドバイス」「注意点・デメリット」「おすすめな人チェックリスト」「まとめ」「最終判断」「商品の特徴」「データ・比較」「詳細レビュー」
`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 16000,
        }
      })
    });

    const data = await response.json();
    if (data.candidates && data.candidates[0]) {
      const text = data.candidates[0].content.parts[0].text;

      // <title>, <excerpt>, <content> を抽出
      const titleMatch = text.match(/<title>([^<]+)<\/title>/);
      const excerptMatch = text.match(/<excerpt>([^<]+)<\/excerpt>/);
      const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/);

      const title = titleMatch ? titleMatch[1] : `${productName}を徹底解説`;
      const excerpt = excerptMatch ? excerptMatch[1] : `${productName}の選び方と注意点をまとめました`;
      let content = contentMatch ? contentMatch[1].trim() : text;

      // テキスト文字数を計算
      const textContent = content.replace(/<[^>]+>/g, '');
      console.log(`   📊 生成文字数: ${textContent.length}文字`);

      return { title, excerpt, content };
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

// HTMLファイルを生成（9セクション構成対応）
function generateHTML(productName, category, article, asin, customTitle = null) {
  const slug = generateSlug(productName);
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const amazonUrl = asin
    ? `https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`
    : `https://www.amazon.co.jp/s?k=${encodeURIComponent(productName)}&tag=${AMAZON_TAG}`;

  // 優先順位: カスタムタイトル > AI生成タイトル > デフォルト
  const articleTitle = customTitle || article.title || `${productName} レビュー`;
  const excerpt = article.excerpt || `${productName}を徹底解説`;

  // 記事中盤にCTAを挿入
  let articleContent = article.content || '';
  articleContent = insertMidArticleCTAs(articleContent, productName, amazonUrl);

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${excerpt}">
  <title>${articleTitle} - キッズグッズラボ</title>
  <meta property="og:title" content="${articleTitle}">
  <meta property="og:description" content="${excerpt}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://kidsgoodslab.com/images/ogp/${slug}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://kidsgoodslab.com/images/ogp/${slug}.png">
  <link rel="canonical" href="https://kidsgoodslab.com/products/${slug}.html">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="icon" type="image/png" href="../images/logo.png">
</head>
<body>
  <header class="header">
    <div class="container header-inner">
      <a href="../index.html" class="logo"><img src="../images/logo.png" alt="キッズグッズラボ" class="logo-img"></a>
      <nav class="nav-menu">
        <a href="../index.html" class="nav-link">ホーム</a>
        <a href="index.html" class="nav-link">商品レビュー</a>
        <a href="../about.html" class="nav-link">運営者情報</a>
        <a href="../contact.html" class="nav-link">お問い合わせ</a>
      </nav>
      <button class="mobile-menu-btn" aria-label="メニュー"><span></span><span></span><span></span></button>
    </div>
  </header>

  <section class="article-header">
    <div class="container">
      <div class="article-meta">
        <span class="article-category">${CATEGORY_NAMES[category]}</span>
        <span class="article-date">${date}</span>
      </div>
      <h1 class="article-title">${articleTitle}</h1>
      <p class="article-excerpt">${excerpt}</p>
    </div>
  </section>

  <section class="article-content">
    <div class="container">
      <div class="article-body">
        <div class="product-info-card" style="background:#f8f9fa;padding:24px;border-radius:12px;margin-bottom:32px;text-align:center;">
          <a href="${amazonUrl}" target="_blank" rel="noopener sponsored">
            <img src="../images/ogp/${slug}.png" alt="${productName}" style="max-width:280px;height:auto;display:block;margin:0 auto 16px;">
          </a>
          <p style="font-weight:600;margin-bottom:8px;">${productName}</p>
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">Amazonで価格を見る</a>
        </div>

        ${articleContent}

        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px;border-radius:12px;text-align:center;margin:40px 0;">
          <p style="color:#fff;font-size:1.1rem;margin-bottom:16px;font-weight:600;">この商品をAmazonでチェック</p>
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="background:#fff;color:#667eea;font-weight:700;padding:16px 32px;font-size:1.1rem;">
            ${productName}の詳細を見る →
          </a>
        </div>
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
        <p class="footer-copy">&copy; 2026 キッズグッズラボ</p>
        <p style="margin-top:8px;font-size:0.8rem;">※当サイトはアフィリエイトプログラムに参加しています。</p>
      </div>
    </div>
  </footer>
  <script src="../js/main.js"></script>
</body>
</html>`;

  return { html, slug, date, articleTitle };
}

// index.htmlに商品カードを追加
function addToIndex(slug, productName, category, excerpt, rating, indexPath, asin) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');

  // カード用の画像（OGP画像を使用）
  const imgPrefix = indexPath.includes('products') ? '../' : '';
  const ogpExists = fs.existsSync(path.join(__dirname, '..', 'images', 'ogp', `${slug}.png`));
  const cardImageHTML = ogpExists
    ? `<img src="${imgPrefix}images/ogp/${slug}.png" alt="${productName}" style="width: 100%; height: auto; object-fit: cover;">`
    : `<span style="font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f8f8;">📦</span>`;

  const cardHTML = `        <article class="product-card" data-category="${category}">
          <a href="${indexPath.includes('products') ? '' : 'products/'}${slug}.html">
            <div class="product-image">
              ${cardImageHTML}
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
    console.log('使用方法: node auto-generate-article.js "商品名" "カテゴリー" ["記事タイトル"] ["ASIN"] ["パターンキー"]');
    console.log('カテゴリー: toy, baby, educational, consumable, outdoor, furniture, safety');
    console.log('パターンキー: where-to-buy, reviews, lowest-price, coupon, skin-trouble, etc.');
    console.log('');
    console.log('例:');
    console.log('  node auto-generate-article.js "エルゴベビー OMNI 360" "baby"');
    console.log('  node auto-generate-article.js "パンパース" "consumable" "" "B0BYG24S5V" "lowest-price"');
    process.exit(1);
  }

  const [productName, category, customTitle, providedAsin, patternKey] = args;

  if (!CATEGORY_NAMES[category]) {
    console.error(`無効なカテゴリー: ${category}`);
    console.log('有効なカテゴリー:', Object.keys(CATEGORY_NAMES).join(', '));
    process.exit(1);
  }

  console.log(`\n📝 記事生成開始: ${productName}\n`);

  try {
    // 1. 商品情報を検索
    const searchResults = await searchProduct(productName);

    // 2. Amazon ASINを検索（提供済みならスキップ）
    let asin;
    if (providedAsin) {
      console.log(`🛒 ASIN指定あり: ${providedAsin}`);
      asin = providedAsin;
    } else {
      asin = await searchAmazonASIN(productName);
    }

    // 3. 記事を生成
    const article = await generateArticle(productName, category, searchResults, asin, customTitle, patternKey);

    // 4. HTMLファイルを生成
    const { html, slug, date, articleTitle } = generateHTML(productName, category, article, asin, customTitle);

    // 5. OGP画像を生成
    console.log(`🎨 OGP画像を生成中...`);
    try {
      await generateOGP(productName, articleTitle, category, slug);
      console.log(`✅ OGP画像を生成: images/ogp/${slug}.png`);
    } catch (ogpError) {
      console.error(`⚠️ OGP画像生成失敗（記事は作成します）: ${ogpError.message}`);
    }

    // 6. ファイルを保存
    const productsDir = path.join(__dirname, '../products');
    const filePath = path.join(productsDir, `${slug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ 記事を保存: products/${slug}.html`);

    // 7. index.htmlに追加
    const rootIndex = path.join(__dirname, '../index.html');
    const productsIndex = path.join(productsDir, 'index.html');

    const rating = article.rating || '4.5';
    addToIndex(slug, productName, category, article.excerpt, rating, rootIndex, asin);
    addToIndex(slug, productName, category, article.excerpt, rating, productsIndex, asin);
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
