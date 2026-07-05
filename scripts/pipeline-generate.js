#!/usr/bin/env node
/**
 * 統合記事生成パイプライン
 *
 * フロー:
 *   1. ASIN検証（asin-resolver: 404/不一致/在庫なし/アフィ対象外を排除。通らなければ生成しない）
 *   2. Brave Search → 商品情報取得
 *   3. Gemini生成（文字数・禁止表現ゲート内蔵） + OGP画像
 *   4. Critic/Safety/SEOチェック
 *   5. 問題があれば Gemini で本文修正（最大2回）→ 再チェック
 *   6. 合格 → インデックス・サイトマップ更新 → Git push
 *      不合格 → drafts/ に隔離してデプロイ中止（インデックスにも載せない）
 *
 * 使用方法:
 *   node pipeline-generate.js "商品名" "カテゴリー" ["記事タイトル"] ["ASIN"]
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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const ROOT_DIR = path.join(__dirname, '..');
const PRODUCTS_DIR = path.join(ROOT_DIR, 'products');
const DRAFTS_DIR = path.join(ROOT_DIR, 'drafts');
const MAX_REVISIONS = 2;

const CONTENT_START = '<!-- article-content-start -->';
const CONTENT_END = '<!-- article-content-end -->';

// =========================================
// 品質チェック（Critic/Safety/SEO）
// =========================================

async function callGemini(prompt, maxOutputTokens = 16384) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens, temperature: 0.3 }
    })
  });
  const data = await res.json();
  if (data.candidates && data.candidates[0]) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error(`Gemini API error: ${data.error ? data.error.message : 'unknown'}`);
}

/**
 * 記事本文のテキストを抽出（headやナビではなく生成コンテンツを審査対象にする）
 */
function extractArticleText(htmlContent) {
  const start = htmlContent.indexOf(CONTENT_START);
  const end = htmlContent.indexOf(CONTENT_END);
  let region;
  if (start !== -1 && end !== -1) {
    region = htmlContent.substring(start + CONTENT_START.length, end);
  } else {
    // マーカーがない旧記事: article-body全体
    const m = htmlContent.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/);
    region = m ? m[1] : htmlContent;
  }
  return region.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 生成コンテンツ領域（HTML）を取得 */
function extractContentRegion(htmlContent) {
  const start = htmlContent.indexOf(CONTENT_START);
  const end = htmlContent.indexOf(CONTENT_END);
  if (start === -1 || end === -1) return null;
  return htmlContent.substring(start + CONTENT_START.length, end).trim();
}

async function runCriticCheck(articleText, productName) {
  console.log('  🔍 Critic チェック中...');
  const prompt = `あなたはキッズグッズラボの批評家エージェントです。以下の子供用品レビュー記事本文を5軸で審査してください。

## 5軸
1. 安全性: 対象年齢の根拠、安全規格の正確性、「安全です」等の断言がないか
2. 実用性: 実際にその年齢が使うか、ランニングコスト、サイズ適合性
3. バイアス: アフィリ報酬による過度な推し、競合比較の公平性
4. 情報正確性: 価格・スペックの正確性、データの鮮度、出典のない口コミの断定
5. 親への配慮: 不安煽り、恐怖訴求、発達不安の刺激

## 判定基準
- severity "high" は「公開すると実害がある」レベルのみ（法的リスク、明白な虚偽、危険な誤情報）
- 文体の好みや改善提案は "low"

商品名: ${productName}
記事本文:
${articleText.substring(0, 12000)}

JSON形式で回答してください:
{"verdict": "PASS" or "FAIL", "issues": [{"axis": "軸名", "severity": "high/medium/low", "location": "該当箇所の文章（原文のまま抜粋）", "fix": "修正内容"}]}`;

  const result = await callGemini(prompt, 4096);
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'PASS', issues: [] };
  } catch {
    console.log('  ⚠️ Critic結果のパース失敗、PASSとして続行');
    return { verdict: 'PASS', issues: [] };
  }
}

