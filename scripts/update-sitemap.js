/**
 * サイトマップ自動更新スクリプト
 * products/ ディレクトリ内の全記事を含むsitemap.xmlを生成
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://kidsgoodslab.com';
const productsDir = path.join(__dirname, '..', 'products');
const sitemapPath = path.join(__dirname, '..', 'sitemap.xml');

function generateSitemap() {
  // 固定ページ（Cloudflare Pagesは.htmlを拡張子なしURLへ308リダイレクトするため、
  // 実際に配信される拡張子なしURLをsitemapに載せる）
  const staticPages = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/products/', changefreq: 'daily', priority: '0.9' },
    { loc: '/about', changefreq: 'monthly', priority: '0.5' },
    { loc: '/contact', changefreq: 'monthly', priority: '0.5' },
    { loc: '/privacy', changefreq: 'monthly', priority: '0.3' },
  ];

  // 記事ページを取得
  const productFiles = fs.readdirSync(productsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

  const today = new Date().toISOString().split('T')[0];

  // XML生成
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // 固定ページ
  for (const page of staticPages) {
    xml += `  <url><loc>${SITE_URL}${page.loc}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>\n`;
  }

  // 記事ページ
  for (const file of productFiles) {
    const stat = fs.statSync(path.join(productsDir, file));
    const lastmod = stat.mtime.toISOString().split('T')[0];
    xml += `  <url><loc>${SITE_URL}/products/${file.replace(/\.html$/, '')}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
  }

  xml += '</urlset>\n';

  fs.writeFileSync(sitemapPath, xml, 'utf8');
  console.log(`サイトマップ更新: ${productFiles.length}件の記事を含む ${staticPages.length + productFiles.length} URL`);
}

generateSitemap();
