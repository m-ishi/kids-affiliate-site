#!/usr/bin/env node
/**
 * バッチ記事生成スクリプト
 *
 * 使用方法:
 *   node batch-generate.js [--limit N] [--dry-run]
 *
 * products-queue.json から status が pending（または未設定）の商品を読み込み、
 * pipeline-generate.js（ASIN検証 + 品質ゲート付き）で1件ずつ処理します。
 * 結果は queue の status に反映（published / failed）、products-done.json にも記録。
 *
 * キューファイル形式:
 *   [{ "name": "商品名", "category": "カテゴリ", "pattern": "パターンキー",
 *      "title": "記事タイトル", "asin": "ASIN", "status": "pending" }]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(__dirname, 'products-queue.json');
const DONE_FILE = path.join(__dirname, 'products-done.json');

function loadDoneList() {
  if (fs.existsSync(DONE_FILE)) {
    return JSON.parse(fs.readFileSync(DONE_FILE, 'utf8'));
  }
  return [];
}

function addToDoneList(product, result) {
  const done = loadDoneList();
  done.push({
    ...product,
    result,
    generatedAt: new Date().toISOString()
  });
  fs.writeFileSync(DONE_FILE, JSON.stringify(done, null, 2), 'utf8');
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let limit = 3;

  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
  }

  if (!fs.existsSync(QUEUE_FILE)) {
    console.error(`❌ キューファイルがありません: ${QUEUE_FILE}`);
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  const doneNames = loadDoneList().map(d => d.name);

  // 未処理 = status が pending/未設定、かつ done リストにない
  const pending = queue.filter(p =>
    (!p.status || p.status === 'pending') && !doneNames.includes(p.name)
  );

  if (pending.length === 0) {
    console.log('✅ すべての商品が処理済みです');
    return;
  }

  console.log(`📋 未処理: ${pending.length}件, 今回処理: ${Math.min(limit, pending.length)}件${dryRun ? '（dry-run）' : ''}\n`);

  const toProcess = pending.slice(0, limit);
  const summary = { published: [], failed: [] };

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}] ${product.name}`);
    console.log('='.repeat(50));

    const titleArg = product.title ? `"${product.title.replace(/"/g, '\\"')}"` : '""';
    const asinArg = product.asin ? `"${product.asin}"` : '""';
    const dryArg = dryRun ? '--dry-run ' : '';

    let ok = false;
    try {
      execSync(
        `node "${path.join(__dirname, 'pipeline-generate.js')}" ${dryArg}"${product.name}" "${product.category}" ${titleArg} ${asinArg}`,
        { stdio: 'inherit' }
      );
      ok = true;
    } catch {
      console.error(`❌ 失敗: ${product.name}（ASIN検証落ち or 品質ゲート不合格）`);
    }

    // キューのstatusを更新（dry-runは副作用なし）
    if (!dryRun) {
      const qItem = queue.find(p => p.name === product.name);
      if (qItem) {
        qItem.status = ok ? 'published' : 'failed';
        if (!ok) qItem.failedAt = new Date().toISOString();
        saveQueue(queue);
      }
      if (ok) addToDoneList(product, 'published');
    }
    (ok ? summary.published : summary.failed).push(product.name);

    // API制限対策で待機
    if (i < toProcess.length - 1) {
      console.log('\n⏳ 次の記事まで10秒待機...\n');
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 バッチ処理完了: 成功 ${summary.published.length} / 失敗 ${summary.failed.length}`);
  if (summary.failed.length > 0) {
    console.log('失敗（status=failed、要確認）:');
    summary.failed.forEach(n => console.log(`  - ${n}`));
  }
}

main().catch(console.error);
