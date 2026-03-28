#!/usr/bin/env node
/**
 * NOTE記事に実体験フックを自動生成・挿入するスクリプト
 * Gemini 2.0 Flash APIを使って、各商品に合った「2児パパの実体験フック」を生成
 */
import { readFileSync, writeFileSync } from 'fs';

const GEMINI_API_KEY = 'AIzaSyCFZWgF0U0sqDKKUhvidC-6uYb4yGmCjFY';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const ARTICLES = [
  { slug: 'bornelund-magformers-62', category: '知育玩具', product: 'マグフォーマー62ピース', childRelevance: '2歳の息子が図形に興味を持ち始めた' },
  { slug: 'strider-14x', category: '外遊び', product: 'ストライダー14x', childRelevance: '2歳の息子が公園で他の子のストライダーに興味津々' },
  { slug: 'strider-sport-model', category: '外遊び', product: 'ストライダー スポーツモデル', childRelevance: '2歳の息子にそろそろバランスバイクを検討中' },
  { slug: 'lego-duplo-kazuasobi-train', category: '知育玩具', product: 'レゴ デュプロ かずあそびトレイン', childRelevance: '2歳の息子が数字に興味を示し始めた' },
  { slug: 'kumon-new', category: '知育玩具', product: 'くもんスタディ将棋', childRelevance: '将棋が子供の論理的思考力を育てると聞いた' },
  { slug: 'mell-chan-', category: 'おもちゃ', product: 'メルちゃん入門セット', childRelevance: '0歳の娘がもう少し大きくなったら人形遊びを' },
  { slug: 'plarail-', category: 'おもちゃ', product: 'プラレール トーマスセット', childRelevance: '2歳の息子が電車に夢中' },
  { slug: 'anpanman-block-lab-town', category: '知育玩具', product: 'アンパンマン ブロックラボ', childRelevance: '2歳の息子がアンパンマン大好き' },
  { slug: 'skip-hop-', category: 'ベビー用品', product: 'スキップホップ ベビーバス', childRelevance: '0歳の娘のお風呂グッズを検討中' },
  { slug: 'shnuggle-', category: 'ベビー用品', product: 'シュナグル ベビーバス', childRelevance: '0歳の娘のワンオペ入浴に苦戦中' },
  { slug: 'nihon-ikuji-smartgate2-where-to-buy', category: '安全グッズ', product: 'スマートゲイト2', childRelevance: '2歳の息子がキッチンに侵入してきて危険' },
  { slug: 'richell-fuwafuwa-baby-bath', category: 'ベビー用品', product: 'リッチェル ふかふかベビーバス', childRelevance: '0歳の娘の沐浴が大変で楽なベビーバスを探している' },
  { slug: 'fisher-price-ii', category: 'ベビー用品', product: 'レインフォレストジムII', childRelevance: '0歳の娘が一人遊びできるグッズが欲しい' },
];

async function generateHook(article) {
  const prompt = `あなたは「パパラボ」という2児のパパ（2歳男の子・0歳女の子、東京在住）です。
以下の商品レビュー記事の冒頭に入れる「実体験フック」を1段落（100〜150文字）で書いてください。

商品: ${article.product}
カテゴリ: ${article.category}
きっかけ: ${article.childRelevance}

ルール:
- 嘘はつかない。「買った」「使った」とは書かない
- 「気になって調べた」「店頭で見た」「友人に聞いた」「子供の様子を見て」など、自然な導入
- 具体的な子供の行動や日常シーンを1つ入れる（例：公園で、お風呂で、リビングで）
- 口語体で親しみやすく
- 最後は「そこで徹底的に口コミを調べてみました」的な流れで締める

実体験フックだけを出力してください。余計な説明は不要です。`;

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 300 }
      })
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  } catch (e) {
    console.error(`  ❌ Gemini API error for ${article.slug}: ${e.message}`);
    return null;
  }
}

function insertHook(noteText, hook) {
  // 「---」の後の最初の「## 」の直前にフックを挿入
  const parts = noteText.split('\n---\n');
  if (parts.length < 2) return noteText;

  // 2番目のパート（本文）の先頭にフックを挿入
  const body = parts.slice(1).join('\n---\n');
  const hookSection = `\n> ${hook}\n`;

  return parts[0] + '\n---\n' + hookSection + body;
}

// メイン処理
async function main() {
  console.log('🚀 実体験フック生成開始...\n');

  for (const article of ARTICLES) {
    const filePath = `/Users/masa/kids-affiliate-site/note-export/${article.slug}.txt`;
    console.log(`📝 ${article.product}...`);

    try {
      const noteText = readFileSync(filePath, 'utf-8');

      // 既にフックが入っていたらスキップ
      if (noteText.includes('> ')) {
        console.log(`  ⏭ フック挿入済み、スキップ`);
        continue;
      }

      const hook = await generateHook(article);
      if (!hook) continue;

      console.log(`  ✅ フック: ${hook.substring(0, 60)}...`);

      const updated = insertHook(noteText, hook);
      writeFileSync(filePath, updated, 'utf-8');
      console.log(`  💾 保存完了 (${updated.length}文字)`);

      // レート制限対策
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  ❌ ${article.slug}: ${e.message}`);
    }
  }

  console.log('\n✨ 全記事完了！');
}

main();
