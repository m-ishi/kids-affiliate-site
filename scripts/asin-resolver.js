/**
 * ASIN解決・検証モジュール
 *
 * 記事生成前に「本当にリンクして良いASIN」だけを返す。
 * 検証内容（Puppeteerで実ページを確認）:
 *   1. 404/削除ページでない（#productTitleが取れる）
 *   2. 商品名と一致する（トークン一致）
 *   3. 在庫がある（在庫切れ・取扱不可でない）
 *   4. アフィリエイト対象（「アソシエイト・プログラムの対象外」等がない）
 *
 * 使い方:
 *   const { resolveVerifiedASIN } = require('./asin-resolver');
 *   const r = await resolveVerifiedASIN('リッチェル ポッティス', providedAsin);
 *   // → { asin, amazonTitle } または null
 *
 * CLI: node asin-resolver.js "商品名" [ASIN]
 */

const fs = require('fs');
const path = require('path');

// .env読み込み
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const AMAZON_TAG = 'kidsgoodslab-22';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const INELIGIBLE_PATTERNS = [
  'アソシエイト・プログラムの対象外',
  'アフィリエイト対象外',
  'この商品は紹介料の対象外',
  'Amazonアソシエイト・プログラムにより紹介料が発生しない',
  '紹介料対象外',
];

const UNAVAILABLE_PATTERNS = [
  '現在在庫切れです',
  'この商品は現在お取り扱いできません',
  '入荷時期は未定です',
];

// 模倣品・非正規品を示すタイトルパターン（正規品だけを紹介する）
const KNOCKOFF_PATTERNS = [
  'ノーブランド',
  '互換品',
  '非純正',
  '模倣',
  'コピー品',
  '並行輸入品',
];

/**
 * Brave SearchでASIN候補を収集（/dp/を含むURLのみ、重複除去）
 */
async function searchASINCandidates(productName, maxCandidates = 4) {
  if (!BRAVE_API_KEY) return [];
  const candidates = [];
  const queries = [
    `${productName} site:amazon.co.jp`,
    `${productName} Amazon`,
  ];
  for (const q of queries) {
    if (candidates.length >= maxCandidates) break;
    try {
      const res = await fetch(`${BRAVE_SEARCH_URL}?q=${encodeURIComponent(q)}&count=8&search_lang=jp&country=jp`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const data = await res.json();
      for (const r of data?.web?.results || []) {
        const m = r.url.match(/amazon\.co\.jp\/(?:[^\/]+\/)?dp\/([A-Z0-9]{10})/);
        if (m && !candidates.includes(m[1])) {
          candidates.push(m[1]);
          if (candidates.length >= maxCandidates) break;
        }
      }
    } catch (e) {
      console.log(`   ⚠️ Brave検索エラー: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1200)); // レート制限対策
  }
  return candidates;
}

/**
 * 商品名とAmazonタイトルの一致判定（トークンベース・寛容）
 * 商品名の3文字以上のトークンが1つでもタイトルに含まれればOK
 */
function titleMatches(productName, amazonTitle) {
  if (!amazonTitle) return false;
  const normalize = s => s.toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, ' ');
  const title = normalize(amazonTitle);
  const tokens = normalize(productName).split(/[\s・、/／|｜]+/).filter(t => t.length >= 3);
  if (tokens.length === 0) return true; // 判定材料なしは通す（誤検出防止）
  return tokens.some(t => title.includes(t));
}

/**
 * 単一ASINをPuppeteerで検証
 * @returns { ok, asin, amazonTitle, reason }
 */
async function verifyASINWithBrowser(browser, asin, productName) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
  try {
    await page.goto(`https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_TAG}`, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });

    let title = '';
    try { title = await page.$eval('#productTitle', el => el.textContent.trim()); } catch {}
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (!title || bodyText.includes('ページが見つかりません')) {
      return { ok: false, asin, reason: '404または商品ページでない' };
    }

    if (!titleMatches(productName, title)) {
      return { ok: false, asin, amazonTitle: title, reason: `商品名不一致: "${title.substring(0, 50)}"` };
    }

    // 模倣品・非正規品チェック
    for (const p of KNOCKOFF_PATTERNS) {
      if (title.includes(p)) {
        return { ok: false, asin, amazonTitle: title, reason: `非正規品の疑い: "${p}" を含むタイトル` };
      }
    }

    // 在庫チェック（#availability優先、なければ本文パターン）
    let availText = '';
    try { availText = await page.$eval('#availability', el => el.innerText.trim()); } catch {}
    const stockSource = availText || bodyText.substring(0, 5000);
    for (const p of UNAVAILABLE_PATTERNS) {
      if (stockSource.includes(p)) {
        return { ok: false, asin, amazonTitle: title, reason: `在庫なし: "${p}"` };
      }
    }

    // アフィリエイト対象外チェック
    for (const p of INELIGIBLE_PATTERNS) {
      if (bodyText.includes(p)) {
        return { ok: false, asin, amazonTitle: title, reason: `アフィリエイト対象外: "${p}"` };
      }
    }

    return { ok: true, asin, amazonTitle: title };
  } catch (e) {
    return { ok: false, asin, reason: `アクセス失敗: ${e.message.split('\n')[0]}` };
  } finally {
    await page.close();
  }
}

/**
 * Geminiで「意図した商品と同一か」を判定
 * トークン一致では防げないケース（同ブランドの別モデル・大人用バリエーション等）を弾く。
 * API障害時は判定不能として通す（ブロッカーにしない）。
 */
async function geminiProductMatch(productName, amazonTitle) {
  if (!GEMINI_API_KEY) return { match: true, reason: 'Gemini未設定のためスキップ' };
  try {
    const prompt = `子供用品アフィリエイトサイトで「${productName}」を紹介する記事を書きます。
リンク先候補のAmazon商品タイトルは以下です:
「${amazonTitle}」

この商品は、記事で紹介したい商品そのもの（同一商品・適切なバリエーション）ですか？
以下は不一致(false)と判定してください:
- 同ブランドの別モデル・別シリーズ
- 大人用・成人向けバリエーション（商品名に大人用と明記されていない限り）
- アクセサリー・交換部品・ケースのみ
- セット内容が明らかに異なるもの

JSONのみで回答: {"match": true/false, "reason": "簡潔な理由"}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 }
      })
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      return { match: !!parsed.match, reason: parsed.reason || '' };
    }
  } catch (e) {
    console.log(`   ⚠️ Gemini商品一致判定エラー（通過扱い）: ${e.message}`);
  }
  return { match: true, reason: '判定不能のためスキップ' };
}

