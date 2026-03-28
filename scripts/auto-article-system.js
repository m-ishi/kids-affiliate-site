/**
 * 統合記事生成システム v2
 * 商品選定 → サジェストKW取得 → 辛口E-E-A-T構成で記事生成
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { patterns, getPrompt } = require('./article-patterns');
const { generateOGP } = require('./generate-ogp-image');
const { getSectionPrompt } = require('./pattern-sections');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888';
const AFFILIATE_TAG = 'kidsgoodslab-22';

// ========================================
// サジェストKW自動取得
// ========================================

/**
 * Google Suggest API からサジェストキーワードを取得
 * @param {string} query - 検索クエリ
 * @returns {Promise<string[]>} サジェストキーワード配列
 */
async function getGoogleSuggestions(query) {
  try {
    const url = `http://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await response.json();
    return data[1] || [];
  } catch (e) {
    console.log(`  ⚠️ サジェスト取得失敗: ${e.message}`);
    return [];
  }
}

/**
 * 商品名に対して多角的なサジェストKWを取得
 * ネガティブ系・比較系・購入系・使い方系に分類
 */
async function fetchSuggestKeywords(productName) {
  const suffixes = [
    '', ' 口コミ', ' デメリット', ' 後悔', ' 比較',
    ' おすすめ', ' いらない', ' 何歳'
  ];

  const allSuggestions = new Set();
  for (const suffix of suffixes) {
    const suggestions = await getGoogleSuggestions(productName + suffix);
    suggestions.forEach(s => allSuggestions.add(s));
    await new Promise(r => setTimeout(r, 200)); // レート制限
  }

  const keywords = [...allSuggestions];

  // カテゴリ分類
  const negative = keywords.filter(k =>
    /デメリット|後悔|いらない|危ない|失敗|重い|高い|壊れ|うるさい|邪魔|不要|微妙/.test(k)
  );
  const comparison = keywords.filter(k =>
    /比較|違い|vs|どっち|どれ|おすすめ|ランキング|選び方/.test(k)
  );
  const purchase = keywords.filter(k =>
    /最安値|安い|どこ|買う|Amazon|楽天|セール|クーポン|中古|メルカリ/.test(k)
  );
  const usage = keywords.filter(k =>
    /何歳|いつ|使い方|組み立て|サイズ|重さ|洗い|掃除|収納|お手入れ/.test(k)
  );

  return {
    all: keywords,
    negative,
    comparison,
    purchase,
    usage,
    summary: `取得KW: ${keywords.length}件 (ネガ:${negative.length} 比較:${comparison.length} 購入:${purchase.length} 使い方:${usage.length})`
  };
}

/**
 * SearXNG経由で競合記事の見出し構成を取得
 */
async function fetchCompetitorHeadings(productName, patternKey) {
  try {
    const query = `${productName} ${patternKey === 'regret' ? 'デメリット 後悔' : patternKey === 'reviews' ? '口コミ 評判' : 'レビュー'}`;
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=ja`;
    const response = await fetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    return data.results?.slice(0, 5).map(r => `${r.title}: ${r.content || ''}`).join('\n') || '';
  } catch (e) {
    return '';
  }
}

const productsDir = '/Users/masa/kids-affiliate-site/products';
const ogpDir = '/Users/masa/kids-affiliate-site/images/ogp';
const productImagesDir = '/Users/masa/kids-affiliate-site/images/products';
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

