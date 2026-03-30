#!/usr/bin/env node
/**
 * 全記事のAmazonアフィリエイトリンク修正 + 楽天リンク追加スクリプト
 *
 * 1. 各記事から商品名を抽出
 * 2. Brave Search APIで正しいASINを取得
 * 3. ASINの有効性を確認（HTTPステータス）
 * 4. 古いASINを新しいASINに置換
 * 5. 楽天アフィリエイトリンクを各CTAに追加
 */

const fs = require('fs');
const path = require('path');

// .env読み込み
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  }
}

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const AMAZON_TAG = 'kidsgoodslab-22';
const RAKUTEN_AFF_ID = '525ce562.e179174b.525ce563.a29a3c52';

const PRODUCTS_DIR = path.join(__dirname, '..', 'products');
const LOG_FILE = path.join(__dirname, 'fix-all-links-log.json');

// ========== ユーティリティ ==========

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function searchASIN(query) {
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`${query} site:amazon.co.jp`)}&count=10&search_lang=jp&country=jp`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
    });
    const data = await res.json();
    if (data && data.web && data.web.results) {
      for (const result of data.web.results) {
        const match = result.url.match(/\/dp\/([A-Z0-9]{10})/);
        if (match) {
          return { asin: match[1], title: result.title, url: result.url };
        }
      }
    }
  } catch (e) {
    console.error(`   Brave Search エラー: ${e.message}`);
  }
  return null;
}

async function verifyASIN(asin) {
  try {
    const res = await fetch(`https://www.amazon.co.jp/dp/${asin}`, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    return res.status === 200;
  } catch (e) {
    return false;
  }
}

function extractProductName(html, filename) {
  // 1. product-info-card内の商品名
  const productNameMatch = html.match(/<p style="font-weight:600[^"]*"[^>]*>([^<]+)<\/p>/);
  if (productNameMatch) return productNameMatch[1].trim();

  // 2. meta descriptionから
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  if (descMatch) {
    const desc = descMatch[1];
    // "XXXの口コミ" パターンから商品名を抽出
    const nameFromDesc = desc.match(/^(.+?)の(?:口コミ|評判|レビュー)/);
    if (nameFromDesc) return nameFromDesc[1].trim();
  }

  // 3. titleタグから
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const title = titleMatch[1].replace(/ - キッズグッズラボ$/, '');
    // 最初の商品名部分を抽出
    const nameFromTitle = title.match(/^(.+?)(?:の評判|って実際|正直レビュー|口コミ|は本当|をお得|最安値|中古は|故障|保証は|どこで買う|で肌荒れ|季節|一体何枚|何枚必要)/);
    if (nameFromTitle) return nameFromTitle[1].trim();
    return title.split(/[！？!?]/)[0].trim();
  }

  return filename.replace('.html', '').replace(/-/g, ' ');
}

function extractCurrentASINs(html) {
  const asins = new Set();
  const matches = html.matchAll(/amazon\.co\.jp\/dp\/([A-Z0-9]{10})/g);
  for (const m of matches) {
    asins.add(m[1]);
  }
  return [...asins];
}

