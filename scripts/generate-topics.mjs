#!/usr/bin/env node
// ============================================================
// Kids Gear Lab — Topic Auto-Generator
// 子供用品向け記事トピック自動生成
//
// 生成基準:
//   1. 未カバー商品（Amazonランキング、新商品）
//   2. 季節テーマ（現在の月、イベント）
//   3. 既存記事の更新・リフレッシュ角度
//   4. 比較記事・まとめ記事の組み合わせ
//   5. 年齢別・用途別カテゴリー
//
// 使用方法:
//   node generate-topics.mjs                  # トピック生成＆追加
//   node generate-topics.mjs --dry-run        # プレビューのみ、書き込みなし
//   node generate-topics.mjs --count 20       # 20トピック生成（デフォルト: 30）
//   node generate-topics.mjs --refresh        # 古い記事の更新トピックも生成
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_CONFIG_FILE = path.join(__dirname, "../site-config.json");
const TOPICS_FILE = path.join(__dirname, "topics.mjs");
const HISTORY_FILE = path.join(__dirname, "history.json");

// 環境変数からAPIキーを取得
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEYが設定されていません");
  console.error("   export GEMINI_API_KEY=\"your-key\"");
  process.exit(1);
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// 遅延関数
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 1. サイト設定読み込み
// ============================================================
function loadSiteConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(SITE_CONFIG_FILE, "utf-8"));
    return config;
  } catch (error) {
    console.error("❌ site-config.jsonの読み込みに失敗:", error.message);
    process.exit(1);
  }
}

// ============================================================
// 2. トピックプール読み込み
// ============================================================
async function loadTopicPool() {
  try {
    const { TOPIC_POOL } = await import(TOPICS_FILE);
    return TOPIC_POOL || [];
  } catch (error) {
    console.log("⚠️ topics.mjsが見つからないか空です。新規作成します。");
    return [];
  }
}

// ============================================================
// 3. 履歴読み込み（重複防止）
// ============================================================
function loadHistory() {
  try {
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    return new Set(history.posted || []);
  } catch (error) {
    console.log("⚠️ history.jsonが見つからないか空です。新規作成します。");
    return new Set();
  }
}

// ============================================================
// 4. Gemini API呼び出し
// ============================================================
async function callGemini(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 4096,
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
// 5. 季節テーマの生成
// ============================================================
function getSeasonalThemes() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const themes = [];

  // 月別テーマ
  const monthlyThemes = {
    1: ["お正月遊び", "冬の室内遊び", "寒さ対策グッズ", "新年の知育玩具"],
    2: ["バレンタイン", "節分グッズ", "冬の終わり遊び", "花粉症対策子供用品"],
    3: ["ひな祭り", "入園・入学準備", "春の外遊び", "お花見グッズ"],
    4: ["新学期準備", "春のピクニック", "新学期ストレス対策", "春の運動遊び"],
    5: ["こどもの日", "ゴールデンウィーク", "初夏の遊び", "母の日ギフト"],
    6: ["梅雨対策", "父の日ギフト", "雨の日遊び", "夏休み準備"],
    7: ["夏休み", "海水浴グッズ", "夏祭り", "熱中症対策"],
    8: ["夏休み後半", "夏のキャンプ", "自由研究", "夏バテ対策"],
    9: ["防災の日", "新学期", "秋の運動会", "読書の秋"],
    10: ["ハロウィン", "運動会", "秋の遠足", "食欲の秋"],
    11: ["七五三", "文化の日", "秋の紅葉遊び", "クリスマス準備"],
    12: ["クリスマス", "冬休み", "大掃除子供参加", "年越し準備"],
  };

  themes.push(...(monthlyThemes[month] || []));

  // 年齢別テーマ
  const ageThemes = [
    "0-1歳向け", "1-2歳向け", "3-5歳向け", "6-8歳向け", "9-12歳向け",
    "新生児", "乳児", "幼児", "小学生", "中学生以上"
  ];

  // カテゴリー別テーマ
  const categoryThemes = [
    "知育玩具比較", "おもちゃ耐久性レビュー", "ベビー用品実用性", 
    "外遊びグッズ安全性", "収納家具実用性", "安全グッズ効果検証"
  ];

  return [...themes, ...ageThemes, ...categoryThemes];
}

