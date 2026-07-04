#!/usr/bin/env node
/**
 * Puppeteerで全記事のAmazonリンクがアフィリエイト対象か確認
 * 「アフィリエイト対象外」「この商品はアソシエイト・プログラムの対象外」等を検出
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');

async function checkEligibility(browser, asin) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

  try {
    await page.goto(`https://www.amazon.co.jp/dp/${asin}?tag=kidsgoodslab-22`, {
      waitUntil: 'networkidle2',
      timeout: 20000
    });

    // ページ全体のテキストを取得
    const bodyText = await page.evaluate(() => document.body.innerText);

    // 商品タイトル
    let title = '';
    try { title = await page.$eval('#productTitle', el => el.textContent.trim()); } catch {}

    // アフィリエイト対象外チェック
    const ineligiblePatterns = [
      'アソシエイト・プログラムの対象外',
      'アフィリエイト対象外',
      'この商品は紹介料の対象外',
      'Amazonアソシエイト・プログラムにより紹介料が発生しない',
      'この商品についてはアソシエイト',
      '紹介料対象外'
    ];

    let ineligible = false;
    let matchedPattern = '';
    for (const pattern of ineligiblePatterns) {
      if (bodyText.includes(pattern)) {
        ineligible = true;
        matchedPattern = pattern;
        break;
      }
    }

    // 404チェック
    const is404 = !title || title === '' || bodyText.includes('ページが見つかりません');

    return { title, ineligible, matchedPattern, is404 };
  } catch (e) {
    return { title: '', ineligible: false, is404: true, error: e.message };
  } finally {
    await page.close();
  }
}

async function main() {
  const files = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html');

  // 全記事からユニークASINを収集
  const asinMap = {}; // asin -> [files]
  for (const file of files) {
    const html = fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
    const asins = [...new Set([...html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]))];
    for (const asin of asins) {
      if (!asinMap[asin]) asinMap[asin] = [];
      asinMap[asin].push(file);
    }
  }

  const uniqueAsins = Object.keys(asinMap);
  console.log(`検査対象: ${uniqueAsins.length}個のユニークASIN（${files.length}記事）\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP']
  });

  const results = { eligible: [], ineligible: [], unknown: [] };

  for (let i = 0; i < uniqueAsins.length; i++) {
    const asin = uniqueAsins[i];
    const articleFiles = asinMap[asin];

    const { title, ineligible, matchedPattern, is404, error } = await checkEligibility(browser, asin);
    await new Promise(r => setTimeout(r, 3000)); // レートリミット

    if (is404) {
      console.log(`⚠️ [${i+1}/${uniqueAsins.length}] ${asin} → 取得失敗 (${articleFiles.join(', ')})`);
      results.unknown.push({ asin, files: articleFiles, reason: error || '404' });
    } else if (ineligible) {
      console.log(`❌ [${i+1}/${uniqueAsins.length}] ${asin} → 対象外！ "${matchedPattern}" (${title.substring(0, 50)})`);
      console.log(`   影響記事: ${articleFiles.join(', ')}`);
      results.ineligible.push({ asin, files: articleFiles, title, pattern: matchedPattern });
    } else {
      console.log(`✅ [${i+1}/${uniqueAsins.length}] ${asin} → OK (${title.substring(0, 50)})`);
      results.eligible.push({ asin, files: articleFiles, title });
    }
  }

  await browser.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 対象: ${results.eligible.length}`);
  console.log(`❌ 対象外: ${results.ineligible.length}`);
  console.log(`⚠️ 不明: ${results.unknown.length}`);

  if (results.ineligible.length > 0) {
    console.log('\n--- アフィリエイト対象外 ---');
    for (const r of results.ineligible) {
      console.log(`  ${r.asin}: ${r.title}`);
      console.log(`    記事: ${r.files.join(', ')}`);
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'affiliate-eligibility.json'),
    JSON.stringify(results, null, 2), 'utf8'
  );
}

main().catch(console.error);
