#!/usr/bin/env node
/**
 * ログイン済みChromeに接続してSiteStripeでアフィリエイト検証
 *
 * 前提: Chromeが --remote-debugging-port=9222 で起動済み
 *   起動方法: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile &
 *
 * 使用:
 *   node verify-with-sitestripe.js              # 直近24h更新の記事のみ
 *   node verify-with-sitestripe.js --all         # 全記事
 *   node verify-with-sitestripe.js file1.html    # 指定記事
 *   node verify-with-sitestripe.js --fix         # 問題を自動修正（差替え or 削除）
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const ROOT_DIR = path.join(__dirname, '..');
const TAG = 'kidsgoodslab-22';
const RAKUTEN = '525ce562.e179174b.525ce563.a29a3c52';
const TELEGRAM_TOKEN = '***REVOKED-TELEGRAM-TOKEN***';
const TELEGRAM_CHAT = '7685031090';

async function sendTelegram(msg) {
  try {
    execSync(`curl -s -X POST 'https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage' -d 'chat_id=${TELEGRAM_CHAT}' --data-urlencode 'text=${msg}'`, { stdio: 'ignore' });
  } catch {}
}

async function checkProduct(page, asin) {
  await page.goto(`https://www.amazon.co.jp/dp/${asin}?tag=${TAG}`, { waitUntil: 'networkidle2', timeout: 25000 });
  await new Promise(r => setTimeout(r, 3000));
  return await page.evaluate(() => {
    const get = (s) => { try { return document.querySelector(s)?.innerText?.trim() || null } catch { return null } };
    const stripe = document.querySelector('#amzn-ss-wrap');
    const stripeText = stripe ? stripe.innerText : '';
    const avail = get('#availability span') || get('#availability') || '';
    return {
      title: get('#productTitle'),
      price: get('.a-price .a-offscreen') || get('#newBuyBoxPrice'),
      availability: avail,
      inStock: avail.includes('在庫あり') || avail.includes('In Stock') || avail.includes('残り'),
      outOfStock: avail.includes('在庫なし') || avail.includes('Currently unavailable'),
      usedOnly: !!(get('#usedBuyBoxPrice') && !get('.a-price .a-offscreen') && !get('#newBuyBoxPrice')),
      affiliateExcluded: stripeText.includes('除外'),
      commissionRate: (stripeText.match(/販売手数料率\s*([\d.]+%)/)||[])[1] || null,
      siteStripeVisible: !!stripe,
    };
  });
}

async function searchAndVerify(page, query) {
  await page.goto(`https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 2000));
  const candidates = await page.evaluate(() => {
    const results = [];
    for (const item of document.querySelectorAll('[data-asin]')) {
      const asin = item.dataset.asin;
      if (!asin || asin.length !== 10) continue;
      const titleEl = item.querySelector('h2 a span, .a-text-normal');
      const sponsored = !!item.querySelector('.puis-sponsored-label-text') || item.innerHTML.includes('スポンサー');
      if (titleEl && !sponsored) {
        results.push({ asin, title: titleEl.innerText.trim() });
      }
      if (results.length >= 5) break;
    }
    return results;
  });

  // 各候補をSiteStripeで検証
  for (const c of candidates) {
    const detail = await checkProduct(page, c.asin);
    await new Promise(r => setTimeout(r, 2500));
    if (!detail.affiliateExcluded && detail.inStock && !detail.outOfStock && !detail.usedOnly) {
      return { asin: c.asin, ...detail };
    }
  }
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
  const doFix = args.includes('--fix');
  const all = args.includes('--all');
  const cleanArgs = args.filter(a => !a.startsWith('--'));

  // 対象ファイル決定
  let files;
  if (cleanArgs.length > 0) {
    files = cleanArgs.map(f => f.endsWith('.html') ? f : f + '.html');
  } else if (all) {
    files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
  } else {
    const now = Date.now();
    files = fs.readdirSync(PRODUCTS_DIR)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .filter(f => now - fs.statSync(path.join(PRODUCTS_DIR, f)).mtimeMs < 24 * 60 * 60 * 1000);
  }

  if (files.length === 0) { console.log('対象なし'); return; }

  // Chrome接続
  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
  } catch {
    console.error('Chrome (port 9222) に接続できません。以下で起動してください:');
    console.error('  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile &');
    process.exit(1);
  }

  console.log(`検証: ${files.length}記事\n`);

  const results = { ok: [], fixed: [], deleted: [], issues: [] };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(PRODUCTS_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const asins = [...new Set([...html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]))];
    const productName = extractProductName(html);

    for (const asin of asins) {
      const page = await browser.newPage();
      try {
        const data = await checkProduct(page, asin);

        const problems = [];
        if (!data.title) problems.push('404');
        if (data.affiliateExcluded) problems.push('除外');
        if (data.outOfStock) problems.push('在庫なし');
        if (data.usedOnly) problems.push('中古のみ');

        if (problems.length === 0 && data.inStock) {
          console.log(`[${i+1}/${files.length}] ✅ ${file} | ${asin} | ${data.price || ''} | ${(data.title||'').substring(0,40)}`);
          results.ok.push({ file, asin, price: data.price, rate: data.commissionRate });
        } else {
          console.log(`[${i+1}/${files.length}] ❌ ${file} | ${asin} | [${problems.join(', ')}]`);

          if (doFix && productName) {
            console.log(`   🔍 代替検索: ${productName}`);
            const replacement = await searchAndVerify(page, productName);

            if (replacement) {
              // 同一ブランドチェック（簡易）
              const brandWords = productName.split(/[\s　]+/).filter(w => w.length >= 2).slice(0, 2);
              const brandMatch = brandWords.some(w => (replacement.title || '').includes(w));

              if (brandMatch) {
                let newHtml = fs.readFileSync(filePath, 'utf8');
                newHtml = newHtml.replace(new RegExp(`dp/${asin}`, 'g'), `dp/${replacement.asin}`);
                fs.writeFileSync(filePath, newHtml, 'utf8');
                console.log(`   ✅ 差替え: ${asin} → ${replacement.asin} | ${(replacement.title||'').substring(0,40)}`);
                results.fixed.push({ file, oldAsin: asin, newAsin: replacement.asin, title: replacement.title });
              } else {
                console.log(`   ❌ 代替が別ブランド → 削除推奨`);
                if (doFix) {
                  fs.unlinkSync(filePath);
                  console.log(`   🗑️ 削除: ${file}`);
                  results.deleted.push({ file, reason: problems.join(', ') + ' + 同一ブランド代替なし' });
                } else {
                  results.issues.push({ file, asin, problems, recommendation: '削除' });
                }
              }
            } else {
              console.log(`   ❌ 代替なし → 削除推奨`);
              if (doFix) {
                fs.unlinkSync(filePath);
                console.log(`   🗑️ 削除: ${file}`);
                results.deleted.push({ file, reason: problems.join(', ') + ' + 代替なし' });
              } else {
                results.issues.push({ file, asin, problems, recommendation: '削除' });
              }
            }
          } else {
            results.issues.push({ file, asin, problems });
          }
        }
      } catch (e) {
        console.log(`[${i+1}/${files.length}] ⚠️ ${file} | ${asin} | エラー`);
        results.issues.push({ file, asin, problems: ['エラー'] });
      }
      await page.close();
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  browser.disconnect();

  // サマリー
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ OK: ${results.ok.length}`);
  console.log(`🔧 差替え: ${results.fixed.length}`);
  console.log(`🗑️ 削除: ${results.deleted.length}`);
  console.log(`⚠️ 要対応: ${results.issues.length}`);

  // --fixで変更があった場合、インデックス更新+push
  if (doFix && (results.fixed.length > 0 || results.deleted.length > 0)) {
    console.log('\n📤 デプロイ中...');
    try {
      execSync('node scripts/rebuild-index.js', { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync('node scripts/update-sitemap.js', { cwd: ROOT_DIR, stdio: 'inherit' });
      execSync('git add products/ index.html products/index.html sitemap.xml', { cwd: ROOT_DIR });
      execSync('git commit -m "verify-sitestripe: ASIN差替え・記事削除"', { cwd: ROOT_DIR });
      execSync('git push', { cwd: ROOT_DIR });
      console.log('✅ プッシュ完了');
    } catch {}

    // Telegram通知
    const msg = `🔍 SiteStripe検証完了\n✅ OK: ${results.ok.length}\n🔧 差替え: ${results.fixed.length}\n🗑️ 削除: ${results.deleted.length}`;
    await sendTelegram(msg);
  }

  fs.writeFileSync(path.join(__dirname, 'sitestripe-results.json'), JSON.stringify(results, null, 2));
}

main().catch(console.error);