// ============================================================
// 6. トピック生成プロンプト
// ============================================================
function createTopicPrompt(config, existingTopics, seasonalThemes, count) {
  const categories = config.categories.map(c => `${c.name} (${c.id})`).join(", ");
  
  return `あなたは子供用品レビューサイト「${config.siteName}」のコンテンツプランナーです。
サイト運営者は2児の父（2歳男の子、0歳女の子）で、東京在住、ニックネームは「パパラボ」です。

# サイト情報
- サイト名: ${config.siteName} (${config.siteNameEn})
- URL: ${config.siteUrl}
- 説明: ${config.siteDescription}
- カテゴリー: ${categories}
- ターゲット: 子育て中の親、特に父親目線での実用的なレビュー

# 既存トピック例（重複防止）:
${existingTopics.slice(0, 10).map(t => `- ${t.title}`).join("\n")}

# 季節テーマ（現在 ${new Date().getMonth() + 1}月）:
${seasonalThemes.slice(0, 10).join(", ")}

# 生成要件:
${count}個の記事トピックを生成してください。各トピックは以下の形式で出力:

## トピック形式
{
  "title": "記事タイトル（日本語、具体的で魅力的）",
  "category": "カテゴリーID（toy, baby, educational, outdoor, furniture, safetyのいずれか）",
  "targetAge": "対象年齢（例: \"1-3歳\", \"3-6歳\", \"全年齢\"）",
  "keywords": ["キーワード1", "キーワード2", "キーワード3"],
  "angle": "記事の切り口・視点（例: \"パパ目線での実用性比較\", \"安全性重視の選び方\"）",
  "productFocus": "主な商品カテゴリー（例: \"知育ブロック\", \"抱っこ紐\", \"三輪車\"）",
  "seasonal": "季節関連か（true/false）",
  "comparison": "比較記事か（true/false）"
}

# 注意点:
1. パパ目線（父親目線）での実用的なレビューを強調
2. 安全性、耐久性、実用性を重視
3. 年齢に合った適切な推薦
4. 季節性のあるコンテンツを適宜含める
5. 比較記事と単品レビューをバランスよく
6. 既存トピックとの重複を避ける
7. 具体的な商品名ではなく商品カテゴリーを指定

# 出力形式:
JSON配列のみを出力してください。説明文は含めないでください。`;
}

