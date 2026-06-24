# Site Manager Report 2026-06-24

## Results
- Task 0 QA: babysmile-babyalarm-e201-review.html PASS（schema.org Product+Article✅ Amazon/楽天リンク✅ 内部リンク3本✅ 公的機関リンク✅ 安全断言なし✅）
- Task 1 ASIN: 5件 all OK（B09X137GDR, B01I52KP3Q, B00BBR17EE, B005JALKUA, B08SR2T1MC）
  - 軽微: B08SR2T1MC はFJL-350イエローホワイト色バリアント（記事では色指定なし・問題なし）
- Task 2 Recall: 対象記事なし（Peg Perego Tatamia：サイト記事なし、Thermos シャトルジャー：FJL-350とは別製品）
- Task 3 Freshness: richell-fukafukababybath-coupon.html クーポン金額（500円OFF等）が古い可能性あり
- Task 4 Broken links: 0件（10記事チェック）
- Task 5 Deploy: インデックス再構築・サイトマップ更新 → push済み (a717bcb)

## 記事数
- 合計: 110本（index.html除く）

## 新規公開記事（24h）
- ベビーアラーム E-201「誤作動が多い」は本当か？0歳娘に3ヶ月使ったパパの正直レポート
  https://kidsgoodslab.com/products/babysmile-babyalarm-e201-review.html

## 注意事項
- OGP画像 6本が3161バイト（プレースホルダー）: d-bike-mini-plus, kidsforet-raincoat-randoseru, pigeon-steam-sterilizer, stokke-tripp-trapp, sylvanian-families-dh-08-hajimete, babysmile-babyalarm-e201
  → generate-ogp-image.js での再生成を推奨

## リコール確認詳細
- Peg Perego Tatamia 3-in-1: US CPSC 2025年6月リコール（窒息リスク）→ サイト記事なし
- FLAGAV プレイマット: 海外リコール → サイト記事なし
- Thermos 真空断熱シャトルジャー: recall.caa.go.jp掲載 → FJL-350とは別製品（問題なし）
- 2026年1月より子供PSCマーク制度開始（リコールではなく新規制）

## Notifications
- Telegram: BLOCKED（proxy HTTP 403）
- PushNotification: 送信済み
- このファイル: scripts/logs/site-manager-2026-06-24.md
