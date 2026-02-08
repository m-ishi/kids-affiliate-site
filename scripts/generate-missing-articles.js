/**
 * 検証済み商品で記事がないものを生成
 * 6000-8000文字の高CVR構成
 * Brave API: 秒1件制限
 */

const fs = require('fs');
const path = require('path');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AFFILIATE_TAG = 'kidsgoodslab-22';

const productsDir = '/Users/masa/kids-affiliate-site/products';
const verifiedProducts = require('./verified-products.json');

// 既存記事のASINを取得
function getExistingAsins() {
  const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');
  const asins = new Set();

  for (const file of files) {
    const content = fs.readFileSync(path.join(productsDir, file), 'utf8');
    const match = content.match(/images\/P\/([A-Z0-9]+)/);
    if (match) asins.add(match[1]);
  }

  return asins;
}

// スラッグ生成（ユニーク化）
function generateSlug(name, asin) {
  const romajiMap = {
    'パンパース': 'pampers', 'メリーズ': 'merries', 'ムーニー': 'moony', 'グーン': 'goon',
    'マミーポコ': 'mamypoko', 'ピジョン': 'pigeon', 'コンビ': 'combi', 'アップリカ': 'aprica',
    'エルゴベビー': 'ergobaby', 'ベビービョルン': 'babybjorn', 'サイベックス': 'cybex',
    'リッチェル': 'richell', 'ストライダー': 'strider', 'レゴ': 'lego', 'トミカ': 'tomica',
    'プラレール': 'plarail', 'アンパンマン': 'anpanman', 'シルバニア': 'sylvanian',
    'メルちゃん': 'mellchan', 'くもん': 'kumon', 'ボーネルンド': 'bornelund',
    'フィッシャープライス': 'fisherprice', '和光堂': 'wakodo', 'キューピー': 'kewpie',
    'アイクレオ': 'icreo', 'ほほえみ': 'hohoemi', 'はいはい': 'haihai', 'すこやか': 'sukoyaka',
    'ファルスカ': 'farska', 'サンデシカ': 'sandesica', 'スイマーバ': 'swimava',
    'コニー': 'konny', 'Joie': 'joie', 'INTEX': 'intex', '日本育児': 'nihon-ikuji',
    'おしりふき': 'wipes', '哺乳': 'bottle', '搾乳': 'pump', '抱っこ': 'carrier',
    'ベビーカー': 'stroller', 'チャイルドシート': 'carseat', 'バウンサー': 'bouncer',
    'ベビーバス': 'bath', 'ゲート': 'gate', 'デュプロ': 'duplo', 'コンテナ': 'container',
  };

  let slug = name.toLowerCase();
  for (const [jp, en] of Object.entries(romajiMap)) {
    slug = slug.replace(new RegExp(jp, 'gi'), en);
  }
  slug = slug.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  // ASINの末尾4文字を追加してユニーク化
  return `${slug}-${asin.slice(-4).toLowerCase()}`;
}

