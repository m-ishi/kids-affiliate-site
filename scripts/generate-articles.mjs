#!/usr/bin/env node
// ============================================================
// Kids Gear Lab — Article Generator (Draft Mode)
// 記事生成モジュール（下書き生成）
//
// OPERATIONS.mdパターン準拠:
//   1. すべての記事を下書きとして生成（drafts/ディレクトリ）
//   2. QAチェックは別モジュール（publish-articles.mjs）で実行
//   3. 合格記事のみ公開（articles/ディレクトリ）
//
// 使用方法:
//   node generate-articles.mjs                  # 5記事生成（デフォルト）
//   node generate-articles.mjs --count 3        # 3記事生成
//   node generate-articles.mjs --category baby  # ベビー用品カテゴリーのみ
//   node generate-articles.mjs --dry-run        # プレビューのみ
//   node generate-articles.mjs --topic "トピックタイトル" # 特定トピック
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TOPIC_POOL, getRandomTopics, getTopicsByCategory } from "./topics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_CONFIG_FILE = path.join(__dirname, "../site-config.json");
const HISTORY_FILE = path.join(__dirname, "history.json");
const DRAFTS_DIR = path.join(__dirname, "../drafts");
const ARTICLES_DIR = path.join(__dirname, "../articles");

// 環境変数からAPIキーを取得
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!BRAVE_API_KEY || !GEMINI_API_KEY) {
  console.error("❌ 環境変数が設定されていません");
  console.error("以下を設定してください:");
  console.error("  export BRAVE_API_KEY=\"your-key\"");
  console.error("  export GEMINI_API_KEY=\"your-key\"");
  process.exit(1);
}

const AMAZON_TAG = "kidsgoodslab-22";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const CATEGORY_NAMES = {
  toy: "おもちゃ",
  baby: "ベビー用品",
  educational: "知育玩具",
  outdoor: "外遊び",
  furniture: "家具・収納",
  safety: "安全グッズ"
};

// ============================================================
// 1. ユーティリティ関数
// ============================================================

// 遅延関数
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// リトライ付きAPI呼び出し
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const waitTime = attempt * 3000;
        console.log(`   ⚠️ レート制限 (429)。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`   ⚠️ ${error.message}。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
  return null;
}

// ============================================================
// 2. データ読み込み
// ============================================================

// サイト設定読み込み
function loadSiteConfig() {
  try {
    return JSON.parse(fs.readFileSync(SITE_CONFIG_FILE, "utf-8"));
  } catch (error) {
    console.error("❌ site-config.jsonの読み込みに失敗:", error.message);
    process.exit(1);
  }
}

// 履歴読み込み
function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch (error) {
    console.log("⚠️ history.jsonが見つからないか空です。新規作成します。");
    return { posted: [], lastUpdated: new Date().toISOString(), totalArticles: 0, byCategory: {}, recentActivity: [] };
  }
}

// 履歴保存
function saveHistory(history) {
  history.lastUpdated = new Date().toISOString();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ============================================================
// 3. Brave Search API
// ============================================================

// 商品情報検索
async function searchProduct(productName) {
  console.log(`🔍 Brave APIで検索中: ${productName}`);
  
  const queries = [
    `${productName} レビュー 口コミ`,
    `${productName} 子供 おすすめ`,
    `${productName} 安全性 評価`,
    `${productName} 比較 ベスト`
  ];
  
  const allResults = [];
  
  for (const query of queries) {
    const encodedQuery = encodeURIComponent(query);
    const url = `${BRAVE_SEARCH_URL}?q=${encodedQuery}&count=5&freshness=month`;
    
    try {
      const data = await fetchWithRetry(url, {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": BRAVE_API_KEY
        }
      });
      
      if (data && data.web && data.web.results) {
        allResults.push(...data.web.results);
      }
      
      await delay(1000); // レート制限回避
    } catch (error) {
      console.log(`   ⚠️ 検索クエリ "${query}" でエラー:`, error.message);
    }
  }
  
  // 重複除去とスコアリング
  const uniqueResults = [];
  const seenUrls = new Set();
  
  for (const result of allResults) {
    if (!result.url || seenUrls.has(result.url)) continue;
    
    seenUrls.add(result.url);
    
    // スコアリング: タイトルと商品名の一致度
    let score = 0;
    const title = result.title?.toLowerCase() || "";
    const description = result.description?.toLowerCase() || "";
    
    if (title.includes(productName.toLowerCase())) score += 3;
    if (description.includes(productName.toLowerCase())) score += 2;
    if (title.includes("レビュー") || description.includes("レビュー")) score += 2;
    if (title.includes("比較") || description.includes("比較")) score += 1;
    if (title.includes("おすすめ") || description.includes("おすすめ")) score += 1;
    
    uniqueResults.push({
      ...result,
      score
    });
  }
  
  // スコア順にソート
  uniqueResults.sort((a, b) => b.score - a.score);
  
  console.log(`   ✅ ${uniqueResults.length}件の関連情報を取得`);
  return uniqueResults.slice(0, 10); // 上位10件まで
}

