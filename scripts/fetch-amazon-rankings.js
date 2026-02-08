/**
 * Brave APIでAmazonベストセラー情報を取得
 */

const fs = require('fs');
const path = require('path');

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

if (!BRAVE_API_KEY) {
  console.error('BRAVE_API_KEY が設定されていません');
  process.exit(1);
}

// 検索カテゴリー
const SEARCH_QUERIES = [
  'Amazon ベビー ベストセラー おむつ 2024',
  'Amazon ベビー ベストセラー 抱っこ紐 2024',
  'Amazon ベビー ベストセラー ベビーカー 2024',
  'Amazon ベビー ベストセラー チャイルドシート 2024',
  'Amazon ベビー ベストセラー 哺乳瓶 粉ミルク 2024',
  'Amazon 知育玩具 ベストセラー 2024',
  'Amazon ベビー ベストセラー バウンサー ハイローチェア 2024',
];

async function searchBrave(query) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&country=jp&search_lang=ja`;

  const response = await fetch(url, {
    headers: {
      'X-Subscription-Token': BRAVE_API_KEY,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status}`);
  }

  const data = await response.json();
  return data.web?.results || [];
}

// ASINを抽出（Amazon URLから）
function extractAsin(url) {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

async function main() {
  console.log('=== Brave APIでAmazonランキング情報を取得 ===\n');

  const allProducts = [];

  for (const query of SEARCH_QUERIES) {
    console.log(`検索: ${query}`);

    try {
      const results = await searchBrave(query);

      for (const result of results) {
        console.log(`  - ${result.title}`);
        console.log(`    ${result.url}`);

        const asin = extractAsin(result.url);
        if (asin) {
          console.log(`    ASIN: ${asin}`);
          allProducts.push({
            title: result.title,
            url: result.url,
            asin: asin,
            description: result.description
          });
        }
      }

      // レート制限対策
      await new Promise(r => setTimeout(r, 1000));

    } catch (error) {
      console.error(`  エラー: ${error.message}`);
    }

    console.log('');
  }

  console.log(`\n=== 結果 ===`);
  console.log(`取得した商品: ${allProducts.length}件`);

  // 重複除去
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
}

main().catch(console.error);
