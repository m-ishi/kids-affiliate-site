#!/usr/bin/env node
/**
 * Product Page Generator for Kids Affiliate Site
 *
 * This script generates product review pages from a template.
 * It can be used with MCP filesystem tools or run directly.
 *
 * Usage:
 *   node generate-product.js --data product-data.json
 *   node generate-product.js --interactive
 *
 * Or import as a module:
 *   const { generateProductPage } = require('./generate-product.js');
 *   generateProductPage(productData);
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Paths
const TEMPLATE_PATH = path.join(__dirname, '../templates/product-template.html');
const PRODUCTS_DIR = path.join(__dirname, '../products');

/**
 * Generate star rating HTML
 * @param {number} rating - Rating value (0-5)
 * @returns {string} Star rating HTML
 */
function generateStars(rating) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  let stars = '';
  for (let i = 0; i < fullStars; i++) stars += '★';
  if (halfStar) stars += '☆';
  for (let i = 0; i < emptyStars; i++) stars += '☆';

  return stars;
}

/**
 * Generate URL-safe slug from product name
 * @param {string} name - Product name
 * @returns {string} URL-safe slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

/**
 * Format list items for pros/cons
 * @param {string[]} items - Array of items
 * @returns {string} HTML list items
 */
function formatListItems(items) {
  if (!items || items.length === 0) return '<li>なし</li>';
  return items.map(item => `<li>${item}</li>`).join('\n              ');
}

/**
 * Generate product page from template
 * @param {Object} data - Product data
 * @returns {Object} Result with filename and content
 */
