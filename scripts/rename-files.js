const fs = require('fs');
const path = require('path');

const productsDir = path.join(__dirname, '../products');

// 旧ファイル名 → 新ファイル名（SEOフレンドリー）
const renameMap = [
  { old: 'rx68j0.html', new: 'lego-duplo-kazuasobi-train.html', name: 'レゴデュプロ はじめてのデュプロ かずあそびトレイン' },
  { old: '18ztxll.html', new: 'kumon-study-shogi.html', name: 'くもん NEWスタディ将棋' },
  { old: 'b4m6pf.html', new: 'bornelund-magformers-62.html', name: 'ボーネルンド マグフォーマー ベーシックセット 62ピース' },
  { old: '1et2v7o.html', new: 'gakken-new-block.html', name: '学研 ニューブロック たっぷりセット' },
  { old: '1ijflir.html', new: 'edinter-mori-asobibako.html', name: 'エド・インター 森のあそび箱' },
  { old: '1ur9nu6.html', new: 'combi-nemulila-auto-swing.html', name: 'コンビ ネムリラ AUTO SWING' },
  { old: 'wc7jp.html', new: 'ergobaby-omni-360.html', name: 'エルゴベビー OMNI 360' },
  { old: 'zy2vmd.html', new: 'richell-fuwafuwa-baby-bath.html', name: 'リッチェル ふかふかベビーバス' },
  { old: '1mfcwkj.html', new: 'pigeon-bonyu-jikkan.html', name: 'ピジョン 母乳実感 哺乳びん' },
  { old: '2ltvx32.html', new: 'sylvanian-red-roof-house.html', name: 'シルバニアファミリー 赤い屋根の大きなお家' },
  { old: '1v573be.html', new: 'anpanman-block-lab-town.html', name: 'アンパンマン ブロックラボ たのしいアンパンマンタウン' },
  { old: 'qjj27e.html', new: 'mell-chan-baby-car.html', name: 'メルちゃん おせわだいすきベビーカー' },
  { old: '8ka6bo.html', new: 'tomica-dx-tower.html', name: 'トミカ でっかく遊ぼう DXトミカタワー' },
  { old: '2qxvagw.html', new: 'strider-sport-model.html', name: 'ストライダー スポーツモデル' },
  { old: '1ozjjmq.html', new: 'anpanman-buranko-park-dx.html', name: 'アンパンマン うちの子天才 ブランコパークDX' },
  { old: '5r0xsq2.html', new: 'nihon-ikuji-smart-gate-2.html', name: '日本育児 ベビーゲート スマートゲイト2' },
  { old: '2f0oqfz.html', new: 'richell-corner-cushion.html', name: 'リッチェル ベビーガード コーナークッション' },
];

// 1. ファイルをリネーム
console.log('📁 ファイルをリネーム中...\n');
for (const item of renameMap) {
  const oldPath = path.join(productsDir, item.old);
  const newPath = path.join(productsDir, item.new);

  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
    console.log(`✓ ${item.old} → ${item.new}`);
  } else {
    console.log(`✗ ${item.old} が見つかりません`);
  }
}

// 2. products/index.html のリンクを更新
console.log('\n📝 products/index.html を更新中...');
let productsIndex = fs.readFileSync(path.join(productsDir, 'index.html'), 'utf8');
for (const item of renameMap) {
  productsIndex = productsIndex.replace(new RegExp(item.old, 'g'), item.new);
}
fs.writeFileSync(path.join(productsDir, 'index.html'), productsIndex, 'utf8');
console.log('✓ 完了');

// 3. index.html（トップページ）のリンクを更新
console.log('\n📝 index.html を更新中...');
const rootIndexPath = path.join(__dirname, '../index.html');
let rootIndex = fs.readFileSync(rootIndexPath, 'utf8');
for (const item of renameMap) {
  rootIndex = rootIndex.replace(new RegExp(item.old, 'g'), item.new);
}
fs.writeFileSync(rootIndexPath, rootIndex, 'utf8');
console.log('✓ 完了');

// 4. サンプル記事を削除
const samplePath = path.join(productsDir, 'sample-product.html');
if (fs.existsSync(samplePath)) {
  fs.unlinkSync(samplePath);
  console.log('\n🗑️ sample-product.html を削除しました');
}

console.log('\n✅ 全て完了！');
