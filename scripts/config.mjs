// ============================================================
// Kids Gear Lab — Configuration Module
// ============================================================
// 環境変数とサイト設定を一元管理するモジュール
// ============================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 1. 環境変数読み込み
// ============================================================

function loadEnv() {
  // 環境変数から直接読み込み（既に設定済みの場合）
  const env = {
    // API Keys
    BRAVE_API_KEY: process.env.BRAVE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    
    // サイト設定
    AMAZON_TAG: process.env.AMAZON_TAG || "kidsgoodslab-22",
    
    // Telegram通知
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "8754086846:AAETbMUvQtBTVjOgGOkLMAbCgzgMHTmLmKI",
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "7685031090",
    
    // 生成設定
    DEFAULT_ARTICLE_COUNT: parseInt(process.env.DEFAULT_ARTICLE_COUNT) || 5,
    DEFAULT_TOPIC_COUNT: parseInt(process.env.DEFAULT_TOPIC_COUNT) || 30,
    RATE_LIMIT_DELAY_MS: parseInt(process.env.RATE_LIMIT_DELAY_MS) || 3000,
    MAX_RETRY_COUNT: parseInt(process.env.MAX_RETRY_COUNT) || 3,
    
    // ディレクトリ設定
    DRAFTS_DIR: process.env.DRAFTS_DIR || path.join(__dirname, "../drafts"),
    ARTICLES_DIR: process.env.ARTICLES_DIR || path.join(__dirname, "../articles"),
    HISTORY_FILE: process.env.HISTORY_FILE || path.join(__dirname, "history.json"),
    TOPICS_FILE: process.env.TOPICS_FILE || path.join(__dirname, "topics.mjs"),
    
    // 品質管理設定
    QA_MAX_ISSUES: parseInt(process.env.QA_MAX_ISSUES) || 3,
    MIN_WORD_COUNT: parseInt(process.env.MIN_WORD_COUNT) || 1500,
    MIN_AFFILIATE_LINKS: parseInt(process.env.MIN_AFFILIATE_LINKS) || 3,
  };
  
  // 必須APIキーの検証
  if (!env.BRAVE_API_KEY) {
    console.error("❌ BRAVE_API_KEYが設定されていません");
    console.error("   .envファイルを作成するか、環境変数を設定してください");
    console.error("   テンプレート: cp .env.example .env");
    process.exit(1);
  }
  
  if (!env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEYが設定されていません");
    console.error("   .envファイルを作成するか、環境変数を設定してください");
    console.error("   テンプレート: cp .env.example .env");
    process.exit(1);
  }
  
  return env;
}

// ============================================================
// 2. サイト設定読み込み
// ============================================================

function loadSiteConfig() {
  const siteConfigPath = path.join(__dirname, "../site-config.json");
  
  try {
    const config = JSON.parse(fs.readFileSync(siteConfigPath, "utf-8"));
    
    // デフォルト値の設定
    return {
      siteName: config.siteName || "キッズグッズラボ",
      siteNameEn: config.siteNameEn || "Kids Gear Lab",
      siteUrl: config.siteUrl || "https://kidsgoodslab.com",
      siteDescription: config.siteDescription || "子供用品の実用的なレビューサイト。2児のパパ目線での商品比較・選び方ガイド。",
      categories: config.categories || [
        { id: "toy", name: "おもちゃ" },
        { id: "baby", name: "ベビー用品" },
        { id: "educational", name: "知育玩具" },
        { id: "outdoor", name: "外遊び" },
        { id: "furniture", name: "家具・収納" },
        { id: "safety", name: "安全グッズ" }
      ],
      amazonTag: config.amazonTag || "kidsgoodslab-22",
      author: config.author || {
        name: "パパラボ",
        bio: "2児の父（2歳男の子、0歳女の子）。東京在住。実際の子育て経験を元に、実用的な子供用品レビューを提供。",
        location: "東京"
      }
    };
  } catch (error) {
    console.error("❌ site-config.jsonの読み込みに失敗:", error.message);
    console.error("   デフォルト設定を使用します");
    
    return {
      siteName: "キッズグッズラボ",
      siteNameEn: "Kids Gear Lab",
      siteUrl: "https://kidsgoodslab.com",
      siteDescription: "子供用品の実用的なレビューサイト。2児のパパ目線での商品比較・選び方ガイド。",
      categories: [
        { id: "toy", name: "おもちゃ" },
        { id: "baby", name: "ベビー用品" },
        { id: "educational", name: "知育玩具" },
        { id: "outdoor", name: "外遊び" },
        { id: "furniture", name: "家具・収納" },
        { id: "safety", name: "安全グッズ" }
      ],
      amazonTag: "kidsgoodslab-22",
      author: {
        name: "パパラボ",
        bio: "2児の父（2歳男の子、0歳女の子）。東京在住。実際の子育て経験を元に、実用的な子供用品レビューを提供。",
        location: "東京"
      }
    };
  }
}

