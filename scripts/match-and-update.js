/**
 * 既存記事と検証済み商品を商品名でマッチングし、ASINを更新
 */

const fs = require('fs');
const path = require('path');

const productsDir = '/Users/masa/kids-affiliate-site/products';
const verifiedProducts = require('./verified-products.json');

// 商品名の正規化（マッチング用）
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[\s\-_・]/g, '')
    .replace(/ー/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// マッチングルール（既存記事のキーワード → 検証済み商品名の部分一致）
const matchRules = [
  // おむつ
  { pattern: /パンパース.*さらさら|pampers.*sarasara/i, product: 'パンパース さらさらケア' },
  { pattern: /パンパース.*肌|pampers.*hada/i, product: 'パンパース 肌へのいちばん' },
  { pattern: /メリーズ|merries/i, product: 'メリーズ さらさらエアスルー' },
  { pattern: /ムーニー.*エアフィット|moony.*air/i, product: 'ムーニー エアフィット' },
  { pattern: /ナチュラルムーニー|natural.*moony/i, product: 'ナチュラルムーニー オーガニック' },
  { pattern: /グーン|goon/i, product: 'グーン プラス' },
  { pattern: /マミーポコ|mamypoko/i, product: 'マミーポコ パンツ' },

  // 粉ミルク・離乳食
  { pattern: /ほほえみ|hohoemi/i, product: 'ほほえみ らくらくキューブ' },
  { pattern: /はいはい|haihai/i, product: 'はいはい 粉ミルク' },
  { pattern: /アイクレオ|icreo/i, product: 'アイクレオ バランスミルク' },
  { pattern: /すこやか|sukoyaka/i, product: 'すこやかM1' },
  { pattern: /キューピー|kewpie/i, product: 'キューピー ベビーフード' },
  { pattern: /和光堂|wakodo/i, product: '和光堂 グーグーキッチン' },

  // 哺乳瓶・授乳
  { pattern: /母乳実感|pigeon.*bonyu/i, product: 'ピジョン 母乳実感' },
  { pattern: /テテオ|teteo/i, product: 'コンビ テテオ 哺乳びん' },
  { pattern: /搾乳|pigeon.*handy/i, product: 'ピジョン 搾乳器 電動' },

  // 抱っこ紐
  { pattern: /エルゴ.*omni|ergobaby.*omni/i, product: 'エルゴベビー OMNI Breeze' },
  { pattern: /エルゴ.*adapt|ergobaby.*adapt/i, product: 'エルゴベビー ADAPT' },
  { pattern: /コニー|konny/i, product: 'コニー 抱っこ紐' },
  { pattern: /ベビービョルン.*mini|babybjorn.*mini/i, product: 'ベビービョルン MINI' },
  { pattern: /アップリカ.*コアラ|aprica.*koala/i, product: 'アップリカ コアラ ウルトラメッシュ' },

  // ベビーカー
  { pattern: /スゴカル|sugocal/i, product: 'コンビ スゴカルSwitch' },
  { pattern: /ラクーナ|rakuna/i, product: 'アップリカ ラクーナ クッション' },
  { pattern: /サイベックス.*メリオ|cybex.*melio/i, product: 'サイベックス メリオ カーボン' },
  { pattern: /ランフィ|runfee/i, product: 'ピジョン ランフィ' },

  // チャイルドシート
  { pattern: /クルムーヴ|culmove/i, product: 'コンビ クルムーヴ スマート' },
  { pattern: /フラディア|fladea/i, product: 'アップリカ フラディア グロウ' },
  { pattern: /joie.*チルト|joie.*tilt/i, product: 'Joie チルト' },
  { pattern: /サイベックス.*シローナ|cybex.*sirona/i, product: 'サイベックス シローナ' },

  // バウンサー・スウィング
  { pattern: /ベビービョルン.*バウンサー|babybjorn.*bliss/i, product: 'ベビービョルン バウンサー Bliss' },
  { pattern: /ネムリラ|nemulila/i, product: 'コンビ ネムリラ AUTO SWING' },
  { pattern: /ユラリズム|yurarizm/i, product: 'アップリカ ユラリズム' },

  // ベビーベッド・寝具
  { pattern: /ファルスカ|farska/i, product: 'ファルスカ ベッドインベッド' },
  { pattern: /サンデシカ|sandesica/i, product: 'サンデシカ 抱っこ布団' },

  // ベビーバス
  { pattern: /リッチェル.*ふかふか|richell.*fuwafuwa/i, product: 'リッチェル ふかふかベビーバス' },
  { pattern: /スイマーバ|swimava/i, product: 'スイマーバ うきわ首リング' },

  // 安全グッズ
  { pattern: /スマートゲイト|smartgate/i, product: '日本育児 スマートゲイト2' },
  { pattern: /コーナー.*ガード|corner.*guard/i, product: 'コーナーガード' },

  // 知育玩具
  { pattern: /レゴ.*デュプロ|lego.*duplo/i, product: 'レゴ デュプロ コンテナ' },
  { pattern: /アンパンマン.*ブロック|anpanman.*block/i, product: 'アンパンマン ブロックラボ' },
  { pattern: /くるくるチャイム|kurukuru/i, product: 'くもん くるくるチャイム' },
  { pattern: /フィッシャープライス|fisher.*price/i, product: 'フィッシャープライス バイリンガル' },
  { pattern: /マグフォーマー|magformers/i, product: 'ボーネルンド マグフォーマー' },

  // 外遊び
  { pattern: /ストライダー.*スポーツ|strider.*sport/i, product: 'ストライダー スポーツモデル' },
  { pattern: /ストライダー.*14/i, product: 'ストライダー 14x' },
  { pattern: /よくばりビジーカー|busycar/i, product: 'アンパンマン よくばりビジーカー' },
  { pattern: /intex.*プール|インテックス/i, product: 'INTEX プール' },

  // トミカ・プラレール
  { pattern: /トミカ|tomica/i, product: 'トミカ ベーシック道路セット' },
  { pattern: /プラレール|plarail/i, product: 'プラレール ベーシックセット' },

  // その他
  { pattern: /シルバニア|sylvanian/i, product: 'シルバニアファミリー 赤い屋根の大きなお家' },
  { pattern: /メルちゃん|mell.*chan/i, product: 'メルちゃん お人形セット' },
];

// 検証済み商品のマップを作成
const verifiedMap = new Map();
for (const p of verifiedProducts) {
  verifiedMap.set(p.name, p);
}

// 既存記事を取得
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.html') && f !== 'index.html');

console.log('=== 既存記事と検証済み商品のマッチング ===\n');
console.log(`既存記事: ${files.length}件`);
console.log(`検証済み商品: ${verifiedProducts.length}件\n`);

const matched = [];
const unmatched = [];

for (const file of files) {
  const filePath = path.join(productsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // タイトル取得
  const titleMatch = content.match(/<h1 class="article-title">([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1] : file;

  // ファイル名とタイトルでマッチング
  const searchText = file + ' ' + title;

  let matchedProduct = null;
  for (const rule of matchRules) {
    if (rule.pattern.test(searchText)) {
      matchedProduct = verifiedMap.get(rule.product);
      break;
    }
  }

  if (matchedProduct) {
    matched.push({ file, title, product: matchedProduct });
    console.log(`✅ ${file}`);
    console.log(`   → ${matchedProduct.name} (${matchedProduct.asin})`);
  } else {
    unmatched.push({ file, title });
    console.log(`❌ ${file}`);
    console.log(`   タイトル: ${title.substring(0, 40)}...`);
  }
}

console.log(`\n=== 結果 ===`);
console.log(`マッチ: ${matched.length}件`);
console.log(`未マッチ: ${unmatched.length}件`);

// 結果を保存
fs.writeFileSync(
  path.join(__dirname, 'match-results.json'),
  JSON.stringify({ matched, unmatched }, null, 2),
  'utf8'
);

console.log('\n結果を保存: match-results.json');
console.log('\nASIN更新を実行するには: node match-and-update.js --execute');

// --execute オプションで実際に更新
if (process.argv.includes('--execute')) {
  console.log('\n=== ASIN更新実行 ===');

  for (const item of matched) {
    const filePath = path.join(productsDir, item.file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 古いASINを新しいASINに置換
    const oldAsinMatch = content.match(/images\/P\/([A-Z0-9]+)/);
    if (oldAsinMatch) {
      const oldAsin = oldAsinMatch[1];
      const newAsin = item.product.asin;

      if (oldAsin !== newAsin) {
        content = content.replace(new RegExp(oldAsin, 'g'), newAsin);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`更新: ${item.file} (${oldAsin} → ${newAsin})`);
      }
    }
  }

  // 未マッチ記事を削除
  console.log('\n=== 未マッチ記事を削除 ===');
  for (const item of unmatched) {
    const filePath = path.join(productsDir, item.file);
    fs.unlinkSync(filePath);
    console.log(`削除: ${item.file}`);
  }

  console.log(`\n${matched.length}件のASINを更新、${unmatched.length}件の記事を削除しました`);

  // インデックス再構築
  console.log('\nインデックスを再構築中...');
  require('./rebuild-index.js');
}
