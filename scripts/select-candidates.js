/**
 * 取得データから既存記事と重複しない商品を選定
 */
const fs = require('fs');
const path = require('path');

// 取得データを読み込み
const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'brave-amazon-results.json'), 'utf8'));

// 既存記事のASINを取得
const productsDir = path.join(__dirname, '..', 'products');
const existingFiles = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');

const existingAsins = new Set();
for (const f of existingFiles) {
  const content = fs.readFileSync(path.join(productsDir, f), 'utf8');
  const asinMatch = content.match(/\/dp\/([A-Z0-9]{10})/);
  if (asinMatch) existingAsins.add(asinMatch[1]);
}

// 既存キューの商品名
const queue = JSON.parse(fs.readFileSync(path.join(__dirname, 'products-queue.json'), 'utf8'));
const queueNames = new Set(queue.map(q => q.name));

console.log('=== 既存ASIN数:', existingAsins.size);
console.log('=== 既存キュー:', queueNames.size);
console.log('');

// 除外条件
function shouldExclude(item) {
  const name = item.name;
  const title = item.title;

  // 名前が不明確
  if (name === 'Amazon.co.jp' || name === 'Amazon' || name.length < 5) return true;

  // お試しセット系
  if (title.includes('お試しセット') || title.includes('お試しパック')) return true;

  // アクセサリー系
  if (title.includes('よだれカバー') || title.includes('よだれパッド')) return true;
  if (title.includes('振り子') || title.includes('寝かしつけ おもちゃ')) return true;
  if (title.includes('安全ネット') || title.includes('落下防止')) return true;

  // 既存ASINと重複
  if (existingAsins.has(item.asin)) return true;

  return false;
}

// フィルタリング
const candidates = results.filter(item => !shouldExclude(item));

console.log('候補商品:', candidates.length, '件');
console.log('');
candidates.forEach((c, i) => {
  console.log((i+1) + '. ' + c.name);
  console.log('   ASIN: ' + c.asin + ' | カテゴリー: ' + c.category);
  console.log('   元タイトル: ' + c.title.substring(0, 100));
  console.log('');
});
