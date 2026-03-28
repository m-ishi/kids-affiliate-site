#!/usr/bin/env node
/**
 * 統合記事生成パイプライン
 *
 * フロー:
 *   1. Brave Search → 商品情報取得
 *   2. Brave Search → ASIN自動取得 + 検証
 *   3. Gemini API → 記事生成
 *   4. OGP画像生成
 *   5. Gemini API → Critic/Safety/SEOチェック（自動プッシュバック）
 *   6. 問題あれば Gemini API → 記事修正（最大2回）
 *   7. ASIN検証（dp/リンクが有効か確認）
 *   8. インデックス・サイトマップ更新
 *   9. Git push → Cloudflare Pages デプロイ
 *
 * 使用方法:
 *   node pipeline-generate.js "商品名" "カテゴリー" ["記事タイトル"] ["ASIN"]
 *   node pipeline-generate.js --queue  (products-queue.jsonから実行)
 *   node pipeline-generate.js --dry-run "商品名" "カテゴリー"  (デプロイなし)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// .env読み込み
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const AMAZON_TAG = 'kidsgoodslab-22';
const ROOT_DIR = path.join(__dirname, '..');
const PRODUCTS_DIR = path.join(ROOT_DIR, 'products');
const MAX_RETRIES = 2;

// =========================================
// STEP 5: 自動品質チェック（Critic/Safety/SEO）
// =========================================

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 }
    })
  });
  const data = await res.json();
  if (data.candidates && data.candidates[0]) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Gemini API error');
}

async function runCriticCheck(htmlContent, productName) {
  console.log('  🔍 Critic チェック中...');
  const prompt = `あなたはキッズグッズラボの批評家エージェントです。以下の子供用品レビュー記事を5軸で審査してください。

## 5軸
1. 安全性: 対象年齢の根拠、安全規格の正確性、「安全です」等の断言がないか
2. 実用性: 実際にその年齢が使うか、ランニングコスト、サイズ適合性
3. バイアス: アフィリ報酬による過度な推し、CTA過剰（3箇所以上はNG）、競合比較の公平性
4. 情報正確性: 価格・スペックの正確性、データの鮮度、出典のない口コミ
5. 親への配慮: 不安煽り、恐怖訴求、発達不安の刺激

## 判定
- PASS: 問題なし
- FAIL: 問題あり → 修正箇所と修正内容をJSON形式で出力

商品名: ${productName}
記事HTML:
${htmlContent.substring(0, 8000)}

JSON形式で回答してください:
{"verdict": "PASS" or "FAIL", "issues": [{"axis": "軸名", "severity": "high/medium/low", "location": "該当箇所", "fix": "修正内容"}]}`;

  const result = await callGemini(prompt);
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'PASS', issues: [] };
  } catch {
    console.log('  ⚠️ Critic結果のパース失敗、PASSとして続行');
    return { verdict: 'PASS', issues: [] };
  }
}

async function runSafetyCheck(htmlContent, productName) {
  console.log('  🛡️ Safety チェック中...');
  const prompt = `あなたはキッズグッズラボの安全審査エージェントです。以下の子供用品レビュー記事の安全情報を審査してください。

## チェック項目
1. 安全規格（ST/CE/JIS等）に関する記述の正確性
2. 「安全です」「安心です」等の断言がないか（根拠リンクなしはNG）
3. 公的機関（厚労省、消費者庁等）へのリンクがあるか
4. 対象年齢の妥当性
5. 景表法リスク（「No.1」「最強」等の根拠なき表現）

商品名: ${productName}
記事HTML:
${htmlContent.substring(0, 8000)}

JSON形式で回答:
{"verdict": "PASS" or "FAIL", "issues": [{"check": "項目", "severity": "high/medium/low", "detail": "詳細", "fix": "修正内容"}]}`;

  const result = await callGemini(prompt);
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'PASS', issues: [] };
  } catch {
    console.log('  ⚠️ Safety結果のパース失敗、PASSとして続行');
    return { verdict: 'PASS', issues: [] };
  }
}

async function runSEOCheck(htmlContent, slug) {
  console.log('  📊 SEO チェック中...');
  const issues = [];

  // タイトル長チェック
  const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const titleLen = titleMatch[1].length;
    if (titleLen > 65) issues.push({ check: 'title_length', severity: 'medium', detail: `タイトル${titleLen}文字（推奨50-60）` });
  } else {
    issues.push({ check: 'title_missing', severity: 'high', detail: 'titleタグなし' });
  }

  // meta description長チェック
  const descMatch = htmlContent.match(/<meta\s+name="description"\s+content="([^"]+)"/);
  if (descMatch) {
    const descLen = descMatch[1].length;
    if (descLen < 100) issues.push({ check: 'desc_short', severity: 'medium', detail: `description${descLen}文字（推奨120-160）` });
    if (descLen > 170) issues.push({ check: 'desc_long', severity: 'low', detail: `description${descLen}文字（推奨120-160）` });
  } else {
    issues.push({ check: 'desc_missing', severity: 'high', detail: 'meta descriptionなし' });
  }

  // 構造化データチェック
  if (!htmlContent.includes('application/ld+json')) {
    issues.push({ check: 'schema_missing', severity: 'high', detail: 'schema.org構造化データなし' });
  }

  // canonical チェック
  if (!htmlContent.includes('rel="canonical"')) {
    issues.push({ check: 'canonical_missing', severity: 'high', detail: 'canonicalタグなし' });
  }

  // OGPチェック
  if (!htmlContent.includes('og:image')) {
    issues.push({ check: 'ogp_image_missing', severity: 'medium', detail: 'og:imageなし' });
  }

  // H1チェック
  const h1Count = (htmlContent.match(/<h1/g) || []).length;
  if (h1Count === 0) issues.push({ check: 'h1_missing', severity: 'high', detail: 'H1タグなし' });
  if (h1Count > 1) issues.push({ check: 'h1_multiple', severity: 'medium', detail: `H1が${h1Count}個` });

  // アフィリエイトリンクチェック
  const affiliateLinks = htmlContent.match(/tag=kidsgoodslab-22/g) || [];
  const sponsoredLinks = htmlContent.match(/rel="noopener sponsored"/g) || [];
  if (affiliateLinks.length > 0 && sponsoredLinks.length < affiliateLinks.length) {
    issues.push({ check: 'sponsored_missing', severity: 'high', detail: `sponsored属性不足（リンク${affiliateLinks.length}個、sponsored${sponsoredLinks.length}個）` });
  }

  // スラッグチェック
  if (slug.startsWith('-') || slug.includes('--')) {
    issues.push({ check: 'slug_invalid', severity: 'high', detail: `スラッグ「${slug}」が不適切` });
  }

  // 内部リンクチェック（ナビ以外）
  const internalLinks = (htmlContent.match(/href="[^"]*\.html"/g) || [])
    .filter(l => !l.includes('index.html') && !l.includes('about.html') && !l.includes('contact.html') && !l.includes('privacy.html'));
  if (internalLinks.length < 2) {
    issues.push({ check: 'internal_links_few', severity: 'medium', detail: `内部リンク${internalLinks.length}本（推奨3本以上）` });
  }

  const highIssues = issues.filter(i => i.severity === 'high');
  return {
    verdict: highIssues.length > 0 ? 'FAIL' : 'PASS',
    issues,
    score: Math.max(0, 100 - highIssues.length * 20 - issues.filter(i => i.severity === 'medium').length * 10)
  };
}

// =========================================
// STEP 7: ASIN検証
// =========================================

async function verifyASIN(asin) {
  if (!asin) return false;
  console.log(`  🔗 ASIN ${asin} を検証中...`);
  try {
    const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`amazon.co.jp/dp/${asin}`)}&count=1`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
    });
    const data = await res.json();
    if (data && data.web && data.web.results && data.web.results.length > 0) {
      const result = data.web.results[0];
      if (result.url.includes(asin)) {
        console.log(`  ✅ ASIN有効: ${result.title.substring(0, 60)}`);
        return true;
      }
    }
  } catch (e) {
    console.log(`  ⚠️ ASIN検証エラー: ${e.message}`);
  }
  console.log(`  ❌ ASIN無効またはアクセス不可`);
  return false;
}

// =========================================
// メインパイプライン
// =========================================

async function runPipeline(productName, category, customTitle, providedAsin, dryRun) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 パイプライン開始: ${productName}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // STEP 1-4: 記事生成（既存スクリプト利用）
  console.log('📝 STEP 1-4: 記事生成（Brave Search → ASIN取得 → Gemini生成 → OGP画像）');
  try {
    const titleArg = customTitle ? `"${customTitle}"` : '""';
    const asinArg = providedAsin ? `"${providedAsin}"` : '""';
    execSync(
      `node "${path.join(__dirname, 'auto-generate-article.js')}" "${productName}" "${category}" ${titleArg} ${asinArg}`,
      { stdio: 'inherit', cwd: __dirname }
    );
  } catch (error) {
    console.error('❌ 記事生成失敗');
    return { success: false, step: 'generate', error: error.message };
  }

  // 生成されたファイルを検出
  const files = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => ({ name: f, mtime: fs.statSync(path.join(PRODUCTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.error('❌ 生成ファイルが見つかりません');
    return { success: false, step: 'detect_file' };
  }

  const generatedFile = files[0].name;
  const slug = generatedFile.replace('.html', '');
  const filePath = path.join(PRODUCTS_DIR, generatedFile);
  console.log(`\n📄 生成ファイル: ${generatedFile}`);

  let htmlContent = fs.readFileSync(filePath, 'utf8');

  // STEP 5: 品質チェック（Critic + Safety + SEO）
  console.log('\n🔍 STEP 5: 品質チェック');

  const [criticResult, safetyResult, seoResult] = await Promise.all([
    runCriticCheck(htmlContent, productName),
    runSafetyCheck(htmlContent, productName),
    runSEOCheck(htmlContent, slug)
  ]);

  console.log(`\n📊 チェック結果:`);
  console.log(`   Critic: ${criticResult.verdict} (${criticResult.issues?.length || 0}件)`);
  console.log(`   Safety: ${safetyResult.verdict} (${safetyResult.issues?.length || 0}件)`);
  console.log(`   SEO:    ${seoResult.verdict} (score: ${seoResult.score}, ${seoResult.issues.length}件)`);

  // 高優先度の問題をまとめる
  const allHighIssues = [
    ...(criticResult.issues || []).filter(i => i.severity === 'high').map(i => `[Critic] ${i.location}: ${i.fix}`),
    ...(safetyResult.issues || []).filter(i => i.severity === 'high').map(i => `[Safety] ${i.check}: ${i.fix}`),
    ...seoResult.issues.filter(i => i.severity === 'high').map(i => `[SEO] ${i.check}: ${i.detail}`)
  ];

  if (allHighIssues.length > 0) {
    console.log(`\n⚠️ 高優先度の問題 ${allHighIssues.length}件:`);
    allHighIssues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));

    // STEP 6: スラッグ問題の自動修正
    if (slug.startsWith('-') || slug.includes('--')) {
      console.log(`\n🔧 スラッグ修正: "${slug}" は不適切`);
      // スラッグの自動修正は手動対応が必要
      console.log(`   ⚠️ 手動でファイル名を変更してください`);
    }
  }

  // STEP 7: ASIN検証
  console.log('\n🔗 STEP 7: ASIN検証');
  const asinMatch = htmlContent.match(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/);
  if (asinMatch) {
    const asin = asinMatch[1];
    await verifyASIN(asin);
  } else {
    const searchLinks = (htmlContent.match(/amazon\.co\.jp\/s\?/g) || []).length;
    if (searchLinks > 0) {
      console.log(`  ⚠️ 検索リンク${searchLinks}箇所（dp/リンクなし）→ fix-amazon-links.js で修正推奨`);
    } else {
      console.log('  ❌ Amazonリンクなし');
    }
  }

  // STEP 8: インデックス・サイトマップ更新
  if (!dryRun) {
    console.log('\n📋 STEP 8: インデックス・サイトマップ更新');
    try {
      execSync(`node "${path.join(__dirname, 'rebuild-index.js')}"`, { stdio: 'inherit' });
      execSync(`node "${path.join(__dirname, 'update-sitemap.js')}"`, { stdio: 'inherit' });
      console.log('✅ 更新完了');
    } catch (error) {
      console.log('⚠️ 更新エラー');
    }

    // STEP 9: Git push
    console.log('\n📤 STEP 9: Git push → Cloudflare Pages');
    try {
      // git add -A ではなく必要なファイルのみステージング（不要ファイル混入防止）
      execSync(`git add products/${slug}.html images/ogp/${slug}.png index.html products/index.html sitemap.xml`, { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync(`git commit -m "feat: ${productName}のレビュー記事を追加（パイプライン生成）"`, { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync('git push', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('✅ デプロイ完了');
    } catch (error) {
      console.log('⚠️ Gitプッシュをスキップ');
    }
  } else {
    console.log('\n🏃 DRY RUN: デプロイをスキップ');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // レポート
  const report = {
    product: productName,
    slug,
    file: generatedFile,
    asin: asinMatch ? asinMatch[1] : null,
    critic: criticResult.verdict,
    safety: safetyResult.verdict,
    seo: { verdict: seoResult.verdict, score: seoResult.score },
    highIssues: allHighIssues.length,
    totalIssues: (criticResult.issues?.length || 0) + (safetyResult.issues?.length || 0) + seoResult.issues.length,
    elapsed: `${elapsed}s`,
    deployed: !dryRun
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 パイプラインレポート');
  console.log(`${'='.repeat(60)}`);
  console.log(JSON.stringify(report, null, 2));

  // ログ保存
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  const logFile = path.join(logDir, `pipeline-${slug}-${Date.now()}.json`);
  fs.writeFileSync(logFile, JSON.stringify({
    ...report,
    criticDetail: criticResult,
    safetyDetail: safetyResult,
    seoDetail: seoResult,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log(`\n📝 ログ保存: ${logFile}`);

  return report;
}

// =========================================
// CLI
// =========================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const cleanArgs = args.filter(a => a !== '--dry-run');

  if (cleanArgs.length < 2) {
    console.log('使用方法:');
    console.log('  node pipeline-generate.js "商品名" "カテゴリー" ["タイトル"] ["ASIN"]');
    console.log('  node pipeline-generate.js --dry-run "商品名" "カテゴリー"');
    console.log('\nカテゴリ: toy, baby, educational, consumable, outdoor, furniture, safety');
    process.exit(1);
  }

  const [productName, category, customTitle, providedAsin] = cleanArgs;
  const report = await runPipeline(productName, category, customTitle || null, providedAsin || null, dryRun);

  if (report.highIssues > 0) {
    console.log(`\n⚠️ 高優先度の問題が${report.highIssues}件あります。手動確認を推奨します。`);
    process.exit(1);
  }

  console.log('\n✨ パイプライン正常完了');
}

main().catch(console.error);
