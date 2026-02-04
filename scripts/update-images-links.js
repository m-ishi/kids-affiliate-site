const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const productsDir = path.join(__dirname, '../products');

// 商品リストとファイルの対応
const products = [
  { file: 'rx68j0.html', name: 'レゴデュプロ はじめてのデュプロ かずあそびトレイン' },
  { file: '18ztxll.html', name: 'くもん NEWスタディ将棋' },
  { file: 'b4m6pf.html', name: 'ボーネルンド マグフォーマー ベーシックセット 62ピース' },
  { file: '1et2v7o.html', name: '学研 ニューブロック たっぷりセット' },
  { file: '1ijflir.html', name: 'エド・インター 森のあそび箱' },
  { file: '1ur9nu6.html', name: 'コンビ ネムリラ AUTO SWING' },
  { file: 'wc7jp.html', name: 'エルゴベビー OMNI 360' },
  { file: 'zy2vmd.html', name: 'リッチェル ふかふかベビーバス' },
  { file: '1mfcwkj.html', name: 'ピジョン 母乳実感 哺乳びん' },
  { file: '2ltvx32.html', name: 'シルバニアファミリー 赤い屋根の大きなお家' },
  { file: '1v573be.html', name: 'アンパンマン ブロックラボ たのしいアンパンマンタウン' },
  { file: 'qjj27e.html', name: 'メルちゃん おせわだいすきベビーカー' },
  { file: '8ka6bo.html', name: 'トミカ でっかく遊ぼう DXトミカタワー' },
  { file: '2qxvagw.html', name: 'ストライダー スポーツモデル' },
  { file: '1ozjjmq.html', name: 'アンパンマン うちの子天才 ブランコパークDX' },
  { file: '5r0xsq2.html', name: '日本育児 ベビーゲート スマートゲイト2' },
  { file: '2f0oqfz.html', name: 'リッチェル ベビーガード コーナークッション' },
];

async function callGemini(prompt) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      }
    })
  });

  const data = await response.json();
  if (data.candidates && data.candidates[0]) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error('Gemini API error: ' + JSON.stringify(data));
}

async function getProductInfo(productName) {
  const prompt = `
以下の商品について、Amazon.co.jpの商品URLを教えてください。

商品名: ${productName}

以下のJSON形式で出力してください（JSONのみ、他のテキストは不要）:

{
  "amazonUrl": "https://www.amazon.co.jp/dp/XXXXXXXXXX"
}

注意:
- 実際のAmazon.co.jpの商品ページURLを返してください
- 商品が見つからない場合は、最も近い商品のURLを返してください
- dpの後のASINコードを含むURLにしてください
`;

  const result = await callGemini(prompt);
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON not found');
  }
  return JSON.parse(jsonMatch[0]);
}

function updateHtmlFile(filePath, amazonUrl) {
  let html = fs.readFileSync(filePath, 'utf8');

  // アフィリエイトリンクを更新（href="#" を実際のURLに）
  html = html.replace(/href="#"([^>]*rel="noopener sponsored")/g, `href="${amazonUrl}"$1`);

  // 画像プレースホルダーを商品イメージに更新
  // 📦アイコンをAmazonの商品画像的なプレースホルダーに変更
  const imageHtml = `<img src="https://images-na.ssl-images-amazon.com/images/I/placeholder.jpg" alt="商品画像" style="width: 100%; height: 100%; object-fit: contain; background: #f8f8f8;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 4rem; display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f8f8;\\'>🛒</span>';">`;

  fs.writeFileSync(filePath, html, 'utf8');
  return true;
}

async function main() {
  console.log('🚀 画像とリンクの更新を開始します...\n');

  const results = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i + 1}/${products.length}] ${product.name}`);

    try {
      const info = await getProductInfo(product.name);
      const filePath = path.join(productsDir, product.file);

      // HTMLファイルを更新
      let html = fs.readFileSync(filePath, 'utf8');
      html = html.replace(/href="#"([^>]*rel="noopener sponsored")/g, `href="${info.amazonUrl}"$1`);
      html = html.replace(/href="#" class="affiliate-btn"/g, `href="${info.amazonUrl}" class="affiliate-btn"`);
      fs.writeFileSync(filePath, html, 'utf8');

      results.push({ product: product.name, url: info.amazonUrl });
      console.log(`   ✓ ${info.amazonUrl}`);

      // API制限を避けるため待機
      await new Promise(r => setTimeout(r, 1500));

    } catch (error) {
      console.error(`   ✗ エラー: ${error.message}`);
    }
  }

  console.log('\n✅ 完了！');
  console.log(`   更新された記事: ${results.length}件`);

  // 結果を保存
  fs.writeFileSync(
    path.join(__dirname, 'amazon-links.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
}

main().catch(console.error);
