/* global chrome */
(function () {
  'use strict';

  // ================================================================
  // DOM からラベルに対応する値テキストを取得
  // 複数のHTML構造(th/td, dt/dd, div.property_data系)に対応
  // ================================================================
  function getTextByLabel(labelText) {
    // Strategy 1: <th> -> <td>
    const ths = document.querySelectorAll('th');
    for (const th of ths) {
      if (th.textContent.trim().includes(labelText)) {
        const td = th.nextElementSibling;
        if (td && td.tagName === 'TD') return td.textContent.trim();
        const row = th.closest('tr');
        if (row) {
          const tds = row.querySelectorAll('td');
          if (tds.length > 0) return tds[0].textContent.trim();
        }
      }
    }

    // Strategy 2: <dt> -> <dd>
    const dts = document.querySelectorAll('dt');
    for (const dt of dts) {
      if (dt.textContent.trim().includes(labelText)) {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') return dd.textContent.trim();
      }
    }

    // Strategy 3: div[class*="property_data-title"] / div[class*="bukken-detail-title"]
    const titleEls = document.querySelectorAll(
      '[class*="property_data-title"],[class*="bukken_detail-title"],[class*="detail-title"]'
    );
    for (const el of titleEls) {
      if (el.textContent.trim().includes(labelText)) {
        const body =
          el.nextElementSibling ||
          el.parentElement.querySelector('[class*="property_data-body"],[class*="detail-body"]');
        if (body) return body.textContent.trim();
      }
    }

    return null;
  }

  // ================================================================
  // テキストを数値(円)に変換
  // "8万円" "80,000円" "1ヶ月" "-" "無料" などに対応
  // rentは"Xヶ月"表記の解決に使用
  // ================================================================
  function parseAmount(text, rent) {
    if (!text) return 0;
    const t = text.trim().replace(/\s+/g, '');
    if (!t) return 0;

    // dash / 無 / なし → 0
    if (/^[-－ー‐]$/.test(t)) return 0;
    if (/^(無し?|無料|なし|ナシ)$/.test(t)) return 0;

    // "1ヶ月" "2ヶ月" → rent × N
    const monthMatch = t.match(/^(\d+(?:\.\d+)?)ヶ月/);
    if (monthMatch) return Math.round(parseFloat(monthMatch[1]) * (rent || 0));

    // "8万円" "8.5万"
    const manMatch = t.match(/(\d+(?:\.\d+)?)万/);
    if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10000);

    // "80,000円" "80000"
    const numMatch = t.replace(/円$/, '').match(/[\d,]+/);
    if (numMatch) return parseInt(numMatch[0].replace(/,/g, ''), 10);

    return 0;
  }

  // ================================================================
  // 家賃(賃料)取得 — 複数セレクタをフォールバックしながら検索
  // ================================================================
  function getRent() {
    const RENT_SELECTORS = [
      '.property_view_main-title',
      '.property_unit-price',
      '[class*="price--main"]',
      '[class*="pricemain"]',
      '[class*="cassetteitem_price-main"]',
    ];
    for (const sel of RENT_SELECTORS) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v = parseAmount(el.textContent);
      if (v > 0) return v;
    }
    // th "賃料" -> td
    const fromLabel = getTextByLabel('賃料');
    if (fromLabel) {
      const v = parseAmount(fromLabel);
      if (v > 0) return v;
    }
    return 0;
  }

  // ================================================================
  // ページから物件費用データを収集
  // ================================================================
  function extractData() {
    const rent = getRent();
    if (!rent) return null;

    const mgmt = parseAmount(getTextByLabel('管理費'), rent);
    const deposit = parseAmount(getTextByLabel('敷金'), rent);
    const keyMoney = parseAmount(getTextByLabel('礼金'), rent);

    // 仲介手数料の表示確認(値は使わず、存在確認のみ)
    const agencyText = getTextByLabel('仲介手数料');

    return { rent, mgmt, deposit, keyMoney, agencyText };
  }

  // ================================================================
  // 計算式:
  //   ((家賃+管理費)×24 + 敷金 + 礼金 + 家賃×1.0(仲介) + 家賃×0.5(保証)) ÷ 24
  // ================================================================
  function calcRealMonthlyCost({ rent, mgmt, deposit, keyMoney }) {
    const total =
      (rent + mgmt) * 24 +
      deposit +
      keyMoney +
      rent * 1.0 +
      rent * 0.5;
    return Math.round(total / 24);
  }

  function formatYen(amount) {
    return '¥' + amount.toLocaleString('ja-JP');
  }

  // ================================================================
  // ストレージ: 行動ログ (個人情報・物件特定情報は一切記録しない)
  // ================================================================
  function incrementStat(key) {
    chrome.storage.local.get([key], function (result) {
      const val = (result[key] || 0) + 1;
      chrome.storage.local.set({ [key]: val });
    });
  }

  // ================================================================
  // オーバーレイ生成
  // ================================================================
  function createOverlay(realCost, data) {
    if (document.getElementById('suumo-real-cost-overlay')) return;

    const FORMS_URL = 'https://forms.google.com/PLACEHOLDER'; // 後でURLを差し替えてください

    const overlay = document.createElement('div');
    overlay.id = 'suumo-real-cost-overlay';
    overlay.setAttribute('role', 'complementary');
    overlay.setAttribute('aria-label', '実質月額コスト');

    overlay.innerHTML = `
      <p class="src-label">実質月額</p>
      <p class="src-amount">${formatYen(realCost)}</p>
      <p class="src-detail">
        家賃 ${formatYen(data.rent)}
        ${data.mgmt > 0 ? ' ＋ 管理費 ' + formatYen(data.mgmt) : ''}
      </p>
      <p class="src-note">初期費用24ヶ月均等込み</p>
      <div class="src-buttons">
        <button class="src-btn src-good" title="参考になった" aria-label="参考になった">👍</button>
        <button class="src-btn src-bad"  title="参考にならなかった" aria-label="参考にならなかった">👎</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // ホバー計測
    overlay.addEventListener('mouseenter', function onHover() {
      incrementStat('hoverCount');
      overlay.removeEventListener('mouseenter', onHover); // 1ページ1カウント
    });

    // 👍 ボタン
    overlay.querySelector('.src-good').addEventListener('click', function () {
      incrementStat('goodCount');
      window.open(FORMS_URL + '?vote=good', '_blank', 'noopener,noreferrer');
    });

    // 👎 ボタン
    overlay.querySelector('.src-bad').addEventListener('click', function () {
      incrementStat('badCount');
      window.open(FORMS_URL + '?vote=bad', '_blank', 'noopener,noreferrer');
    });
  }

  // ================================================================
  // エントリポイント
  // ================================================================
  function main() {
    const data = extractData();
    if (!data) {
      console.log('[SUUMO実質月額] 物件情報を取得できませんでした。ページ構造を確認してください。');
      return;
    }
    const realCost = calcRealMonthlyCost(data);
    createOverlay(realCost, data);
    incrementStat('pageViewCount');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
