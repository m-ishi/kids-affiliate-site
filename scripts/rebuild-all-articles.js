#!/usr/bin/env node
/**
 * 全記事再生成スクリプト
 *
 * rebuild-queue.json の全記事をパターン別セクション構成で再生成する
 * 既存記事を上書きし、OGP画像も再生成する
 *
 * 使用方法:
 *   node rebuild-all-articles.js [--start N] [--limit N] [--dry-run]
 *
 *   --start N   : N番目から開始（0始まり、デフォルト0）
 *   --limit N   : N件だけ処理（デフォルト全件）
 *   --dry-run   : 実際のAPI呼び出しを行わず、処理対象のみ表示
 */

const fs = require('fs');
const path = require('path');
const { generateOGP } = require('./generate-ogp-image');
const { getSectionPrompt } = require('./pattern-sections');

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

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AMAZON_TAG = 'kidsgoodslab-22';

if (!BRAVE_API_KEY || !GEMINI_API_KEY) {
  console.error('❌ 環境変数が設定されていません');
  console.error('  export BRAVE_API_KEY="your-key"');
  console.error('  export GEMINI_API_KEY="your-key"');
  process.exit(1);
}

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const OGP_DIR = path.join(__dirname, '..', 'images', 'ogp');

const CATEGORY_NAMES = {
  toy: 'おもちゃ',
  baby: 'ベビー用品',
  educational: '知育玩具',
  consumable: '消耗品',
  outdoor: '外遊び',
  furniture: '家具・収納',
  safety: '安全グッズ',
  food: '食品',
};