// ============================================================
// 4. Gemini API
// ============================================================

// 記事生成プロンプト
function createArticlePrompt(topic, searchResults, config) {
  const categoryName = CATEGORY_NAMES[topic.category] || topic.category;
  const now = new Date();
  const currentYear = now.getFullYear();
  
  return `あなたは子供用品レビューサイト「${config.siteName}」の記事ライターです。
運営者は2児の父（2歳男の子、0歳女の子）で、東京在住、ニックネームは「パパラボ」です。

# 記事要件:
- タイトル: ${topic.title}
- カテゴリー: ${categoryName}
- 対象年齢: ${topic.targetAge}
- キーワード: ${topic.keywords?.join(", ")}
- 視点: ${topic.angle}
- 商品焦点: ${topic.productFocus}
- 季節性: ${topic.seasonal ? "あり" : "なし"}
- 比較記事: ${topic.comparison ? "あり" : "なし"}

# 検索結果（参考情報）:
${searchResults.slice(0, 5).map((r, i) => `
${i + 1}. ${r.title}
    URL: ${r.url}
    ${r.description ? `概要: ${r.description.substring(0, 200)}...` : ""}
`).join("\n")}

# 執筆ガイドライン:
1. **パパ目線**: 父親としての実用的な視点を重視
2. **安全性第一**: 年齢に合った安全性を最優先
3. **実体験ベース**: 可能な限り実際の使用感に基づく
4. **比較検討**: 類似商品との比較を客観的に
5. **データ重視**: 検索結果の情報を適切に引用
6. **親しみやすさ**: 専門的すぎず、親しみやすい語り口
7. **具体的なアドバイス**: 実際の購入・使用に役立つ情報

# 記事構成:
1. 導入（問題提起・読者の悩みに共感）
2. 商品概要・比較表（HTML table形式）
3. 各商品の詳細レビュー（メリット・デメリット）
4. 安全性・耐久性の検証
5. 年齢別おすすめ度
6. 実際の使用シーンでの評価
7. 総合評価・選び方のポイント
8. よくある質問（FAQ）
9. まとめ・最終アドバイス

# フォーマット要件:
- 見出し: h2, h3を適切に使用
- 比較表: HTML table形式（商品名、価格帯、対象年齢、安全性、総合評価）
- アフィリエイトリンク: Amazon商品リンク（タグ: ${AMAZON_TAG}）
- 文字数: 2,000字以上
- 画像配置指示: [画像: 説明] 形式で挿入箇所を指定

# アフィリエイト開示:
記事の最後に以下の開示文を追加:
「当サイトはアマゾンアソシエイト・プログラムの参加者です。適格販売により収入を得ています。」

# 出力形式:
完全なHTML記事を出力してください。説明文やメタデータは含めないでください。`;
}