// 辛口E-E-A-T記事生成（サジェストKW統合版）
async function generateArticle(product, patternKey, searchResults, suggestKW = null) {
  const category = categoryMapping[product.category] || 'baby';
  const patternInfo = patterns[category]?.patterns[patternKey];
  const patternFocus = patternPrompts[patternKey] || '';
  const patternDesc = patternInfo?.prompt || '';
  const suggestedTitle = generatePatternTitle(product.name, patternKey, category);

  // サジェストKWをプロンプトに組み込む
  const kwSection = suggestKW ? `
【SEO対策：記事内に自然に織り込むべきキーワード】
以下のキーワードは実際にユーザーが検索しているものです。
見出しや本文に自然に組み込んでください（無理に全部入れなくてOK、関連性の高いものを優先）。

▼ ネガティブ系（デメリット・後悔系）※必ず2-3個は記事内で言及すること
${suggestKW.negative.slice(0, 8).join('\n') || '（なし）'}

▼ 比較・選択系
${suggestKW.comparison.slice(0, 6).join('\n') || '（なし）'}

▼ 購入検討系
${suggestKW.purchase.slice(0, 6).join('\n') || '（なし）'}

▼ 使い方・仕様系
${suggestKW.usage.slice(0, 6).join('\n') || '（なし）'}

▼ その他のサジェストKW（参考）
${suggestKW.all.filter(k => !suggestKW.negative.includes(k) && !suggestKW.comparison.includes(k) && !suggestKW.purchase.includes(k) && !suggestKW.usage.includes(k)).slice(0, 10).join('\n') || '（なし）'}
` : '';

  const prompt = `
あなたは「パパラボ」。2歳男の子と0歳女の子を育てている子育てパパ。
性格は**そこそこ批判的で正直**。甘い言葉でごまかすのが嫌い。
でもENTPほどの毒舌ではなく、ちゃんと良いものは良いと言う。
「ダメなところはハッキリ言うけど、それでもおすすめなものはおすすめ」というスタンス。

【E-E-A-T（経験・専門性・権威性・信頼性）を意識した文章構成】

★Experience（経験）:
- 自分の子育て体験をベースに書く。ただし所有していない商品は「友人パパに借りて試した」「店頭で触った」「保育園で見た」等のリアルな接触体験で書く
- 「2歳の息子が〜した」「0歳の娘に〜」など具体的な子供の反応を入れる
- 抽象的な感想（「とても良い」）ではなく、具体的なシーン（「朝の着替え中に3分だけ遊ばせる」）で書く

★Expertise（専門性）:
- スペック・数値データを必ず含める（重量、サイズ、対象年齢、価格帯）
- 競合商品との具体的な違いを数字で比較する
- 「なぜそうなのか」の理由を技術的に説明できる部分は説明する

★Authoritativeness（権威性）:
- 口コミの傾向をデータ的に分析する（「Amazonレビュー200件中、星1は〇%」等）
- 保育士・小児科医の見解があれば引用
- 受賞歴・認証があれば言及

★Trustworthiness（信頼性）:
- **デメリットを先に、具体的に書く** ← これが最重要
- 「向かない人」を明確にする
- アフィリエイトリンクがあることを隠さない
- 他の選択肢も公平に紹介する

【辛口パパラボの文体ルール】
- 「正直に言うと、〇〇はイマイチ。」から入ることが多い
- 「でもね、」「ただし、」で転換して良い点を語る
- 「〜って言ってるブログ多いけど、本当にそう？」と他の記事に疑問を投げる
- ☆☆☆☆★みたいな評価を入れる
- 「ぶっちゃけ」「正直」「忖度なしで言うと」を適度に使う
- ただし攻撃的にはならない。愛のある辛口。
- 最後は「それでも○○は買い」と推薦で締める

【絶対禁止の表現】
- 「愛用」「リピート」「リピ買い」
- 過剰なポジティブ表現（「最高」「神」「完璧」「間違いない」）
- ステマ感のある表現（「今だけ」「急いで」「限定」）
- 抽象的すぎる感想（「とても良い商品です」「おすすめです」だけで終わる）

【商品情報】
商品名: ${product.name}
カテゴリー: ${product.category}
${kwSection}
【記事の切り口（パターン）】
パターン: ${patternKey}
狙い: ${patternDesc}
重視ポイント: ${patternFocus}

【参考タイトル例】
${suggestedTitle}

【参考情報（検索結果）】
${searchResults || '（検索結果なし）'}

【記事構成ルール（9セクション・5000-7000文字厳守）】

このパターン「${patternKey}」に最適化した以下の構成で書いてください。

★★★ 見出しルール ★★★
- 全ての<h2>見出しは、読者が「読みたい！」と思う具体的で自然な日本語にすること
- 見出しは疑問形、感嘆、具体的な数字を使って興味を引く
- ネガティブ系KWは見出しに積極的に取り入れる（例：「[商品名] デメリット」「[商品名] 後悔」）
- 「導入文」「まとめ」「商品概要」等の抽象的ワードは絶対禁止
- 以下の見出し例は参考。そのまま使わず、内容に合わせてアレンジすること

【パターン「${patternKey}」専用の記事構成】

${getSectionPrompt(patternKey, product.name)}

【出力形式】
<title>キャッチーなタイトル（32文字以内）★ネガティブ要素を含むタイトル推奨（例：「〇〇のデメリット5つ｜それでもおすすめな理由」）</title>
<excerpt>記事要約（60文字）</excerpt>
<content>
<h2>読者の心を掴む具体的な見出し</h2>
<p>本文...</p>
</content>

【厳守事項】
- 必ず5000文字以上書く
- パターン「${patternKey}」の視点を全体に反映
- 具体的なエピソード・数値を必ず含める
- デメリットを最低3つは具体的に書く（ここが信頼性の核）
- 断定的な表現を使う（「〜かもしれません」より「〜です」）
- 辛口だけど最後は推薦で締める構成にする
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

  // ========================================
  // 商品選定：検索需要スコアで優先順位付け
  // ========================================
  console.log('📊 検索需要スコアを算出中（商品選定）...\n');

  // 商品別サジェストKWキャッシュ（同じ商品の別パターンで再利用）
  const suggestCache = {};

  // キュー内のユニーク商品名を取得
  const uniqueProducts = [...new Set(queue.map(q => q.product.name))];

  for (const productName of uniqueProducts) {
    console.log(`  🔍 ${productName}...`);
    suggestCache[productName] = await fetchSuggestKeywords(productName);
    console.log(`     ${suggestCache[productName].summary}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // 検索需要スコアを計算してキューに付与
  // スコア = サジェストKW総数 × 1.0 + ネガティブ系 × 3.0 + 比較系 × 2.0 + 購入系 × 2.5
  // （ネガティブ系・購入系KWが多い ＝ 購買検討段階のユーザーが多い ＝ CVR高い）
  for (const item of queue) {
    const kw = suggestCache[item.product.name];
    if (kw) {
      item.demandScore =
        kw.all.length * 1.0 +
        kw.negative.length * 3.0 +
        kw.comparison.length * 2.0 +
        kw.purchase.length * 2.5 +
        kw.usage.length * 1.5;
    } else {
      item.demandScore = 0;
    }
  }

  // スコア降順でソート（高需要の商品を先に生成）
  queue.sort((a, b) => b.demandScore - a.demandScore);

  // スコアランキング表示
  console.log('\n📈 商品別 検索需要スコアランキング:');
  const scoreByProduct = {};
  for (const item of queue) {
    if (!scoreByProduct[item.product.name]) {
      scoreByProduct[item.product.name] = item.demandScore;
    }
  }
  const ranked = Object.entries(scoreByProduct).sort((a, b) => b[1] - a[1]);
  ranked.forEach(([name, score], i) => {
    const kw = suggestCache[name];
    const bar = '█'.repeat(Math.min(Math.round(score / 5), 30));
    console.log(`  ${i + 1}. ${name} [${score.toFixed(0)}] ${bar}`);
    if (kw) console.log(`     KW:${kw.all.length} ネガ:${kw.negative.length} 比較:${kw.comparison.length} 購入:${kw.purchase.length}`);
  });
  console.log();

  const toGenerate = queue.slice(0, limit);
  console.log(`今回生成: ${toGenerate.length}件（検索需要スコア上位から）\n`);

  let generated = 0;
  for (const item of toGenerate) {
    const { product, patternKey, slug } = item;
    console.log(`[${generated + 1}/${toGenerate.length}] ${product.name} × ${patternKey}`);

    // サジェストKW取得（キャッシュあり）
    if (!suggestCache[product.name]) {
      console.log('  🔍 サジェストKW取得中...');
      suggestCache[product.name] = await fetchSuggestKeywords(product.name);
      console.log(`  ${suggestCache[product.name].summary}`);
    }
    const suggestKW = suggestCache[product.name];

    // Brave検索 or SearXNG検索
    const category = categoryMapping[product.category];
    const patternName = patterns[category]?.patterns[patternKey]?.name || patternKey;
    console.log('  検索中...');
    let searchResults = await searchBrave(`${product.name} ${patternName}`);
    // SearXNGフォールバック
    if (!searchResults) {
      searchResults = await fetchCompetitorHeadings(product.name, patternKey);
    }
    await new Promise(r => setTimeout(r, 1100));

    // 辛口E-E-A-T記事生成（サジェストKW付き）
    console.log('  ✍️ 辛口E-E-A-T記事生成中...');
    const result = await generateArticle(product, patternKey, searchResults, suggestKW);

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

    // OGP画像生成
    console.log('  OGP画像生成中...');
    const productImagePath = path.join(productImagesDir, `${product.asin}.jpg`);
    const imgPath = fs.existsSync(productImagePath) ? productImagePath : null;
    await generateOGP(product.name, title, product.category, slug, imgPath);

    console.log(`  ✅ ${slug}.html + OGP画像`);
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

module.exports = { generateArticle, createHTML, generateSlug, fetchSuggestKeywords, fetchCompetitorHeadings };

if (require.main === module) {
  main().catch(console.error);
}