function generateProductPage(data) {
  // Read template
  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Get current date if not provided
  const today = new Date();
  const publishDate = data.publishDate || `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;

  // Generate filename
  const slug = data.slug || generateSlug(data.productName);
  const filename = `${slug}.html`;

  // Default values
  const defaults = {
    productName: '商品名未設定',
    metaDescription: `${data.productName}の詳細レビュー。実際に使用した感想やメリット・デメリットを紹介します。`,
    keywords: `${data.productName},子供用品,レビュー,${data.category || 'おもちゃ'}`,
    ogImage: data.productImage || 'https://placehold.co/1200x630/FFB8D0/333333?text=Product',
    productImage: 'https://placehold.co/800x600/FFB8D0/333333?text=Product+Image',
    productShortDescription: data.productName + 'のレビュー記事です。',
    category: 'おもちゃ',
    price: '価格未設定',
    targetAge: '対象年齢未設定',
    manufacturer: 'メーカー未設定',
    affiliateLink: '#',
    rating: 4.0,
    introduction: '<p>この記事では、' + data.productName + 'を実際に使用した感想をレビューします。</p>',
    pros: ['良い点1', '良い点2', '良い点3'],
    cons: ['気になる点1'],
    mainContent: '<p>実際に使ってみた詳細な感想をここに記載します。</p>',
    specifications: '<p>商品の詳細スペックをここに記載します。</p>',
    recommendation: '<ul><li>こんな人におすすめ1</li><li>こんな人におすすめ2</li></ul>',
    conclusion: '<p>まとめの文章をここに記載します。</p>',
    ctaText: '購入を検討されている方は、ぜひチェックしてみてください。',
    additionalAffiliateLinks: '',
    relatedProducts: ''
  };

  // Merge data with defaults
  const pageData = { ...defaults, ...data };

  // Replace placeholders
  const replacements = {
    '{{PRODUCT_NAME}}': pageData.productName,
    '{{META_DESCRIPTION}}': pageData.metaDescription,
    '{{KEYWORDS}}': pageData.keywords,
    '{{OG_IMAGE}}': pageData.ogImage,
    '{{PRODUCT_IMAGE}}': pageData.productImage,
    '{{PRODUCT_SHORT_DESCRIPTION}}': pageData.productShortDescription,
    '{{CATEGORY}}': pageData.category,
    '{{PUBLISH_DATE}}': publishDate,
    '{{PRICE}}': pageData.price,
    '{{TARGET_AGE}}': pageData.targetAge,
    '{{MANUFACTURER}}': pageData.manufacturer,
    '{{AFFILIATE_LINK}}': pageData.affiliateLink,
    '{{RATING}}': pageData.rating,
    '{{RATING_STARS}}': generateStars(pageData.rating),
    '{{INTRODUCTION}}': pageData.introduction,
    '{{PROS}}': formatListItems(pageData.pros),
    '{{CONS}}': formatListItems(pageData.cons),
    '{{MAIN_CONTENT}}': pageData.mainContent,
    '{{SPECIFICATIONS}}': pageData.specifications,
    '{{RECOMMENDATION}}': pageData.recommendation,
    '{{CONCLUSION}}': pageData.conclusion,
    '{{CTA_TEXT}}': pageData.ctaText,
    '{{ADDITIONAL_AFFILIATE_LINKS}}': pageData.additionalAffiliateLinks,
    '{{RELATED_PRODUCTS}}': pageData.relatedProducts
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return {
    filename,
    filepath: path.join(PRODUCTS_DIR, filename),
    content: template
  };
}

/**
 * Save generated page to file
 * @param {Object} result - Result from generateProductPage
 */
function savePage(result) {
  // Ensure products directory exists
  if (!fs.existsSync(PRODUCTS_DIR)) {
    fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  }

  fs.writeFileSync(result.filepath, result.content, 'utf8');
  console.log(`✓ Generated: ${result.filepath}`);
}

/**
 * Interactive mode for creating product page
 */
async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log('\n=== Product Page Generator ===\n');

  const data = {};

  data.productName = await question('商品名: ');
  data.category = await question('カテゴリー (おもちゃ/ベビー用品/知育玩具/外遊び): ') || 'おもちゃ';
  data.price = await question('価格: ');
  data.targetAge = await question('対象年齢: ');
  data.manufacturer = await question('メーカー: ');
  data.productImage = await question('商品画像URL: ');
  data.affiliateLink = await question('アフィリエイトリンク: ');
  data.rating = parseFloat(await question('評価 (1-5): ')) || 4.0;
  data.productShortDescription = await question('商品の短い説明: ');

  console.log('\n良い点を入力してください（空行で終了）:');
  data.pros = [];
  let pro;
  while ((pro = await question('  - ')) !== '') {
    data.pros.push(pro);
  }

  console.log('\n気になる点を入力してください（空行で終了）:');
  data.cons = [];
  let con;
  while ((con = await question('  - ')) !== '') {
    data.cons.push(con);
  }

  rl.close();

  const result = generateProductPage(data);
  savePage(result);

  console.log('\n✓ Product page generated successfully!');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--interactive') || args.includes('-i')) {
    await interactiveMode();
    return;
  }

  const dataIndex = args.indexOf('--data');
  if (dataIndex !== -1 && args[dataIndex + 1]) {
    const dataFile = args[dataIndex + 1];
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    if (Array.isArray(data)) {
      // Multiple products
      for (const product of data) {
        const result = generateProductPage(product);
        savePage(result);
      }
    } else {
      // Single product
      const result = generateProductPage(data);
      savePage(result);
    }
    return;
  }

  // Show usage
  console.log(`
Product Page Generator for Kids Affiliate Site

Usage:
  node generate-product.js --data <json-file>    Generate from JSON file
  node generate-product.js --interactive         Interactive mode

JSON Data Format:
{
  "productName": "商品名",
  "category": "おもちゃ",
  "price": "¥3,000",
  "targetAge": "3歳以上",
  "manufacturer": "メーカー名",
  "productImage": "https://example.com/image.jpg",
  "affiliateLink": "https://amazon.co.jp/...",
  "rating": 4.5,
  "productShortDescription": "商品の短い説明",
  "pros": ["良い点1", "良い点2"],
  "cons": ["気になる点1"],
  "introduction": "<p>導入文</p>",
  "mainContent": "<p>本文</p>",
  "specifications": "<p>スペック</p>",
  "recommendation": "<ul><li>おすすめの人</li></ul>",
  "conclusion": "<p>まとめ</p>"
}
  `);
}

// Export for module use
module.exports = {
  generateProductPage,
  savePage,
  generateStars,
  generateSlug
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
