# SUUMO 実質月額コスト Chrome拡張

SUUMOの賃貸物件詳細ページに**実質月額コスト**をオーバーレイ表示するChrome拡張（Manifest V3）です。

## 計算式

```
実質月額 = ((家賃 + 管理費) × 24 + 敷金 + 礼金 + 家賃 × 1.0(仲介) + 家賃 × 0.5(保証)) ÷ 24
```

初期費用を24ヶ月で均等割りした「実態の月負担額」を表示します。

## インストール方法

1. このリポジトリをクローン or ZIPダウンロード
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をON
4. 「パッケージ化されていない拡張機能を読み込む」からこのフォルダを選択

## 対象ページ

`suumo.jp/chintai/jnc_*` および `suumo.jp/chintai/nc_*`

## Google Forms URL の差し替え

[content.js](content.js) 内の以下の行を実際のフォームURLに変更してください:

```js
const FORMS_URL = 'https://forms.google.com/PLACEHOLDER';
```

## 記録データ（ローカルのみ）

`chrome.storage.local` に以下のカウンタのみ保存します。外部送信は一切ありません。

| キー | 内容 |
|------|------|
| `pageViewCount` | 物件ページ閲覧回数 |
| `hoverCount` | オーバーレイへのホバー回数 |
| `goodCount` | 👍 クリック回数 |
| `badCount` | 👎 クリック回数 |

個人情報・物件特定情報は記録しません。