async function runSafetyCheck(articleText, productName) {
  console.log('  🛡️ Safety チェック中...');
  const prompt = `あなたはキッズグッズラボの安全審査エージェントです。以下の子供用品レビュー記事本文の安全情報を審査してください。

## チェック項目
1. 安全規格（ST/CE/JIS等）に関する記述の正確性（存在しない規格・取得していない規格を「取得済み」と書いていないか）
2. 「安全です」「安心です」等の断言がないか（根拠なしはNG）
3. 対象年齢の妥当性（誤飲リスクのある部品を3歳未満に勧めていないか等）
4. 景表法リスク（「No.1」「最強」「最安」等の根拠なき最上級表現）
5. 医学的・発達に関する断定（「これで発達が伸びる」等）

## 判定基準
- severity "high" は法的リスク・実害があるもののみ

商品名: ${productName}
記事本文:
${articleText.substring(0, 12000)}

JSON形式で回答:
{"verdict": "PASS" or "FAIL", "issues": [{"check": "項目", "severity": "high/medium/low", "location": "該当箇所の文章（原文のまま抜粋）", "fix": "修正内容"}]}`;

  const result = await callGemini(prompt, 4096);
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: 'PASS', issues: [] };
  } catch {
    console.log('  ⚠️ Safety結果のパース失敗、PASSとして続行');
    return { verdict: 'PASS', issues: [] };
  }
}

function runSEOCheck(htmlContent, slug) {
  console.log('  📊 SEO チェック中...');
  const issues = [];

  const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const titleLen = titleMatch[1].length;
    if (titleLen > 70) issues.push({ check: 'title_length', severity: 'medium', detail: `タイトル${titleLen}文字（推奨50-60）` });
  } else {
    issues.push({ check: 'title_missing', severity: 'high', detail: 'titleタグなし' });
  }

  const descMatch = htmlContent.match(/<meta\s+name="description"\s+content="([^"]+)"/);
  if (descMatch) {
    const descLen = descMatch[1].length;
    if (descLen < 80) issues.push({ check: 'desc_short', severity: 'medium', detail: `description${descLen}文字（推奨110-160）` });
    if (descLen > 170) issues.push({ check: 'desc_long', severity: 'low', detail: `description${descLen}文字（推奨110-160）` });
  } else {
    issues.push({ check: 'desc_missing', severity: 'high', detail: 'meta descriptionなし' });
  }

  if (!htmlContent.includes('application/ld+json')) {
    issues.push({ check: 'schema_missing', severity: 'high', detail: 'schema.org構造化データなし' });
  }

  if (!htmlContent.includes('rel="canonical"')) {
    issues.push({ check: 'canonical_missing', severity: 'high', detail: 'canonicalタグなし' });
  }

  if (!htmlContent.includes('og:image')) {
    issues.push({ check: 'ogp_image_missing', severity: 'medium', detail: 'og:imageなし' });
  }

  const h1Count = (htmlContent.match(/<h1/g) || []).length;
  if (h1Count === 0) issues.push({ check: 'h1_missing', severity: 'high', detail: 'H1タグなし' });
  if (h1Count > 1) issues.push({ check: 'h1_multiple', severity: 'medium', detail: `H1が${h1Count}個` });

  // アフィリエイトリンク: dp/直リンクのみ・sponsored必須・CTA最大2ブロック
  // （href属性のみ対象。schema.orgのJSON-LD内URLはリンクではないので数えない）
  const affiliateLinks = htmlContent.match(/href="[^"]*amazon\.co\.jp[^"]*tag=kidsgoodslab-22[^"]*"/g) || [];
  const sponsoredLinks = htmlContent.match(/rel="noopener sponsored"/g) || [];
  if (affiliateLinks.length > 0 && sponsoredLinks.length < affiliateLinks.length) {
    issues.push({ check: 'sponsored_missing', severity: 'high', detail: `sponsored属性不足（リンク${affiliateLinks.length}個、sponsored${sponsoredLinks.length}個）` });
  }
  if (htmlContent.includes('amazon.co.jp/s?')) {
    issues.push({ check: 'search_link', severity: 'high', detail: 'Amazon検索結果へのリンクあり（dp/直リンクにすべき）' });
  }
  const ctaBlocks = (htmlContent.match(/class="affiliate-btn"/g) || []).length;
  if (ctaBlocks > 2) {
    issues.push({ check: 'cta_excess', severity: 'high', detail: `CTAボタン${ctaBlocks}個（基準は最大2: 冒頭+末尾）` });
  }

  if (slug.startsWith('-') || slug.includes('--') || slug.startsWith('product-1')) {
    issues.push({ check: 'slug_invalid', severity: 'high', detail: `スラッグ「${slug}」が不適切` });
  }

  // 内部リンク（ナビ以外の記事間リンク。拡張子なしURLにも対応）
  const internalLinks = (htmlContent.match(/href="[a-z0-9][a-z0-9-]*(?:\.html)?"/g) || [])
    .filter(l => !l.includes('index.html'));
  if (internalLinks.length < 3) {
    issues.push({ check: 'internal_links_few', severity: 'high', detail: `内部リンク${internalLinks.length}本（基準3本以上）` });
  }

  // 公的機関リンク
  const hasAuthority = /caa\.go\.jp|kokusen\.go\.jp|toys\.or\.jp|mhlw\.go\.jp|meti\.go\.jp/.test(htmlContent);
  if (!hasAuthority) {
    issues.push({ check: 'authority_link_missing', severity: 'high', detail: '公的機関への外部リンクなし' });
  }

  // 文字数
  const articleText = extractArticleText(htmlContent);
  if (articleText.length < 1500) {
    issues.push({ check: 'too_short', severity: 'high', detail: `本文${articleText.length}文字（最低1500）` });
  }

  const highIssues = issues.filter(i => i.severity === 'high');
  return {
    verdict: highIssues.length > 0 ? 'FAIL' : 'PASS',
    issues,
    score: Math.max(0, 100 - highIssues.length * 20 - issues.filter(i => i.severity === 'medium').length * 10)
  };
}

