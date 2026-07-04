#!/usr/bin/env node
/**
 * Puppeteerで生成済み記事のASINを検証し、不一致があれば修正する
 * 使用: node verify-asin-puppeteer.js [ファイル名...]
 *       node verify-asin-puppeteer.js --all  (products/全記事)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const TAG = 'kidsgoodslab-22';
const RAKUTEN = '525ce562.e179174b.525ce563.a29a3c52';

// .env読み込み
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...v] = line.split('=');
    if (key && v.length) process.env[key.trim()] = v.join('=').trim();
  }
}
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

async function getAmazonTitle(browser, asin) {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
  try {
    await page.goto(`https://www.amazon.co.jp/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    let title = '';
    try { title = await page.$eval('#productTitle', el => el.textContent.trim()); } catch {}
    if (!title) {
      try { title = await page.$eval('title', el => el.textContent.trim()); } catch {}
    }
    const is404 = !title || title === 'Amazon.co.jp' || title.includes('ページが見つかりません');
    return { title: is404 ? null : title, is404 };
  } catch (e) {
    return { title: null, is404: true, error: e.message };
  } finally {
    await page.close();
  }
}

async function searchCorrectASIN(productName) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(productName + ' site:amazon.co.jp')}&count=5&search_lang=jp&country=jp`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
    });
    const d = await res.json();
    if (d.web && d.web.results) {
      for (const r of d.web.results) {
        const m = r.url.match(/\/dp\/([A-Z0-9]{10})/);
        if (m) return { asin: m[1], title: r.title };
      }
    }
  } catch {}
  return null;
}

function extractProductName(html) {
  const m = html.match(/<p style="font-weight:600[^"]*"[^>]*>([^<]+)<\/p>/);
  if (m) return m[1].trim();
  const d = html.match(/<meta name="description" content="([^"]+)"/);
  if (d) {
    const n = d[1].match(/^(.+?)の(?:口コミ|評判|レビュー)/);
    if (n) return n[1].trim();
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.includes('--all')) {
    files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
  } else if (args.length > 0) {
    files = args.map(f => f.endsWith('.html') ? f : f + '.html');
  } else {
    // 直近24時間に更新されたファイルのみ
    const now = Date.now();
    files = fs.readdirSync(PRODUCTS_DIR)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .filter(f => now - fs.statSync(path.join(PRODUCTS_DIR, f)).mtimeMs < 24 * 60 * 60 * 1000);
  }

  if (files.length === 0) {
    console.log('検証対象なし');
    return;
  }

  console.log(`🔍 ASIN検証: ${files.length}件\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP']
  });

  const results = { ok: [], mismatch: [], notfound: [], fixed: [] };

  for (const file of files) {
    const filePath = path.join(PRODUCTS_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const asins = [...new Set([...html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]))];
    const productName = extractProductName(html);

    if (asins.length === 0) {
      console.log(`⚠️ ${file}: ASINなし`);
      continue;
    }

    for (const asin of asins) {
      const { title, is404 } = await getAmazonTitle(browser, asin);
      await new Promise(r => setTimeout(r, 2000));

      if (is404) {
        console.log(`❌ ${file}: ${asin} → 404/取得失敗`);
        // Brave Searchで正しいASINを探す
        if (productName) {
          console.log(`   🔍 "${productName}" で再検索中...`);
          const correct = await searchCorrectASIN(productName);
          await new Promise(r => setTimeout(r, 1100));
          if (correct) {
            // 再検証
            const verify = await getAmazonTitle(browser, correct.asin);
            await new Promise(r => setTimeout(r, 2000));
            if (!verify.is404 && verify.title) {
              // 置換
              let newHtml = html.replace(new RegExp(`dp/${asin}`, 'g'), `dp/${correct.asin}`);
              fs.writeFileSync(filePath, newHtml, 'utf8');
              console.log(`   ✅ 修正: ${asin} → ${correct.asin} (${verify.title.substring(0, 50)})`);
              results.fixed.push({ file, oldAsin: asin, newAsin: correct.asin, title: verify.title });
            } else {
              console.log(`   ⚠️ 代替ASINも無効: ${correct.asin}`);
              results.notfound.push({ file, asin, productName });
            }
          } else {
            results.notfound.push({ file, asin, productName });
          }
        } else {
          results.notfound.push({ file, asin });
        }
      } else {
        // 商品名の整合性チェック
        const articleTitle = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
        console.log(`✅ ${file}: ${asin} → ${title.substring(0, 60)}`);
        results.ok.push({ file, asin, amazonTitle: title });
      }
    }
  }

  await browser.close();

  // サマリー
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ OK: ${results.ok.length}`);
  console.log(`🔧 修正: ${results.fixed.length}`);
  console.log(`❌ 未解決: ${results.notfound.length}`);

  if (results.fixed.length > 0) {
    console.log('\n--- 修正済み ---');
    results.fixed.forEach(r => console.log(`  ${r.file}: ${r.oldAsin} → ${r.newAsin}`));
  }
  if (results.notfound.length > 0) {
    console.log('\n--- 要手動対応 ---');
    results.notfound.forEach(r => console.log(`  ${r.file}: ${r.asin} (${r.productName || '不明'})`));
  }
}

main().catch(console.error);
