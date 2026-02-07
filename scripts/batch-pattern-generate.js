/**
 * 複数パターンで記事を一括生成するスクリプト
 *
 * 使い方:
 *   node batch-pattern-generate.js
 *
 * batch-pattern-queue.json を読み込んで記事を生成します
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const queuePath = path.join(__dirname, 'batch-pattern-queue.json');

// サンプルキューを作成
function createSampleQueue() {
  const sample = [
    {
      productName: 'パンパース さらさらケア',
      category: 'consumable',
      patterns: ['where-to-buy', 'lowest-price', 'skin-trouble'],
      asin: 'B0BYG24S5V'
    },
    {
      productName: 'ストライダー スポーツモデル',
      category: 'outdoor',
      patterns: ['where-to-buy', 'age-guide', 'safety'],
      asin: 'B00IZXCB5A'
    },
    {
      productName: 'コンビ クルムーヴ',
      category: 'furniture',
      patterns: ['where-to-buy', 'regret', 'size-check'],
      asin: 'B01HT85TJW'
    },
    {
      productName: 'マグフォーマー',
      category: 'educational',
      patterns: ['where-to-buy', 'effect', 'alternative'],
      asin: 'B001HGJA5U'
    },
    {
      productName: 'アイクレオ 粉ミルク',
      category: 'food',
      patterns: ['where-to-buy', 'when-to-start', 'safety'],
      asin: 'B07CWF5D4P'
    }
  ];

  fs.writeFileSync(queuePath, JSON.stringify(sample, null, 2), 'utf8');
  console.log(`サンプルキューを作成しました: ${queuePath}`);
  console.log('\n内容を編集してから再度実行してください。');
  return sample;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // キューファイルがなければサンプル作成
  if (!fs.existsSync(queuePath)) {
    createSampleQueue();
    return;
  }

  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  console.log(`\n=== バッチ生成開始 ===`);
  console.log(`キュー内のアイテム: ${queue.length}件`);

  let totalGenerated = 0;
  let totalPatterns = queue.reduce((sum, item) => sum + item.patterns.length, 0);

  console.log(`生成予定の記事数: ${totalPatterns}件\n`);

  for (const item of queue) {
    console.log(`\n--- ${item.productName} ---`);

    for (const pattern of item.patterns) {
      console.log(`  パターン: ${pattern}`);

      try {
        const cmd = `node "${path.join(__dirname, 'generate-pattern-article.js')}" "${item.productName}" "${item.category}" "${pattern}"${item.asin ? ` "${item.asin}"` : ''}`;

        execSync(cmd, {
          stdio: 'inherit',
          env: process.env
        });

        totalGenerated++;
        console.log(`  ✅ 完了 (${totalGenerated}/${totalPatterns})`);

        // API制限対策で少し待機
        await sleep(3000);

      } catch (error) {
        console.error(`  ❌ エラー: ${error.message}`);
      }
    }
  }

  console.log(`\n=== 完了 ===`);
  console.log(`生成した記事: ${totalGenerated}/${totalPatterns}件`);

  // 完了したらキューをクリア（バックアップを残す）
  const backupPath = queuePath.replace('.json', `-done-${Date.now()}.json`);
  fs.renameSync(queuePath, backupPath);
  console.log(`キューをバックアップしました: ${backupPath}`);
}

main().catch(console.error);
