#!/usr/bin/env node

/**
 * rebuild-queue.js
 *
 * Extracts metadata from all article HTML files in products/ directory
 * and outputs a JSON array for rebuild queue processing.
 *
 * Extracts: productName, category, asin, patternKey, slug
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');

// Category mapping: Japanese → English key
const CATEGORY_MAP = {
  'おもちゃ': 'toy',
  'ベビー用品': 'baby',
  '知育玩具': 'educational',
  '消耗品': 'consumable',
  '外遊び': 'outdoor',
  '家具・収納': 'furniture',
  '安全グッズ': 'safety',
  '食品': 'food',
};

// Pattern suffix mapping (order matters: longer suffixes first to avoid partial matches)
const PATTERN_SUFFIXES = [
  { suffix: '-model-comparison', key: 'model-comparison' },
  { suffix: '-skin-trouble', key: 'skin-trouble' },
  { suffix: '-where-to-buy', key: 'where-to-buy' },
  { suffix: '-lowest-price', key: 'lowest-price' },
  { suffix: '-warranty', key: 'warranty' },
  { suffix: '-seasonal', key: 'seasonal' },
  { suffix: '-quantity', key: 'quantity' },
  { suffix: '-reviews', key: 'reviews' },
  { suffix: '-storage', key: 'storage' },
  { suffix: '-coupon', key: 'coupon' },
  { suffix: '-repair', key: 'repair' },
  { suffix: '-used', key: 'used' },
];

/**
 * Determine pattern key from filename (without .html extension)
 */
function getPatternKey(slug) {
  // Check for "vs" comparison pattern
  if (slug.includes('-vs-') || slug.match(/^[^-]+-vs-/)) {
    return 'comparison';
  }

  // Check for known pattern suffixes
  for (const { suffix, key } of PATTERN_SUFFIXES) {
    if (slug.endsWith(suffix)) {
      return key;
    }
  }

  // Default
  return 'reviews';
}

/**
 * Extract product name from HTML content using multiple strategies:
 * 1. <p style="font-weight:600;margin-bottom:8px;">Product Name</p>
 * 2. <dt>商品名</dt><dd>Product Name</dd>
 * 3. JSON-LD "name" field
 * 4. <title> tag (fallback, cleaned)
 */
function extractProductName(html, slug) {
  // Strategy 1: product-info-card with inline style
  const inlineMatch = html.match(/font-weight:600;margin-bottom:8px;"?>([^<]+)</);
  if (inlineMatch) {
    return inlineMatch[1].trim();
  }

  // Strategy 2: product-specs <dt>商品名</dt><dd>...</dd>
  const specsMatch = html.match(/<dt>商品名<\/dt>\s*<dd>([^<]+)<\/dd>/);
  if (specsMatch) {
    return specsMatch[1].trim();
  }

  // Strategy 3: <li><b>商品名</b>: Product Name</li>
  const liBoldMatch = html.match(/<b>商品名<\/b>\s*[:：]\s*([^<]+)</);
  if (liBoldMatch) {
    return liBoldMatch[1].trim();
  }

  // Strategy 4: JSON-LD structured data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      if (jsonLd.name) {
        return jsonLd.name.trim();
      }
    } catch (e) {
      // JSON parse failed, continue to next strategy
    }
  }

  // Strategy 5: <title> tag (remove site suffix and pattern-related Japanese text)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    let title = titleMatch[1].trim();
    // Remove " - キッズグッズラボ" suffix
    title = title.replace(/\s*-\s*キッズグッズラボ$/, '');
    return title;
  }

  return slug;
}

/**
 * Extract category from <span class="article-category">
 */
function extractCategory(html) {
  const match = html.match(/<span class="article-category">([^<]+)<\/span>/);
  if (match) {
    const jaCategory = match[1].trim();
    return CATEGORY_MAP[jaCategory] || jaCategory;
  }
  return null;
}

/**
 * Extract first ASIN from Amazon /dp/ links
 */
function extractAsin(html) {
  const match = html.match(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/);
  if (match) {
    return match[1];
  }
  return null;
}

// Main execution
function main() {
  const files = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

  const results = [];

  for (const file of files) {
    const filePath = path.join(PRODUCTS_DIR, file);
    const html = fs.readFileSync(filePath, 'utf-8');
    const slug = file.replace('.html', '');

    const patternKey = getPatternKey(slug);
    const productName = extractProductName(html, slug);
    const category = extractCategory(html);
    const asin = extractAsin(html);

    results.push({
      slug,
      productName,
      category,
      asin,
      patternKey,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
