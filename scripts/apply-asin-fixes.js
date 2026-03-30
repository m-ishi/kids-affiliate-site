#!/usr/bin/env node
/**
 * fix-all-links-log.json の asinInvalid 結果を使ってASINを一括置換
 * (Amazon HEAD検証はボット対策で404になるため、Brave Search結果を信頼)
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const LOG_FILE = path.join(__dirname, 'fix-all-links-log.json');

const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));

// asinInvalid に入っているもの = Brave Searchは見つけたがHTTP検証で弾かれたもの
const toFix = log.asinInvalid;

console.log(`📊 修正対象: ${toFix.length}件\n`);

let fixedCount = 0;
let skippedCount = 0;

// 特殊ケース: pampers-seasonal/pampers-skin-trouble は おしりふき のASINが出ている
// これらは本来「肌へのいちばん テープ」の記事なので、正しいASINに差し替え
const OVERRIDE_ASINS = {
  'pampers-seasonal.html': 'B084PGP3LD', // パンパース 肌へのいちばん テープ M
  'pampers-skin-trouble.html': 'B084PGP3LD',
  'pampers-wipes-hadaichi.html': 'B06W5T41QK', // パンパース おしりふき 肌へのいちばん（元のASINが正解だった場合）
  'pampers.html': 'B06W5T41QK', // おしりふき記事
  // pigeon-bonyujikkan-seasonal は乳首のASINが出ている → 哺乳びんに修正
  'pigeon-bonyujikkan-seasonal.html': 'B09QBZ99QM', // ピジョン母乳実感 哺乳びん
};

for (const item of toFix) {
  const filePath = path.join(PRODUCTS_DIR, item.file);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ ファイルなし: ${item.file}`);
    continue;
  }

  let html = fs.readFileSync(filePath, 'utf8');

  // 現在のASINを取得
  const currentASINs = [...new Set([...html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]))];

  // オーバーライドがあればそちらを使う
  const newASIN = OVERRIDE_ASINS[item.file] || item.asin;

  if (currentASINs.length === 0) {
    console.log(`⚠️ ${item.file}: ASINなし（スキップ）`);
    skippedCount++;
    continue;
  }

  let modified = false;
  for (const oldASIN of currentASINs) {
    if (oldASIN !== newASIN) {
      const pattern = new RegExp(`dp/${oldASIN}`, 'g');
      html = html.replace(pattern, `dp/${newASIN}`);
      console.log(`✅ ${item.file}: ${oldASIN} → ${newASIN}`);
      modified = true;
    } else {
      console.log(`⏭️ ${item.file}: ASIN変更なし (${oldASIN})`);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, html, 'utf8');
    fixedCount++;
  } else {
    skippedCount++;
  }
}

console.log(`\n✅ 修正完了: ${fixedCount}件`);
console.log(`⏭️ スキップ: ${skippedCount}件`);
