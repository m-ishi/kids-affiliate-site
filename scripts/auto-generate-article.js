#!/usr/bin/env node
/**
 * 自動記事生成スクリプト
 *
 * 使用方法:
 *   node auto-generate-article.js "商品名" "カテゴリー" ["記事タイトル"] ["ASIN"] ["パターンキー"] ["slug"]
 *
 * 品質保証（このスクリプトが機械的に保証するもの）:
 *   - ASINはPuppeteer検証済みのみ採用（404/商品名不一致/在庫なし/アフィ対象外は不採用→生成中止）
 *   - CTAは冒頭+末尾の2箇所のみ
 *   - 同カテゴリの内部リンク3本（あわせて読みたい）
 *   - 公的機関への外部リンク（カテゴリ別）
 *   - 本文3,500文字未満は再生成、それでも短ければ失敗
 *   - 禁止表現（「愛用」「実際に使ってみた」「安全です」断言等）は自動修正、残れば失敗
 *   - タイトル等のHTMLエスケープ、schema.orgに根拠のない評価を出さない
 *
 * カテゴリー: toy, baby, educational, consumable, outdoor, furniture, safety
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

if (!BRAVE_API_KEY || !GEMINI_API_KEY) {
  console.error('❌ 環境変数が設定されていません');
  console.error('  scripts/.env に BRAVE_API_KEY / GEMINI_API_KEY を設定してください');
  process.exit(1);
}

const AMAZON_TAG = 'kidsgoodslab-22';
const { generateOGP, fetchRakutenImage } = require('./generate-ogp-image');
const { getSectionPrompt } = require('./pattern-sections');
const { resolveVerifiedASIN } = require('./asin-resolver');

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
// gemini-2.0-flashは出力上限8192トークンで長文が切り詰められるため2.5-flashを既定に
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const MIN_CHARS = 3500;       // これ未満なら1回再生成
const MIN_CHARS_HARD = 2500;  // 再生成してもこれ未満なら失敗

const CATEGORY_NAMES = {
  toy: 'おもちゃ',
  baby: 'ベビー用品',
  educational: '知育玩具',
  consumable: '消耗品',
  outdoor: '外遊び',
  furniture: '家具・収納',
  safety: '安全グッズ'
};

// カテゴリ別の公的機関リンク（テンプレートが機械的に挿入する）
const AUTHORITY_LINKS = {
  toy: [
    { name: '一般社団法人 日本玩具協会（STマーク）', url: 'https://www.toys.or.jp/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  educational: [
    { name: '一般社団法人 日本玩具協会（STマーク）', url: 'https://www.toys.or.jp/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  baby: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '独立行政法人 国民生活センター', url: 'https://www.kokusen.go.jp/' },
  ],
  consumable: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '独立行政法人 国民生活センター', url: 'https://www.kokusen.go.jp/' },
  ],
  outdoor: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  furniture: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  safety: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '独立行政法人 国民生活センター', url: 'https://www.kokusen.go.jp/' },
  ],
};

// 禁止表現（CLAUDE.md品質基準 + 未使用レビュー偽装の防止）
const BANNED_PATTERNS = [
  { re: /愛用/g, label: '「愛用」' },
  { re: /実際に使ってみ/g, label: '「実際に使ってみた」' },
  { re: /使ってみました/g, label: '「使ってみました」' },
  { re: /我が家で使って|うちで使って/g, label: '「我が家で使っている」' },
  { re: /[ヶか]月使った|年使った/g, label: '「〜ヶ月/年使った」' },
  { re: /リピ買い|リピートして/g, label: '「リピート」' },
  { re: /安全です/g, label: '「安全です」断言' },
  { re: /安心です/g, label: '「安心です」断言' },
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
async function searchProduct(productName, patternKey = null) {
  console.log(`🔍 Brave APIで検索中: ${productName}`);

  const queries = patternKey === 'brand-trust'
    ? [
        `${productName} どこの国 会社`,
        `${productName} 怪しい 評判`,
        `${productName} 安全性 認証`,
        `${productName} レビュー 口コミ`,
      ]
    : [
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

      // レート制限対策
      await new Promise(r => setTimeout(r, 1500));
    } catch (error) {
      console.error(`検索エラー: ${error.message}`);
    }
  }

  console.log(`   ${allResults.length}件の検索結果を取得`);
  return allResults;
}

// Gemini API呼び出し（共通）
async function callGemini(prompt, { temperature = 0.85, maxOutputTokens = 24576 } = {}) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens }
    })
  });
  const data = await response.json();
  if (data.candidates && data.candidates[0]) {
    return data.candidates[0].content.parts[0].text;
  }
  if (data.error) {
    throw new Error(`Gemini APIエラー: ${data.error.message || JSON.stringify(data.error)}`);
  }
  throw new Error('Gemini APIからの応答を解析できません');
}

// Gemini APIで記事を生成
async function generateArticle(productName, category, searchResults, amazonTitle, customTitle = null, patternKey = null, extraInstruction = '') {
  console.log(`✍️  Gemini(${GEMINI_MODEL})で記事生成中...`);
  if (patternKey) console.log(`   📋 パターン: ${patternKey}`);

  const searchContext = searchResults.map(r => `- ${r.title}: ${r.description}`).join('\n');

  const titleInstruction = customTitle
    ? `\n【参考タイトル例】\n${customTitle}\n`
    : '';

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
- 「安全です」「安心です」という断言（根拠なしの安全宣言は法的リスク）
  → 「STマーク取得済みなので一定の安全基準を満たしている」のように根拠とセットで書く

【推奨する表現】
- 「口コミを調べてみると」「評判をまとめると」
- 「友人ママに聞いたところ」「ママ友の間では」
- 「店頭で実物をチェックしたら」
- 「比較検討した結果」「調べてわかったこと」
- 「購入を検討している方へ」

【商品情報】
商品名: ${productName}
Amazon正式商品名: ${amazonTitle || '（不明）'}
カテゴリー: ${CATEGORY_NAMES[category]}
※Amazon正式商品名と異なる型番・モデル名を本文に書かないこと（スペックの捏造禁止）
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
<excerpt>記事要約（110〜140文字。検索結果に表示される説明文として自然な文章にする）</excerpt>
<content>
<h2>読者の心を掴む具体的な見出し</h2>
<p>本文...</p>
</content>
<faq>
<q>読者が検索しそうな質問（例: ○○は何歳から使える？）</q><a>簡潔で具体的な回答（2〜3文）</a>
<q>2つ目の質問</q><a>回答</a>
<q>3つ目の質問</q><a>回答</a>
</faq>

【FAQのルール】
- 質問は実際に検索されそうな自然な疑問文（何歳から・いつまで・洗える？・違いは？等）
- 回答は結論から書く。あいまいな回答は禁止
- 3〜4問

【厳守事項】
- 必ず5000文字以上書く
- ★最初のセクションの冒頭に「結論サマリー」を置く（AI検索・流し読み対策で最重要）:
  この商品が「誰に向くか・向かないか」「価格帯」「判断のポイント」を2〜3文で言い切る
${patternKey ? `- パターン「${patternKey}」の視点を全体に反映\n` : ''}- 具体的なエピソード・数値を必ず含める
- 断定的な表現を使う（「〜かもしれません」より「〜です」）※ただし安全性の断言は禁止
- 本文にURLやリンク（<a>タグ）を書かない（リンクはテンプレート側で挿入される）
- ★絶対禁止ワード★ 以下は見出しに使用禁止：
  「導入文」「商品概要」「目次的導入」「事実・データパート」「メインコンテンツ」「実践的アドバイス」「注意点・デメリット」「おすすめな人チェックリスト」「まとめ」「最終判断」「商品の特徴」「データ・比較」「詳細レビュー」
${extraInstruction}`;

  const text = await callGemini(prompt);

  const titleMatch = text.match(/<title>([^<]+)<\/title>/);
  const excerptMatch = text.match(/<excerpt>([^<]+)<\/excerpt>/);
  const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/);
  const faqMatch = text.match(/<faq>([\s\S]*?)<\/faq>/);

  const title = titleMatch ? titleMatch[1].trim() : `${productName}を徹底解説`;
  const excerpt = excerptMatch ? excerptMatch[1].trim() : `${productName}の選び方と注意点をまとめました`;
  let content = contentMatch ? contentMatch[1].trim() : text;

  // FAQ抽出（<q>質問</q><a>回答</a>のペア）
  const faq = faqMatch
    ? [...faqMatch[1].matchAll(/<q>([\s\S]*?)<\/q>\s*<a>([\s\S]*?)<\/a>/g)]
        .map(m => ({ q: m[1].trim(), a: m[2].trim() }))
        .filter(x => x.q && x.a)
        .slice(0, 5)
    : [];

  const textContent = content.replace(/<[^>]+>/g, '');
  console.log(`   📊 生成文字数: ${textContent.length}文字 / FAQ: ${faq.length}問`);

  return { title, excerpt, content, faq, chars: textContent.length };
}

// 禁止表現をスキャン → 検出結果 [{label, count}]
// 「」内は第三者の口コミ・ブログタイトル等の引用なので対象外（筆者の主張のみ検査）
function stripQuotes(text) {
  return text.replace(/「[^」]*」/g, '').replace(/『[^』]*』/g, '');
}
function scanBannedExpressions(content) {
  const text = stripQuotes(content.replace(/<[^>]+>/g, ''));
  const found = [];
  for (const { re, label } of BANNED_PATTERNS) {
    re.lastIndex = 0;
    const matches = text.match(re);
    if (matches) found.push({ label, count: matches.length });
  }
  return found;
}

// 禁止表現を含む段落（<p>/<li>/<td>）だけを抜き出してGeminiで書き換える
// 全文一括書き換えは長文で取りこぼすため、外科的に該当ブロックのみ修正する
async function reviseBannedExpressions(content, violations) {
  console.log(`   🔧 禁止表現を修正中: ${violations.map(v => v.label).join(', ')}`);

  const blocks = [...content.matchAll(/<(p|li|td)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g)]
    .map(m => m[0])
    .filter(b => BANNED_PATTERNS.some(p => {
      p.re.lastIndex = 0;
      return p.re.test(stripQuotes(b.replace(/<[^>]+>/g, '')));
    }));
  const unique = [...new Set(blocks)].slice(0, 20);
  if (unique.length === 0) return content;

  const prompt = `子供用品レビュー記事から、使用禁止表現を含む段落を抜き出しました。
各段落を以下の方針で自然に書き直してください。

【方針】
- 「愛用」「実際に使ってみた」「〜ヶ月使った」「リピート」等の使用体験の主張
  → 「口コミを調べると」「店頭でチェックしたところ」等の調査視点に
- 「安全です」「安心です」の断言 → 「〜の基準を満たしている」「〜とされています」「安心材料になる」等の根拠ベース・非断言表現に必ず置き換える（「安心です」「安全です」という文字列を残さない）
- HTMLタグ・リンクはそのまま維持、文意と文字数もできるだけ維持

【入力】(JSON配列)
${JSON.stringify(unique)}

【出力】書き直した段落のJSON配列のみ（入力と同じ順序・同じ要素数）`;

  const text = await callGemini(prompt, { temperature: 0.2 });
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return content;
  try {
    const rewritten = JSON.parse(m[0]);
    if (!Array.isArray(rewritten) || rewritten.length !== unique.length) return content;
    unique.forEach((orig, i) => {
      const rep = rewritten[i];
      if (typeof rep === 'string' && rep.length > orig.length * 0.4) {
        content = content.split(orig).join(rep);
      }
    });
  } catch { /* パース失敗時は変更なし → リトライへ */ }
  return content;
}