// Gemini API呼び出し
async function callGemini(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const waitTime = attempt * 3000;
          console.log(`   ⚠️ レート制限 (429)。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
          await delay(waitTime);
          continue;
        }
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      if (attempt < maxRetries) {
        const waitTime = attempt * 2000;
        console.log(`   ⚠️ ${error.message}。${waitTime / 1000}秒後にリトライ... (${attempt}/${maxRetries})`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
  return null;
}

// ============================================================
// 5. 記事生成メイン関数
// ============================================================

async function generateArticle(topic, config, dryRun = false) {
  console.log(`\n📝 記事生成開始: ${topic.title}`);
  console.log(`   カテゴリー: ${CATEGORY_NAMES[topic.category]}, 対象年齢: ${topic.targetAge}`);
  
  try {
    // 1. 商品情報検索
    console.log("   🔍 商品情報を検索中...");
    const searchResults = await searchProduct(topic.productFocus || topic.title);
    
    if (searchResults.length === 0) {
      console.log("   ⚠️ 十分な検索結果が得られませんでした");
      return null;
    }
    
    // 2. 記事生成プロンプト作成
    console.log("   🤖 記事を生成中...");
    const prompt = createArticlePrompt(topic, searchResults, config);
    
    // 3. Gemini API呼び出し
    const articleHtml = await callGemini(prompt);
    
    if (!articleHtml) {
      console.log("   ❌ 記事生成に失敗しました");
      return null;
    }
    
    // 4. メタデータ作成
    const now = new Date();
    const articleId = `article_${now.getTime()}_${Math.random().toString(36).substr(2, 9)}`;
    const filename = `${articleId}.html`;
    const draftPath = path.join(DRAFTS_DIR, filename);
    
    const metadata = {
      id: articleId,
      title: topic.title,
      category: topic.category,
      targetAge: topic.targetAge,
      keywords: topic.keywords || [],
      generatedAt: now.toISOString(),
      status: "draft",
      topic: topic,
      searchResults: searchResults.slice(0, 3).map(r => ({
        title: r.title,
        url: r.url,
        score: r.score
      }))
    };
    
    // 5. 完全なHTMLドキュメント作成
    const fullHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${topic.title} | ${config.siteName}</title>
    <meta name="description" content="${topic.title} - ${config.siteDescription}">
    <meta name="keywords" content="${topic.keywords?.join(", ")}">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 30px; }
        h3 { color: #555; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; }
        .rating { color: #FF9800; font-weight: bold; }
        .warning { background-color: #FFF3CD; border: 1px solid #FFEEBA; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .disclosure { background-color: #E8F5E9; border: 1px solid #C8E6C9; padding: 15px; border-radius: 5px; margin: 20px 0; font-size: 0.9em; }
        .metadata { font-size: 0.8em; color: #666; margin-bottom: 30px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="metadata">
        <strong>生成日時:</strong> ${now.toLocaleDateString("ja-JP")} ${now.toLocaleTimeString("ja-JP")}<br>
        <strong>カテゴリー:</strong> ${CATEGORY_NAMES[topic.category]}<br>
        <strong>対象年齢:</strong> ${topic.targetAge}<br>
        <strong>ステータス:</strong> 下書き（QAチェック待ち）
    </div>
    
    <h1>${topic.title}</h1>
    
    ${articleHtml}
    
    <div class="disclosure">
        <strong>📢 アフィリエイト開示</strong><br>
        当サイトはアマゾンアソシエイト・プログラムの参加者です。適格販売により収入を得ています。
        商品リンクをクリックして購入いただくと、当サイトに紹介料が発生することがあります。
        これはサイト運営のための貴重な収入源であり、質の高いコンテンツ作成の原動力となっています。
    </div>
    
    <!-- メタデータ（非表示） -->
    <div style    <!-- メタデータ（非表示） -->
    <div style="display: none;" id="article-metadata">
        ${JSON.stringify(metadata)}
    </div>
    
    <script>
        // メタデータアクセス用
        window.articleMetadata = ${JSON.stringify(metadata)};
    </script>
</body>
</html>`;
    
    if (dryRun) {
      console.log(`   📋 プレビュー（${articleHtml.length}文字）:`);
      console.log("   ".repeat(20) + "=".repeat(40));
      console.log(articleHtml.substring(0, 500) + "...");
      console.log("   ".repeat(20) + "=".repeat(40));
      return metadata;
    }
    
    // 6. 下書きディレクトリ作成
    if (!fs.existsSync(DRAFTS_DIR)) {
      fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    }
    
    // 7. 下書きファイル保存
    fs.writeFileSync(draftPath, fullHtml);
    console.log(`   💾 下書きを保存: ${draftPath}`);
    
    // 8. 履歴更新（下書きとして記録）
    const history = loadHistory();
    history.recentActivity.unshift({
      action: "draft_created",
      articleId: articleId,
      title: topic.title,
      timestamp: now.toISOString()
    });
    
    // 最近の活動は最大50件まで保持
    if (history.recentActivity.length > 50) {
      history.recentActivity = history.recentActivity.slice(0, 50);
    }
    
    saveHistory(history);
    
    // 9. 通知（後で実装）
    // await sendNotification({
    //   team: "B",
    //   emoji: "📝",
    //   title: "下書き生成完了",
    //   details: `${topic.title}`,
    //   status: "下書き保存済み"
    // });
    
    return {
      metadata,
      draftPath,
      html: fullHtml
    };
    
  } catch (error) {
    console.error(`   ❌ 記事生成エラー:`, error.message);
    
    // エラー通知（後で実装）
    // await sendNotification({
    //   team: "B",
    //   emoji: "❌",
    //   title: "記事生成エラー",
    //   details: `${topic.title}: ${error.message}`,
    //   status: "エラー"
    // });
    
    return null;
  }
}

