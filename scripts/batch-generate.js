#!/usr/bin/env node
/**
 * バッチ記事生成スクリプト
 *
 * 使用方法:
 *   node batch-generate.js [--limit N]
 *
 * 商品リストは products-queue.json から読み込みます
 * 生成済みの商品は products-done.json に記録されます
 *
 * キューファイル形式:
 *   [{ "name": "商品名", "category": "カテゴリ", "pattern": "パターンキー", "title": "記事タイトル", "asin": "ASIN" }]
 *   pattern: reviews, where-to-buy, lowest-price, comparison, age-guide 等（省略時は reviews）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'products-queue.json');
const DONE_FILE = path.join(__dirname, 'products-done.json');

// キューファイルがなければサンプルを作成
function initQueueFile() {
  if (!fs.existsSync(QUEUE_FILE)) {
    const sample = [
      { name: "グーン まっさらさら通気", category: "consumable", pattern: "reviews" },
      { name: "ベビービョルン バウンサー", category: "baby", pattern: "where-to-buy" },
      { name: "プラレール ベーシックセット", category: "toy", pattern: "age-guide" }
    ];
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(sample, null, 2), 'utf8');
    console.log(`📝 サンプルキューファイルを作成: ${QUEUE_FILE}`);
  }
}

// 完了リストを読み込み
function loadDoneList() {
  if (fs.existsSync(DONE_FILE)) {
    return JSON.parse(fs.readFileSync(DONE_FILE, 'utf8'));
  }
  return [];
}

// 完了リストに追加
function addToDoneList(product) {
  const done = loadDoneList();
  done.push({
    ...product,
    generatedAt: new Date().toISOString()
  });
  fs.writeFileSync(DONE_FILE, JSON.stringify(done, null, 2), 'utf8');
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  let limit = 3; // デフォルトは3件

  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
  }

  initQueueFile();

  // キューを読み込み
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const done = loadDoneList();
  const doneNames = done.map(d => d.name);

  // 未処理の商品をフィルタ
  const pending = queue.filter(p => !doneNames.includes(p.name));

  if (pending.length === 0) {
    console.log('✅ すべての商品が処理済みです');
    return;
  }

  console.log(`📋 未処理: ${pending.length}件, 今回処理: ${Math.min(limit, pending.length)}件\n`);

  const toProcess = pending.slice(0, limit);

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    console.log(`\n[${ i + 1}/${toProcess.length}] ${product.name}`);
    console.log('='.repeat(50));

    try {
      const titleArg = product.title ? `"${product.title}"` : '""';
      const asinArg = product.asin ? `"${product.asin}"` : '""';
      const patternArg = product.pattern ? `"${product.pattern}"` : '';
      execSync(
        `node "${path.join(__dirname, 'auto-generate-article.js')}" "${product.name}" "${product.category}" ${titleArg} ${asinArg} ${patternArg}`,
        { stdio: 'inherit' }
      );

      addToDoneList(product);

      // API制限対策で待機
      if (i < toProcess.length - 1) {
        console.log('\n⏳ 次の記事まで10秒待機...\n');
        await new Promise(r => setTimeout(r, 10000));
      }
    } catch (error) {
      console.error(`❌ エラー: ${product.name}`);
    }
  }

  // インデックスとサイトマップを再構築
  console.log('\n🔄 インデックスページを再構築中...');
  try {
    execSync(`node "${path.join(__dirname, 'rebuild-index.js')}"`, { stdio: 'inherit' });
    console.log('✅ インデックス更新完了');
  } catch (error) {
    console.log('⚠️ インデックス更新エラー');
  }

  console.log('🗺️ サイトマップを更新中...');
  try {
    execSync(`node "${path.join(__dirname, 'update-sitemap.js')}"`, { stdio: 'inherit' });
    console.log('✅ サイトマップ更新完了');
  } catch (error) {
    console.log('⚠️ サイトマップ更新エラー');
  }

  // Gitコミット＆プッシュ
  console.log('\n📤 GitHubにプッシュ中...');
  try {
    execSync('git add -A', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    execSync(`git commit -m "記事${toProcess.length}件追加（自動生成）"`, { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    execSync('git push', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
    console.log('✅ プッシュ完了');
  } catch (error) {
    console.log('⚠️ Gitプッシュをスキップ（変更なしまたはエラー）');
  }

  console.log('\n🎉 バッチ処理完了！');
}

main().catch(console.error);
