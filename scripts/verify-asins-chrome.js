#!/usr/bin/env node
/**
 * Puppeteerで実際のChromeを使ってAmazon ASINの商品名を取得・検証
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');

async function main() {
  // 全記事からASINと記事タイトルを収集
  const files = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html');

  const articleASINs = [];
  const seenASINs = new Set();

  for (const file of files) {
    const html = fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(/ - キッズグッズラボ$/, '') : file;
    const asins = [...new Set([...html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]))];

    for (const asin of asins) {
      if (!seenASINs.has(asin)) {
        seenASINs.add(asin);
        articleASINs.push({ file, title, asin });
      }
    }
  }

  console.log(`検証対象: ${seenASINs.size}個のユニークASIN\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP']
  });

  const results = [];

  for (let i = 0; i < articleASINs.length; i++) {
    const { file, title, asin } = articleASINs[i];
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

    try {
      const url = `https://www.amazon.co.jp/dp/${asin}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 商品タイトル取得
      let productTitle = '';
      try {
        productTitle = await page.$eval('#productTitle', el => el.textContent.trim());
      } catch {
        try {
          productTitle = await page.$eval('title', el => el.textContent.trim().split('|')[0].split(':')[0].trim());
        } catch {
          productTitle = 'NOT FOUND';
        }
      }

      // 404チェック
      const is404 = productTitle.includes('ページが見つかりません') ||
                     productTitle === 'Amazon.co.jp' ||
                     productTitle === '';

      const status = is404 ? '❌ 404' : '✅';
      console.log(`[${i + 1}/${articleASINs.length}] ${status} ${asin} (${file})`);
      console.log(`   記事: ${title.substring(0, 50)}`);
      console.log(`   Amazon: ${productTitle.substring(0, 80)}`);

      results.push({ file, title, asin, productTitle, is404 });
    } catch (e) {
      console.log(`[${i + 1}/${articleASINs.length}] ⚠️ ${asin} (${file}) - エラー: ${e.message.substring(0, 50)}`);
      results.push({ file, title, asin, productTitle: 'ERROR', is404: true });
    }

    await page.close();
    // レートリミット対策
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();

  // サマリー
  const ok = results.filter(r => !r.is404);
  const ng = results.filter(r => r.is404);

  console.log('\n' + '='.repeat(60));
  console.log(`✅ 有効: ${ok.length}件`);
  console.log(`❌ 無効/404: ${ng.length}件`);

  if (ng.length > 0) {
    console.log('\n--- 無効ASIN ---');
    for (const r of ng) {
      console.log(`  ${r.asin} (${r.file}): ${r.productTitle}`);
    }
  }

  // 結果保存
  fs.writeFileSync(
    path.join(__dirname, 'verify-results.json'),
    JSON.stringify(results, null, 2), 'utf8'
  );
  console.log(`\n📄 詳細: scripts/verify-results.json`);
}

main().catch(console.error);
