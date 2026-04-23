/* global chrome */
(function () {
  'use strict';

  function getValueFromLabeledSpan(labelPrefix) {
    const spans = document.querySelectorAll(
      '.property_view_note-list span, .property_view_note-info span'
    );
    for (const span of spans) {
      const text = span.textContent.trim();
      if (text.startsWith(labelPrefix)) {
        const colonIdx = text.indexOf(':');
        if (colonIdx !== -1) return text.slice(colonIdx + 1).trim();
      }
    }
    return null;
  }

  function getTextByThLabel(labelText) {
    for (const th of document.querySelectorAll('th')) {
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
    return null;
  }

  function getTextByDtLabel(labelText) {
    for (const dt of document.querySelectorAll('dt')) {
      if (dt.textContent.trim().includes(labelText)) {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') return dd.textContent.trim();
      }
    }
    return null;
  }

  function getTextByDivLabel(labelText) {
    const els = document.querySelectorAll(
      '[class*="property_data-title"],[class*="bukken_detail-title"],[class*="detail-title"]'
    );
    for (const el of els) {
      if (el.textContent.trim().includes(labelText)) {
        const body =
          el.nextElementSibling ||
          el.parentElement.querySelector('[class*="property_data-body"],[class*="detail-body"]');
        if (body) return body.textContent.trim();
      }
    }
    return null;
  }

  function parseAmount(text, rent) {
    if (!text) return 0;
    const t = text.trim().replace(/\s+/g, '');
    if (!t) return 0;
    if (/^[-－ー‐]$/.test(t)) return 0;
    if (/^(無し?|無料|なし|ナシ)$/.test(t)) return 0;
    const monthMatch = t.match(/^(\d+(?:\.\d+)?)ヶ月/);
    if (monthMatch) return Math.round(parseFloat(monthMatch[1]) * (rent || 0));
    const manMatch = t.match(/(\d+(?:\.\d+)?)万/);
    if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10000);
    const numMatch = t.replace(/円$/, '').match(/[\d,]+/);
    if (numMatch) return parseInt(numMatch[0].replace(/,/g, ''), 10);
    return 0;
  }

  function getFieldText(spanLabelPrefix, tableLabel) {
    const fromSpan = getValueFromLabeledSpan(spanLabelPrefix);
    if (fromSpan !== null) return fromSpan;
    return getTextByThLabel(tableLabel) || getTextByDtLabel(tableLabel) || getTextByDivLabel(tableLabel) || null;
  }

  function getRent() {
    const emphEl = document.querySelector('.property_view_note-emphasis');
    if (emphEl) {
      const v = parseAmount(emphEl.textContent);
      if (v > 0) return v;
    }
    for (const sel of ['.property_view_main-title', '.property_unit-price',
                        '[class*="price--main"]', '[class*="pricemain"]']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v = parseAmount(el.textContent);
      if (v > 0) return v;
    }
    for (const label of ['賃料', '家賃']) {
      const txt = getTextByThLabel(label) || getTextByDtLabel(label) || getTextByDivLabel(label);
      if (txt) { const v = parseAmount(txt); if (v > 0) return v; }
    }
    return 0;
  }

  function getPropertyName() {
    for (const sel of ['.section_h1-header-title', 'h1.property_view_main-title', 'h1']) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim().slice(0, 50);
    }
    return document.title.replace(/《SUUMO》/, '').split('／')[0].trim().slice(0, 50);
  }

  function extractData() {
    const rent = getRent();
    if (!rent) return null;
    return {
      rent,
      mgmt:     parseAmount(getFieldText('管理費', '管理費'), rent),
      deposit:  parseAmount(getFieldText('敷金', '敷金'), rent),
      keyMoney: parseAmount(getFieldText('礼金', '礼金'), rent),
      agencyText: getFieldText('仲介手数料', '仲介手数料'),
    };
  }

  function calcRealMonthlyCost({ rent, mgmt, deposit, keyMoney }) {
    const total = (rent + mgmt) * 24 + deposit + keyMoney + rent * 1.0 + rent * 0.5;
    return Math.round(total / 24);
  }

  function formatYen(amount) {
    return '¥' + amount.toLocaleString('ja-JP');
  }

  function incrementStat(key) {
    chrome.storage.local.get([key], function (result) {
      chrome.storage.local.set({ [key]: (result[key] || 0) + 1 });
    });
  }

  function saveToHistory(data, realCost) {
    const entry = {
      url:       location.href.split('?')[0],
      name:      getPropertyName(),
      rent:      data.rent,
      mgmt:      data.mgmt,
      deposit:   data.deposit,
      keyMoney:  data.keyMoney,
      realCost:  realCost,
      visitedAt: Date.now(),
    };
    chrome.storage.local.get(['propertyHistory'], function (result) {
      let history = (result.propertyHistory || []).filter(h => h.url !== entry.url);
      history.unshift(entry);
      if (history.length > 100) history.length = 100;
      chrome.storage.local.set({ propertyHistory: history });
    });
  }

  function createOverlay(realCost, data) {
    if (document.getElementById('suumo-real-cost-overlay')) return;

    const FORMS_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc2Id15Y_dls5Ds0krI6g9lFUS9qBL6EaqsSHsbXSHMP3t8WQ/viewform';

    const total2yr = (data.rent + data.mgmt) * 24
                   + data.deposit + data.keyMoney
                   + data.rent * 1.0 + data.rent * 0.5;

    const mgmtRow    = data.mgmt > 0
      ? `<tr><td>管理費</td><td>${formatYen(data.mgmt)}</td></tr>` : '';

    const overlay = document.createElement('div');
    overlay.id = 'suumo-real-cost-overlay';
    overlay.setAttribute('role', 'complementary');
    overlay.setAttribute('aria-label', '実質月額コスト');

    overlay.innerHTML = `
      <p class="src-label">実質月額</p>
      <p class="src-amount">${formatYen(realCost)}</p>
      <p class="src-rent-line">
        家賃 ${formatYen(data.rent)}${data.mgmt > 0 ? ' ＋ 管理費 ' + formatYen(data.mgmt) : ''}
      </p>
      <details class="src-breakdown-wrap">
        <summary>内訳を見る</summary>
        <table class="src-breakdown">
          <tr><td>家賃</td><td>${formatYen(data.rent)}</td></tr>
          ${mgmtRow}
          <tr class="src-br-sub"><td>月額計 × 24ヶ月</td><td>${formatYen((data.rent + data.mgmt) * 24)}</td></tr>
          <tr><td>敷金</td><td>${formatYen(data.deposit)}</td></tr>
          <tr><td>礼金</td><td>${formatYen(data.keyMoney)}</td></tr>
          <tr><td>仲介手数料（1ヶ月）</td><td>${formatYen(data.rent)}</td></tr>
          <tr><td>保証料（0.5ヶ月）</td><td>${formatYen(Math.round(data.rent * 0.5))}</td></tr>
          <tr class="src-br-total"><td>2年総額</td><td>${formatYen(total2yr)}</td></tr>
          <tr class="src-br-result"><td>÷ 24ヶ月</td><td>${formatYen(realCost)}</td></tr>
        </table>
      </details>
      <p class="src-note">初期費用24ヶ月均等込み</p>
      <div class="src-buttons">
        <button class="src-btn src-good" title="参考になった" aria-label="参考になった">👍</button>
        <button class="src-btn src-bad"  title="参考にならなかった" aria-label="参考にならなかった">👎</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('mouseenter', function onHover() {
      incrementStat('hoverCount');
      overlay.removeEventListener('mouseenter', onHover);
    });

    overlay.querySelector('.src-good').addEventListener('click', function () {
      incrementStat('goodCount');
      window.open(FORMS_URL + '?vote=good', '_blank', 'noopener,noreferrer');
    });
    overlay.querySelector('.src-bad').addEventListener('click', function () {
      incrementStat('badCount');
      window.open(FORMS_URL + '?vote=bad', '_blank', 'noopener,noreferrer');
    });
  }

  function main() {
    const data = extractData();
    if (!data) {
      console.log('[SUUMO実質月額] 物件情報を取得できませんでした。');
      return;
    }
    const realCost = calcRealMonthlyCost(data);
    createOverlay(realCost, data);
    saveToHistory(data, realCost);
    incrementStat('pageViewCount');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