// ============================================================
// 3. API URL設定
// ============================================================

function getApiUrls(env) {
  return {
    braveSearch: "https://api.search.brave.com/res/v1/web/search",
    gemini: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    telegram: `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`
  };
}

// ============================================================
// 4. カテゴリーマッピング
// ============================================================

const CATEGORY_MAP = {
  toy: { name: "おもちゃ", emoji: "🧸" },
  baby: { name: "ベビー用品", emoji: "👶" },
  educational: { name: "知育玩具", emoji: "🧠" },
  outdoor: { name: "外遊び", emoji: "🌳" },
  furniture: { name: "家具・収納", emoji: "🛋️" },
  safety: { name: "安全グッズ", emoji: "🛡️" }
};

// ============================================================
// 5. QAチェック項目設定
// ============================================================

const QA_CHECKS = [
  { id: "age_recommendation", name: "年齢推奨表示の適切性", required: true, weight: 3 },
  { id: "safety_info", name: "安全性情報の記載", required: true, weight: 3 },
  { id: "parent_perspective", name: "親目線の体験談（パパ目線）", required: true, weight: 3 },
  { id: "fair_comparison", name: "製品比較の公平性", required: true, weight: 2 },
  { id: "affiliate_disclosure", name: "アフィリエイト開示の明確性", required: true, weight: 3 },
  { id: "price_accuracy", name: "価格情報の正確性", required: true, weight: 2 },
  { id: "stock_status", name: "在庫状況の確認", required: false, weight: 1 },
  { id: "image_appropriateness", name: "画像の適切性（子供向け）", required: true, weight: 2 },
  { id: "expert_review", name: "専門家監修の有無・適切性", required: false, weight: 1 },
  { id: "medical_accuracy", name: "医療・健康アドバイスの正確性", required: true, weight: 3 },
  { id: "seasonal_relevance", name: "季節性コンテンツの適時性", required: false, weight: 1 },
  { id: "word_count", name: "ワード数 ≥ 1500", required: true, weight: 2 },
  { id: "affiliate_links", name: "アフィリエイトリンク ≥ 3", required: true, weight: 2 },
  { id: "spec_table", name: "商品仕様表の記載", required: false, weight: 1 },
  { id: "purchase_links", name: "購入先リンクの記載", required: true, weight: 2 },
  { id: "review_sources", name: "レビューソースの明示", required: true, weight: 2 },
  { id: "update_date", name: "更新日時の記載", required: false, weight: 1 }
];

// ============================================================
// 6. Auditorチェック項目設定
// ============================================================

const AUDITOR_CHECKS = [
  { id: "coppa_compliance", name: "COPPA（子供のオンラインプライバシー保護法）遵守", level: "RED" },
  { id: "safety_misinformation", name: "安全性に関する誤った情報", level: "RED" },
  { id: "age_inappropriate", name: "年齢に不適切なコンテンツ", level: "RED" },
  { id: "exaggerated_advertising", name: "誇大広告・虚偽表現", level: "YELLOW" },
  { id: "affiliate_disclosure_issue", name: "アフィリエイト開示の不備", level: "YELLOW" },
  { id: "copyright_risk", name: "著作権侵害リスク", level: "YELLOW" },
  { id: "privacy_policy_violation", name: "プライバシーポリシー違反", level: "YELLOW" }
];

// ============================================================
// 7. メイン設定オブジェクト
// ============================================================

const env = loadEnv();
const siteConfig = loadSiteConfig();
const apiUrls = getApiUrls(env);