// ============================================================
// 7. トピック生成メイン関数
// ============================================================
async function generateTopics(count = 30, dryRun = false, refresh = false) {
  console.log("🧠 Kids Gear Lab トピック生成を開始...");
  
  // データ読み込み
  const config = loadSiteConfig();
  const existingTopics = await loadTopicPool();
  const history = loadHistory();
  const seasonalThemes = getSeasonalThemes();
  
  console.log(`📊 現在のトピック数: ${existingTopics.length}`);
  console.log(`📅 季節テーマ: ${seasonalThemes.slice(0, 5).join(", ")}...`);
  
  // 既存トピックのタイトルを取得（重複防止）
  const existingTitles = new Set(existingTopics.map(t => t.title));
  
  // プロンプト作成
  const prompt = createTopicPrompt(config, existingTopics, seasonalThemes, count);
  
  console.log("🤖 Gemini APIでトピック生成中...");
  
  try {
    const response = await callGemini(prompt);
    
    if (!response) {
      console.error("❌ Gemini APIからの応答がありません");
      return [];
    }
    
    // JSONパース
    let newTopics;
    try {
      // JSON部分を抽出
      const jsonMatch = response.match(/\[\s*\{.*\}\s*\]/s);
      if (jsonMatch) {
        newTopics = JSON.parse(jsonMatch[0]);
      } else {
        newTopics = JSON.parse(response);
      }
    } catch (parseError) {
      console.error("❌ JSONパースエラー:", parseError.message);
      console.log("📝 生の応答:", response.substring(0, 500) + "...");
      return [];
    }
    
    // バリデーションとフィルタリング
    const validTopics = newTopics.filter(topic => {
      if (!topic.title || !topic.category) return false;
      if (existingTitles.has(topic.title)) return false;
      if (history.has(topic.title)) return false;
      
      // カテゴリー検証
      const validCategories = ["toy", "baby", "educational", "outdoor", "furniture", "safety"];
      if (!validCategories.includes(topic.category)) return false;
      
      return true;
    });
    
    console.log(`✅ ${validTopics.length}個の有効なトピックを生成`);
    
    if (dryRun) {
      console.log("\n📋 生成トピック（プレビュー）:");
      validTopics.forEach((topic, i) => {
        console.log(`${i + 1}. ${topic.title} [${topic.category}]`);
        console.log(`   対象年齢: ${topic.targetAge}, キーワード: ${topic.keywords?.join(", ")}`);
      });
      return validTopics;
    }
    
    // トピックプールに追加
    const updatedTopics = [...existingTopics, ...validTopics];
    
    // topics.mjsを更新
    const topicsContent = `// ============================================================
// Kids Gear Lab — Topic Pool (Auto-generated)
// 自動生成された記事トピックプール
// 最終更新: ${new Date().toISOString()}
// ============================================================

export const TOPIC_POOL = ${JSON.stringify(updatedTopics, null, 2)};

// カテゴリー別フィルタリング関数
export function getTopicsByCategory(category) {
  return TOPIC_POOL.filter(t => t.category === category);
}

// 未使用トピック取得関数
export function getUnusedTopics(usedTitles) {
  const usedSet = new Set(usedTitles);
  return TOPIC_POOL.filter(t => !usedSet.has(t.title));
}
`;
    
    fs.writeFileSync(TOPICS_FILE, topicsContent);
    console.log(`💾 topics.mjsを更新: ${updatedTopics.length}トピック`);
    
    // 通知（後で実装）
    // await sendNotification({
    //   team: "B",
    //   emoji: "🧠",
    //   title: "トピック生成完了",
    //   details: `${validTopics.length}個の新しいトピックを生成しました`,
    //   status: "成功"
    // });
    
    return validTopics;
    
  } catch (error) {
    console.error("❌ トピック生成エラー:", error.message);
    
    // エラー通知（後で実装）
    // await sendNotification({
    //   team: "B",
    //   emoji: "❌",
    //   title: "トピック生成エラー",
    //   details: error.message,
    //   status: "エラー"
    // });
    
    return [];
  }
}

// ============================================================
// 8. リフレッシュトピック生成（古い記事の更新用）
// ============================================================
async function generateRefreshTopics(existingTopics, count = 10) {
  console.log("🔄 リフレッシュトピック生成を開始...");
  
  // 古いトピックを選ぶ（ランダムに10個）
  const oldTopics = [...existingTopics]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(10, existingTopics.length));
  
  if (oldTopics.length === 0) {
    console.log("⚠️ リフレッシュ対象の古いトピックがありません");
    return [];
  }
  
  const prompt = `あなたは子供用品レビューサイトのコンテンツプランナーです。
以下の既存記事トピックを「2026年版」や「最新情報アップデート」としてリフレッシュする新しいトピックを生成してください。

# 既存トピック:
${oldTopics.map(t => `- ${t.title} (カテゴリー: ${t.category})`).join("\n")}

# リフレッシュ角度:
1. 「2026年最新版」として情報更新
2. 新型・改良版商品の追加比較
3. ユーザーレビューや口コミの最新情報反映
4. 価格変動や在庫状況の更新
5. 安全性や規制の変更反映
6. 代替商品や競合商品の追加比較

# 出力形式:
上記の既存トピックに対応するリフレッシュトピックをJSON配列で出力してください。
各トピックは元のタイトルに「2026年版」や「最新比較」などを追加し、refresh: true を含めてください。`;
  
  try {
    const response = await callGemini(prompt);
    const jsonMatch = response.match(/\[\s*\{.*\}\s*\]/s);
    const refreshTopics = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    
    console.log(`✅ ${refreshTopics.length}個のリフレッシュトピックを生成`);
    return refreshTopics;
    
  } catch (error) {
    console.error("❌ リフレッシュトピック生成エラー:", error.message);
    return [];
  }
}