// 進捗ファイル
const PROGRESS_FILE = path.join(__dirname, 'rebuild-progress.json');

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { completed: [], failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

// リトライ付きBrave API
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
        const waitTime = attempt * 5000;
        console.log(`      ⚠️ レート制限。${waitTime / 1000}秒待機... (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      if (!response.ok) throw new Error(`Brave API: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 3000;
        console.log(`      ⚠️ ${error.message}。リトライ... (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
      } else {
        throw error;
      }
    }
  }
  return null;
}

// Brave Search
async function searchProduct(productName) {
  const queries = [
    `${productName} レビュー 口コミ`,
    `${productName} Amazon 価格`,
    `${productName} メリット デメリット`
  ];
  let allResults = [];
  for (const query of queries) {
    try {
      const data = await fetchBraveWithRetry(
        `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5&search_lang=jp&country=jp`
      );
      if (data && data.web && data.web.results) {
        allResults = allResults.concat(data.web.results.map(r => ({
          title: r.title,
          description: r.description,
          url: r.url
        })));
      }
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.log(`      ⚠️ 検索エラー: ${error.message}`);
    }
  }
  return allResults;
}

// 記事中盤CTA挿入
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

  const sections = content.split(/<h2>/i);
  if (sections.length < 4) return content;

  let result = sections[0];
  for (let i = 1; i < sections.length; i++) {
    result += '<h2>' + sections[i];
    if (i === 2) result += ctaSmall;
    if (i === 5) result += ctaMedium;
  }
  return result;
}

// Gemini API で記事生成
async function generateArticle(productName, category, searchResults, patternKey) {
  const searchContext = searchResults.map(r => `- ${r.title}: ${r.description}`).join('\n');
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
カテゴリー: ${CATEGORY_NAMES[category] || category}
${patternInstruction}
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
    const titleMatch = text.match(/<title>([^<]+)<\/title>/);
    const excerptMatch = text.match(/<excerpt>([^<]+)<\/excerpt>/);
    const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/);

    const title = titleMatch ? titleMatch[1] : `${productName}を徹底解説`;
    const excerpt = excerptMatch ? excerptMatch[1] : `${productName}の選び方と注意点をまとめました`;
    let content = contentMatch ? contentMatch[1].trim() : text;

    const textContent = content.replace(/<[^>]+>/g, '');
    return { title, excerpt, content, charCount: textContent.length };
  }
  if (data.error) {
    throw new Error(`Gemini APIエラー: ${JSON.stringify(data.error)}`);
  }
  throw new Error('Gemini APIからの応答を解析できません');
}

// HTML生成
function buildHTML(slug, productName, category, article, asin) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const amazonUrl = asin
    ? `https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`
    : `https://www.amazon.co.jp/s?k=${encodeURIComponent(productName)}&tag=${AMAZON_TAG}`;

  const articleTitle = article.title;
  const excerpt = article.excerpt;
  let articleContent = insertMidArticleCTAs(article.content, productName, amazonUrl);

  return `<!DOCTYPE html>
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
        <span class="article-category">${CATEGORY_NAMES[category] || category}</span>
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
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  let startIdx = 0;
  let limit = Infinity;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i + 1]) startIdx = parseInt(args[i + 1], 10);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[i + 1], 10);
    if (args[i] === '--dry-run') dryRun = true;
  }

  // キューを読み込み
  const queue = JSON.parse(fs.readFileSync(path.join(__dirname, 'rebuild-queue.json'), 'utf8'));
  const progress = loadProgress();

  // 完了済みをスキップ
  const remaining = queue.filter(q => !progress.completed.includes(q.slug));
  const toProcess = remaining.slice(startIdx, startIdx + limit);

  console.log('');
  console.log('🔄 全記事再生成スクリプト');
  console.log('='.repeat(60));
  console.log(`📋 総記事数: ${queue.length}`);
  console.log(`✅ 完了済み: ${progress.completed.length}`);
  console.log(`❌ 失敗: ${progress.failed.length}`);
  console.log(`📝 今回処理: ${toProcess.length}件 (${startIdx}番目から)`);
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('\n🏃 ドライラン（実行しません）\n');
    toProcess.forEach((item, i) => {
      console.log(`[${i + 1}] ${item.slug} | ${item.productName} | ${item.category} | ${item.patternKey}`);
    });
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const num = progress.completed.length + i + 1;
    console.log(`\n[${num}/${queue.length}] ${item.productName}`);
    console.log(`   📁 ${item.slug}.html | 📂 ${item.category} | 🏷️ ${item.patternKey}`);

    try {
      // 1. Brave検索
      console.log(`   🔍 Brave検索中...`);
      const searchResults = await searchProduct(item.productName);
      console.log(`   📊 ${searchResults.length}件の検索結果`);

      // 2. Gemini で記事生成
      console.log(`   ✍️  Gemini記事生成中...`);
      const article = await generateArticle(item.productName, item.category, searchResults, item.patternKey);
      console.log(`   📝 ${article.charCount}文字生成`);

      // 3. HTML構築
      const html = buildHTML(item.slug, item.productName, item.category, article, item.asin);

      // 4. OGP画像生成
      console.log(`   🎨 OGP画像生成中...`);
      try {
        await generateOGP(item.productName, article.title, item.category, item.slug);
      } catch (ogpErr) {
        console.log(`   ⚠️ OGP画像生成失敗: ${ogpErr.message}`);
      }

      // 5. ファイル保存
      const filePath = path.join(PRODUCTS_DIR, `${item.slug}.html`);
      fs.writeFileSync(filePath, html, 'utf8');
      console.log(`   ✅ 保存完了: products/${item.slug}.html`);

      // 進捗記録
      progress.completed.push(item.slug);
      saveProgress(progress);
      successCount++;

      // API制限対策
      if (i < toProcess.length - 1) {
        const waitSec = 8;
        console.log(`   ⏳ ${waitSec}秒待機...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
      }

    } catch (error) {
      console.log(`   ❌ エラー: ${error.message}`);
      progress.failed.push({ slug: item.slug, error: error.message, time: new Date().toISOString() });
      saveProgress(progress);
      failCount++;

      // エラー時も少し待機
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🎉 バッチ処理完了！`);
  console.log(`   ✅ 成功: ${successCount}件`);
  console.log(`   ❌ 失敗: ${failCount}件`);
  console.log(`   📊 全体進捗: ${progress.completed.length}/${queue.length}件`);

  if (progress.completed.length >= queue.length) {
    console.log('\n🏁 全記事の再生成が完了しました！');
    console.log('次のステップ:');
    console.log('  node rebuild-index.js   # インデックス再構築');
    console.log('  node update-sitemap.js  # サイトマップ更新');
    console.log('  git add -A && git commit -m "全記事をパターン別構成で再生成" && git push');
  } else {
    console.log(`\n📌 残り${queue.length - progress.completed.length}件。続行するには:`);
    console.log('  node rebuild-all-articles.js');
  }
}

main().catch(err => {
  console.error('💀 致命的エラー:', err.message);
  process.exit(1);
});
