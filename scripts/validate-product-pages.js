const fs = require('fs');
const path = require('path');

// 既存記事からASINを抽出
const productsDir = '/Users/masa/kids-affiliate-site/products';
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');

// 商品ページが有効かチェック（リダイレクトやエラーページでないか）
async function validateProductPage(asin) {
  try {
    const productUrl = `https://www.amazon.co.jp/dp/${asin}`;
    const response = await fetch(productUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ja-JP,ja;q=0.9'
      },
      redirect: 'follow'
    });

    const text = await response.text();

    // エラーページのパターンをチェック
    if (text.includes('お探しの商品は見つかりませんでした') ||
        text.includes('この商品は現在お取り扱いできません') ||
        text.includes('ページが見つかりません') ||
        text.includes('何かお探しですか')) {
      return { valid: false, reason: '商品ページなし/取り扱い終了' };
    }

    // 正常なページかチェック（カートに入れるボタンや価格があるか）
    if (text.includes('カートに入れる') || text.includes('今すぐ買う') || text.includes('¥')) {
      return { valid: true, reason: '販売中' };
    }

    return { valid: false, reason: '不明なページ状態' };

  } catch (error) {
    return { valid: false, reason: `エラー: ${error.message}` };
  }
}

async function main() {
  console.log('=== 商品ページの有効性チェック ===\n');
  console.log('※ 実際の商品ページをチェックするため時間がかかります\n');

  const results = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(productsDir, file), 'utf8');
    const match = content.match(/images\/P\/([A-Z0-9]+)/);

    if (match) {
      const asin = match[1];
      console.log(`チェック中: ${file} (${asin})...`);

      const result = await validateProductPage(asin);
      results.push({ file, asin, ...result });

      if (result.valid) {
        console.log(`  ✅ ${result.reason}`);
      } else {
        console.log(`  ❌ ${result.reason}`);
      }

      // レート制限対策（Amazonにブロックされないよう）
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const validCount = results.filter(r => r.valid).length;
  const invalidResults = results.filter(r => !r.valid);

  console.log(`\n=== 結果 ===`);
  console.log(`有効: ${validCount}件`);
  console.log(`無効: ${invalidResults.length}件`);

  if (invalidResults.length > 0) {
    console.log('\n【無効な商品ページ】');
    for (const item of invalidResults) {
      console.log(`  ${item.file}: ${item.asin} - ${item.reason}`);
    }
  }

  // 結果を保存
  fs.writeFileSync(
    path.join(__dirname, 'product-page-validation.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
}

main().catch(console.error);