function buildRakutenUrl(productName) {
  const encoded = encodeURIComponent(productName);
  return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFF_ID}/?pc=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F${encoded}%2F&m=https%3A%2F%2Fsearch.rakuten.co.jp%2Fsearch%2Fmall%2F${encoded}%2F`;
}

function addRakutenLinks(html, productName) {
  const rakutenUrl = buildRakutenUrl(productName);

  // 既に楽天リンクがある場合はスキップ
  if (html.includes('rakuten.co.jp')) return html;

  // パターン1: product-info-card内のAmazonボタンの後に楽天ボタン追加
  html = html.replace(
    /(<a href="https:\/\/www\.amazon\.co\.jp\/dp\/[^"]+?" class="affiliate-btn" target="_blank" rel="noopener sponsored">Amazonで価格を見る<\/a>)/g,
    `$1\n          <a href="${rakutenUrl}" class="affiliate-btn rakuten-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#bf0000;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px;">楽天市場で見る</a>`
  );

  // パターン2: 中間CTA（黄色背景のbox）のAmazonボタンの後に追加
  html = html.replace(
    /(<a href="https:\/\/www\.amazon\.co\.jp\/dp\/[^"]+?" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#ff9900;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Amazonで見る →<\/a>)/g,
    `$1\n  <a href="${rakutenUrl}" class="affiliate-btn rakuten-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#bf0000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-left:8px;">楽天市場で見る →</a>`
  );

  // パターン3: 緑背景CTA
  html = html.replace(
    /(<a href="https:\/\/www\.amazon\.co\.jp\/dp\/[^"]+?" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#4caf50;[^"]*">[^<]+<\/a>)/g,
    `$1\n  <a href="${rakutenUrl}" class="affiliate-btn rakuten-btn" target="_blank" rel="noopener sponsored" style="display:inline-block;background:#bf0000;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:1rem;margin-top:8px;">楽天市場で価格を見る</a>`
  );

  // パターン4: 最下部CTA（グラデーション背景）のAmazonボタンの後に追加
  html = html.replace(
    /(<a href="https:\/\/www\.amazon\.co\.jp\/dp\/[^"]+?" class="affiliate-btn" target="_blank" rel="noopener sponsored" style="background:#fff;color:#667eea;font-weight:700;padding:16px 32px;font-size:1.1rem;">\s*[^<]+<\/a>)/g,
    `$1\n          <a href="${rakutenUrl}" class="affiliate-btn rakuten-btn" target="_blank" rel="noopener sponsored" style="background:rgba(255,255,255,0.9);color:#bf0000;font-weight:700;padding:16px 32px;font-size:1.1rem;margin-top:12px;display:inline-block;border-radius:8px;text-decoration:none;">楽天市場でも見る →</a>`
  );

  return html;
}

function replaceASIN(html, oldAsin, newAsin) {
  // dp/OLD → dp/NEW
  const pattern = new RegExp(`dp/${oldAsin}`, 'g');
  return html.replace(pattern, `dp/${newAsin}`);
}

// 特別な検索クエリマッピング（ファイル名から正しい商品名を推定しにくいもの）
const SPECIAL_QUERIES = {
  'fisher-price-ii.html': 'フィッシャープライス レインフォレスト デラックスジムII',
  'fisherprice-bilingual-used.html': 'フィッシャープライス バイリンガル おもちゃ',
  'plarail-thomas-set.html': 'プラレール トーマス ベーシックセット',
  'tomica-basicroad-reviews.html': 'トミカ つながる道路 ベーシックどうろセット',
  'tomica-dx-tower.html': 'トミカ でっかく遊ぼう DXトミカタワー',
  'sylvanian-red-roof-house.html': 'シルバニアファミリー 赤い屋根の大きなお家',
  'sylvanian-sylvanian.html': 'シルバニアファミリー はじめてのシルバニアファミリー',
  'mell-chan-baby-car.html': 'メルちゃん おせわパーツ ベビーカー',
  'mell-chan-starter.html': 'メルちゃん 入門セット',
  'ergobaby-omni-breeze-seasonal.html': 'エルゴベビー オムニブリーズ 抱っこ紐',
  'ergobaby-omni-360.html': 'エルゴベビー OMNI 360 クールエア',
  'ergo-omni-360.html': 'エルゴベビー OMNI 360 メッシュ',
  'ergobaby-adapt-used.html': 'エルゴベビー ADAPT 抱っこ紐',
  'strider-14x.html': 'ストライダー 14x ペダル',
  'strider-14x-reviews.html': 'ストライダー 14x',
  'strider-14x-warranty.html': 'ストライダー 14x',
  'strider-sport-model.html': 'ストライダー スポーツモデル',
  'pigeon-bonyu-jikkan.html': 'ピジョン 母乳実感 哺乳びん プラスチック',
  'pigeon-handy-fit.html': 'ピジョン さく乳器 母乳アシスト ハンディフィット',
  'richell-fuwafuwa-baby-bath.html': 'リッチェル ふかふかベビーバスW',
  'richell-fukafukababybath-coupon.html': 'リッチェル ふかふかベビーバスW',
  'richell-fukafukababybath-seasonal.html': 'リッチェル ふかふかベビーバスW',
  'combi-nemulila-auto-swing.html': 'コンビ ネムリラ AUTO SWING',
  'aprica-ag.html': 'アップリカ マジカルエアー AG',
  'aprica-rakuna-storage.html': 'アップリカ ラクーナクッション',
  'aprica-yurarizm-model-comparison.html': 'アップリカ ユラリズム',
  'bornelund-magformers-62.html': 'ボーネルンド マグフォーマー 62ピース',
  'kumon-kurukuru-chime.html': 'くもん くるくるチャイム',
  'lego-duplo-kazuasobi-train.html': 'レゴ デュプロ かずあそびトレイン',
  'pormido-prd8xc-digital-mirror-diy.html': 'PORMIDO PRD8XC ミラー型 ドライブレコーダー 12インチ',
  'goon-coupon.html': 'グーンプラス 敏感肌設計 テープ',
  'goon-lowest-price.html': 'グーンプラス テープ',
  'goon-reviews.html': 'グーンプラス 敏感肌設計',
  'goon-sarasara-tape.html': 'グーンプラス 敏感肌設計 テープ',
  'goon-skin-trouble.html': 'グーンプラス 敏感肌設計',
  'goon-where-to-buy.html': 'グーンプラス テープ',
  'merries-sarasara-coupon.html': 'メリーズ さらさらエアスルー テープ',
  'merries-sarasara-lowest-price.html': 'メリーズ さらさらエアスルー',
  'merries-sarasara-quantity.html': 'メリーズ さらさらエアスルー',
  'merries-sarasara-reviews.html': 'メリーズ さらさらエアスルー',
  'merries-sarasara-seasonal.html': 'メリーズ さらさらエアスルー',
  'merries-sarasara-skin-trouble.html': 'メリーズ さらさらエアスルー',
  'merries-sarasara-where-to-buy.html': 'メリーズ さらさらエアスルー',
  'moony-coupon.html': 'ムーニー エアフィット テープ',
  'moony-lowest-price.html': 'ムーニー エアフィット テープ',
  'moony-quantity.html': 'ムーニー エアフィット',
  'moony-reviews.html': 'ムーニー エアフィット',
  'moony-seasonal.html': 'ムーニー エアフィット',
  'moony-skin-trouble.html': 'ムーニー エアフィット',
  'moony-where-to-buy.html': 'ムーニー エアフィット テープ',
  'natural-moony-organic.html': 'ナチュラルムーニー オーガニックコットン テープ',
  'pampers-coupon.html': 'パンパース 肌へのいちばん テープ 新生児',
  'pampers-lowest-price.html': 'パンパース 肌へのいちばん テープ',
  'pampers-quantity.html': 'パンパース 肌へのいちばん テープ',
  'pampers-reviews.html': 'パンパース 肌へのいちばん テープ',
  'pampers-seasonal.html': 'パンパース 肌へのいちばん',
  'pampers-skin-trouble.html': 'パンパース 肌へのいちばん',
  'pampers-where-to-buy.html': 'パンパース 肌へのいちばん テープ',
  'pampers.html': 'パンパース おしりふき 肌へのいちばん',
  'pampers-sarasara-care.html': 'パンパース さらさらケア テープ',
  'pampers-sarasara-coupon.html': 'パンパース さらさらケア テープ',
  'pampers-sarasara-lowest-price.html': 'パンパース さらさらケア',
  'pampers-sarasara-quantity.html': 'パンパース さらさらケア',
  'pampers-sarasara-reviews.html': 'パンパース さらさらケア',
  'pampers-sarasara-seasonal.html': 'パンパース さらさらケア',
  'pampers-sarasara-skin-trouble.html': 'パンパース さらさらケア',
  'pampers-sarasara-where-to-buy.html': 'パンパース さらさらケア',
  'pampers-vs-merries.html': 'パンパース 肌へのいちばん テープ 新生児',
  'pampers-wipes-hadaichi.html': 'パンパース おしりふき 肌へのいちばん',
  'sandbox-toy-set-review.html': '砂場セット ダンプカー おもちゃ 15個',
  'nihon-ikuji-smartgate2-where-to-buy.html': '日本育児 スマートゲイト2',
  'cybex-melio-storage.html': 'CYBEX メリオカーボン ベビーカー',
  'babybjorn-mini-used.html': 'ベビービョルン MINI 抱っこ紐',
  'icreo-milk.html': 'アイクレオ バランスミルク 粉ミルク',
  'intex-frame-pool.html': 'INTEX フレームプール 家庭用',
  'joie-tilt-repair.html': 'Joie チルト チャイルドシート',
  'joie-tilt-used.html': 'Joie チルト チャイルドシート',
  'kewpie-babyfood-reviews.html': 'キユーピー ベビーフード 瓶詰',
  'meiji-hohoemi-cube.html': '明治 ほほえみ らくらくキューブ',
  'meiji-hohoemi-powder.html': '明治 ほほえみ 粉ミルク 大缶',
  'wakodo-googoo-kitchen.html': '和光堂 グーグーキッチン ベビーフード',
  'wipes-moony-reviews.html': 'ムーニー おしりふき やわらか素材',
};

// ========== メイン処理 ==========

async function main() {
  if (!BRAVE_API_KEY) {
    console.error('BRAVE_API_KEY が設定されていません。.envファイルを確認してください。');
    process.exit(1);
  }

  const files = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

  console.log(`\n📊 対象記事: ${files.length}件\n`);

  const results = {
    fixed: [],
    rakutenAdded: [],
    asinNotFound: [],
    asinInvalid: [],
    errors: [],
    skipped: []
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(PRODUCTS_DIR, file);
    let html = fs.readFileSync(filePath, 'utf8');
    const currentASINs = extractCurrentASINs(html);

    console.log(`[${i + 1}/${files.length}] ${file}`);

    // 商品名を決定
    const searchQuery = SPECIAL_QUERIES[file] || extractProductName(html, file);
    console.log(`   商品名: ${searchQuery}`);

    // Brave Searchで正しいASINを検索
    const searchResult = await searchASIN(searchQuery);
    await sleep(1100); // レートリミット対策

    if (!searchResult) {
      console.log(`   ❌ ASIN見つからず`);
      results.asinNotFound.push({ file, query: searchQuery, currentASINs });

      // ASINが見つからなくても楽天リンクは追加
      const productName = searchQuery;
      const newHtml = addRakutenLinks(html, productName);
      if (newHtml !== html) {
        fs.writeFileSync(filePath, newHtml, 'utf8');
        results.rakutenAdded.push(file);
        console.log(`   🔴 楽天リンク追加`);
      }
      continue;
    }

    const newASIN = searchResult.asin;
    console.log(`   🔍 検索結果: ${newASIN} - ${searchResult.title}`);

    // ASINの有効性を確認
    const isValid = await verifyASIN(newASIN);
    await sleep(500);

    if (!isValid) {
      console.log(`   ⚠️ 新ASINも無効 (404): ${newASIN}`);
      results.asinInvalid.push({ file, query: searchQuery, asin: newASIN, title: searchResult.title });

      // 楽天リンクだけ追加
      const productName = searchQuery;
      const newHtml = addRakutenLinks(html, productName);
      if (newHtml !== html) {
        fs.writeFileSync(filePath, newHtml, 'utf8');
        results.rakutenAdded.push(file);
        console.log(`   🔴 楽天リンク追加`);
      }
      continue;
    }

    // ASINを置換
    let modified = false;
    if (currentASINs.length === 0) {
      // ASINなしの記事 → schema.orgに追加は複雑なのでログだけ
      console.log(`   ⚠️ 現在ASINなし。手動追加が必要`);
      results.errors.push({ file, reason: 'ASINなし', newASIN, newTitle: searchResult.title });
    } else {
      for (const oldASIN of currentASINs) {
        if (oldASIN !== newASIN) {
          html = replaceASIN(html, oldASIN, newASIN);
          console.log(`   ✅ ASIN置換: ${oldASIN} → ${newASIN}`);
          modified = true;
        }
      }
      if (!modified && currentASINs.includes(newASIN)) {
        console.log(`   ✅ ASIN正しい: ${newASIN}`);
        results.skipped.push(file);
      }
    }

    // 楽天リンクを追加
    const productName = searchQuery;
    html = addRakutenLinks(html, productName);

    // ファイル書き込み
    fs.writeFileSync(filePath, html, 'utf8');
    if (modified) {
      results.fixed.push({ file, oldASINs: currentASINs, newASIN, title: searchResult.title });
    }
    if (html.includes('rakuten.co.jp')) {
      if (!results.rakutenAdded.includes(file)) {
        results.rakutenAdded.push(file);
      }
    }
  }

  // 結果サマリー
  console.log('\n' + '='.repeat(60));
  console.log('📊 処理結果サマリー');
  console.log('='.repeat(60));
  console.log(`✅ ASIN修正: ${results.fixed.length}件`);
  console.log(`🔴 楽天リンク追加: ${results.rakutenAdded.length}件`);
  console.log(`⏭️ ASINそのまま: ${results.skipped.length}件`);
  console.log(`❌ ASIN取得失敗: ${results.asinNotFound.length}件`);
  console.log(`⚠️ 新ASIN無効: ${results.asinInvalid.length}件`);
  console.log(`🔧 要手動対応: ${results.errors.length}件`);

  if (results.asinNotFound.length > 0) {
    console.log('\n--- ASIN取得失敗 ---');
    for (const r of results.asinNotFound) {
      console.log(`  ${r.file}: "${r.query}" (現ASIN: ${r.currentASINs.join(', ')})`);
    }
  }

  if (results.asinInvalid.length > 0) {
    console.log('\n--- 新ASIN無効 ---');
    for (const r of results.asinInvalid) {
      console.log(`  ${r.file}: ${r.asin} "${r.title}"`);
    }
  }

  if (results.fixed.length > 0) {
    console.log('\n--- ASIN修正詳細 ---');
    for (const r of results.fixed) {
      console.log(`  ${r.file}: ${r.oldASINs.join(',')} → ${r.newASIN} (${r.title})`);
    }
  }

  // ログ保存
  fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n📄 詳細ログ: ${LOG_FILE}`);
}

main().catch(console.error);
