#!/usr/bin/env node
/**
 * 実Chromeで問題ASINの代替を検索・修正
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const TAG = 'kidsgoodslab-22';

// 問題リスト: { file, query (検索クエリ), issue }
const problems = [
  // 在庫なし → 代替検索
  { file: 'asics-sukusuku-first-shoes.html', query: 'アシックス すくすく ファーストシューズ', issue: '在庫なし' },
  { file: 'bibetta-ultra-bib.html', query: 'ビベッタ ウルトラビブ お食事エプロン', issue: '在庫なし' },
  { file: 'ergobaby-adapt-used.html', query: 'エルゴベビー ADAPT 抱っこ紐', issue: '在庫なし' },
  { file: 'joie-tilt-repair.html', query: 'Joie チルト チャイルドシート', issue: '在庫なし' },
  { file: 'joie-tilt-used.html', query: 'Joie チルト チャイルドシート', issue: '在庫なし' },
  { file: 'jtc-baby-yuraride.html', query: 'JTC ユラライド 三輪車', issue: '在庫なし' },
  { file: 'kids-teepee-tent-indoor.html', query: 'キッズテント ティピーテント 室内', issue: '在庫なし' },
  { file: 'lifaxia-babygate.html', query: 'LIFAXIA ベビーゲート ロール式', issue: '在庫なし' },
  { file: 'meiji-hohoemi-cube.html', query: '明治 ほほえみ らくらくキューブ', issue: '在庫なし' },
  { file: 'montbell-pocketable-baby-carrier.html', query: 'モンベル ポケッタブル ベビーキャリア', issue: '在庫なし' },
  { file: 'pampers-wipes-hadaichi.html', query: 'パンパース おしりふき 肌へのいちばん', issue: '在庫なし' },
  { file: 'pampers.html', query: 'パンパース おしりふき 肌へのいちばん', issue: '在庫なし' },
  { file: 's-504.html', query: 'メルシーポット S-504 電動鼻吸い器', issue: '在庫なし' },
  { file: 'sandbox-toy-set-review.html', query: '砂場セット ダンプカー おもちゃ', issue: '在庫なし' },
  { file: 'skip-hop-babybath.html', query: 'スキップホップ ベビーバス', issue: '在庫なし' },
  { file: 'stokke-flexibath.html', query: 'ストッケ フレキシバス ベビーバス', issue: '在庫なし' },
  // 製品不一致
  { file: 'aprica-ag.html', query: 'アップリカ マジカルエアー AG ベビーカー', issue: '製品不一致(AG→AH)' },
  { file: 'aprica-ah.html', query: 'アップリカ ラクーナクッション AH ベビーカー', issue: '製品不一致(AH→AF)' },
  { file: 'aprica-rakuna-storage.html', query: 'アップリカ ラクーナクッション ベビーカー', issue: '製品不一致' },
  { file: 'ikea-forsiktig.html', query: 'IKEA 子供用 踏み台 ステップ', issue: '製品不一致(FORSIKTIG→TROGEN)' },
  { file: 'norokka-raincover.html', query: 'ノロッカ レインカバー 後ろ リア', issue: '留め具パーツ' },
  // 404
  { file: 'brio.html', query: 'BRIO ビルダー スターターセット', issue: '404' },
  { file: 'cleansui-md101-baby-water-review.html', query: 'クリンスイ MD101 浄水器', issue: '404' },
];

async function searchAmazon(page, query) {
  await page.goto(`https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`, {
    waitUntil: 'networkidle2', timeout: 20000
  });

  return await page.evaluate(() => {
    const results = [];
    const items = document.querySelectorAll('[data-asin]');
    for (const item of items) {
      const asin = item.dataset.asin;
      if (!asin || asin.length !== 10) continue;

      const titleEl = item.querySelector('h2 a span, .a-size-base-plus, .a-text-normal');
      const priceEl = item.querySelector('.a-price .a-offscreen');
      const ratingEl = item.querySelector('.a-icon-alt');
      const imageEl = item.querySelector('.s-image');

      if (titleEl) {
        results.push({
          asin,
          title: titleEl.innerText.trim(),
          price: priceEl ? priceEl.innerText.trim() : null,
          rating: ratingEl ? ratingEl.innerText.trim() : null,
          image: imageEl ? imageEl.src : null,
        });
      }
      if (results.length >= 5) break;
    }
    return results;
  });
}

async function checkProductPage(page, asin) {
  await page.goto(`https://www.amazon.co.jp/dp/${asin}?tag=${TAG}`, {
    waitUntil: 'networkidle2', timeout: 20000
  });

  return await page.evaluate(() => {
    const get = (sel) => { try { return document.querySelector(sel)?.innerText?.trim() || null } catch { return null } };
    const price = get('.a-price .a-offscreen') || get('#newBuyBoxPrice');
    const avail = get('#availability span') || get('#availability');
    return {
      title: get('#productTitle'),
      price,
      availability: avail,
      inStock: avail ? !avail.includes('在庫なし') && !avail.includes('unavailable') && !avail.includes('Currently') : null,
      rating: get('#acrPopover .a-size-base') || get('.a-icon-alt'),
      reviewCount: get('#acrCustomerReviewText'),
      imageUrl: (document.querySelector('#landingImage') || document.querySelector('#imgBlkFront'))?.src || null,
    };
  });
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--lang=ja-JP,ja']
  });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
  // Amazon日本語表示用Cookie
  await page.setCookie({
    name: 'lc-acbjp',
    value: 'ja_JP',
    domain: '.amazon.co.jp'
  });

  const fixes = [];
  const unfixable = [];

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    console.log(`\n[${i+1}/${problems.length}] ${p.file} (${p.issue})`);
    console.log(`   検索: ${p.query}`);

    // Amazon検索
    const results = await searchAmazon(page, p.query);
    await new Promise(r => setTimeout(r, 2000));

    if (results.length === 0) {
      console.log(`   ❌ 検索結果なし`);
      unfixable.push(p);
      continue;
    }

    // 最初の在庫あり商品を選択
    let found = null;
    for (const r of results) {
      const detail = await checkProductPage(page, r.asin);
      await new Promise(r => setTimeout(r, 2000));

      if (detail.inStock && detail.title) {
        found = { ...r, ...detail };
        break;
      }
    }

    if (!found) {
      // 在庫関係なく最初の結果を使う
      found = results[0];
      const detail = await checkProductPage(page, found.asin);
      await new Promise(r => setTimeout(r, 2000));
      found = { ...found, ...detail };
      console.log(`   ⚠️ 在庫あり商品なし。最初の結果を使用`);
    }

    console.log(`   ✅ ${found.asin}: ${(found.title || '').substring(0, 60)}`);
    console.log(`      価格: ${found.price || 'N/A'} | 在庫: ${found.inStock ? 'あり' : 'なし'} | 評価: ${found.rating || 'N/A'}`);

    // ファイル更新
    const filePath = path.join(PRODUCTS_DIR, p.file);
    if (fs.existsSync(filePath)) {
      let html = fs.readFileSync(filePath, 'utf8');
      const oldAsins = [...new Set([...html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]))];

      for (const old of oldAsins) {
        html = html.replace(new RegExp(`dp/${old}`, 'g'), `dp/${found.asin}`);
      }
      fs.writeFileSync(filePath, html, 'utf8');
      console.log(`   📝 ${oldAsins.join(',')} → ${found.asin}`);
    }

    fixes.push({ file: p.file, oldIssue: p.issue, newAsin: found.asin, title: found.title, price: found.price, inStock: found.inStock });
  }

  await browser.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 修正: ${fixes.length}`);
  console.log(`❌ 修正不可: ${unfixable.length}`);

  if (unfixable.length > 0) {
    console.log('\n--- 修正不可（削除推奨） ---');
    unfixable.forEach(u => console.log(`  ${u.file}: ${u.query}`));
  }

  fs.writeFileSync(path.join(__dirname, 'fix-results.json'), JSON.stringify({ fixes, unfixable }, null, 2));
}

main().catch(console.error);
