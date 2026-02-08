/**
 * 統合記事生成システム
 * 商品選定 → パターン選定 → 高CVR構成で記事生成
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { patterns, getPrompt } = require('./article-patterns');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AFFILIATE_TAG = 'kidsgoodslab-22';

const productsDir = '/Users/masa/kids-affiliate-site/products';
const verifiedProducts = require('./verified-products.json');

// カテゴリーマッピング（verified-products → article-patterns）
const categoryMapping = {
  'consumable': 'consumable',
  'food': 'food',
  'baby': 'baby',
  'furniture': 'furniture',
  'educational': 'educational',
  'outdoor': 'outdoor',
  'safety': 'safety'
};

// ========================================
// パターン適合判断（ルールベース + AI）
// ========================================

// subcat別の除外パターン（明らかに不適合なもの）
const excludePatternsBySubcat = {
  // 消耗品系 - 修理・お下がり・中古は不適合
  'diapers': ['repair', 'hand-me-down', 'used', 'rent-vs-buy', 'warranty', 'model-comparison', 'storage'],
  'wipes': ['repair', 'hand-me-down', 'used', 'rent-vs-buy', 'warranty', 'model-comparison', 'storage', 'size-check'],
  'care': ['repair', 'hand-me-down', 'used', 'rent-vs-buy', 'warranty', 'size-check'],

  // 食品系 - 修理・収納・サイズは不適合
  'formula': ['repair', 'hand-me-down', 'used', 'storage', 'size-check', 'cleaning', 'rent-vs-buy', 'warranty'],
  'babyfood': ['repair', 'hand-me-down', 'used', 'storage', 'size-check', 'cleaning', 'rent-vs-buy', 'warranty', 'skin-trouble'],

  // 哺乳瓶・授乳系
  'feeding': ['hand-me-down', 'used', 'rent-vs-buy', 'skin-trouble', 'size-check'],

  // 抱っこ紐系
  'carrier': ['skin-trouble', 'when-to-start', 'quantity'],

  // ベビーカー・チャイルドシート
  'stroller': ['skin-trouble', 'when-to-start', 'quantity', 'cleaning'],
  'carseat': ['skin-trouble', 'when-to-start', 'quantity', 'cleaning'],

  // バウンサー・スイング
  'bouncer': ['skin-trouble', 'when-to-start', 'quantity'],
  'swing': ['skin-trouble', 'when-to-start', 'quantity'],
  'bed': ['skin-trouble', 'quantity'],
  'bedding': ['quantity', 'repair'],

  // お風呂系
  'bath': ['quantity', 'when-to-start', 'repair'],

  // 安全グッズ
  'gate': ['skin-trouble', 'when-to-start', 'quantity', 'seasonal'],
  'cushion': ['skin-trouble', 'when-to-start', 'rent-vs-buy', 'warranty', 'model-comparison'],

  // 知育玩具系 - 肌トラブル・いつから不要なものも
  'blocks': ['skin-trouble', 'quantity', 'seasonal', 'when-to-start'],
  'learning': ['skin-trouble', 'quantity', 'seasonal'],
  'vehicle': ['skin-trouble', 'quantity', 'seasonal', 'when-to-start'],
  'dollhouse': ['skin-trouble', 'quantity', 'seasonal', 'when-to-start'],
  'doll': ['skin-trouble', 'quantity', 'seasonal'],

  // 外遊び系
  'bike': ['skin-trouble', 'quantity', 'when-to-start', 'cleaning'],
  'ride': ['skin-trouble', 'quantity', 'when-to-start'],
  'pool': ['skin-trouble', 'quantity', 'repair', 'hand-me-down', 'used', 'rent-vs-buy'],
};

// 製品とパターンの適合度をルールで判定
function isPatternSuitableByRule(product, patternKey) {
  const excludeList = excludePatternsBySubcat[product.subcat] || [];
  return !excludeList.includes(patternKey);
}

// AI判断（微妙なケース用）
async function checkPatternRelevanceAI(product, patternKey, patternName) {
  if (!GEMINI_API_KEY) return true; // APIなければスキップ

  const prompt = `
以下の製品と記事パターンの組み合わせが適切かどうか判断してください。

製品: ${product.name}
カテゴリー: ${product.category} / ${product.subcat}
記事パターン: ${patternKey} (${patternName})

この組み合わせで価値のある記事が書けますか？
「はい」または「いいえ」だけで回答してください。
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 10 }
      })
    });
    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || '';
    return answer.includes('はい') || answer.includes('yes');
  } catch (e) {
    return true; // エラー時はスキップしない
  }
}

// 総合判断（ルール → AI）
async function isPatternSuitable(product, patternKey, patternName, useAI = false) {
  // まずルールベースで判断
  if (!isPatternSuitableByRule(product, patternKey)) {
    return false;
  }
  // ルールをパスしたら、必要に応じてAI判断
  if (useAI) {
    return await checkPatternRelevanceAI(product, patternKey, patternName);
  }
  return true;
}

// ========================================

// パターン別の追加プロンプト
const patternPrompts = {
  'where-to-buy': '販売店舗、ネット通販、価格比較、在庫状況に焦点を当てる',
  'reviews': '口コミ分析、良い評判・悪い評判の両面、リアルな声を重視',
  'coupon': 'クーポン情報、セール時期、ポイント還元、お得な買い方に焦点',
  'regret': '購入後の後悔ポイント、デメリット、向かない人を正直に解説',
  'lowest-price': '価格比較、1枚/1個あたり単価、定期便、まとめ買いを重視',
  'skin-trouble': '肌トラブル対策、敏感肌対応、アトピー児の使用感を重視',
  'size-check': 'サイズ詳細、車・部屋への適合性、設置スペースを重視',
  'comparison': '競合商品との比較表、スペック比較、選び方のポイント',
  'effect': '知育効果、成長への影響、遊んだ結果の変化を重視',
  'age-guide': '対象年齢、年齢別の遊び方・使い方、卒業時期を重視',
  'safety': '安全対策、事故防止、必要な装備を重視',
  'when-to-start': '開始時期、月齢別の使い方、量の目安を重視',
  'quantity': '必要数量、消費ペース、まとめ買いの目安を重視',
  'cleaning': 'お手入れ方法、洗い方、カビ・臭い対策を重視',
  'until-when': '使用期限、卒業のサイン、次のステップを重視',
  'hand-me-down': 'お下がり可否、衛生面、使い回しのコツを重視',
  'used': '中古相場、メルカリ購入の注意点、売却のコツを重視',
  'gift': 'ギフト適性、ラッピング、贈る際のマナーを重視',
  'authentic': '偽物の見分け方、正規品購入先、並行輸入リスクを重視',
  'repair': '修理方法、パーツ入手先、メンテナンス方法を重視',
  'how-to-use': '使い方のコツ、セットアップ、裏ワザを重視',
  'necessity': '必要性の検討、代用品、なくても良いケースを重視',
  'seasonal': '季節別の使い方、暑さ・寒さ対策を重視',
  'warranty': '保証内容、故障対応、返品条件を重視',
  'model-comparison': '新旧モデル比較、型落ちのメリットを重視',
  'rent-vs-buy': 'レンタルvs購入、コスパ比較を重視',
  'alternative': '代用品、100均比較、本物の価値を重視',
  'storage': '収納方法、省スペース、片付けのコツを重視',
  'tips': '実用テクニック、アレンジ、裏ワザを重視',
};

// スラッグ生成
function generateSlug(productName, patternKey, asin) {
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
    'おしりふき': 'wipes', 'ナチュラル': 'natural', 'さらさら': 'sarasara',
    'バランスミルク': 'balance', 'ベビーフード': 'babyfood', 'グーグーキッチン': 'googoo',
    '母乳実感': 'bonyujikkan', 'テテオ': 'teteo', '搾乳器': 'pump',
    'OMNI': 'omni', 'Breeze': 'breeze', 'ADAPT': 'adapt', 'MINI': 'mini',
    'コアラ': 'koala', 'スゴカル': 'sugocal', 'ラクーナ': 'rakuna', 'メリオ': 'melio',
    'ランフィ': 'runfee', 'クルムーヴ': 'culmove', 'フラディア': 'fladea', 'チルト': 'tilt',
    'シローナ': 'sirona', 'バウンサー': 'bouncer', 'Bliss': 'bliss', 'ネムリラ': 'nemulila',
    'ユラリズム': 'yurarizm', 'ベッドインベッド': 'bedinbed', '抱っこ布団': 'dakkobuton',
    'ふかふか': 'fukafuka', 'ベビーバス': 'babybath', 'うきわ': 'ukiwa', 'スマートゲイト': 'smartgate',
    'ベビーガード': 'babyguard', 'コーナーガード': 'cornerguard', 'デュプロ': 'duplo',
    'ブロックラボ': 'blocklab', 'くるくるチャイム': 'kurukuruchime', 'バイリンガル': 'bilingual',
    'マグフォーマー': 'magformers', 'スポーツモデル': 'sport', '14x': '14x',
    'よくばりビジーカー': 'busycar', 'プール': 'pool', 'ベーシック': 'basic', '道路セット': 'road',
    '赤い屋根': 'redroot', 'お人形セット': 'doll', '綿棒': 'menbo',
  };

  let slug = productName.toLowerCase();
  for (const [jp, en] of Object.entries(romajiMap)) {
    slug = slug.replace(new RegExp(jp, 'gi'), en);
  }
  slug = slug.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-${patternKey}`;
}

// Brave検索
async function searchBrave(query) {
  if (!BRAVE_API_KEY) return '';
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=jp`;
    const response = await fetch(url, { headers: { 'X-Subscription-Token': BRAVE_API_KEY } });
    if (!response.ok) return '';
    const data = await response.json();
    return data.web?.results?.map(r => `${r.title}: ${r.description}`).join('\n') || '';
  } catch (e) { return ''; }
}

// パターン別タイトル生成
function generatePatternTitle(productName, patternKey, category) {
  const cat = patterns[category];
  if (!cat || !cat.patterns[patternKey]) return `${productName}レビュー`;
  const titles = cat.patterns[patternKey].titles;
  const template = titles[Math.floor(Math.random() * titles.length)];
  return template.replace(/\[商品名\]/g, productName);
}

// 高CVR記事生成
async function generateArticle(product, patternKey, searchResults) {
  const category = categoryMapping[product.category] || 'baby';
  const patternInfo = patterns[category]?.patterns[patternKey];
  const patternFocus = patternPrompts[patternKey] || '';
  const patternDesc = patternInfo?.prompt || '';
  const suggestedTitle = generatePatternTitle(product.name, patternKey, category);

  const prompt = `
あなたは高CVRアフィリエイト記事の専門ライター「パパラボ」です。
2歳男の子と0歳女の子を育てている子育てパパとして記事を書きます。

【商品情報】
商品名: ${product.name}
カテゴリー: ${product.category}

【記事の切り口（パターン）】
パターン: ${patternKey}
狙い: ${patternDesc}
重視ポイント: ${patternFocus}

【参考タイトル例】
${suggestedTitle}

【参考情報】
${searchResults || '（検索結果なし）'}

【記事構成ルール（9セクション・6000-8000文字厳守）】

このパターン「${patternKey}」に最適化しつつ、以下の構成で書いてください。

★★★ 見出しルール ★★★
- 全ての<h2>見出しは、読者が「読みたい！」と思う具体的で自然な日本語にすること
- 見出しは疑問形、感嘆、具体的な数字を使って興味を引く
- 「導入文」「まとめ」「商品概要」等の抽象的ワードは絶対禁止

【構成と見出し例】

1. 冒頭パート（300-400文字）
   見出し例：
   - 「夜中のオムツ漏れ、もう限界…そんなあなたに朗報です」
   - 「正直、最初は半信半疑でした」
   - 「2歳児のパパが本音で語る${product.name}」

2. 商品紹介（200-300文字）
   見出し例：
   - 「そもそも${product.name}って何がすごいの？」
   - 「他のオムツと何が違う？3つのポイント」
   - 「売れてる理由、調べてみました」

3. 記事の内容予告（100-150文字）
   見出し例：
   - 「この記事で分かる5つのこと」
   - 「読む前に知っておきたいポイント」

4. 数字で見る比較（600-800文字）
   見出し例：
   - 「価格・枚数・1枚あたり単価を徹底比較！」
   - 「ドラッグストア vs Amazon、どっちが安い？」
   - 「サイズ別の選び方、表で一発解決」

5. 体験レビュー（1500-2000文字）
   見出し例：
   - 「3ヶ月使い続けてわかった"リアルな感想"」
   - 「深夜2時のオムツ替え、救われた話」
   - 「ぶっちゃけ、ここが良かった・ダメだった」

6. 使い方のコツ（600-800文字）
   見出し例：
   - 「先輩パパママに聞いた！失敗しないコツ5選」
   - 「知らないと損する裏ワザ、教えます」
   - 「初めて使う人へ、これだけは守って！」

7. 注意点（500-700文字）
   見出し例：
   - 「買う前に知っておきたいデメリット3つ」
   - 「こんな人には正直おすすめしません」
   - 「我が家で起きたトラブルと対処法」

8. おすすめチェック（300-400文字）
   見出し例：
   - 「当てはまったら買い！チェックリスト」
   - 「${product.name}が向いてる人、向いてない人」

9. 結論（300-400文字）
   見出し例：
   - 「で、結局買いなの？パパの最終結論」
   - 「迷っているなら、これだけ覚えて帰って」
   - 「1年使った今、もう一度買うか？→答えはYES」

【出力形式】
<title>キャッチーなタイトル（32文字以内）</title>
<excerpt>記事要約（60文字）</excerpt>
<content>
<h2>読者の心を掴む具体的な見出し</h2>
<p>本文...</p>
</content>

【厳守事項】
- 必ず6000文字以上書く
- パターン「${patternKey}」の視点を全体に反映
- 具体的なエピソード・数値を必ず含める
- 断定的な表現を使う（「〜かもしれません」より「〜です」）
- ★絶対禁止ワード★ 以下は見出しに使用禁止：
  「導入文」「商品概要」「目次的導入」「事実・データパート」「メインコンテンツ」「実践的アドバイス」「注意点・デメリット」「おすすめな人チェックリスト」「まとめ」「最終判断」「商品の特徴」「データ・比較」「詳細レビュー」
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

// 記事中盤にCTAを挿入
function insertMidArticleCTAs(content, product) {
  const ctaSmall = `
<div style="background:#fff3cd;border:2px solid #ffc107;padding:20px;border-radius:10px;margin:24px 0;text-align:center;">
  <p style="margin:0 0 12px;font-weight:600;">📦 ${product.name}をチェック</p>
  <a href="https://www.amazon.co.jp/dp/${product.asin}?tag=${AFFILIATE_TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#ff9900;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Amazonで見る →</a>
</div>`;

  const ctaMedium = `
<div style="background:linear-gradient(135deg,#e8f5e9 0%,#c8e6c9 100%);padding:24px;border-radius:12px;margin:32px 0;text-align:center;">
  <p style="font-size:1.1rem;font-weight:600;margin-bottom:12px;">🛒 今すぐ価格をチェック！</p>
  <p style="margin-bottom:16px;color:#555;">在庫状況や最新価格はAmazonで確認できます</p>
  <a href="https://www.amazon.co.jp/dp/${product.asin}?tag=${AFFILIATE_TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#4caf50;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:1rem;">${product.name}の詳細を見る</a>
</div>`;

  // h2タグで分割
  const sections = content.split(/<h2>/i);
  if (sections.length < 4) return content;

  // 2番目のセクションの後にCTA挿入
  let result = sections[0];
  for (let i = 1; i < sections.length; i++) {
    result += '<h2>' + sections[i];
    if (i === 2) result += ctaSmall;  // 2番目のh2の後
    if (i === 5) result += ctaMedium; // 5番目のh2の後
  }
  return result;
}

// ランダム日付生成（過去2ヶ月で分散）
function getRandomDate() {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 60); // 0〜59日前
  const randomDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return randomDate.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
}

// HTML生成
function createHTML(product, title, excerpt, content, slug) {
  const categoryJa = {
    'food': '食品', 'furniture': '家具・収納', 'educational': '知育玩具',
    'consumable': '消耗品', 'outdoor': '外遊び', 'baby': 'ベビー用品', 'safety': '安全グッズ'
  }[product.category] || 'ベビー用品';

  const date = getRandomDate();

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
          <a href="https://www.amazon.co.jp/dp/${product.asin}?tag=${AFFILIATE_TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored">Amazonで価格を見る</a>
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

// 既存記事チェック
function getExistingArticles() {
  const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');
  return new Set(files.map(f => f.replace('.html', '')));
}

// メイン実行
async function main() {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY が必要です');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const mode = args[0] || 'auto';
  const limit = parseInt(args[1]) || 10;
  const useAI = args.includes('--ai'); // --ai オプションでAI判断を有効化

  console.log(`=== 統合記事生成システム ===`);
  console.log(`モード: ${mode}, 生成数上限: ${limit}`);
  console.log(`パターンフィルタ: ルールベース${useAI ? ' + AI判断' : ''}\n`);

  const existingArticles = getExistingArticles();
  const queue = [];
  let skippedByRule = 0;
  let skippedByAI = 0;

  // キュー生成（フィルタリング付き）
  console.log('適合パターンをスキャン中...');
  for (const product of verifiedProducts) {
    const category = categoryMapping[product.category];
    if (!category || !patterns[category]) continue;

    const availablePatterns = Object.keys(patterns[category].patterns);

    for (const patternKey of availablePatterns) {
      const slug = generateSlug(product.name, patternKey, product.asin);

      if (existingArticles.has(slug)) continue;

      // ルールベースでフィルタ
      if (!isPatternSuitableByRule(product, patternKey)) {
        skippedByRule++;
        continue;
      }

      // AI判断（オプション）
      if (useAI) {
        const patternName = patterns[category].patterns[patternKey]?.name || patternKey;
        const suitable = await checkPatternRelevanceAI(product, patternKey, patternName);
        if (!suitable) {
          skippedByAI++;
          continue;
        }
        await new Promise(r => setTimeout(r, 500)); // AI APIレート制限
      }

      queue.push({ product, patternKey, slug });
    }
  }

  console.log(`\n除外: ルール ${skippedByRule}件${useAI ? `, AI ${skippedByAI}件` : ''}`);
  console.log(`生成可能な記事: ${queue.length}件`);
  console.log(`（既存: ${existingArticles.size}件）\n`);

  if (queue.length === 0) {
    console.log('生成する記事がありません');
    return;
  }

  const toGenerate = queue.slice(0, limit);
  console.log(`今回生成: ${toGenerate.length}件\n`);

  let generated = 0;
  for (const item of toGenerate) {
    const { product, patternKey, slug } = item;
    console.log(`[${generated + 1}/${toGenerate.length}] ${product.name} × ${patternKey}`);

    // Brave検索
    const category = categoryMapping[product.category];
    const patternName = patterns[category]?.patterns[patternKey]?.name || patternKey;
    console.log('  検索中...');
    const searchResults = await searchBrave(`${product.name} ${patternName}`);
    await new Promise(r => setTimeout(r, 1100));

    // 記事生成
    console.log('  生成中...');
    const result = await generateArticle(product, patternKey, searchResults);

    if (!result) {
      console.log('  ❌ 生成失敗');
      continue;
    }

    // パース
    const titleMatch = result.match(/<title>([^<]+)<\/title>/);
    const excerptMatch = result.match(/<excerpt>([^<]+)<\/excerpt>/);
    const contentMatch = result.match(/<content>([\s\S]*?)<\/content>/);

    const title = titleMatch ? titleMatch[1] : `${product.name} ${patternName}`;
    const excerpt = excerptMatch ? excerptMatch[1] : `${product.name}を徹底解説`;
    let content = contentMatch ? contentMatch[1].trim() : result;

    // 記事中にCTAを挿入（2番目と5番目のh2の後）
    content = insertMidArticleCTAs(content, product);

    const textContent = content.replace(/<[^>]+>/g, '');
    console.log(`  文字数: ${textContent.length}文字`);

    const html = createHTML(product, title, excerpt, content, slug);
    fs.writeFileSync(path.join(productsDir, `${slug}.html`), html, 'utf8');

    console.log(`  ✅ ${slug}.html`);
    generated++;

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== 完了: ${generated}件生成 ===`);

  // インデックス更新
  console.log('\nインデックス更新中...');
  require('./rebuild-index.js');

  // 自動デプロイ（git push）
  if (generated > 0) {
    console.log('\n自動デプロイ中...');
    try {
      const rootDir = '/Users/masa/kids-affiliate-site';
      execSync('git add -A', { cwd: rootDir, stdio: 'pipe' });

      const commitMsg = `記事${generated}件追加（自動生成）`;
      execSync(`git commit -m "${commitMsg}"`, { cwd: rootDir, stdio: 'pipe' });

      execSync('git push', { cwd: rootDir, stdio: 'pipe' });
      console.log('✅ デプロイ完了（Cloudflare Pagesで自動公開されます）');
    } catch (e) {
      if (e.message.includes('nothing to commit')) {
        console.log('変更なし、デプロイスキップ');
      } else {
        console.error('❌ デプロイ失敗:', e.message);
      }
    }
  }
}

module.exports = { generateArticle, createHTML, generateSlug };

if (require.main === module) {
  main().catch(console.error);
}