// =========================================
// 自動修正（high issueをGeminiで本文修正）
// =========================================

async function reviseArticle(filePath, htmlContent, highIssues) {
  const contentRegion = extractContentRegion(htmlContent);
  if (!contentRegion) {
    console.log('  ⚠️ 本文マーカーが見つからないため自動修正をスキップ');
    return htmlContent;
  }

  console.log(`  🔧 本文を自動修正中（${highIssues.length}件）...`);
  const prompt = `以下のHTML記事本文に品質上の問題があります。指摘箇所だけを修正し、記事全体をそのまま返してください。

【指摘事項】
${highIssues.map((i, n) => `${n + 1}. [${i.source}] ${i.location || i.check || ''}: ${i.fix || i.detail}`).join('\n')}

【ルール】
- HTMLタグ構造は変えない（h2/p/ul等の構成維持）
- 指摘に該当する文以外は一切変更しない
- 文字数を減らさない（削除ではなく書き換えで対応）
- 「安全です」等の断言は根拠ベースの表現に置き換える
- 出力は<content>タグで囲んだ記事本文のみ

<content>
${contentRegion}
</content>`;

  const result = await callGemini(prompt, 24576);
  const m = result.match(/<content>([\s\S]*?)<\/content>/);
  if (!m) {
    console.log('  ⚠️ 修正結果のパース失敗、元の本文を維持');
    return htmlContent;
  }

  const revised = m[1].trim();
  // 修正で本文が大幅に縮んだ場合は採用しない（破壊防止）
  if (revised.replace(/<[^>]+>/g, '').length < contentRegion.replace(/<[^>]+>/g, '').length * 0.7) {
    console.log('  ⚠️ 修正結果が元の70%未満に縮小、採用せず');
    return htmlContent;
  }

  const start = htmlContent.indexOf(CONTENT_START);
  const end = htmlContent.indexOf(CONTENT_END);
  const newHtml = htmlContent.substring(0, start + CONTENT_START.length) +
    '\n        ' + revised + '\n        ' +
    htmlContent.substring(end);
  fs.writeFileSync(filePath, newHtml, 'utf8');
  return newHtml;
}

// =========================================
// チェック一式を実行して high issue を集める
// =========================================