// Brave検索
async function searchBrave(query) {
  if (!BRAVE_API_KEY) return '';

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=jp`;
    const response = await fetch(url, {
      headers: { 'X-Subscription-Token': BRAVE_API_KEY }
    });
    if (!response.ok) return '';
    const data = await response.json();
    return data.web?.results?.map(r => `${r.title}: ${r.description}`).join('\n') || '';
  } catch (e) {
    return '';
  }
}

// カテゴリー別の重視ポイント
const categoryFocus = {
  'food': '安全性・成分・食べない時の対策・月齢別の使い方',
  'consumable': '最安値比較・肌トラブル対策・コスパ・使用感',
  'baby': '使いやすさ・安全性・コスパ・実際の使用シーン',
  'furniture': 'サイズ・車や部屋への適合性・デメリット・長期使用感',
  'educational': '知育効果・対象年齢・飽きずに遊べるか・コスパ',
  'outdoor': '安全性・対象年齢・収納・メンテナンス',
  'safety': '必要性・設置のしやすさ・賃貸対応・代替品との比較',
};

// Gemini記事生成（高CVR構成）
async function generateArticle(product, searchResults) {
  const focus = categoryFocus[product.category] || '使いやすさ・コスパ・安全性';

  const prompt = `
あなたは高CVRアフィリエイト記事の専門ライターです。
子育て中のパパ「パパラボ」として、2歳男の子と0歳女の子を育てている設定で記事を書きます。

【商品情報】
商品名: ${product.name}
カテゴリー: ${product.category}
ASIN: ${product.asin}
重視ポイント: ${focus}

【参考情報】
${searchResults || '（検索結果なし）'}

【記事構成（9セクション厳守・6000-8000文字）】

1. 導入文（リード文）300-400文字
   - 結論を最速で提示（この商品の最大の特徴・誰に最適か）
   - 読者の悩みを代弁（「〇〇で困っていませんか？」）
   - この記事を読むメリットを明示

2. 商品概要 200-300文字
   - 商品の基本情報（何ができる商品か）
   - 価格帯の目安
   - Amazonでの評価概要

3. 目次的な全体像 100-150文字
   - この記事で分かることを箇条書きで予告

4. 事実情報パート（スペック・比較）600-800文字
   - 具体的な数値（サイズ、重量、対象年齢など）
   - 競合商品との比較表（あれば）
   - 公式の特徴・技術

5. ベネフィット説明（メイン）1500-2000文字
   - 機能ではなく「生活がどう変わるか」
   - 具体的な使用シーン（朝の準備、夜の寝かしつけ等）
   - パパ目線の体験談風エピソード
   - 「抽象→具体」「悩み→解決」の流れ

6. 使い方のコツ・工夫 600-800文字
   - 初心者がつまずきやすいポイント
   - より効果的に使う方法
   - 先輩パパママの知恵

7. デメリット・注意点（正直レビュー）500-700文字
   - 合わない人・環境を明示
   - 「買わない理由」をあえて出す（信頼構築）
   - 対処法があれば併記

8. こんな人におすすめ（ターゲット再定義）300-400文字
   - 「これは私向けだ」と確信させる
   - 具体的なペルソナ像
   - チェックリスト形式も可

9. まとめ 300-400文字
   - 要点の再整理（3-5個の箇条書き）
   - 最後の背中押し
   - 購入を迷っている人への一言

【出力形式】HTMLで出力してください。
<title>キャッチーな記事タイトル（疑問形や数字を含む、32文字以内）</title>
<excerpt>記事の要約（60文字程度）</excerpt>
<content>
<h2>セクション見出し</h2>
<p>本文...</p>
<!-- 各セクションをh2で区切る -->
</content>

【重要な注意点】
- 必ず6000文字以上書くこと
- 具体的なエピソードや数値を入れること
- 「〜かもしれません」より「〜です」と断定的に
- 読者の不安を先回りして解消すること
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 16000 }
    })
  });

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// HTML生成
function createHTML(product, title, excerpt, content, slug) {
  const categoryJa = {
    'food': '食品', 'furniture': '家具・収納', 'educational': '知育玩具',
    'consumable': '消耗品', 'outdoor': '外遊び', 'baby': 'ベビー用品', 'safety': '安全グッズ'
  }[product.category] || 'ベビー用品';

  const date = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${excerpt}">
  <title>${title} - キッズグッズラボ</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${excerpt}">
  <meta property="og:type" content="article">
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
        <div class="product-info-card" style="background:#f8f9fa;padding:24px;border-radius:12px;margin-bottom:32px;text-align:center;">
          <a href="https://www.amazon.co.jp/dp/${product.asin}?tag=${AFFILIATE_TAG}" target="_blank" rel="noopener sponsored">
            <img src="https://m.media-amazon.com/images/P/${product.asin}.09.LZZZZZZZ.jpg" alt="${product.name}" style="max-width:280px;height:auto;display:block;margin:0 auto 16px;" onerror="this.style.display='none';">
          </a>
          <p style="font-weight:600;margin-bottom:8px;">${product.name}</p>
          <a href="https://www.amazon.co.jp/dp/${product.asin}?tag=${AFFILIATE_TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;">Amazonで価格を見る</a>
        </div>

        ${content}

        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px;border-radius:12px;text-align:center;margin:40px 0;">
          <p style="color:#fff;font-size:1.1rem;margin-bottom:16px;font-weight:600;">この商品をAmazonでチェック</p>
          <a href="https://www.amazon.co.jp/dp/${product.asin}?tag=${AFFILIATE_TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="background:#fff;color:#667eea;font-weight:700;padding:16px 32px;font-size:1.1rem;">
            ${product.name}の詳細を見る →
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
        <p class="footer-copy">&copy; 2025 キッズグッズラボ</p>
      </div>
    </div>
  </footer>
  <script src="../js/main.js"></script>
</body>
</html>`;
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY が必要です');
    process.exit(1);
  }

  const existingAsins = getExistingAsins();
  const missingProducts = verifiedProducts.filter(p => !existingAsins.has(p.asin));

  console.log(`=== 高CVR記事生成（6000-8000文字） ===`);
  console.log(`既存記事: ${existingAsins.size}件`);
  console.log(`検証済み商品: ${verifiedProducts.length}件`);
  console.log(`生成が必要: ${missingProducts.length}件\n`);

  if (missingProducts.length === 0) {
    console.log('全ての検証済み商品に記事があります');
    return;
  }

  // 生成数制限（オプション）
  const limit = parseInt(process.argv[2]) || missingProducts.length;
  const toGenerate = missingProducts.slice(0, limit);

  console.log(`生成する記事数: ${toGenerate.length}件\n`);

  let generated = 0;
  for (const product of toGenerate) {
    console.log(`[${generated + 1}/${toGenerate.length}] ${product.name}`);

    // Brave検索（秒1件制限）
    console.log('  検索中...');
    const searchResults = await searchBrave(`${product.name} レビュー 口コミ メリット デメリット`);
    await new Promise(r => setTimeout(r, 1100)); // 1秒待機

    // 記事生成
    console.log('  生成中（6000-8000文字）...');
    const result = await generateArticle(product, searchResults);

    if (!result) {
      console.log('  ❌ 生成失敗');
      continue;
    }

    // パース
    const titleMatch = result.match(/<title>([^<]+)<\/title>/);
    const excerptMatch = result.match(/<excerpt>([^<]+)<\/excerpt>/);
    const contentMatch = result.match(/<content>([\s\S]*?)<\/content>/);

    const title = titleMatch ? titleMatch[1] : `${product.name}レビュー`;
    const excerpt = excerptMatch ? excerptMatch[1] : `${product.name}を徹底レビュー`;
    const content = contentMatch ? contentMatch[1].trim() : result;

    // 文字数カウント
    const textContent = content.replace(/<[^>]+>/g, '');
    console.log(`  文字数: ${textContent.length}文字`);

    const slug = generateSlug(product.name, product.asin);
    const html = createHTML(product, title, excerpt, content, slug);

    const outputPath = path.join(productsDir, `${slug}.html`);
    fs.writeFileSync(outputPath, html, 'utf8');

    console.log(`  ✅ 保存: ${slug}.html`);
    generated++;

    // Gemini制限対策
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== 完了 ===`);
  console.log(`生成: ${generated}件`);

  // インデックス再構築
  console.log('\nインデックス更新中...');
  require('./rebuild-index.js');
}

main().catch(console.error);
