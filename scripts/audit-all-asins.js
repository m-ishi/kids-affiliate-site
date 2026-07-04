#!/usr/bin/env node
/**
 * 実Chromeで全ASINの詳細情報を取得
 * - 商品名（記事との一致チェック）
 * - 価格（新品・中古）
 * - 在庫状況
 * - レビュー（評価・件数）
 * - ブランド
 * - アフィリエイト対象可否
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');

async function scrapeProduct(page, asin) {
  try {
    await page.goto(`https://www.amazon.co.jp/dp/${asin}?tag=kidsgoodslab-22`, {
      waitUntil: 'networkidle2', timeout: 20000
    });

    return await page.evaluate(() => {
      const get = (sel) => { try { return document.querySelector(sel)?.innerText?.trim() || null } catch { return null } };
      const getAll = (sel) => { try { return Array.from(document.querySelectorAll(sel)).map(el => el.innerText?.trim()).filter(Boolean) } catch { return [] } };

      const price = get('.a-price .a-offscreen') || get('#priceblock_ourprice') || get('#newBuyBoxPrice') || get('.a-price-whole');
      const availability = get('#availability span') || get('#availability');
      const bodyText = document.body.innerText;

      return {
        title: get('#productTitle'),
        price: price,
        listPrice: get('.a-text-price .a-offscreen'),
        availability: availability,
        inStock: availability ? !availability.includes('在庫なし') && !availability.includes('入荷') && !availability.includes('unavailable') : null,
        usedOnly: bodyText.includes('中古品') && !price,
        rating: get('#acrPopover .a-size-base') || get('.a-icon-alt'),
        reviewCount: get('#acrCustomerReviewText'),
        brand: get('#bylineInfo'),
        merchantInfo: get('#merchant-info') || get('#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"] span'),
        imageUrl: (document.querySelector('#landingImage') || document.querySelector('#imgBlkFront'))?.src || null,
        affiliateIneligible: bodyText.includes('対象外') && bodyText.includes('アソシエイト'),
        is404: !get('#productTitle'),
      };
    });
  } catch (e) {
    return { is404: true, error: e.message };
  }
}

function extractArticleProductName(html) {
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
  const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');

  // ASIN→記事マッピング
  const asinMap = {};
  const articleNames = {};
  for (const file of files) {
    const html = fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
    const name = extractArticleProductName(html);
    articleNames[file] = name;
    for (const m of html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)) {
      if (!asinMap[m[1]]) asinMap[m[1]] = { files: [], articleName: name };
      if (!asinMap[m[1]].files.includes(file)) asinMap[m[1]].files.push(file);
    }
  }

  const asins = Object.keys(asinMap);
  console.log(`検査: ${asins.length} ASIN / ${files.length} 記事\n`);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--lang=ja-JP']
  });
  const page = await browser.newPage();

  const audit = [];

  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i];
    const info = asinMap[asin];
    const data = await scrapeProduct(page, asin);
    await new Promise(r => setTimeout(r, 2500));

    const entry = {
      asin,
      files: info.files,
      articleName: info.articleName,
      ...data,
    };

    // 問題判定
    const issues = [];
    if (data.is404) issues.push('404/取得失敗');
    if (data.affiliateIneligible) issues.push('アフィリエイト対象外');
    if (data.usedOnly) issues.push('中古のみ');
    if (data.inStock === false) issues.push('在庫なし');
    if (data.title && info.articleName) {
      // 簡易的な一致チェック: 記事の商品名のキーワードがAmazonタイトルに含まれるか
      const keywords = info.articleName.replace(/[（）()【】\[\]]/g, ' ').split(/[\s　]+/).filter(w => w.length >= 2);
      const matchCount = keywords.filter(kw => data.title.includes(kw)).length;
      const matchRate = keywords.length > 0 ? matchCount / keywords.length : 0;
      if (matchRate < 0.3) issues.push(`製品名不一致(${(matchRate*100).toFixed(0)}%)`);
      entry.nameMatchRate = matchRate;
    }

    entry.issues = issues;

    const status = issues.length > 0 ? '❌' : '✅';
    const issueStr = issues.length > 0 ? ` [${issues.join(', ')}]` : '';
    console.log(`[${i+1}/${asins.length}] ${status} ${asin}${issueStr}`);
    console.log(`   Amazon: ${(data.title || 'N/A').substring(0, 60)}`);
    console.log(`   記事: ${(info.articleName || 'N/A').substring(0, 60)}`);
    if (data.price) console.log(`   価格: ${data.price}${data.listPrice ? ' (定価' + data.listPrice + ')' : ''}`);
    if (data.availability) console.log(`   在庫: ${data.availability.substring(0, 40)}`);
    if (data.rating) console.log(`   評価: ${data.rating} (${data.reviewCount || '?'})`);
    console.log('');

    audit.push(entry);
  }

  await browser.close();

  // サマリー
  const problems = audit.filter(a => a.issues.length > 0);
  const ok = audit.filter(a => a.issues.length === 0);

  console.log('='.repeat(50));
  console.log(`✅ OK: ${ok.length}`);
  console.log(`❌ 問題あり: ${problems.length}`);
  if (problems.length > 0) {
    console.log('\n--- 問題一覧 ---');
    for (const p of problems) {
      console.log(`  ${p.asin}: [${p.issues.join(', ')}]`);
      console.log(`    Amazon: ${(p.title || 'N/A').substring(0, 60)}`);
      console.log(`    記事: ${p.files.join(', ')}`);
    }
  }

  // 全データ保存
  fs.writeFileSync(path.join(__dirname, 'audit-results.json'), JSON.stringify(audit, null, 2));
  console.log('\n📄 詳細: scripts/audit-results.json');
}

main().catch(console.error);