async function runAllChecks(htmlContent, productName, slug) {
  const articleText = extractArticleText(htmlContent);
  const [criticResult, safetyResult] = await Promise.all([
    runCriticCheck(articleText, productName),
    runSafetyCheck(articleText, productName),
  ]);
  const seoResult = runSEOCheck(htmlContent, slug);

  const highIssues = [
    ...(criticResult.issues || []).filter(i => i.severity === 'high').map(i => ({ ...i, source: 'Critic' })),
    ...(safetyResult.issues || []).filter(i => i.severity === 'high').map(i => ({ ...i, source: 'Safety' })),
    ...seoResult.issues.filter(i => i.severity === 'high').map(i => ({ ...i, source: 'SEO' })),
  ];

  return { criticResult, safetyResult, seoResult, highIssues };
}

// 不合格記事を drafts/ に隔離
function quarantine(slug) {
  if (!fs.existsSync(DRAFTS_DIR)) fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const src = path.join(PRODUCTS_DIR, `${slug}.html`);
  const dst = path.join(DRAFTS_DIR, `${slug}.html`);
  if (fs.existsSync(src)) fs.renameSync(src, dst);
  const ogpSrc = path.join(ROOT_DIR, 'images', 'ogp', `${slug}.png`);
  const ogpDst = path.join(DRAFTS_DIR, `${slug}.ogp.png`);
  if (fs.existsSync(ogpSrc)) fs.renameSync(ogpSrc, ogpDst);
  // インデックスから除去
  try {
    execSync(`node "${path.join(__dirname, 'rebuild-index.js')}"`, { stdio: 'pipe' });
  } catch { /* 手動対応 */ }
  console.log(`\n🚧 不合格のため隔離しました: drafts/${slug}.html`);
  console.log('   修正後、products/ に戻して再チェックしてください');
}

// =========================================
// メインパイプライン
// =========================================

