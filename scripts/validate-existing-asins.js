const fs = require('fs');
const path = require('path');

// 既存記事からASINを抽出
const productsDir = '/Users/masa/kids-affiliate-site/products';
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');

async function validateAsin(asin) {
  try {
    const imageUrl = `https://m.media-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
    const response = await fetch(imageUrl, { method: 'HEAD' });
    return response.ok && response.status === 200;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('=== 既存記事のASIN検証 ===\n');

  const invalidList = [];
  const validList = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(productsDir, file), 'utf8');
    const match = content.match(/images\/P\/([A-Z0-9]+)/);

    if (match) {
      const asin = match[1];
      const isValid = await validateAsin(asin);

      if (isValid) {
        validList.push({ file, asin });
        console.log(`✅ ${file}: ${asin}`);
      } else {
        invalidList.push({ file, asin });
        console.log(`❌ ${file}: ${asin} - 無効`);
      }

      await new Promise(r => setTimeout(r, 150));
    } else {
      console.log(`⚠️  ${file}: ASINなし`);
    }
  }

  console.log(`\n=== 結果 ===`);
  console.log(`有効: ${validList.length}件`);
  console.log(`無効: ${invalidList.length}件`);

  if (invalidList.length > 0) {
    console.log('\n【無効なASINの記事】');
    for (const item of invalidList) {
      console.log(`  ${item.file}: ${item.asin}`);
    }
  }

  // 結果を保存
  fs.writeFileSync(
    path.join(__dirname, 'invalid-asins.json'),
    JSON.stringify(invalidList, null, 2),
    'utf8'
  );
}

main().catch(console.error);
