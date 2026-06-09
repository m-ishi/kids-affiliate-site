/**
 * OGP画像自動生成スクリプト
 * キッズグッズラボ オリジナルデザイン
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// 出力ディレクトリ
const outputDir = path.join(__dirname, '../images/ogp');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// カラーパレット（キッズグッズラボ用）
const colors = {
  primary: '#667eea',      // メインカラー（紫青）
  secondary: '#764ba2',    // サブカラー（紫）
  accent: '#f093fb',       // アクセント（ピンク）
  yellow: '#ffd93d',       // 黄色
  mint: '#6bcb77',         // ミント
  coral: '#ff6b6b',        // コーラル
  white: '#ffffff',
  dark: '#2d3436',
  gray: '#636e72',
  lightBg: '#f8f9fa',
};

// カテゴリ別カラー
const categoryColors = {
  'consumable': { bg: '#fff3e0', accent: '#ff9800' },  // オレンジ系
  'food': { bg: '#e8f5e9', accent: '#4caf50' },        // グリーン系
  'baby': { bg: '#e3f2fd', accent: '#2196f3' },        // ブルー系
  'furniture': { bg: '#fce4ec', accent: '#e91e63' },   // ピンク系
  'educational': { bg: '#fff8e1', accent: '#ffc107' }, // イエロー系
  'outdoor': { bg: '#e0f7fa', accent: '#00bcd4' },     // シアン系
  'safety': { bg: '#f3e5f5', accent: '#9c27b0' },      // パープル系
};

/**
 * テキストを指定幅で折り返し
 */
function wrapText(ctx, text, maxWidth) {
  const chars = text.split('');
  const lines = [];
  let currentLine = '';

  for (const char of chars) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * パターンA: グラデーション背景 + 斜めデザイン
 */
async function generatePatternA(productName, title, category, slug, productImagePath = null) {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const catColor = categoryColors[category] || categoryColors['baby'];

  // 背景グラデーション（斜め）
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, catColor.bg);
  gradient.addColorStop(1, colors.white);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 装飾：右上の丸
  ctx.beginPath();
  ctx.arc(width + 50, -50, 250, 0, Math.PI * 2);
  ctx.fillStyle = catColor.accent + '20';
  ctx.fill();

  // 装飾：左下の丸
  ctx.beginPath();
  ctx.arc(-80, height + 80, 300, 0, Math.PI * 2);
  ctx.fillStyle = catColor.accent + '15';
  ctx.fill();

  // 左側：テキストエリア
  // カテゴリタグ
  const categoryNames = {
    'consumable': '消耗品', 'food': '食品', 'baby': 'ベビー用品',
    'furniture': '家具', 'educational': '知育玩具', 'outdoor': '外遊び', 'safety': '安全グッズ'
  };
  const catName = categoryNames[category] || 'ベビー用品';

  ctx.font = 'bold 24px "Hiragino Sans", "Noto Sans JP", sans-serif';
  const tagWidth = ctx.measureText(catName).width + 32;

  // タグ背景
  ctx.fillStyle = catColor.accent;
  ctx.beginPath();
  ctx.roundRect(60, 60, tagWidth, 44, 22);
  ctx.fill();

  // タグテキスト
  ctx.fillStyle = colors.white;
  ctx.fillText(catName, 76, 92);

  // 商品名（小さめ）
  ctx.font = 'bold 28px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = colors.gray;
  ctx.fillText(productName, 60, 160);

  // タイトル（大きく、折り返し）
  ctx.font = 'bold 52px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = colors.dark;
  const titleLines = wrapText(ctx, title, 650);
  let y = 230;
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, 60, y);
    y += 70;
  }

  // サイト名
  ctx.font = 'bold 22px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.fillStyle = catColor.accent;
  ctx.fillText('キッズグッズラボ', 60, height - 50);

  // 右側：商品画像エリア（または装飾）
  if (productImagePath && fs.existsSync(productImagePath)) {
    try {
      const img = await loadImage(productImagePath);
      const imgSize = 320;
      const imgX = width - imgSize - 80;
      const imgY = (height - imgSize) / 2;

      // 白い円形背景
      ctx.beginPath();
      ctx.arc(imgX + imgSize/2, imgY + imgSize/2, imgSize/2 + 20, 0, Math.PI * 2);
      ctx.fillStyle = colors.white;
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 画像を円形にクリップ
      ctx.save();
      ctx.beginPath();
      ctx.arc(imgX + imgSize/2, imgY + imgSize/2, imgSize/2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
      ctx.restore();
    } catch (e) {
      drawPlaceholder(ctx, width, height, catColor);
    }
  } else {
    drawPlaceholder(ctx, width, height, catColor);
  }

  // 保存
  const outputPath = path.join(outputDir, `${slug}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * 商品画像がない場合のプレースホルダー
 */
function drawPlaceholder(ctx, width, height, catColor) {
  const size = 280;
  const x = width - size - 100;
  const y = (height - size) / 2;

  // 装飾的な円
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2);
  ctx.fillStyle = catColor.accent + '30';
  ctx.fill();

  // アイコン的な要素
  ctx.font = '120px "Hiragino Sans"';
  ctx.fillStyle = catColor.accent;
  ctx.textAlign = 'center';
  ctx.fillText('📦', x + size/2, y + size/2 + 40);
  ctx.textAlign = 'left';
}

/**
 * メイン実行
 */
async function generateOGP(productName, title, category, slug, productImagePath = null) {
  console.log(`生成中: ${slug}`);
  const outputPath = await generatePatternA(productName, title, category, slug, productImagePath);
  console.log(`✅ 完了: ${outputPath}`);
  return outputPath;
}

// CLI実行
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.log('使い方: node generate-ogp-image.js "商品名" "タイトル" "カテゴリ" "slug" [商品画像パス]');
    console.log('例: node generate-ogp-image.js "パンパース" "どこで買える？" "consumable" "pampers-where-to-buy"');
    process.exit(1);
  }

  generateOGP(args[0], args[1], args[2], args[3], args[4])
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { generateOGP, generatePatternA };