// ファイル名を生成（SEOフレンドリー）
function generateSlug(productName, slugHint) {
  if (slugHint) {
    return slugHint
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

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
    'マグネット': 'magnet',
    'ブロック': 'block',
    'おもちゃ': 'toy',
    'サブスク': 'subscription',
    'ベビーカー': 'stroller',
    'チャイルドシート': 'child-seat',
    'モンテッソーリ': 'montessori',
    'プログラミング': 'programming',
    '安全': 'safety',
    '比較': 'comparison',
    '危ない': 'danger',
    '後悔': 'regret',
    '卒業': 'graduation',
    '誕生日': 'birthday',
    'プレゼント': 'present',
    'クリスマス': 'christmas',
    'ランキング': 'ranking',
    '知育': 'chiiku',
    '玩具': 'toy',
  };

  let slug = productName.toLowerCase();

  for (const [jp, en] of Object.entries(romanize)) {
    slug = slug.replace(new RegExp(jp, 'gi'), en);
  }

  slug = slug
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

  if (!slug || slug.length < 3) {
    const englishParts = productName.match(/[a-zA-Z0-9]+/g);
    if (englishParts && englishParts.length > 0) {
      slug = englishParts.join('-').toLowerCase();
    }
    if (!slug || slug.length < 3) {
      return null; // 変換不能 → 呼び出し側でGeminiローマ字化にフォールバック
    }
  }

  return slug;
}

