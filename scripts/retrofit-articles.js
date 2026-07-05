#!/usr/bin/env node
/**
 * 既存記事の一括改修スクリプト（2026-07 品質基準への遡及適用）
 *
 * やること:
 *   1. 中間バナーCTA削除（#fff3cd / #e8f5e9グラデの2種。冒頭カード+末尾CTAの2箇所に）
 *   2. 公的機関リンク挿入（カテゴリ別、最終CTA直前）
 *   3. 関連記事3本挿入（同カテゴリ優先、最終CTA直後）
 *   4. schema.orgの根拠なしreview/rating削除 + dateModified更新
 *   5. 禁止表現（愛用/実際に使ってみた/安全・安心断言等）をGeminiで書き換え
 *   6. 短すぎるmeta description（<80字）をGeminiで110-140字に拡張
 *   ※ ファイルのmtimeは保持（インデックスの並び順を壊さない）
 *
 * 使用方法:
 *   node retrofit-articles.js [--dry-run] [--limit N] [--skip-gemini]
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const PRODUCTS_DIR = path.join(__dirname, '..', 'products');

const CATEGORY_KEYS = {
  'おもちゃ': 'toy', 'ベビー用品': 'baby', '知育玩具': 'educational',
  '消耗品': 'consumable', '外遊び': 'outdoor', '家具・収納': 'furniture', '安全グッズ': 'safety'
};

const AUTHORITY_LINKS = {
  toy: [
    { name: '一般社団法人 日本玩具協会（STマーク）', url: 'https://www.toys.or.jp/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  educational: [
    { name: '一般社団法人 日本玩具協会（STマーク）', url: 'https://www.toys.or.jp/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  baby: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '独立行政法人 国民生活センター', url: 'https://www.kokusen.go.jp/' },
  ],
  consumable: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '独立行政法人 国民生活センター', url: 'https://www.kokusen.go.jp/' },
  ],
  outdoor: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  furniture: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '消費者庁 リコール情報サイト', url: 'https://www.recall.caa.go.jp/' },
  ],
  safety: [
    { name: '消費者庁 子どもの事故防止', url: 'https://www.caa.go.jp/policies/policy/consumer_safety/child/' },
    { name: '独立行政法人 国民生活センター', url: 'https://www.kokusen.go.jp/' },
  ],
};

const BANNED_PATTERNS = [
  { re: /愛用/, label: '愛用' },
  { re: /実際に使ってみ/, label: '実際に使ってみた' },
  { re: /使ってみました/, label: '使ってみました' },
  { re: /我が家で使って|うちで使って/, label: '我が家で使っている' },
  { re: /リピ買い|リピートして/, label: 'リピート' },
  { re: /安全です/, label: '安全です断言' },
  { re: /安心です/, label: '安心です断言' },
];

// 中間バナーCTA（旧auto-generateが挿入していた2種）
const MID_CTA_PATTERNS = [
  /\n?<div style="background:#fff3cd;border:2px solid #ffc107;[^"]*">[\s\S]*?<\/div>/g,
  /\n?<div style="background:linear-gradient\(135deg,#e8f5e9 0%,#c8e6c9 100%\);[^"]*">[\s\S]*?<\/div>/g,
];

const FINAL_CTA_RE = /<div style="background:linear-gradient\(135deg,#667eea[^"]*">[\s\S]*?<\/div>/;

async function callGemini(prompt, maxOutputTokens = 8192) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens }
    })
  });
  const data = await res.json();
  if (data.candidates && data.candidates[0]) return data.candidates[0].content.parts[0].text;
  throw new Error(`Gemini error: ${data.error ? data.error.message : 'unknown'}`);
}

function getMeta(html, file) {
  const title = (html.match(/<h1 class="article-title">([^<]+)<\/h1>/) || [])[1] || '';
  const catName = (html.match(/<span class="article-category">([^<]+)<\/span>/) || [])[1] || 'ベビー用品';
  const excerpt = (html.match(/<p class="article-excerpt">([^<]+)<\/p>/) || [])[1] || '';
  return { title, category: CATEGORY_KEYS[catName] || 'baby', catName, excerpt, slug: file.replace('.html', '') };
}

// 全記事のメタ情報（関連記事選定用）
function loadAllMeta() {
  const all = [];
  for (const file of fs.readdirSync(PRODUCTS_DIR)) {
    if (!file.endsWith('.html') || file === 'index.html') continue;
    const html = fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
    const meta = getMeta(html, file);
    if (meta.title) all.push({ ...meta, mtime: fs.statSync(path.join(PRODUCTS_DIR, file)).mtimeMs });
  }
  return all;
}

function pickRelated(allMeta, category, excludeSlug, count = 3) {
  const same = allMeta.filter(a => a.category === category && a.slug !== excludeSlug).sort((a, b) => b.mtime - a.mtime);
  const others = allMeta.filter(a => a.category !== category && a.slug !== excludeSlug).sort((a, b) => b.mtime - a.mtime);
  return [...same, ...others].slice(0, count);
}

function buildRelatedSection(related) {
  const items = related.map(a => `            <li><a href="${a.slug}">${a.title}</a></li>`).join('\n');
  return `
        <div class="related-articles" style="background:#f8f9fa;padding:24px;border-radius:12px;margin:40px 0 0;">
          <p style="font-weight:700;margin-bottom:12px;">📖 あわせて読みたい</p>
          <ul style="margin:0;padding-left:20px;line-height:2;">
${items}
          </ul>
        </div>`;
}

function buildAuthoritySection(category) {
  const links = AUTHORITY_LINKS[category] || AUTHORITY_LINKS.baby;
  const items = links.map(l => `            <li><a href="${l.url}" target="_blank" rel="noopener">${l.name}</a></li>`).join('\n');
  return `
        <div class="authority-links" style="border-left:4px solid #667eea;background:#f8f9fa;padding:16px 24px;margin:32px 0;">
          <p style="font-weight:600;margin-bottom:8px;font-size:0.95rem;">🏛️ 安全性の確認に役立つ公的情報</p>
          <ul style="margin:0;padding-left:20px;font-size:0.9rem;line-height:1.9;">
${items}
          </ul>
        </div>`;
}

// schema.orgからreview/aggregateRatingを削除 + dateModified更新
function fixSchema(html) {
  let changed = false;
  const today = new Date().toISOString().split('T')[0];
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, body) => {
    try {
      const j = JSON.parse(body);
      if (j['@type'] === 'Product' && (j.review || j.aggregateRating)) {
        delete j.review;
        delete j.aggregateRating;
        changed = true;
        return `<script type="application/ld+json">\n  ${JSON.stringify(j, null, 2)}\n  </script>`;
      }
      if (j['@type'] === 'Article' && j.dateModified !== today) {
        j.dateModified = today;
        changed = true;
        return `<script type="application/ld+json">\n  ${JSON.stringify(j, null, 2)}\n  </script>`;
      }
      return whole;
    } catch {
      return whole; // パース不能はそのまま（レポートで検出される）
    }
  });
  return { html, changed };
}

// 禁止表現を含む<p>/<li>ブロックを抽出しGeminiで書き換え
async function fixBannedExpressions(html, stats) {
  const blocks = [...html.matchAll(/<(p|li)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g)]
    .map(m => m[0])
    .filter(b => BANNED_PATTERNS.some(p => p.re.test(b.replace(/<[^>]+>/g, ''))));
  if (blocks.length === 0) return html;

  const unique = [...new Set(blocks)].slice(0, 20);
  const prompt = `子供用品レビューサイトの記事から、使用禁止表現を含む段落を抜き出しました。
各段落を以下の方針で自然に書き直してください。

【方針】
- 「愛用」「実際に使ってみた」「使ってみました」「〜ヶ月使った」「リピート」等の使用体験の主張
  → 「口コミを調べると」「店頭でチェックしたところ」「レビューを分析すると」等の調査視点に
- 「安全です」「安心です」の断言 → 「〜の基準を満たしている」「〜とされています」等の根拠ベース/伝聞に
- HTMLタグ・リンクはそのまま維持、文意と文字数もできるだけ維持

【入力】(JSON配列)
${JSON.stringify(unique)}

【出力】書き直した段落のJSON配列のみ（入力と同じ順序・同じ要素数）`;

  try {
    const result = await callGemini(prompt, 16384);
    const m = result.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('JSON配列が返らない');
    const rewritten = JSON.parse(m[0]);
    if (!Array.isArray(rewritten) || rewritten.length !== unique.length) throw new Error('要素数不一致');
    unique.forEach((orig, i) => {
      const rep = rewritten[i];
      if (typeof rep === 'string' && rep.length > orig.length * 0.4) {
        html = html.split(orig).join(rep);
      }
    });
    stats.bannedFixed = unique.length;
  } catch (e) {
    stats.bannedError = e.message;
  }
  return html;
}

// meta descriptionを110-140字に拡張
async function fixDescription(html, meta, stats) {
  const descM = html.match(/<meta name="description" content="([^"]*)"/);
  if (!descM || descM[1].length >= 80) return html;

  const bodyText = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const excerpt = bodyText.substring(bodyText.indexOf(meta.title) + meta.title.length, bodyText.indexOf(meta.title) + meta.title.length + 600);

  try {
    const result = await callGemini(`以下の記事のmeta description（検索結果に表示される説明文）を110〜140文字で書いてください。
クリックしたくなる自然な日本語で、記事の要点（商品名・誰向け・何がわかるか）を含めること。
「安全です」等の断言、煽り表現は禁止。出力は説明文のみ（引用符・改行なし）。

記事タイトル: ${meta.title}
現在の説明文: ${descM[1]}
本文冒頭: ${excerpt}`, 4096);
    const newDesc = result.trim().replace(/^["「]|["」]$/g, '').replace(/"/g, '&quot;').replace(/\n/g, '');
    if (newDesc.length >= 80 && newDesc.length <= 200) {
      html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${newDesc}$2`);
      html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${newDesc}$2`);
      html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${newDesc}$2`);
      stats.descFixed = true;
    }
  } catch (e) {
    stats.descError = e.message;
  }
  return html;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipGemini = args.includes('--skip-gemini');
  // 体験談ベース記事(パスB)には禁止表現の書き換えを適用しない
  const skipBanned = args.includes('--skip-banned');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx !== -1 ? new Set(args[onlyIdx + 1].split(',')) : null;

  const allMeta = loadAllMeta();
  const files = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .filter(f => !only || only.has(f))
    .slice(0, limit);

  const report = [];
  let processed = 0;

  for (const file of files) {
    const filePath = path.join(PRODUCTS_DIR, file);
    if (!fs.existsSync(filePath)) continue; // 処理中に移動/削除されたファイルはスキップ
    const stat = fs.statSync(filePath);
    let html = fs.readFileSync(filePath, 'utf8');
    const orig = html;
    const meta = getMeta(html, file);
    const stats = { file };

    // 1. 中間バナーCTA削除
    let removed = 0;
    for (const re of MID_CTA_PATTERNS) {
      html = html.replace(re, () => { removed++; return ''; });
    }
    stats.midCtaRemoved = removed;

    // 2. 公的機関リンク挿入（未挿入の場合、最終CTA直前）
    if (!html.includes('authority-links')) {
      const auth = buildAuthoritySection(meta.category);
      const finalCta = html.match(FINAL_CTA_RE);
      if (finalCta) {
        html = html.replace(FINAL_CTA_RE, auth + '\n        ' + finalCta[0]);
      } else {
        // ガイド記事等: article-body末尾（footer前の閉じタグ群の直前）
        html = html.replace(/(\s*<\/div>\s*<\/div>\s*<\/section>\s*(?:<!--[^>]*-->\s*)?<footer)/, auth + '$1');
      }
      stats.authority = html.includes('authority-links');
    }

    // 3. 関連記事挿入（未挿入の場合、最終CTA直後）
    if (!html.includes('related-articles')) {
      const related = pickRelated(allMeta, meta.category, meta.slug);
      if (related.length > 0) {
        const rel = buildRelatedSection(related);
        const finalCta = html.match(FINAL_CTA_RE);
        if (finalCta) {
          html = html.replace(FINAL_CTA_RE, finalCta[0] + rel);
        } else {
          html = html.replace(/(\s*<\/div>\s*<\/div>\s*<\/section>\s*(?:<!--[^>]*-->\s*)?<footer)/, rel + '$1');
        }
        stats.related = html.includes('related-articles');
      }
    }

    // 4. schema修正
    const schemaResult = fixSchema(html);
    html = schemaResult.html;
    stats.schemaFixed = schemaResult.changed;

    // 5. 禁止表現（Gemini）
    if (!skipGemini && !skipBanned) {
      html = await fixBannedExpressions(html, stats);
      if (stats.bannedFixed) await new Promise(r => setTimeout(r, 1000));
    }

    // 6. meta description（Gemini）
    if (!skipGemini) {
      html = await fixDescription(html, meta, stats);
      if (stats.descFixed) await new Promise(r => setTimeout(r, 1000));
    }

    if (html !== orig && !dryRun) {
      fs.writeFileSync(filePath, html, 'utf8');
      fs.utimesSync(filePath, stat.atime, stat.mtime); // mtime保持（並び順維持）
    }
    stats.changed = html !== orig;
    report.push(stats);
    processed++;
    if (processed % 10 === 0) console.log(`... ${processed}/${files.length}`);
  }

  // サマリー
  const sum = (k) => report.filter(r => r[k]).length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`処理: ${report.length}件${dryRun ? '（dry-run: 書き込みなし）' : ''}`);
  console.log(`中間CTA削除: ${report.reduce((a, r) => a + (r.midCtaRemoved || 0), 0)}ブロック（${sum('midCtaRemoved')}記事）`);
  console.log(`公的リンク挿入: ${sum('authority')}記事`);
  console.log(`関連記事挿入: ${sum('related')}記事`);
  console.log(`schema修正: ${sum('schemaFixed')}記事`);
  console.log(`禁止表現修正: ${sum('bannedFixed')}記事 / エラー: ${sum('bannedError')}`);
  console.log(`description拡張: ${sum('descFixed')}記事 / エラー: ${sum('descError')}`);
  const errors = report.filter(r => r.bannedError || r.descError);
  if (errors.length) {
    console.log('\n--- Geminiエラー（要再実行 or 手動対応）---');
    errors.forEach(r => console.log(`  ${r.file}: ${r.bannedError || ''} ${r.descError || ''}`));
  }
  fs.writeFileSync(path.join(__dirname, 'logs', 'retrofit-report.json'), JSON.stringify(report, null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
