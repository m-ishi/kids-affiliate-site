#!/usr/bin/env node
/**
 * パンパース記事に全サイズリンクを追加
 */
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const TAG = 'kidsgoodslab-22';
const RAKUTEN = '525ce562.e179174b.525ce563.a29a3c52';

// パンパース 肌へのいちばん テープ 全サイズASIN
const HADAICHI = {
  name: 'パンパース はじめての肌へのいちばん',
  sizes: [
    { label: '新生児', asin: 'B0CCJ338PF' },
    { label: 'S (4-8kg)', asin: 'B0CCHZY9KJ' },
    { label: 'M (6-11kg)', asin: 'B0CCHZ1737' },
    { label: 'L (9-14kg)', asin: 'B0074EFBR2' },
  ],
  caseSizes: [
    { label: '新生児 ケース', asin: 'B084H83HTJ' },
    { label: 'S ケース', asin: 'B01BSTSQRU' },
    { label: 'M ケース', asin: 'B0CCHZ1737' },
    { label: 'L ケース', asin: 'B0CCHYPVJD' },
  ]
};

// パンパース さらさらケア テープ 全サイズASIN
const SARASARA = {
  name: 'パンパース さらさらケア',
  sizes: [
    { label: '新生児', asin: 'B0BBF1HJ3R' },
    { label: 'S (4-8kg)', asin: 'B0BBF3BHG1' },
    { label: 'M (6-12kg)', asin: 'B0BBF1HG2Y' },
    { label: 'L (9-14kg)', asin: 'B0BBDY7X5X' },
  ],
  caseSizes: [
    { label: '新生児 ケース', asin: 'B0CYSXL656' },
    { label: 'S ケース', asin: 'B0BBF3BHG1' },
    { label: 'M ケース', asin: 'B0BBDY77WH' },
    { label: 'L ケース', asin: 'B0BBF2WJ26' },
  ]
};

function buildSizeLinks(product) {
  const rakutenUrl = `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN}/?pc=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F${encodeURIComponent(product.name)}%2F&m=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F${encodeURIComponent(product.name)}%2F`;

  let html = `<div class="size-links" style="margin-top:16px;text-align:left;background:#fff;padding:16px;border-radius:8px;border:1px solid #e0e0e0;">\n`;
  html += `            <p style="font-weight:600;font-size:0.95rem;margin-bottom:10px;">サイズ別で見る（Amazon）</p>\n`;
  for (const s of product.sizes) {
    html += `            <a href="https://www.amazon.co.jp/dp/${s.asin}?tag=${TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#ff9900;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.85rem;margin:3px 4px;">テープ ${s.label}</a>\n`;
  }
  if (product.caseSizes) {
    html += `            <p style="font-weight:600;font-size:0.95rem;margin:12px 0 8px;">おまとめパック（Amazon）</p>\n`;
    for (const s of product.caseSizes) {
      html += `            <a href="https://www.amazon.co.jp/dp/${s.asin}?tag=${TAG}" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#e67e00;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.85rem;margin:3px 4px;">テープ ${s.label}</a>\n`;
    }
  }
  html += `            <p style="font-weight:600;font-size:0.95rem;margin:12px 0 8px;">楽天市場</p>\n`;
  html += `            <a href="${rakutenUrl}" class="affiliate-btn rakuten-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#bf0000;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.85rem;margin:3px 4px;">楽天市場で見る</a>\n`;
  html += `          </div>`;
  return html;
}

// 肌へのいちばん記事
const hadaichiFiles = [
  'pampers-coupon.html', 'pampers-lowest-price.html', 'pampers-quantity.html',
  'pampers-reviews.html', 'pampers-seasonal.html', 'pampers-skin-trouble.html',
  'pampers-where-to-buy.html', 'pampers-vs-merries.html'
];

// さらさらケア記事
const sarasaraFiles = [
  'pampers-sarasara-care.html', 'pampers-sarasara-coupon.html',
  'pampers-sarasara-lowest-price.html', 'pampers-sarasara-quantity.html',
  'pampers-sarasara-reviews.html', 'pampers-sarasara-seasonal.html',
  'pampers-sarasara-skin-trouble.html', 'pampers-sarasara-where-to-buy.html'
];

function processFile(file, product) {
  const filePath = path.join(PRODUCTS_DIR, file);
  if (!fs.existsSync(filePath)) { console.log(`⚠️ ${file} not found`); return; }

  let html = fs.readFileSync(filePath, 'utf8');

  // 既にsize-linksがあればスキップ
  if (html.includes('size-links')) {
    console.log(`⏭️ ${file}: already has size links`);
    return;
  }

  const sizeLinksHtml = buildSizeLinks(product);

  // product-info-card内の既存の単一Amazonボタン+楽天ボタンを、サイズ別リンクに置換
  // パターン: Amazonで価格を見る</a> ... 楽天市場で見る</a> の後、</div>の前にサイズリンクを挿入
  // 既存の単一リンクはそのまま残し（代表サイズ）、その下にサイズ別を追加

  // product-info-cardの閉じ</div>の前に挿入
  const insertPoint = html.indexOf('</div>', html.indexOf('product-info-card'));
  if (insertPoint === -1) {
    console.log(`⚠️ ${file}: product-info-card not found`);
    return;
  }

  html = html.slice(0, insertPoint) + '\n          ' + sizeLinksHtml + '\n        ' + html.slice(insertPoint);

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`✅ ${file}: size links added`);
}

// 処理実行
console.log('--- パンパース 肌へのいちばん ---');
for (const f of hadaichiFiles) processFile(f, HADAICHI);

console.log('\n--- パンパース さらさらケア ---');
for (const f of sarasaraFiles) processFile(f, SARASARA);

// おしりふき記事はサイズ不要なのでスキップ
console.log('\n⏭️ pampers-wipes-hadaichi.html, pampers.html: おしりふき（サイズ不要）');