export const CONFIG = {
  // 環境変数
  env,
  
  // サイト設定
  site: siteConfig,
  
  // API設定
  api: apiUrls,
  
  // マッピング
  categories: CATEGORY_MAP,
  
  // 品質管理
  qa: {
    checks: QA_CHECKS,
    maxIssues: env.QA_MAX_ISSUES,
    minWordCount: env.MIN_WORD_COUNT,
    minAffiliateLinks: env.MIN_AFFILIATE_LINKS
  },
  
  // 監査
  auditor: {
    checks: AUDITOR_CHECKS
  },
  
  // パス設定
  paths: {
    drafts: env.DRAFTS_DIR,
    articles: env.ARTICLES_DIR,
    history: env.HISTORY_FILE,
    topics: env.TOPICS_FILE,
    scripts: __dirname
  },
  
  // ユーティリティ関数
  utils: {
    // カテゴリー名取得
    getCategoryName: (categoryId) => {
      return CATEGORY_MAP[categoryId]?.name || categoryId;
    },
    
    // カテゴリー絵文字取得
    getCategoryEmoji: (categoryId) => {
      return CATEGORY_MAP[categoryId]?.emoji || "📁";
    },
    
    // 全カテゴリーリスト取得
    getAllCategories: () => {
      return Object.keys(CATEGORY_MAP);
    },
    
    // 必須QAチェック取得
    getRequiredQaChecks: () => {
      return QA_CHECKS.filter(check => check.required);
    },
    
    // REDレベルAuditorチェック取得
    getRedLevelAuditorChecks: () => {
      return AUDITOR_CHECKS.filter(check => check.level === "RED");
    }
  }
};

// ============================================================
// 8. 設定検証
// ============================================================

export function validateConfig() {
  const errors = [];
  
  // APIキー検証
  if (!CONFIG.env.BRAVE_API_KEY || CONFIG.env.BRAVE_API_KEY.includes("your_")) {
    errors.push("BRAVE_API_KEYが正しく設定されていません");
  }
  
  if (!CONFIG.env.GEMINI_API_KEY || CONFIG.env.GEMINI_API_KEY.includes("your_")) {
    errors.push("GEMINI_API_KEYが正しく設定されていません");
  }
  
  // ディレクトリ存在確認
  const requiredDirs = [CONFIG.paths.drafts, CONFIG.paths.articles];
  for (const dir of requiredDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 ディレクトリを作成: ${dir}`);
      }
    } catch (error) {
      errors.push(`ディレクトリ作成失敗: ${dir} - ${error.message}`);
    }
  }
  
  // ファイル存在確認
  const requiredFiles = [CONFIG.paths.history, CONFIG.paths.topics];
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      errors.push(`必須ファイルが存在しません: ${file}`);
    }
  }
  
  if (errors.length > 0) {
    console.error("❌ 設定検証エラー:");
    errors.forEach(error => console.error(`   - ${error}`));
    return false;
  }
  
  console.log("✅ 設定検証完了");
  return true;
}

// ============================================================
// 9. 設定表示（デバッグ用）
// ============================================================

export function showConfig() {
  console.log("=".repeat(60));
  console.log("🔧 Kids Gear Lab — 設定情報");
  console.log("=".repeat(60));
  
  console.log("\n📊 サイト設定:");
  console.log(`   サイト名: ${CONFIG.site.siteName} (${CONFIG.site.siteNameEn})`);
  console.log(`   URL: ${CONFIG.site.siteUrl}`);
  console.log(`   説明: ${CONFIG.site.siteDescription}`);
  console.log(`   カテゴリー数: ${CONFIG.site.categories.length}`);
  console.log(`   Amazonタグ: ${CONFIG.site.amazonTag}`);
  
  console.log("\n🔑 API設定:");
  console.log(`   Brave API: ${CONFIG.env.BRAVE_API_KEY ? "設定済み" : "未設定"}`);
  console.log(`   Gemini API: ${CONFIG.env.GEMINI_API_KEY ? "設定済み" : "未設定"}`);
  console.log(`   Telegram Bot: ${CONFIG.env.TELEGRAM_BOT_TOKEN ? "設定済み" : "未設定"}`);
  
  console.log("\n📁 パス設定:");
  console.log(`   下書き: ${CONFIG.paths.drafts}`);
  console.log(`   公開記事: ${CONFIG.paths.articles}`);
  console.log(`   履歴: ${CONFIG.paths.history}`);
  console.log(`   トピック: ${CONFIG.paths.topics}`);
  
  console.log("\n✅ 品質管理:");
  console.log(`   QAチェック項目: ${CONFIG.qa.checks.length}項目`);
  console.log(`   Auditorチェック項目: ${CONFIG.auditor.checks.length}項目`);
  console.log(`   最大許容問題数: ${CONFIG.qa.maxIssues}`);
  
  console.log("=".repeat(60));
}

// ============================================================
// 10. デフォルトエクスポート
// ============================================================

export default CONFIG;