// ============================================================
// 6. バッチ生成関数
// ============================================================

async function generateArticlesBatch(count = 5, category = null, dryRun = false) {
  console.log("=".repeat(60));
  console.log("🧸 Kids Gear Lab — 記事バッチ生成");
  console.log("=".repeat(60));
  
  // データ読み込み
  const config = loadSiteConfig();
  const history = loadHistory();
  
  // 使用済みトピックを取得
  const usedTitles = new Set(history.posted || []);
  
  // トピック選択
  let availableTopics;
  if (category) {
    availableTopics = getTopicsByCategory(category);
  } else {
    availableTopics = TOPIC_POOL;
  }
  
  // 未使用トピックのみ
  const unusedTopics = availableTopics.filter(t => !usedTitles.has(t.title));
  
  if (unusedTopics.length === 0) {
    console.log("⚠️ 未使用のトピックがありません。generate-topics.mjsで新しいトピックを生成してください。");
    return [];
  }
  
  // 指定数までランダム選択
  const selectedTopics = [...unusedTopics]
    .sort(() => 0.5 - Math.random())
    .slice(0, Math.min(count, unusedTopics.length));
  
  console.log(`📊 トピック状況: ${unusedTopics.length}未使用 / ${availableTopics.length}総数`);
  console.log(`🎯 ${selectedTopics.length}記事を生成します`);
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  // 記事生成ループ
  for (let i = 0; i < selectedTopics.length; i++) {
    const topic = selectedTopics[i];
    console.log(`\n📄 [${i + 1}/${selectedTopics.length}]`);
    
    const result = await generateArticle(topic, config, dryRun);
    
    if (result) {
      successCount++;
      results.push(result);
      
      // レート制限回避のための遅延（ドライラン時は短く）
      if (!dryRun && i < selectedTopics.length - 1) {
        const delayTime = 3000 + Math.random() * 2000; // 3-5秒
        console.log(`   ⏳ ${Math.round(delayTime / 1000)}秒待機中...`);
        await delay(delayTime);
      }
    } else {
      errorCount++;
    }
  }
  
  // 結果サマリー
  console.log("\n" + "=".repeat(60));
  console.log("📊 生成結果サマリー");
  console.log("=".repeat(60));
  console.log(`✅ 成功: ${successCount}記事`);
  console.log(`❌ 失敗: ${errorCount}記事`);
  console.log(`📁 下書き保存先: ${DRAFTS_DIR}`);
  
  if (!dryRun && successCount > 0) {
    console.log(`\n🔍 次のステップ:`);
    console.log(`   1. QAチェック: node publish-articles.mjs --check`);
    console.log(`   2. 公開: node publish-articles.mjs --publish`);
    console.log(`   3. 下書き確認: ls -la ${DRAFTS_DIR}`);
  }
  
  // バッチ通知（後で実装）
  // if (!dryRun && successCount > 0) {
  //   await sendNotification({
  //     team: "B",
  //     emoji: "🎉",
  //     title: "バッチ生成完了",
  //     details: `${successCount}記事の下書きを生成しました`,
  //     status: "成功"
  //   });
  // }
  
  return results;
}

// ============================================================
// 7. 特定トピック生成関数
// ============================================================