// 日本語商品名をGeminiでURLスラッグ化（romanize辞書で変換できなかった場合）
async function generateSlugWithGemini(productName) {
  console.log('   🔤 スラッグをGeminiでローマ字化中...');
  const text = await callGemini(
    `Convert this Japanese product name to a short URL-friendly English slug (lowercase, hyphens, max 40 chars). Output ONLY the slug, no explanation: "${productName}"`,
    { temperature: 0, maxOutputTokens: 4096 }
  );
  const slug = text.trim().toLowerCase()
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug && slug.length >= 3 && !/[^\x00-\x7F]/.test(slug)) {
    return slug.substring(0, 50);
  }
  throw new Error(`スラッグを生成できません: "${productName}" → "${slug}"。第6引数でslugを指定してください`);
}

// 既存記事から関連記事を選ぶ（同カテゴリ優先・新しい順・最大count件）
function pickRelatedArticles(category, excludeSlug, count = 3) {
  const productsDir = path.join(__dirname, '..', 'products');
  const categoryName = CATEGORY_NAMES[category];
  const articles = [];

  for (const file of fs.readdirSync(productsDir)) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    const slug = file.replace('.html', '');
    if (slug === excludeSlug) continue;
    try {
      const html = fs.readFileSync(path.join(productsDir, file), 'utf8');
      const titleMatch = html.match(/<h1 class="article-title">([^<]+)<\/h1>/);
      const catMatch = html.match(/<span class="article-category">([^<]+)<\/span>/);
      if (!titleMatch) continue;
      articles.push({
        slug,
        title: titleMatch[1],
        category: catMatch ? catMatch[1] : '',
        mtime: fs.statSync(path.join(productsDir, file)).mtimeMs,
      });
    } catch { /* skip */ }
  }

  const sameCategory = articles.filter(a => a.category === categoryName).sort((a, b) => b.mtime - a.mtime);
  const others = articles.filter(a => a.category !== categoryName).sort((a, b) => b.mtime - a.mtime);
  return [...sameCategory, ...others].slice(0, count);
}

