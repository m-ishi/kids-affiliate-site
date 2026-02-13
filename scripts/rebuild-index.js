const fs = require('fs');
const path = require('path');

const productsDir = '/Users/masa/kids-affiliate-site/products';
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');

console.log(`Found ${files.length} product files`);

// 各記事から情報を抽出
const products = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(productsDir, file), 'utf8');

  const titleMatch = content.match(/<h1 class="article-title">([^<]+)<\/h1>/);
  const categoryMatch = content.match(/<span class="article-category">([^<]+)<\/span>/);
  const excerptMatch = content.match(/<p class="article-excerpt">([^<]+)<\/p>/);
  const ratingMatch = content.match(/<div class="rating-score">([^<]+)<\/div>/);
  const dateMatch = content.match(/<span class="article-date">([^<]+)<\/span>/);
  const imageMatch = content.match(/src="https:\/\/m\.media-amazon\.com\/images\/P\/([A-Z0-9]+)/);

  if (titleMatch) {
    products.push({
      file,
      title: titleMatch[1].substring(0, 50),
      category: categoryMatch ? categoryMatch[1] : 'ベビー用品',
      excerpt: excerptMatch ? excerptMatch[1].substring(0, 60) : '',
      rating: ratingMatch ? ratingMatch[1] : '4.0',
      date: dateMatch ? dateMatch[1] : '2026.02.07',
      asin: imageMatch ? imageMatch[1] : null
    });
  }
}

console.log(`Extracted ${products.length} products`);

// 日付でソート（新しい順）、同じ日付の場合はファイル更新日時で
products.sort((a, b) => {
  // 日付を比較可能な形式に変換 (2026.02.07 -> 20260207)
  const dateA = a.date.replace(/\./g, '');
  const dateB = b.date.replace(/\./g, '');
  if (dateB !== dateA) {
    return dateB.localeCompare(dateA);
  }
  // 同じ日付の場合はファイル更新日時で比較
  const statA = fs.statSync(path.join(productsDir, a.file));
  const statB = fs.statSync(path.join(productsDir, b.file));
  return statB.mtime - statA.mtime;
});

console.log('Sorted by date (newest first)');

const categoryMap = {
  'おもちゃ': 'toy', 'ベビー用品': 'baby', '知育玩具': 'educational',
  '消耗品': 'consumable', '外遊び': 'outdoor', '家具・収納': 'furniture', '安全グッズ': 'safety'
};

function generateStars(r) {
  const rating = parseFloat(r) || 4.0;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '☆' : '') + '☆'.repeat(5 - full - half);
}

function generateCard(p, isProductsPage) {
  const cat = categoryMap[p.category] || 'baby';
  const href = isProductsPage ? p.file : `products/${p.file}`;
  const slug = p.file.replace('.html', '');
  const ogpPath = path.join('/Users/masa/kids-affiliate-site/images/ogp', `${slug}.png`);
  const hasOgp = fs.existsSync(ogpPath);
  const imgPrefix = isProductsPage ? '../' : '';
  const imgHTML = hasOgp
    ? `<img src="${imgPrefix}images/ogp/${slug}.png" alt="${p.title}" style="width:100%;height:auto;object-fit:cover;">`
    : '📦';

  return `        <article class="product-card" data-category="${cat}">
          <a href="${href}">
            <div class="product-image" style="display:flex;align-items:center;justify-content:center;background:#f8f8f8;min-height:150px;font-size:3rem;">
              ${imgHTML}
            </div>
            <div class="product-content">
              <span class="product-category">${p.category}</span>
              <h3 class="product-title">${p.title}</h3>
              <p class="product-excerpt">${p.excerpt}</p>
              <div class="product-meta">
                <div class="product-rating">${generateStars(p.rating)}</div>
                <span class="product-date">${p.date}</span>
              </div>
            </div>
          </a>
        </article>`;
}

// index.html を更新
const indexPath = '/Users/masa/kids-affiliate-site/index.html';
let indexContent = fs.readFileSync(indexPath, 'utf8');

// products-grid開始から About Section前までを置換
const gridStart = indexContent.indexOf('<div class="products-grid">');
const aboutSection = indexContent.indexOf('<!-- About Section -->');

if (gridStart > 0 && aboutSection > gridStart) {
  const before = indexContent.substring(0, gridStart + '<div class="products-grid">'.length);
  const after = indexContent.substring(aboutSection);

  const cards = products.map(p => generateCard(p, false)).join('\n');
  const newContent = before + '\n' + cards + '\n      </div>\n    </div>\n  </section>\n\n  ' + after;

  fs.writeFileSync(indexPath, newContent, 'utf8');
  console.log('Updated index.html with ' + products.length + ' cards');
} else {
  console.log('Could not find markers in index.html', gridStart, aboutSection);
}

// products/index.html を更新
const prodIndexPath = '/Users/masa/kids-affiliate-site/products/index.html';
let prodContent = fs.readFileSync(prodIndexPath, 'utf8');

const prodGridStart = prodContent.indexOf('<div class="products-grid">');
const footerSection = prodContent.indexOf('<!-- Footer -->');

if (prodGridStart > 0 && footerSection > prodGridStart) {
  const before = prodContent.substring(0, prodGridStart + '<div class="products-grid">'.length);
  const after = prodContent.substring(footerSection);

  const cards = products.map(p => generateCard(p, true)).join('\n');
  const newContent = before + '\n' + cards + '\n      </div>\n    </div>\n  </section>\n\n  ' + after;

  fs.writeFileSync(prodIndexPath, newContent, 'utf8');
  console.log('Updated products/index.html with ' + products.length + ' cards');
} else {
  console.log('Could not find markers in products/index.html', prodGridStart, footerSection);
}

console.log('Done!');
