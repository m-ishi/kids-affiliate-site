// ============================================================
// Kids Gear Lab — Topic Pool (Initial)
// 初期トピックプール
// 最終更新: 2026-03-18
// ============================================================

export const TOPIC_POOL = [
  {
    "title": "【パパ目線比較】2026年おすすめ知育ブロック5選！レゴ・ラキュー・ピタゴラスの実用性レビュー",
    "category": "educational",
    "targetAge": "3-8歳",
    "keywords": ["知育ブロック", "レゴ", "ラキュー", "ピタゴラス", "比較レビュー"],
    "angle": "パパ目線での実用性と教育効果の比較",
    "productFocus": "知育ブロック",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "我が家の2歳児が夢中！安全設計の三輪車3機種を実際に乗り比べてみた",
    "category": "outdoor",
    "targetAge": "1-3歳",
    "keywords": ["三輪車", "子供用自転車", "安全設計", "パパレビュー", "外遊び"],
    "angle": "安全性を最優先にした実地テスト比較",
    "productFocus": "三輪車",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "新生児から使える抱っこ紐選びのポイント！エルゴ・ベビービョルン・アイムスの着け心地比較",
    "category": "baby",
    "targetAge": "0-2歳",
    "keywords": ["抱っこ紐", "エルゴベビー", "ベビービョルン", "アイムス", "新生児"],
    "angle": "実際の使用感に基づくパパ目線レビュー",
    "productFocus": "抱っこ紐",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "雨の日でも大丈夫！室内で楽しめる大型おもちゃ5選【2児のパパが厳選】",
    "category": "toy",
    "targetAge": "1-5歳",
    "keywords": ["室内遊び", "大型おもちゃ", "雨の日", "パパおすすめ", "知育玩具"],
    "angle": "実際の子育て経験から選んだ実用的なおもちゃ",
    "productFocus": "室内おもちゃ",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "子供の安全を守る！2026年最新版チャイルドシート比較＆選び方ガイド",
    "category": "safety",
    "targetAge": "0-12歳",
    "keywords": ["チャイルドシート", "車載用品", "安全性", "比較レビュー", "選び方"],
    "angle": "安全性テスト結果と実用性のバランスを検証",
    "productFocus": "チャイルドシート",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "コンパクトで機能的な子供用学習デスク3選！狭い部屋でも勉強習慣が身につくアイテム",
    "category": "furniture",
    "targetAge": "3-10歳",
    "keywords": ["学習デスク", "子供部屋", "収納家具", "勉強習慣", "コンパクト"],
    "angle": "限られた空間でも効果的な学習環境を構築",
    "productFocus": "学習デスク",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "春のピクニックに必須！子供連れでも安心のアウトドアグッズ7選",
    "category": "outdoor",
    "targetAge": "全年齢",
    "keywords": ["ピクニック", "アウトドア", "春のお出かけ", "家族連れ", "便利グッズ"],
    "angle": "実際の家族でのアウトドア経験から選んだ実用品",
    "productFocus": "アウトドアグッズ",
    "seasonal": true,
    "comparison": true
  },
  {
    "title": "知育効果バツグン！パズルおもちゃの選び方と年齢別おすすめ5選",
    "category": "educational",
    "targetAge": "1-6歳",
    "keywords": ["知育パズル", "脳トレ", "発達支援", "年齢別", "おすすめ"],
    "angle": "子供の発達段階に合わせた最適なパズル選び",
    "productFocus": "知育パズル",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "哺乳瓶の衛生管理はこれで完璧！消毒器・保管ケースの実用性比較",
    "category": "baby",
    "targetAge": "0-1歳",
    "keywords": ["哺乳瓶", "消毒器", "衛生管理", "ベビー用品", "実用性"],
    "angle": "忙しいパパでも簡単にできる衛生管理方法",
    "productFocus": "哺乳瓶消毒器",
    "seasonal": false,
    "comparison": true
  },
  {
    "title": "子供の事故防止に！家の中の危険箇所と対策グッズ完全ガイド",
    "category": "safety",
    "targetAge": "0-5歳",
    "keywords": ["事故防止", "安全対策", "危険箇所", "ホームセーフティ", "子供の安全"],
    "angle": "実際の子育て経験から見つけた危険ポイントと対策",
    "productFocus": "安全対策グッズ",
    "seasonal": false,
    "comparison": false
  }
];

// カテゴリー別フィルタリング関数
export function getTopicsByCategory(category) {
  return TOPIC_POOL.filter(t => t.category === category);
}

// 未使用トピック取得関数
export function getUnusedTopics(usedTitles) {
  const usedSet = new Set(usedTitles);
  return TOPIC_POOL.filter(t => !usedSet.has(t.title));
}

// ランダムトピック取得関数
export function getRandomTopics(count = 5) {
  const shuffled = [...TOPIC_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}