// 関連記事セクションのHTML
function buildRelatedSection(related) {
  if (related.length === 0) return '';
  const items = related.map(a =>
    `            <li><a href="${a.slug}">${a.title}</a></li>`
  ).join('\n');
  return `
        <div class="related-articles" style="background:#f8f9fa;padding:24px;border-radius:12px;margin:40px 0 0;">
          <p style="font-weight:700;margin-bottom:12px;">📖 あわせて読みたい</p>
          <ul style="margin:0;padding-left:20px;line-height:2;">
${items}
          </ul>
        </div>`;
}

// 公的機関リンクセクションのHTML
function buildAuthoritySection(category) {
  const links = AUTHORITY_LINKS[category] || AUTHORITY_LINKS.baby;
  const items = links.map(l =>
    `            <li><a href="${l.url}" target="_blank" rel="noopener">${l.name}</a></li>`
  ).join('\n');
  return `
        <div class="authority-links" style="border-left:4px solid #667eea;background:#f8f9fa;padding:16px 24px;margin:32px 0;">
          <p style="font-weight:600;margin-bottom:8px;font-size:0.95rem;">🏛️ 安全性の確認に役立つ公的情報</p>
          <ul style="margin:0;padding-left:20px;font-size:0.9rem;line-height:1.9;">
${items}
          </ul>
        </div>`;
}