async function generateSpecificArticle(topicTitle, dryRun = false) {
  console.log("=".repeat(60));
  console.log("🎯 特定トピック記事生成");
  console.log("=".repeat(60));
  
  const config = loadSiteConfig();
  
  // トピック検索
  const topic = TOPIC_POOL.find(t => t.title === topicTitle);
  
  if (!topic) {
    console.log(`❌ トピックが見つかりません: "${topicTitle}"`);
    console.log(`   利用可能なトピック:`);
    TOPIC_POOL.slice(0, 10).forEach(t => console.log(`   - ${t.title}`));
    if (TOPIC_POOL.length > 10) console.log(`   ...他${TOPIC_POOL.length - 10}件`);
    return null;
  }
  
  console.log(`🎯 トピック: ${topic.title}`);
  console.log(`   📂 カテゴリー: ${CATEGORY_NAMES[topic.category]}`);
  console.log(`   👶 対象年齢: ${topic.targetAge}`);
  
  const result = await generateArticle(topic, config, dryRun);
  
  if (result && !dryRun) {
    console.log(`\n✅ 記事を生成しました: ${result.draftPath}`);
  }
  
  return result;
}

// ============================================================
// 8. メインCLI関数
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  
  // 引数パース
  let count = 5;
  let category = null;
  let dryRun = false;
  let specificTopic = null;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "-d") {
      dryRun = true;
    } else if (arg === "--category" || arg === "-cat") {
      if (i + 1 < args.length) {
        category = args[i + 1];
        i++;
      }
    } else if (arg === "--count" || arg === "-c") {
      if (i + 1 < args.length && !isNaN(parseInt(args[i + 1]))) {
        count = parseInt(args[i + 1]);
        i++;
      }
    } else if (arg === "--topic" || arg === "-t") {
      if (i + 1 < args.length) {
        specificTopic = args[i + 1];
        i++;
      }
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      return;
    } else if (!arg.startsWith("-")) {
      // 位置引数としてトピックタイトルと解釈
      specificTopic = arg;
    }
  }
  
  if (dryRun) {
    console.log("⚠️ ドライランモード: ファイルは保存されません");
  }
  
  if (specificTopic) {
    // 特定トピック生成
    await generateSpecificArticle(specificTopic, dryRun);
  } else {
    // バッチ生成
    await generateArticlesBatch(count, category, dryRun);
  }
}

// ============================================================
// 9. ヘルプ表示
// ============================================================

function showHelp() {
  console.log(`
Kids Gear Lab — 記事生成システム（下書きモード）
================================================

使用方法:
  node generate-articles.mjs [オプション]

オプション:
  --dry-run, -d         プレビューのみ、ファイル保存なし
  --category, -cat CAT  特定カテゴリーのみ生成
  --count, -c N         生成記事数（デフォルト: 5）
  --topic, -t TITLE     特定トピックを生成
  --help, -h            このヘルプを表示

カテゴリー:
  toy, baby, educational, outdoor, furniture, safety

例:
  node generate-articles.mjs                    # 5記事生成
  node generate-articles.mjs --dry-run          # プレビューのみ
  node generate-articles.mjs --count 3          # 3記事生成
  node generate-articles.mjs --category baby    # ベビー用品のみ
  node generate-articles.mjs "トピックタイトル"  # 特定トピック
  node generate-articles.mjs --topic "【パパ目線比較】..."

動作:
  1. 未使用トピックを選択
  2. Brave APIで商品情報を検索
  3. Gemini APIで記事を生成
  4. 下書きHTMLとして保存（drafts/ディレクトリ）
  5. 履歴を更新

注意:
  - BRAVE_API_KEY, GEMINI_API_KEY環境変数が必要
  - レート制限に注意（遅延処理あり）
  - 生成された下書きはQAチェックが必要
  - 公開はpublish-articles.mjsで実行

ワークフロー:
  生成 → QAチェック → 公開 → デプロイ
  `);
}

// ============================================================
// 10. エントリーポイント
// ============================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("❌ 致命的なエラー:", error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

// ============================================================
// 11. エクスポート
// ============================================================

export {
  generateArticle,
  generateArticlesBatch,
  generateSpecificArticle,
  searchProduct,
  createArticlePrompt
};