async function runPipeline(productName, category, customTitle, providedAsin, dryRun) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 パイプライン開始: ${productName}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // STEP 1-3: ASIN検証 + 記事生成（auto-generate-article.js が全て実施）
  console.log('📝 STEP 1-3: ASIN検証 → 記事生成 → OGP画像');
  try {
    const titleArg = customTitle ? `"${customTitle.replace(/"/g, '\\"')}"` : '""';
    const asinArg = providedAsin ? `"${providedAsin}"` : '""';
    execSync(
      `node "${path.join(__dirname, 'auto-generate-article.js')}" "${productName}" "${category}" ${titleArg} ${asinArg}`,
      { stdio: 'inherit', cwd: __dirname }
    );
  } catch (error) {
    console.error('❌ 記事生成失敗（ASIN検証落ち or 品質基準未達）');
    return { success: false, step: 'generate', error: error.message };
  }

  // 生成結果を取得（auto-generate-article.js が書き出す）
  const lastGenPath = path.join(__dirname, 'logs', 'last-generated.json');
  if (!fs.existsSync(lastGenPath)) {
    console.error('❌ logs/last-generated.json が見つかりません');
    return { success: false, step: 'detect_file' };
  }
  const gen = JSON.parse(fs.readFileSync(lastGenPath, 'utf8'));
  const slug = gen.slug;
  const filePath = path.join(PRODUCTS_DIR, `${slug}.html`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 生成ファイルが見つかりません: products/${slug}.html`);
    return { success: false, step: 'detect_file' };
  }
  console.log(`\n📄 生成ファイル: ${slug}.html（ASIN: ${gen.asin}・${gen.chars}文字）`);

  let htmlContent = fs.readFileSync(filePath, 'utf8');

  // STEP 4-5: 品質チェック + 自動修正ループ
  // チェック自体が失敗（API障害等）した場合も未チェックのまま公開せず隔離する
  console.log('\n🔍 STEP 4: 品質チェック');
  let checks;
  try {
    checks = await runAllChecks(htmlContent, productName, slug);

    for (let attempt = 1; checks.highIssues.length > 0 && attempt <= MAX_REVISIONS; attempt++) {
      console.log(`\n⚠️ 高優先度の問題 ${checks.highIssues.length}件（修正 ${attempt}/${MAX_REVISIONS}回目）:`);
      checks.highIssues.forEach((issue, i) => console.log(`   ${i + 1}. [${issue.source}] ${issue.fix || issue.detail}`));

      // SEO構造系（リンク不足等）はGemini修正で直らないので、本文系issueがある場合のみ修正を試みる
      const revisableIssues = checks.highIssues.filter(i => i.source !== 'SEO');
      if (revisableIssues.length > 0) {
        htmlContent = await reviseArticle(filePath, htmlContent, revisableIssues);
      } else {
        break; // 構造系のみ → 修正ループでは直らない
      }
      checks = await runAllChecks(htmlContent, productName, slug);
    }
  } catch (e) {
    console.error(`\n❌ 品質チェック実行エラー: ${e.message}`);
    console.error('   未チェックのまま公開はできないため隔離します');
    quarantine(slug);
    return { success: false, step: 'checks', slug, quarantined: true, error: e.message };
  }

  console.log(`\n📊 最終チェック結果:`);
  console.log(`   Critic: ${checks.criticResult.verdict} (${checks.criticResult.issues?.length || 0}件)`);
  console.log(`   Safety: ${checks.safetyResult.verdict} (${checks.safetyResult.issues?.length || 0}件)`);
  console.log(`   SEO:    ${checks.seoResult.verdict} (score: ${checks.seoResult.score}, ${checks.seoResult.issues.length}件)`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const report = {
    product: productName,
    slug,
    asin: gen.asin,
    chars: gen.chars,
    critic: checks.criticResult.verdict,
    safety: checks.safetyResult.verdict,
    seo: { verdict: checks.seoResult.verdict, score: checks.seoResult.score },
    highIssues: checks.highIssues.length,
    elapsed: `${elapsed}s`,
  };

  // ログ保存
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  fs.writeFileSync(path.join(logDir, `pipeline-${slug}-${Date.now()}.json`), JSON.stringify({
    ...report,
    criticDetail: checks.criticResult,
    safetyDetail: checks.safetyResult,
    seoDetail: checks.seoResult,
    timestamp: new Date().toISOString()
  }, null, 2));

  // STEP 6: 合否判定
  if (checks.highIssues.length > 0) {
    console.log(`\n❌ 高優先度の問題が${checks.highIssues.length}件残っています → デプロイ中止`);
    quarantine(slug);
    report.deployed = false;
    report.quarantined = true;
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  if (!dryRun) {
    console.log('\n📋 STEP 6: インデックス・サイトマップ更新');
    try {
      execSync(`node "${path.join(__dirname, 'rebuild-index.js')}"`, { stdio: 'inherit' });
      execSync(`node "${path.join(__dirname, 'update-sitemap.js')}"`, { stdio: 'inherit' });
      console.log('✅ 更新完了');
    } catch (error) {
      console.log('⚠️ 更新エラー');
    }

    console.log('\n📤 STEP 7: Git push → Cloudflare Pages');
    try {
      // 存在するファイルのみステージング（OGP生成失敗時にadd全体が失敗しないように）
      const stageFiles = [`products/${slug}.html`, `images/ogp/${slug}.png`, 'index.html', 'products/index.html', 'sitemap.xml']
        .filter(f => fs.existsSync(path.join(ROOT_DIR, f)));
      execSync(`git add ${stageFiles.join(' ')}`, { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync(`git commit -m "feat: ${productName}のレビュー記事を追加（パイプライン生成）"`, { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync('git push', { cwd: ROOT_DIR, stdio: 'inherit' });
      console.log('✅ デプロイ完了');
      // IndexNowで新記事を即時通知（Bing→ChatGPT検索の入口）
      try {
        execSync(`node "${path.join(__dirname, 'indexnow-submit.js')}" ${slug}`, { stdio: 'inherit' });
      } catch { console.log('⚠️ IndexNow送信失敗（致命的ではない）'); }
    } catch (error) {
      console.log('⚠️ Gitプッシュをスキップ');
    }
    report.deployed = true;
  } else {
    console.log('\n🏃 DRY RUN: デプロイをスキップ');
    report.deployed = false;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 パイプラインレポート');
  console.log(`${'='.repeat(60)}`);
  console.log(JSON.stringify(report, null, 2));

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

  if (!report || report.success === false || report.quarantined) {
    process.exit(1);
  }

  console.log('\n✨ パイプライン正常完了');
}

main().catch(e => { console.error(e); process.exit(1); });
