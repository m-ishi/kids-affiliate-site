#!/usr/bin/env node
/**
 * 記事内のAmazon検索リンク(s?k=)を正しいASIN(dp/)リンクに置換するスクリプト
 * Brave Search APIでASINを自動取得
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

async function searchASIN(query) {
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(`${query} site:amazon.co.jp`)}&count=5&search_lang=jp&country=jp`;
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
  return null;
}

// 対象記事と検索クエリ
const articles = [
  {
    file: 'tapo-c210-baby-monitor-review.html',
    searches: [
      { query: 'TP-Link Tapo C210/A ネットワークカメラ', replace: 'TP-Link+Tapo+C210' }
    ]
  },
  {
    file: 'co-sleeping-bed-safety-guide.html',
    searches: [
      { query: 'ZOOBLY ベビーベッド 添い寝', replace: 'ZOOBLY' },
      { query: 'ファルスカ ベッドインベッド フレックス', replace: encodeURIComponent('ファルスカ+ベッドインベッド') },
      { query: 'カトージ ベビーベッド ミニ', replace: encodeURIComponent('カトージ+ベビーベッド+ミニ') }
    ]
  },
  {
    file: 'delonghi-oil-heater-kids-room-review.html',
    searches: [
      { query: 'デロンギ オイルヒーター アミカルド RHJ35M0812-DG', replace: encodeURIComponent('デロンギ+オイルヒーター+RHJ35M0812') }
    ]
  },
  {
    file: 'baby-cord-safety-cable-box-guide.html',
    searches: [
      { query: 'Umimile ケーブルボックス ルーター収納', replace: 'Umimile' }
    ]
  },
  {
    file: 'azamia-child-tray-review.html',
    searches: [
      { query: 'Azamia チャイルドトレイ チャイルドシート テーブル', replace: 'Azamia' }
    ]
  }
];

async function main() {
  const productsDir = path.join(__dirname, '..', 'products');

  for (const article of articles) {
    const filePath = path.join(productsDir, article.file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ ファイルなし: ${article.file}`);
      continue;
    }

    let html = fs.readFileSync(filePath, 'utf8');
    console.log(`\n📝 ${article.file}`);

    for (const search of article.searches) {
      console.log(`   🔍 検索: ${search.query}`);
      const result = await searchASIN(search.query);

      if (result) {
        console.log(`   ✅ ASIN: ${result.asin} - ${result.title}`);
        const newUrl = `https://www.amazon.co.jp/dp/${result.asin}?tag=${AMAZON_TAG}`;
        // s?k=XXX&tag=kidsgoodslab-22 のパターンを dp/ リンクに置換
        const searchPattern = new RegExp(
          `https://www\\.amazon\\.co\\.jp/s\\?k=[^"]*${search.replace}[^"]*tag=${AMAZON_TAG}`,
          'g'
        );
        const matches = html.match(searchPattern);
        if (matches) {
          html = html.replace(searchPattern, newUrl);
          console.log(`   🔄 ${matches.length}箇所置換`);
        } else {
          console.log(`   ⚠️ 検索リンクパターンが見つかりません`);
        }
      } else {
        console.log(`   ❌ ASIN見つからず（検索リンクのまま）`);
      }

      // レートリミット対策
      await new Promise(r => setTimeout(r, 1000));
    }

    fs.writeFileSync(filePath, html, 'utf8');
  }

  console.log('\n✨ 完了');
}

main().catch(console.error);
