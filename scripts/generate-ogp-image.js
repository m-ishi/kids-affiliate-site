/**
 * OGP画像自動生成スクリプト（@napi-rs/canvas + 楽天商品検索API）
 * プリビルドバイナリのためCloud環境でも動作。
 * 日本語フォントは scripts/fonts/NotoSansJP-Bold.otf を同梱・登録。
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');

const outputDir = path.join(__dirname, '..', 'images', 'ogp');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 同梱フォント登録（Hiraginoが無いLinux/Cloud環境でも日本語が確実に出る）
const fontPath = path.join(__dirname, 'fonts', 'NotoSansJP-Bold.otf');
if (fs.existsSync(fontPath)) {
  GlobalFonts.registerFromPath(fontPath, 'Noto Sans JP');
}
const FONT_STACK = '"Noto Sans JP", "Hiragino Sans", sans-serif';

// .env読み込み（dotenv不要）
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID || '';

// カラーパレット
const colors = {
  white: '#ffffff',
  dark: '#2d3436',
  gray: '#636e72',
};

// カテゴリ別カラー
const categoryColors = {
  consumable: { bg: '#fff3e0', accent: '#ff9800', name: '消耗品' },
  food:       { bg: '#e8f5e9', accent: '#4caf50', name: '食品' },
  baby:       { bg: '#e3f2fd', accent: '#2196f3', name: 'ベビー用品' },
  furniture:  { bg: '#fce4ec', accent: '#e91e63', name: '家具' },
  educational:{ bg: '#fff8e1', accent: '#ffc107', name: '知育玩具' },
  outdoor:    { bg: '#e0f7fa', accent: '#00bcd4', name: '外遊び' },
  safety:     { bg: '#f3e5f5', accent: '#9c27b0', name: '安全グッズ' },
  toy:        { bg: '#fff8e1', accent: '#ff9800', name: 'おもちゃ' },
};

/**
 * 楽天商品検索APIで商品画像URLを取得
 */
function fetchRakutenImage(keyword) {
  return new Promise((resolve) => {
    if (!RAKUTEN_APP_ID) {
      return resolve(null);
    }
    const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=${RAKUTEN_APP_ID}&keyword=${encodeURIComponent(keyword)}&hits=1&imageFlag=1`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.Items && json.Items.length > 0) {
            const images = json.Items[0].Item.mediumImageUrls;
            if (images && images.length > 0) {
              // 楽天画像URLの?_ex=128x128を除去して大きい画像を取得
              const imageUrl = images[0].imageUrl.replace(/\?_ex=\d+x\d+/, '');
              resolve(imageUrl);
              return;
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

/**
 * URLから画像バッファをダウンロード
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * テキストを実測幅で折り返し
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
 * 商品画像がない場合のプレースホルダー（ベクター描画のギフトボックス）
 */
function drawPlaceholder(ctx, width, height, catColor) {
  const size = 280;
  const cx = width - size / 2 - 100;
  const cy = height / 2;

  // 装飾的な円
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = catColor.accent + '30';
  ctx.fill();

  // ギフトボックス本体
  const bw = 120, bh = 90;
  const bx = cx - bw / 2, by = cy - bh / 2 + 20;
  ctx.fillStyle = catColor.accent;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  // フタ
  ctx.beginPath();
  ctx.roundRect(bx - 10, by - 28, bw + 20, 26, 6);
  ctx.fill();
  // リボン（縦）
  ctx.fillStyle = colors.white;
  ctx.fillRect(cx - 8, by - 28, 16, bh + 28 + 2);
  // リボン（結び目）
  ctx.strokeStyle = colors.white;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx - 16, by - 42, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 16, by - 42, 12, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * OGP画像を生成
 */
async function generateOGP(productName, title, category, slug, productImageUrl = null) {
  console.log(`生成中: ${slug}`);

  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const catColor = categoryColors[category] || categoryColors.baby;

  // 楽天APIで商品画像を取得（URLが未指定の場合）
  if (!productImageUrl && RAKUTEN_APP_ID) {
    console.log(`楽天API検索: ${productName}`);
    productImageUrl = await fetchRakutenImage(productName);
    if (productImageUrl) {
      console.log(`商品画像取得: ${productImageUrl}`);
    }
  }

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

  // カテゴリタグ
  ctx.font = `bold 24px ${FONT_STACK}`;
  const tagWidth = ctx.measureText(catColor.name).width + 32;

  ctx.fillStyle = catColor.accent;
  ctx.beginPath();
  ctx.roundRect(60, 60, tagWidth, 44, 22);
  ctx.fill();

  ctx.fillStyle = colors.white;
  ctx.fillText(catColor.name, 76, 92);

  // 商品名（小さめ）
  ctx.font = `bold 28px ${FONT_STACK}`;
  ctx.fillStyle = colors.gray;
  ctx.fillText(productName, 60, 160);

  // タイトル（大きく、実測幅で折り返し）
  ctx.font = `bold 52px ${FONT_STACK}`;
  ctx.fillStyle = colors.dark;
  const titleLines = wrapText(ctx, title, 650);
  let y = 230;
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, 60, y);
    y += 70;
  }

  // サイト名
  ctx.font = `bold 22px ${FONT_STACK}`;
  ctx.fillStyle = catColor.accent;
  ctx.fillText('キッズグッズラボ', 60, height - 50);

  // 右側：商品画像エリア（または装飾）
  let img = null;
  if (productImageUrl) {
    try {
      let imgBuffer;
      if (productImageUrl.startsWith('http')) {
        imgBuffer = await downloadImage(productImageUrl);
      } else if (fs.existsSync(productImageUrl)) {
        imgBuffer = fs.readFileSync(productImageUrl);
      }
      if (imgBuffer) {
        img = await loadImage(imgBuffer);
      }
    } catch (e) {
      console.log(`画像取得失敗: ${e.message}`);
    }
  }

  if (img) {
    const imgSize = 320;
    const imgX = width - imgSize - 80;
    const imgY = (height - imgSize) / 2;

    // 白い円形背景
    ctx.beginPath();
    ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2 + 20, 0, Math.PI * 2);
    ctx.fillStyle = colors.white;
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 画像を円形にクリップ（アスペクト比維持で内接）
    ctx.save();
    ctx.beginPath();
    ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.min(imgSize / img.width, imgSize / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, imgX + (imgSize - dw) / 2, imgY + (imgSize - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    drawPlaceholder(ctx, width, height, catColor);
  }

  // 保存
  const outputPath = path.join(outputDir, `${slug}.png`);
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`✅ 完了: ${outputPath}`);
  return outputPath;
}

// CLI実行
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.log('使い方: node generate-ogp-image.js "商品名" "タイトル" "カテゴリ" "slug" [画像URLまたはパス]');
    console.log('例: node generate-ogp-image.js "パンパース" "どこで買える？" "consumable" "pampers-where-to-buy"');
    process.exit(1);
  }
  generateOGP(args[0], args[1], args[2], args[3], args[4])
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { generateOGP, fetchRakutenImage };
