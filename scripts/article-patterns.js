// 記事パターン定義
// 各カテゴリーに対して複数の切り口（パターン）を定義

const patterns = {
  // 1. 食品・サプリ（離乳食、粉ミルクなど）
  food: {
    name: '食品・サプリ',
    patterns: {
      'where-to-buy': {
        name: '売ってる場所',
        titles: [
          '[商品名]は西松屋にある？売ってる場所（取扱店）を徹底調査',
          '【市販なし？】[商品名]を今すぐ買える店舗とネット通販の在庫まとめ'
        ],
        prompt: '商品がどこで購入できるか（西松屋、赤ちゃん本舗、ドラッグストア、Amazon、楽天など）を調査し、各店舗の価格や在庫状況、お得な買い方をまとめる記事'
      },
      'when-to-start': {
        name: 'いつから使える？',
        titles: [
          '[商品名]は生後何ヶ月からOK？離乳食初期に使う時の注意点',
          '1歳からでも遅くない？[商品名]を始めるタイミングと量'
        ],
        prompt: '商品を何歳・何ヶ月から使えるか、月齢別の使い方、量の目安、注意点をまとめる記事'
      },
      'safety': {
        name: '成分・安全性',
        titles: [
          '[商品名]の添加物は大丈夫？原材料とアレルギーリスクをプロが解析',
          '中国産？国産？[商品名]の安全性と産地について調査してみた'
        ],
        prompt: '商品の原材料、添加物、産地、アレルギー情報など安全性に関する情報を詳しく解説する記事'
      },
      'tips': {
        name: '食べない時の対処法',
        titles: [
          '[商品名]を食べてくれない…偏食な子でも完食した魔法のアレンジ5選',
          '混ぜるだけで栄養補給！[商品名]を離乳食にバレずに混ぜるコツ'
        ],
        prompt: '子供が食べてくれない時の対処法、アレンジレシピ、混ぜ方のコツなど実用的なテクニックを紹介する記事'
      }
    }
  },

  // 2. 家具・大型用品（チャイルドシート、ベビーカーなど）
  furniture: {
    name: '家具・大型用品',
    patterns: {
      'where-to-buy': {
        name: '展示店舗・購入場所',
        titles: [
          '[商品名]の展示店舗はどこ？実物を確認できる赤ちゃん本舗・直営店リスト',
          '[商品名]はコストコで買える？最安値ショップと保証の有無を比較'
        ],
        prompt: '商品を実際に見て試せる店舗、展示店舗リスト、ネット購入と店舗購入のメリット・デメリットを解説する記事'
      },
      'regret': {
        name: '後悔・デメリット',
        titles: [
          '【正直レポ】[商品名]を買って後悔した3つの理由｜狭い車には不向き？',
          '良い口コミは嘘？[商品名]の使いにくい点と1年使った本音を暴露'
        ],
        prompt: '商品のデメリット、後悔しやすいポイント、購入前に知っておくべき注意点を正直にレビューする記事'
      },
      'size-check': {
        name: 'サイズ・適合確認',
        titles: [
          '[商品名]はN-BOXでも狭くない？軽自動車への取り付けを実機検証',
          'アパートの狭い玄関に置ける？[商品名]の折りたたみサイズと重量感'
        ],
        prompt: '商品のサイズ、重量、車への適合性、部屋に置いた時の存在感など、購入前に確認すべきサイズ関連情報をまとめる記事'
      },
      'comparison': {
        name: '徹底比較',
        titles: [
          '[商品名]と[競合商品]を10項目で比較！結局どっちが買い？',
          '[ブランド名]の[シリーズA]と[シリーズB]の違いを完全図解'
        ],
        prompt: '類似商品や競合商品との詳細比較。価格、機能、使いやすさなど複数項目で比較表を作成する記事'
      }
    }
  },

  // 3. 知育・おもちゃ
  educational: {
    name: '知育・おもちゃ',
    patterns: {
      'where-to-buy': {
        name: '購入場所',
        titles: [
          '[商品名]の限定版はどこで買える？Amazon・楽天・公式サイトの特典差',
          'トイザらスに[商品名]はある？実店舗とネットの価格差に驚愕'
        ],
        prompt: '商品の購入場所、限定版や特典の違い、お得に買える場所を調査する記事'
      },
      'effect': {
        name: '効果・成長記録',
        titles: [
          '2歳が[商品名]で3ヶ月遊んだ結果。言葉の数が増えたって本当？',
          '[商品名]の効果は？飽きっぽい子が夢中になった遊び方の工夫'
        ],
        prompt: '商品で遊んだ結果どんな効果があったか、子供の成長にどう影響したかを体験ベースでレポートする記事'
      },
      'rent-vs-buy': {
        name: 'レンタルvs購入',
        titles: [
          '[商品名]は買うべき？レンタル（トイサブ等）の方がお得な人の特徴',
          '1ヶ月で飽きるリスクを回避！[商品名]を安く試す方法'
        ],
        prompt: 'おもちゃのレンタルサービスと購入を比較し、どちらがお得か、それぞれに向いている人の特徴を解説する記事'
      },
      'alternative': {
        name: '代用・100均比較',
        titles: [
          '[商品名]はダイソーの知育玩具で代用できる？本物との決定的な違い',
          '100均で代用できる？[商品名]と類似品の比較レビュー'
        ],
        prompt: '高価な知育玩具と100均などの代用品を比較し、本物を買う価値があるかを検証する記事'
      }
    }
  },

  // 4. 衛生・消耗品（おむつ、保湿剤など）
  consumable: {
    name: '衛生・消耗品',
    patterns: {
      'where-to-buy': {
        name: '売ってる場所',
        titles: [
          '[商品名]をコンビニで探すならどこ？ローソン・セブン・ファミマ調査',
          '【緊急】[商品名]が切れた！最短当日届くショップと在庫のある店'
        ],
        prompt: 'コンビニ、ドラッグストア、スーパーなど身近な店舗での取り扱い状況、急ぎで買える場所を調査する記事'
      },
      'lowest-price': {
        name: '最安値比較',
        titles: [
          '[商品名]の1枚単価を比較！Amazon定期便vs楽天お買い物マラソン',
          '最安値更新！[商品名]を実質〇円で買うポイント活用術'
        ],
        prompt: '各通販サイトの価格比較、定期便、ポイント還元などを考慮した最安値での買い方を解説する記事'
      },
      'skin-trouble': {
        name: '肌トラブル・相性',
        titles: [
          'アトピー肌の子に[商品名]を使ってみた結果。かぶれ・赤みの変化は？',
          '[商品名]と[競合商品]の吸収力を比較。夜中のおしっこ漏れ対策にはどっち？'
        ],
        prompt: '敏感肌やアトピー肌での使用感、肌トラブルの有無、他商品との肌への優しさ比較をレポートする記事'
      }
    }
  },

  // 5. 外遊び用品
  outdoor: {
    name: '外遊び用品',
    patterns: {
      'where-to-buy': {
        name: '購入場所',
        titles: [
          '[商品名]はイオンで買える？実店舗で試乗できる場所を調査',
          '[商品名]の中古は危険？メルカリで買う時の注意点'
        ],
        prompt: '商品を実際に試せる店舗、中古購入のリスク、お得に買える場所を調査する記事'
      },
      'age-guide': {
        name: '年齢別ガイド',
        titles: [
          '[商品名]は何歳から何歳まで使える？年齢別の楽しみ方ガイド',
          '2歳には早い？[商品名]を始める最適なタイミング'
        ],
        prompt: '対象年齢、年齢別の遊び方、長く使うコツを解説する記事'
      },
      'safety': {
        name: '安全対策',
        titles: [
          '[商品名]の事故を防ぐ！安全に遊ぶための親の見守りポイント',
          'ヘルメットは必須？[商品名]の安全装備と選び方'
        ],
        prompt: '安全に使うための注意点、必要な安全装備、事故防止のポイントを解説する記事'
      }
    }
  },

  // 6. ベビー用品全般
  baby: {
    name: 'ベビー用品',
    patterns: {
      'where-to-buy': {
        name: '売ってる場所',
        titles: [
          '[商品名]は西松屋と赤ちゃん本舗どっちが安い？店舗価格を比較',
          '[商品名]をお得に買うならどこ？セール時期と最安ショップまとめ'
        ],
        prompt: '商品の購入場所、店舗ごとの価格比較、お得に買えるタイミングを調査する記事'
      },
      'regret': {
        name: '後悔・失敗談',
        titles: [
          '買って後悔…[商品名]の失敗談と選び方のコツ',
          '[商品名]は本当に必要？なくても困らなかったという声も'
        ],
        prompt: '購入後の後悔ポイント、必要性の検討、代用品の可能性を正直にレビューする記事'
      },
      'how-to-use': {
        name: '使い方・コツ',
        titles: [
          '説明書より分かりやすい！[商品名]の正しい使い方と裏ワザ',
          '初心者でも失敗しない[商品名]のセットアップ完全ガイド'
        ],
        prompt: '商品の使い方、セットアップ方法、便利な使い方のコツを解説する記事'
      }
    }
  },

  // 7. 安全グッズ
  safety: {
    name: '安全グッズ',
    patterns: {
      'where-to-buy': {
        name: '売ってる場所',
        titles: [
          '[商品名]は100均で代用できる？ダイソー・セリアの類似品を検証',
          '[商品名]はホームセンターにある？カインズ・コーナンの品揃えを調査'
        ],
        prompt: '商品の購入場所、100均での代用可能性、ホームセンターでの取り扱いを調査する記事'
      },
      'necessity': {
        name: '必要性の検討',
        titles: [
          '[商品名]は本当に必要？使わなかった先輩ママの声と実態',
          '賃貸でも使える？[商品名]の設置方法と原状回復の注意点'
        ],
        prompt: '商品の必要性、使わなかった人の意見、賃貸での設置可否を検討する記事'
      }
    }
  }
};

