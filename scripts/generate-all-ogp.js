/**
 * 既存全記事のOGP画像を一括生成 & 記事HTMLを更新するスクリプト
 * - products/ 内の全HTML記事からメタ情報を抽出
 * - OGP画像がまだない記事に対してOGP画像を生成
 * - 記事HTML内のAmazon画像参照をOGP画像に置換
 * - og:image メタタグを追加/更新
 */

const fs = require('fs');
const path = require('path');
const { generateOGP } = require('./generate-ogp-image');

const productsDir = '/Users/masa/kids-affiliate-site/products';
const ogpDir = '/Users/masa/kids-affiliate-site/images/ogp';

// カテゴリマッピング（日本語→英語）
const categoryMap = {
  'おもちゃ': 'toy',
  'ベビー用品': 'baby',
  '知育玩具': 'educational',
  '消耗品': 'consumable',
  '外遊び': 'outdoor',
  '家具・収納': 'furniture',
  '安全グッズ': 'safety',
};

async function main() {
  const files = fs.readdirSync(productsDir)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

  console.log(`📁 ${files.length}件の記事を処理します\n`);

  let generated = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const slug = file.replace('.html', '');
    const filePath = path.join(productsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 記事からメタ情報を抽出
    const titleMatch = content.match(/<h1 class="article-title">([^<]+)<\/h1>/);
    const categoryMatch = content.match(/<span class="article-category">([^<]+)<\/span>/);
    // 商品名はproduct-specsから抽出
    const productNameMatch = content.match(/<dt>商品名<\/dt>\s*<dd>([^<]+)<\/dd>/);

    if (!titleMatch) {
      console.log(`⚠️ スキップ: ${file} (タイトルが見つかりません)`);
      skipped++;
      continue;
    }

    const title = titleMatch[1];
    const categoryJa = categoryMatch ? categoryMatch[1] : 'ベビー用品';
    const category = categoryMap[categoryJa] || 'baby';
    const productName = productNameMatch ? productNameMatch[1] : title.substring(0, 30);

    // OGP画像がなければ生成
    const ogpPath = path.join(ogpDir, `${slug}.png`);
    if (!fs.existsSync(ogpPath)) {
      try {
        await generateOGP(productName, title, category, slug);
        generated++;
        console.log(`✅ OGP生成: ${slug}.png`);
      } catch (e) {
        console.error(`❌ OGP生成失敗: ${slug} - ${e.message}`);
        errors++;
        continue;
      }
    } else {
      console.log(`⏭️  OGP既存: ${slug}.png`);
    }

    // --- 記事HTMLを更新 ---
    let modified = false;

    // 1. product-info-box内のAmazon画像をOGP画像に置換
    // パターン: <a href="...amazon..."><img src="https://m.media-amazon.com/images/P/..." ...></a>
    const amazonImgRegex = /<a href="(https:\/\/www\.amazon\.co\.jp[^"]*)"[^>]*>\s*<img src="https:\/\/m\.media-amazon\.com\/images\/P\/[^"]*"[^>]*>\s*<\/a>/g;
    if (amazonImgRegex.test(content)) {
      content = content.replace(amazonImgRegex, (match, amazonUrl) => {
        return `<a href="${amazonUrl}" target="_blank" rel="noopener sponsored"><img src="../images/ogp/${slug}.png" alt="${productName}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;"></a>`;
      });
      modified = true;
    }

    // 2. og:image メタタグを追加/更新
    const ogImageMeta = `<meta property="og:image" content="https://kidsgoodslab.com/images/ogp/${slug}.png">`;
    if (content.includes('og:image')) {
      // 既存のog:imageを更新
      content = content.replace(
        /<meta property="og:image" content="[^"]*">/,
        ogImageMeta
      );
      modified = true;
    } else if (content.includes('og:url')) {
      // og:urlの後にog:imageを追加
      content = content.replace(
        /(<meta property="og:url" content="[^"]*">)/,
        `$1\n  ${ogImageMeta}`
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      updated++;
      console.log(`   📝 HTML更新: ${file}`);
    }
  }

  console.log(`\n========== 完了 ==========`);
  console.log(`OGP画像生成: ${generated}件`);
  console.log(`HTML更新: ${updated}件`);
  console.log(`スキップ: ${skipped}件`);
  console.log(`エラー: ${errors}件`);
}

main().catch(e => {
  console.error('致命的エラー:', e);
  process.exit(1);
});
