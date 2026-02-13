/**
 * Brave APIでAmazonベストセラー情報を取得
 * - リトライ機能付き（他MCPとの競合対策）
 * - 1秒に1リクエストのレート制限遵守
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

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

if (!BRAVE_API_KEY) {
  console.error('BRAVE_API_KEY が設定されていません');
  process.exit(1);
}

// 検索クエリ - site:amazon.co.jp で商品ページを直接取得
const SEARCH_QUERIES = [
  'site:amazon.co.jp おむつ ベストセラー パンパース メリーズ',
  'site:amazon.co.jp 抱っこ紐 人気 エルゴ ベビービョルン',
  'site:amazon.co.jp ベビーカー 人気 コンビ アップリカ',
  'site:amazon.co.jp チャイルドシート 人気 新生児',
  'site:amazon.co.jp 哺乳瓶 人気 ピジョン 母乳実感',
  'site:amazon.co.jp 粉ミルク 液体ミルク アイクレオ ほほえみ',
  'site:amazon.co.jp 知育玩具 人気 1歳 2歳',
  'site:amazon.co.jp バウンサー ハイローチェア 人気',
  'site:amazon.co.jp ベビーゲート 安全柵 階段',
  'site:amazon.co.jp ストライダー キッズバイク 三輪車',
  'site:amazon.co.jp ベビーモニター 見守りカメラ',
  'site:amazon.co.jp ベビーバス 沐浴',
  'site:amazon.co.jp おしりふき 人気',
  'site:amazon.co.jp 離乳食 ベビーフード 人気',
];

// カテゴリー推定マッピング
const CATEGORY_MAP = {
  'おむつ': 'consumable',
  'パンパース': 'consumable',
  'メリーズ': 'consumable',
  'ムーニー': 'consumable',
  'グーン': 'consumable',
  '抱っこ紐': 'baby',
  'エルゴ': 'baby',
  'ベビービョルン': 'baby',
  'ベビーカー': 'furniture',
  'コンビ': 'baby',
  'アップリカ': 'baby',
  'チャイルドシート': 'furniture',
  '哺乳瓶': 'baby',
  '粉ミルク': 'consumable',
  'ピジョン': 'baby',
  '知育': 'educational',
  'おもちゃ': 'educational',
  'バウンサー': 'baby',
  'ハイローチェア': 'baby',
  'ベビーゲート': 'safety',
  'ストライダー': 'outdoor',
  '三輪車': 'outdoor',
};

function guessCategory(title, query) {
  // クエリからカテゴリーを推定
  for (const [keyword, cat] of Object.entries(CATEGORY_MAP)) {
    if (query.includes(keyword) || title.includes(keyword)) {
      return cat;
    }
  }
  return 'baby'; // デフォルト
}

// リトライ付きBrave検索
async function searchBrave(query, maxRetries = 3) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&country=jp&search_lang=jp`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'X-Subscription-Token': BRAVE_API_KEY,
          'Accept': 'application/json'
        }
      });

      if (response.status === 429) {
        const waitTime = attempt * 3000;
        console.log(`  ⚠️ レート制限 (429)。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Brave API error: ${response.status}`);
      }

      const data = await response.json();
      return data.web?.results || [];

    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`  ⚠️ エラー: ${error.message}。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
      } else {
        throw error;
      }
    }
  }

  return [];
}

// ASINを抽出（Amazon URLから）
function extractAsin(url) {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

// 商品名をAmazonタイトルからクリーンアップ
function cleanProductName(title) {
  // Amazon.co.jp等のサフィックスを除去
  let name = title
    .replace(/\s*[-|]\s*Amazon\.co\.jp.*$/i, '')
    .replace(/\s*\|.*$/, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();

  // 長すぎる場合は最初の部分だけ
  if (name.length > 40) {
    const parts = name.split(/\s+/);
    name = parts.slice(0, 4).join(' ');
  }

  return name;
}

async function main() {
  console.log('=== Brave APIでAmazonランキング情報を取得 ===\n');

  const allProducts = [];

  for (const query of SEARCH_QUERIES) {
    console.log(`検索: ${query}`);

    try {
      const results = await searchBrave(query);

      for (const result of results) {
        // Amazon.co.jpのURLのみ対象
        if (!result.url.includes('amazon.co.jp')) continue;

        const asin = extractAsin(result.url);
        if (asin) {
          const productName = cleanProductName(result.title);
          const category = guessCategory(result.title, query);

          console.log(`  ✅ ${productName}`);
          console.log(`     ASIN: ${asin} | カテゴリー: ${category}`);

          allProducts.push({
            name: productName,
            title: result.title,
            url: result.url,
            asin: asin,
            category: category,
            description: result.description,
            query: query
          });
        }
      }

      // レート制限対策（1秒間隔）
      await new Promise(r => setTimeout(r, 1500));

    } catch (error) {
      console.error(`  ❌ エラー: ${error.message}`);
    }

    console.log('');
  }

  console.log(`\n=== 結果 ===`);
  console.log(`取得した商品: ${allProducts.length}件`);

  // 重複除去（ASIN基準）
  const uniqueProducts = [];
  const seenAsins = new Set();
  for (const p of allProducts) {
    if (!seenAsins.has(p.asin)) {
      seenAsins.add(p.asin);
      uniqueProducts.push(p);
    }
  }

  console.log(`ユニーク商品: ${uniqueProducts.length}件`);

  // 結果を保存
  const outputPath = path.join(__dirname, 'brave-amazon-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(uniqueProducts, null, 2), 'utf8');
  console.log(`\n保存: ${outputPath}`);

  // カテゴリー別の集計
  const categoryCounts = {};
  for (const p of uniqueProducts) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }
  console.log('\nカテゴリー別:');
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`  ${cat}: ${count}件`);
  }
}

main().catch(console.error);