// FAQセクションのHTML + FAQPage schema
function buildFaqSection(faq) {
  if (!faq || faq.length === 0) return { html: '', schema: null };
  const items = faq.map(x => `
          <div style="margin-bottom:16px;">
            <p style="font-weight:700;margin-bottom:4px;">Q. ${escapeHtml(x.q)}</p>
            <p style="margin:0;">A. ${escapeHtml(x.a)}</p>
          </div>`).join('');
  const html = `
        <div class="faq-section" style="background:#f8f9fa;padding:24px;border-radius:12px;margin:32px 0;">
          <h2 style="margin-top:0;">よくある質問</h2>${items}
        </div>`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(x => ({
      '@type': 'Question',
      name: x.q,
      acceptedAnswer: { '@type': 'Answer', text: x.a }
    }))
  };
  return { html, schema };
}

// HTMLファイルを生成
function generateHTML(productName, category, article, asin, customTitle = null, slugHint = null, productImageUrl = null) {
  const slug = generateSlug(productName, slugHint);
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  const isoDate = new Date().toISOString().split('T')[0];
  const amazonUrl = `https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`;

  const articleTitle = customTitle || article.title || `${productName} レビュー`;
  const excerpt = article.excerpt || `${productName}を徹底解説`;

  // エスケープ済みの値（属性・テキスト用）
  const eTitle = escapeHtml(articleTitle);
  const eExcerpt = escapeHtml(excerpt);
  const eProduct = escapeHtml(productName);

  const relatedSection = buildRelatedSection(pickRelatedArticles(category, slug));
  const authoritySection = buildAuthoritySection(category);
  const { html: faqSection, schema: faqSchema } = buildFaqSection(article.faq);

  // 商品画像: 楽天API画像があれば実物写真、なければOGP画像
  const cardImage = productImageUrl || `../images/ogp/${slug}.png`;

  // schema.org: 根拠のない評価（reviewRating）は出さない
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productName,
    image: `https://kidsgoodslab.com/images/ogp/${slug}.png`,
    description: excerpt,
    url: amazonUrl,
  };
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: articleTitle,
    image: `https://kidsgoodslab.com/images/ogp/${slug}.png`,
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@type': 'Person', name: 'パパラボ' },
    publisher: {
      '@type': 'Organization',
      name: 'キッズグッズラボ',
      logo: { '@type': 'ImageObject', url: 'https://kidsgoodslab.com/images/logo.png' }
    }
  };

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${eExcerpt}">
  <title>${eTitle} - キッズグッズラボ</title>
  <meta property="og:title" content="${eTitle}">
  <meta property="og:description" content="${eExcerpt}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://kidsgoodslab.com/images/ogp/${slug}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://kidsgoodslab.com/images/ogp/${slug}.png">
  <link rel="canonical" href="https://kidsgoodslab.com/products/${slug}">
  <meta property="og:url" content="https://kidsgoodslab.com/products/${slug}">
  <meta property="og:site_name" content="キッズグッズラボ">
  <meta name="twitter:title" content="${eTitle}">
  <meta name="twitter:description" content="${eExcerpt}">
  <script type="application/ld+json">
  ${JSON.stringify(productSchema, null, 2)}
  </script>
  <script type="application/ld+json">
  ${JSON.stringify(articleSchema, null, 2)}
  </script>${faqSchema ? `
  <script type="application/ld+json">
  ${JSON.stringify(faqSchema, null, 2)}
  </script>` : ''}
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
      <h1 class="article-title">${eTitle}</h1>
      <p class="article-excerpt">${eExcerpt}</p>
    </div>
  </section>

  <section class="article-content">
    <div class="container">
      <div class="article-body">
        <div class="product-info-card" style="background:#f8f9fa;padding:24px;border-radius:12px;margin-bottom:32px;text-align:center;">
          <a href="${amazonUrl}" target="_blank" rel="noopener sponsored">
            <img src="${cardImage}" alt="${eProduct}" style="max-width:280px;height:auto;display:block;margin:0 auto 16px;" loading="lazy">
          </a>
          <p style="font-weight:600;margin-bottom:8px;">${eProduct}</p>
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored">Amazonで価格を見る</a>
        </div>

        <!-- article-content-start -->
        ${article.content}
        <!-- article-content-end -->
