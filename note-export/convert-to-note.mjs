#!/usr/bin/env node
/**
 * キッズグッズラボ HTML → NOTE用テキスト変換スクリプト
 */
import { readFileSync, writeFileSync } from 'fs';

const ARTICLES = [
  'bornelund-magformers-62',
  'strider-14x',
  'strider-sport-model',
  'lego-duplo-kazuasobi-train',
  'kumon-new',
  'mell-chan-',
  'plarail-',
  'anpanman-block-lab-town',
  'skip-hop-',
  'shnuggle-',
  'nihon-ikuji-smartgate2-where-to-buy',
  'richell-fuwafuwa-baby-bath',
  'fisher-price-ii',
];

const PROFILE_INTRO = `パパラボ｜2児のパパ（2歳男の子・0歳女の子）です。
子育てグッズを買う前に口コミを徹底的に調べるのが趣味。
調べた結果を共有することで、忙しいパパママの商品選びの参考になれば嬉しいです。`;

const SITE_FOOTER = `---
この記事が参考になったら「スキ」お願いします！
他の子育てグッズレビューはこちら → https://kidsgoodslab.com
質問・リクエストはコメント欄からお気軽にどうぞ！`;

function htmlToNoteText(html) {
  // Amazonリンク抽出（変換前に）
  const allAmazonLinks = [];
  const amazonRegex = /href="(https:\/\/www\.amazon\.co\.jp\/dp\/[^"?]*\?tag=kidsgoodslab-22)"/gi;
  let match;
  while ((match = amazonRegex.exec(html)) !== null) {
    if (!allAmazonLinks.includes(match[1])) {
      allAmazonLinks.push(match[1]);
    }
  }

  // h1タイトル抽出
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : 'タイトル未取得';

  // article-bodyの中身を抽出（最初の<h2>から最後の</p>または</ol>または</ul>まで）
  const firstH2 = html.indexOf('<h2');
  const lastFooter = html.indexOf('<footer');
  if (firstH2 === -1) return { title, description: '', noteText: '' };

  let body = html.substring(firstH2, lastFooter > 0 ? lastFooter : undefined);

  // CTA/affiliateボックス除去（style付きdivブロック）
  body = body.replace(/<div\s+style="background[^"]*"[^>]*>[\s\S]*?(?:<\/div>\s*){1,3}/gi, '');

  // imgタグ除去
  body = body.replace(/<img[^>]*>/gi, '');

  // H2 → NOTE見出し
  body = body.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => '\n\n## ' + c.replace(/<[^>]+>/g, '').trim() + '\n');

  // H3
  body = body.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => '\n\n### ' + c.replace(/<[^>]+>/g, '').trim() + '\n');

  // bold
  body = body.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**');
  body = body.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');

  // リスト項目
  body = body.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => '・' + c.replace(/<[^>]+>/g, '').trim() + '\n');
  body = body.replace(/<\/?[ou]l[^>]*>/gi, '\n');

  // aタグ → テキストのみ
  body = body.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // 残りのHTMLタグ除去
  body = body.replace(/<[^>]+>/g, '');

  // HTMLエンティティ
  body = body.replace(/&amp;/g, '&');
  body = body.replace(/&lt;/g, '<');
  body = body.replace(/&gt;/g, '>');
  body = body.replace(/&quot;/g, '"');
  body = body.replace(/&#8217;/g, "'");
  body = body.replace(/&#8216;/g, "'");
  body = body.replace(/&#038;/g, '&');
  body = body.replace(/&nbsp;/g, ' ');

  // 空白整理
  body = body.replace(/\n{3,}/g, '\n\n');
  body = body.trim();

  // Amazon購入リンク
  let amazonSection = '';
  if (allAmazonLinks.length > 0) {
    amazonSection = '\n\n---\n## 購入はこちら\n';
    amazonSection += allAmazonLinks.map(url => `▶ Amazon → ${url}`).join('\n');
  }

  const noteText = `${title}

${PROFILE_INTRO}

---

${body}
${amazonSection}

${SITE_FOOTER}
`;

  return { title, noteText, charCount: noteText.length };
}

// メイン
const results = [];
for (const slug of ARTICLES) {
  const filePath = `/Users/masa/kids-affiliate-site/products/${slug}.html`;
  try {
    const html = readFileSync(filePath, 'utf-8');
    const { title, noteText, charCount } = htmlToNoteText(html);
    writeFileSync(`/Users/masa/kids-affiliate-site/note-export/${slug}.txt`, noteText, 'utf-8');
    results.push({ slug, title, charCount, status: 'OK' });
    console.log(`✅ ${slug} → ${charCount}文字 | ${title}`);
  } catch (e) {
    results.push({ slug, title: 'ERROR', charCount: 0, status: e.message });
    console.log(`❌ ${slug}: ${e.message}`);
  }
}

console.log(`\n--- 変換完了: ${results.filter(r => r.status === 'OK').length}/${ARTICLES.length} 記事 ---`);
writeFileSync('/Users/masa/kids-affiliate-site/note-export/conversion-log.json', JSON.stringify(results, null, 2));
