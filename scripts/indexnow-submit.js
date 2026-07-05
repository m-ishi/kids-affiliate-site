#!/usr/bin/env node
/**
 * IndexNow送信スクリプト
 * Bing等のIndexNow対応検索エンジンに新規/更新URLを即時通知する。
 * BingインデックスはChatGPT検索のソースなので、AI検索流入（AIEO）の入口になる。
 *
 * 使用方法:
 *   node indexnow-submit.js --all            # products/全記事+固定ページを送信
 *   node indexnow-submit.js slug1 slug2 ...  # 指定記事のみ送信
 *
 * 前提: リポジトリ直下に <INDEXNOW_KEY>.txt を配置済み（.envのINDEXNOW_KEY）
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const KEY = process.env.INDEXNOW_KEY;
const SITE = 'https://kidsgoodslab.com';
const PRODUCTS_DIR = path.join(__dirname, '..', 'products');

async function submit(urls) {
  if (!KEY) {
    console.log('⚠️ INDEXNOW_KEY未設定（scripts/.env）。送信スキップ');
    return false;
  }
  if (urls.length === 0) {
    console.log('送信対象なし');
    return true;
  }
  // IndexNowは1リクエスト最大10,000 URL
  const body = {
    host: 'kidsgoodslab.com',
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls,
  };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200=OK, 202=受理
  console.log(`IndexNow送信: ${urls.length} URL → HTTP ${res.status} ${res.status === 200 || res.status === 202 ? '✅' : '❌'}`);
  return res.status === 200 || res.status === 202;
}

async function main() {
  const args = process.argv.slice(2);
  let urls;

  if (args.includes('--all')) {
    const articles = fs.readdirSync(PRODUCTS_DIR)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .map(f => `${SITE}/products/${f.replace('.html', '')}`);
    urls = [`${SITE}/`, `${SITE}/products/`, `${SITE}/about`, ...articles];
  } else if (args.length > 0) {
    urls = args.map(s => `${SITE}/products/${s.replace(/\.html$/, '')}`);
  } else {
    console.log('使用方法: node indexnow-submit.js --all | slug1 slug2 ...');
    process.exit(1);
  }

  const ok = await submit(urls);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
