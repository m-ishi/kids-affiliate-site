const fs = require('fs');
const path = require('path');

// 商品名とASINのマッピング
const asinMap = {
  'anpanman-block-lab-town.html': 'B07STCGB6Q',  // アンパンマン ブロックラボ
  'anpanman-buranko-park-dx.html': 'B00Y2L0GAC', // アンパンマン ブランコパーク DX
  'babybjorn-bliss.html': 'B01AZC364S',          // ベビービョルン バウンサー Bliss
  'bornelund-magformers-62.html': 'B001HGJA5U',  // マグフォーマー 62ピース
  'combi-nemulila-auto-swing.html': 'B07CZBRQV1', // コンビ ネムリラ オートスウィング
  'edinter-mori-asobibako.html': 'B001SZSW3M',   // エドインター 森のあそび箱
  'ergobaby-omni-360.html': 'B075FSBNTF',        // エルゴベビー OMNI 360
  'gakken-new-block.html': 'B00I7BGQWQ',         // 学研 ニューブロック
  'goon-sarasara-tape.html': 'B08WHMNTT6',       // グーン さらさらテープ
  'kumon-study-shogi.html': 'B00IUGEWOG',        // くもん スタディ将棋
  'lego-duplo-kazuasobi-train.html': 'B07W7TCLSZ', // レゴ デュプロ かずあそびトレイン
  'mell-chan-baby-car.html': 'B07NC5LPYC',       // メルちゃん ベビーカー
  'nihon-ikuji-smart-gate-2.html': 'B07H3PZNF6', // 日本育児 スマートゲイト2
  'nishimatsuya-smartangel-.html': 'B0CCVWL8CV', // 西松屋 スマートエンジェル
  'pampers-oyasumi-pants.html': 'B0BYFZBXHD',    // パンパース おやすみパンツ
  'pampers-sarasara-care.html': 'B0BYG24S5V',    // パンパース さらさらケア
  'pampers-vs-merries.html': 'B0BYG24S5V',       // パンパース（比較記事用）
  'pigeon-bonyu-jikkan.html': 'B00IGLK8VA',      // ピジョン 母乳実感
  'richell-corner-cushion.html': 'B001E0EM96',   // リッチェル コーナークッション
  'richell-fuwafuwa-baby-bath.html': 'B0040UGJPA', // リッチェル ふかふかベビーバス
  'strider-sport-model.html': 'B00IZXCB5A',      // ストライダー スポーツモデル
  'sylvanian-red-roof-house.html': 'B01D3PJUHI', // シルバニア 赤い屋根の大きなお家
  'takara-tomy-6way.html': 'B07YK75QJ1',         // タカラトミー 6WAYジムにへんしんメリー
  'tomica-dx-tower.html': 'B09MTZC8YH',          // トミカ DXトミカタワー
  'tomica-dxtomica.html': 'B09MTZC8YH',          // トミカ DXトミカタワー
  '-.html': 'B0CP1HVWTH',                        // マミーポコ
  '-bos.html': 'B073CHGBGF'                      // BOS おむつ袋
};

const productsDir = '/Users/masa/kids-affiliate-site/products';
const affiliateTag = 'kidsgoodslab-22';

let updated = 0;

for (const [file, asin] of Object.entries(asinMap)) {
  const filePath = path.join(productsDir, file);

  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // 既にAmazon画像があるかチェック
  if (content.includes('m.media-amazon.com/images/P/')) {
    console.log(`Already has image: ${file}`);
    continue;
  }

  // product-imageセクションを探して画像を追加
  const newImageDiv = `<div class="product-image" style="border-radius: var(--radius-md); overflow: hidden;">
            <a href="https://www.amazon.co.jp/dp/${asin}?tag=${affiliateTag}" target="_blank" rel="noopener sponsored">
              <img src="https://m.media-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;" onerror="this.parentElement.innerHTML='📦';">
            </a>
          </div>`;

  // パターン1: span内の📦
  const pattern1 = /<div class="product-image"[^>]*>\s*<span[^>]*>📦<\/span>\s*<\/div>/s;
  // パターン2: 直接📦
  const pattern2 = /<div class="product-image"[^>]*>\s*📦\s*<\/div>/s;

  if (content.match(pattern1)) {
    content = content.replace(pattern1, newImageDiv);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${file} with ASIN ${asin}`);
    updated++;
  } else if (content.match(pattern2)) {
    content = content.replace(pattern2, newImageDiv);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${file} with ASIN ${asin}`);
    updated++;
  } else {
    console.log(`Could not find image placeholder in: ${file}`);
  }
}

console.log(`\nTotal updated: ${updated} files`);