/**
 * 検証済みASINを解決する。
 * providedAsin があればまずそれを検証し、ダメならBrave検索候補を順に検証。
 * @returns { asin, amazonTitle } または null（安全にリンクできるASINがない）
 */
async function resolveVerifiedASIN(productName, providedAsin = null) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log('⚠️ puppeteer未インストール — ASIN検証をスキップ（非推奨）');
    return providedAsin ? { asin: providedAsin, amazonTitle: null, unverified: true } : null;
  }

  const candidates = [];
  if (providedAsin && /^[A-Z0-9]{10}$/.test(providedAsin)) candidates.push(providedAsin);

  console.log(`🛒 ASIN候補を検索中: ${productName}`);
  const searched = await searchASINCandidates(productName);
  for (const a of searched) {
    if (!candidates.includes(a)) candidates.push(a);
  }

  if (candidates.length === 0) {
    console.log('   ❌ ASIN候補が見つかりません');
    return null;
  }
  console.log(`   候補: ${candidates.join(', ')}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP']
  });

  try {
    for (const asin of candidates) {
      const result = await verifyASINWithBrowser(browser, asin, productName);
      if (result.ok) {
        // 最終判定: 同一商品か（同ブランド別モデル・大人用等を弾く）
        const judge = await geminiProductMatch(productName, result.amazonTitle);
        if (judge.match) {
          console.log(`   ✅ 検証OK: ${asin} (${result.amazonTitle.substring(0, 50)})`);
          return { asin: result.asin, amazonTitle: result.amazonTitle };
        }
        console.log(`   ❌ ${asin}: 商品不一致（${judge.reason}）`);
      } else {
        console.log(`   ❌ ${asin}: ${result.reason}`);
      }
      await new Promise(r => setTimeout(r, 2000)); // レート制限対策
    }
  } finally {
    await browser.close();
  }

  console.log('   ❌ 検証を通過したASINなし');
  return null;
}

// CLI実行
if (require.main === module) {
  const [productName, providedAsin] = process.argv.slice(2);
  if (!productName) {
    console.log('使い方: node asin-resolver.js "商品名" [ASIN]');
    process.exit(1);
  }
  resolveVerifiedASIN(productName, providedAsin || null)
    .then(r => {
      console.log('\n結果:', JSON.stringify(r, null, 2));
      process.exit(r ? 0 : 1);
    })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { resolveVerifiedASIN, verifyASINWithBrowser, titleMatches, searchASINCandidates };