${faqSection}${authoritySection}
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px;border-radius:12px;text-align:center;margin:40px 0;">
          <p style="color:#fff;font-size:1.1rem;margin-bottom:16px;font-weight:600;">この商品をAmazonでチェック</p>
          <a href="${amazonUrl}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="background:#fff;color:#667eea;font-weight:700;padding:16px 32px;font-size:1.1rem;">
            ${eProduct}の詳細を見る →
          </a>
        </div>
${relatedSection}
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

// メイン処理
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('使用方法: node auto-generate-article.js "商品名" "カテゴリー" ["記事タイトル"] ["ASIN"] ["パターンキー"] ["slug"]');
    console.log('カテゴリー: toy, baby, educational, consumable, outdoor, furniture, safety');
    process.exit(1);
  }

  const [productName, category, customTitle, providedAsin, patternKey, slugHint] = args;

  if (!CATEGORY_NAMES[category]) {
    console.error(`無効なカテゴリー: ${category}`);
    console.log('有効なカテゴリー:', Object.keys(CATEGORY_NAMES).join(', '));
    process.exit(1);
  }

  // 体験談タイトルは自動生成（調査視点）と矛盾するため生成前に弾く
  // （購入履歴ベースの体験記事はパスB: Claude Codeエージェントで書く）
  if (customTitle) {
    const experiential = [/実際に(使|与え|試し)/, /使ったら/, /(与え|試し)たら/, /使ってわかった/, /使ってみた/, /愛用/, /我が家で/];
    const hit = experiential.find(re => re.test(customTitle));
    if (hit) {
      console.error(`❌ タイトルが使用体験を主張しています: "${customTitle}"`);
      console.error('   自動生成は「調査・比較」視点のため、本文と矛盾する記事になります。');
      console.error('   → タイトルを調査視点に書き換えるか、パスB（Claude Codeエージェント）で執筆してください');
      process.exit(1);
    }
  }

  console.log(`\n📝 記事生成開始: ${productName}\n`);

  try {
    // 1. ASINを解決・検証（検証を通らなければ生成しない）
    const resolved = await resolveVerifiedASIN(productName, providedAsin || null);
    if (!resolved) {
      console.error('\n❌ 検証済みASINが取得できないため記事生成を中止します');
      console.error('   （404/商品名不一致/在庫なし/アフィリエイト対象外のいずれか）');
      console.error('   正しいASINが分かる場合は第4引数で指定してください');
      process.exit(1);
    }
    const asin = resolved.asin;

    // 2. 商品情報を検索（brand-trustは会社・安全性クエリも収集）
    const searchResults = await searchProduct(productName, patternKey);

    // 3. 記事を生成（文字数不足なら1回再生成）
    let article = await generateArticle(productName, category, searchResults, resolved.amazonTitle, customTitle, patternKey);
    if (article.chars < MIN_CHARS) {
      console.log(`   ⚠️ ${article.chars}文字は基準未満（${MIN_CHARS}）。再生成します`);
      article = await generateArticle(productName, category, searchResults, resolved.amazonTitle, customTitle, patternKey,
        `\n【重要】前回の出力は${article.chars}文字で不足でした。必ず5000文字以上、各セクションを具体例と数値で厚く書いてください。`);
      if (article.chars < MIN_CHARS_HARD) {
        console.error(`❌ 再生成しても${article.chars}文字。品質基準を満たせないため中止します`);
        process.exit(1);
      }
    }

    // 4. 禁止表現チェック → 自動修正（最大2回）→ 残れば失敗
    let violations = scanBannedExpressions(article.content);
    for (let attempt = 1; violations.length > 0 && attempt <= 2; attempt++) {
      article.content = await reviseBannedExpressions(article.content, violations);
      violations = scanBannedExpressions(article.content);
      if (violations.length === 0) console.log(`   ✅ 禁止表現を修正しました（${attempt}回目）`);
    }
    if (violations.length > 0) {
      console.error(`❌ 禁止表現が修正後も残っています: ${violations.map(v => v.label).join(', ')}`);
      process.exit(1);
    }

    // 5. スラッグを確定（辞書変換 → 英字抽出 → Geminiローマ字化の順）
    let finalSlug = generateSlug(productName, slugHint);
    if (!finalSlug) {
      finalSlug = await generateSlugWithGemini(productName);
    }
    // パターン付き記事はスラッグにパターン名を付与（同一商品の別切り口記事と衝突しないように）
    if (patternKey && !slugHint && !finalSlug.includes(patternKey)) {
      finalSlug = `${finalSlug}-${patternKey}`.replace(/-+/g, '-').substring(0, 60);
    }
    console.log(`   🔗 スラッグ: ${finalSlug}`);

    // 6. 楽天APIで商品画像を取得（RAKUTEN_APP_IDが有効な場合のみ。なければnull）
    let rakutenImageUrl = null;
    try {
      rakutenImageUrl = await fetchRakutenImage(productName);
      if (rakutenImageUrl) console.log(`🖼️ 楽天商品画像: ${rakutenImageUrl}`);
    } catch { /* 画像なしで続行 */ }

    // 7. HTMLファイルを生成
    const { html, slug, articleTitle } = generateHTML(productName, category, article, asin, customTitle, finalSlug, rakutenImageUrl);

    // 8. OGP画像を生成（楽天画像があれば商品写真入り）
    console.log(`🎨 OGP画像を生成中...`);
    try {
      await generateOGP(productName, articleTitle, category, slug, rakutenImageUrl);
      console.log(`✅ OGP画像を生成: images/ogp/${slug}.png`);
    } catch (ogpError) {
      console.error(`⚠️ OGP画像生成失敗（記事は作成します）: ${ogpError.message}`);
    }

    // 7. ファイルを保存
    const productsDir = path.join(__dirname, '../products');
    const filePath = path.join(productsDir, `${slug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`✅ 記事を保存: products/${slug}.html`);

    // 8. インデックスページを再構築（products/から全再生成なので冪等）
    try {
      execSync(`node "${path.join(__dirname, 'rebuild-index.js')}"`, { stdio: 'pipe' });
      console.log('✅ インデックスページを更新');
    } catch (e) {
      console.error('⚠️ インデックス更新エラー（rebuild-index.jsを手動実行してください）');
    }

    // 9. 生成結果をパイプライン用に書き出し
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    fs.writeFileSync(path.join(logDir, 'last-generated.json'), JSON.stringify({
      slug,
      asin,
      amazonTitle: resolved.amazonTitle,
      articleTitle,
      chars: article.chars,
      category,
      productName,
      generatedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`\n🎉 完了！\n`);
    console.log(`ファイル: products/${slug}.html`);
    console.log(`文字数: ${article.chars}`);
    console.log(`Amazon URL: https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`);

  } catch (error) {
    console.error(`\n❌ エラー: ${error.message}`);
    process.exit(1);
  }
}

main();
