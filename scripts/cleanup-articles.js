/**
 * 既存記事を検証済み商品リストと照合し、不要な記事を削除
 */

const fs = require('fs');
const path = require('path');

const productsDir = '/Users/masa/kids-affiliate-site/products';
const verifiedProducts = require('./verified-products.json');

// 検証済みASINリスト
const verifiedAsins = new Set(verifiedProducts.map(p => p.asin));

console.log(`検証済み商品: ${verifiedAsins.size}件`);
console.log('ASINs:', [...verifiedAsins].join(', '));

// 既存記事を取得
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');
console.log(`\n既存記事: ${files.length}件\n`);

const toKeep = [];
const toDelete = [];

for (const file of files) {
  const filePath = path.join(productsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // ASINを抽出
  const match = content.match(/images\/P\/([A-Z0-9]+)/);
  const asin = match ? match[1] : null;

  // タイトルを抽出
  const titleMatch = content.match(/<h1 class="article-title">([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].substring(0, 40) : file;

  if (asin && verifiedAsins.has(asin)) {
    toKeep.push({ file, asin, title });
    console.log(`✅ 残す: ${file}`);
    console.log(`   ASIN: ${asin}, タイトル: ${title}`);
  } else {
    toDelete.push({ file, asin, title });
    console.log(`❌ 削除: ${file}`);
    console.log(`   ASIN: ${asin || 'なし'}, タイトル: ${title}`);
  }
}

console.log(`\n=== 結果 ===`);
console.log(`残す記事: ${toKeep.length}件`);
console.log(`削除する記事: ${toDelete.length}件`);

// 削除リストを保存
fs.writeFileSync(
  path.join(__dirname, 'articles-to-delete.json'),
  JSON.stringify(toDelete, null, 2),
  'utf8'
);

console.log('\n削除リストを保存: articles-to-delete.json');
console.log('\n削除を実行するには: node cleanup-articles.js --execute');

// --execute オプションで実際に削除
if (process.argv.includes('--execute')) {
  console.log('\n=== 削除実行 ===');
  for (const item of toDelete) {
    const filePath = path.join(productsDir, item.file);
    fs.unlinkSync(filePath);
    console.log(`削除: ${item.file}`);
  }
  console.log(`\n${toDelete.length}件の記事を削除しました`);

  // インデックス再構築
  console.log('\nインデックスを再構築中...');
  require('./rebuild-index.js');
}