// ============================================================
// 9. メインCLI関数
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  
  // 引数パース
  let count = 30;
  let dryRun = false;
  let refresh = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "-d") {
      dryRun = true;
    } else if (arg === "--refresh" || arg === "-r") {
      refresh = true;
    } else if (arg === "--count" || arg === "-c") {
      if (i + 1 < args.length && !isNaN(parseInt(args[i + 1]))) {
        count = parseInt(args[i + 1]);
        i++;
      }
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      return;
    }
  }
  
  console.log("=".repeat(60));
  console.log("🧸 Kids Gear Lab — トピック自動生成システム");
  console.log("=".repeat(60));
  
  // 既存トピック読み込み
  const existingTopics = await loadTopicPool();
  
  // 通常トピック生成
  const newTopics = await generateTopics(count, dryRun, refresh);
  
  // リフレッシュトピック生成（オプション）
  let refreshTopics = [];
  if (refresh && existingTopics.length > 0) {
    refreshTopics = await generateRefreshTopics(existingTopics, Math.min(10, count / 3));
  }
  
  // 結果表示
  if (dryRun) {
    console.log("\n" + "=".repeat(60));
    console.log("📋 生成結果（プレビュー）");
    console.log("=".repeat(60));
    console.log(`✅ 新規トピック: ${newTopics.length}個`);
    if (refreshTopics.length > 0) {
      console.log(`🔄 リフレッシュトピック: ${refreshTopics.length}個`);
    }
    console.log(`📊 合計トピック数（仮）: ${existingTopics.length + newTopics.length + refreshTopics.length}個`);
  } else {
    console.log("\n" + "=".repeat(60));
    console.log("🎉 トピック生成完了");
    console.log("=".repeat(60));
    console.log(`✅ 追加した新規トピック: ${newTopics.length}個`);
    if (refreshTopics.length > 0) {
      console.log(`🔄 追加したリフレッシュトピック: ${refreshTopics.length}個`);
    }
    
    // 最終的なトピック数を表示
    const finalTopics = await loadTopicPool();
    console.log(`📊 現在の総トピック数: ${finalTopics.length}個`);
    
    // カテゴリー別内訳
    const categoryCount = {};
    finalTopics.forEach(topic => {
      categoryCount[topic.category] = (categoryCount[topic.category] || 0) + 1;
    });
    
    console.log("\n📈 カテゴリー別内訳:");
    Object.entries(categoryCount).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}トピック`);
    });
    
    // 次回生成推奨時期
    if (finalTopics.length < 50) {
      console.log("\n⚠️ トピック数が50未満です。次回CRON実行時に再生成されます。");
    } else {
      console.log(`\n✅ 十分なトピック数があります（${finalTopics.length}/50）。`);
    }
  }
}

// ============================================================
// 10. ヘルプ表示
// ============================================================
function showHelp() {
  console.log(`
Kids Gear Lab — トピック自動生成システム
=========================================

使用方法:
  node generate-topics.mjs [オプション]

オプション:
  --dry-run, -d     プレビューのみ、書き込みなし
  --refresh, -r     古い記事のリフレッシュトピックも生成
  --count N, -c N   生成するトピック数（デフォルト: 30）
  --help, -h        このヘルプを表示

例:
  node generate-topics.mjs                    # 30トピック生成
  node generate-topics.mjs --dry-run          # プレビューのみ
  node generate-topics.mjs --count 20         # 20トピック生成
  node generate-topics.mjs --refresh --count 40 # 40トピック（リフレッシュ含む）

動作:
  1. site-config.jsonからサイト設定を読み込み
  2. topics.mjsから既存トピックを読み込み
  3. Gemini APIで新しいトピックを生成
  4. 重複チェックとバリデーション
  5. topics.mjsを更新（--dry-runでなければ）

出力:
  - topics.mjs: 更新されたトピックプール
  - コンソール: 生成結果のサマリー

注意:
  - GEMINI_API_KEY環境変数が必要です
  - レート制限に注意（1リクエスト/秒推奨）
  - 生成されたトピックは記事生成スクリプトで使用されます
  `);
}

// ============================================================
// 11. エントリーポイント
// ============================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("❌ 致命的なエラー:", error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

// ============================================================
// 12. エクスポート
// ============================================================
export {
  generateTopics,
  generateRefreshTopics,
  loadTopicPool,
  getSeasonalThemes
};