// カテゴリー名からパターン一覧を取得
function getPatternsForCategory(categoryKey) {
  const category = patterns[categoryKey];
  if (!category) return null;
  return category.patterns;
}

// 全カテゴリーのパターン一覧を表示
function listAllPatterns() {
  for (const [catKey, category] of Object.entries(patterns)) {
    console.log(`\n【${category.name}】(${catKey})`);
    for (const [patKey, pattern] of Object.entries(category.patterns)) {
      console.log(`  ${patKey}: ${pattern.name}`);
      pattern.titles.forEach((t, i) => console.log(`    例${i + 1}: ${t}`));
    }
  }
}

// タイトルを生成
function generateTitle(categoryKey, patternKey, productName, competitorName = null) {
  const category = patterns[categoryKey];
  if (!category) return null;

  const pattern = category.patterns[patternKey];
  if (!pattern) return null;

  // ランダムにタイトルを選択
  const titleTemplate = pattern.titles[Math.floor(Math.random() * pattern.titles.length)];

  let title = titleTemplate.replace(/\[商品名\]/g, productName);
  if (competitorName) {
    title = title.replace(/\[競合商品\]/g, competitorName);
    title = title.replace(/\[競合A\]/g, competitorName);
  }

  return title;
}

// プロンプト取得
function getPrompt(categoryKey, patternKey) {
  const category = patterns[categoryKey];
  if (!category) return null;

  const pattern = category.patterns[patternKey];
  if (!pattern) return null;

  return pattern.prompt;
}

module.exports = {
  patterns,
  getPatternsForCategory,
  listAllPatterns,
  generateTitle,
  getPrompt
};

// 直接実行時はパターン一覧を表示
if (require.main === module) {
  listAllPatterns();
}
