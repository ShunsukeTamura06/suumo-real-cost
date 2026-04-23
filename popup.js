/* global chrome */
'use strict';

let currentSort = 'visitedAt';
let sortAsc = false;

function formatYen(amount) {
  return '¥' + Number(amount).toLocaleString('ja-JP');
}

function formatDate(ts) {
  const d = new Date(ts);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

function renderList(history) {
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');

  if (!history || history.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const sorted = [...history].sort((a, b) => {
    const va = a[currentSort] || 0;
    const vb = b[currentSort] || 0;
    return sortAsc ? va - vb : vb - va;
  });

  listEl.innerHTML = sorted.map(item => {
    const diff = item.realCost - item.rent;
    return `
      <div class="property-card" data-url="${item.url}">
        <div class="property-header">
          <span class="property-name" title="${item.name || ''}">${item.name || '物件'}</span>
          <span class="property-date">${formatDate(item.visitedAt)}</span>
        </div>
        <div class="property-costs">
          <div class="cost-item">
            <span class="cost-label">家賃</span>
            <span class="cost-value">${formatYen(item.rent)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-label">実質月額</span>
            <span class="cost-value real">${formatYen(item.realCost)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-label">差額</span>
            <span class="cost-value diff">+${formatYen(diff)}</span>
          </div>
        </div>
        <button class="delete-btn" data-url="${item.url}" title="削除">✕</button>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.property-card').forEach(card => {
    card.addEventListener('click', function (e) {
      if (e.target.classList.contains('delete-btn')) return;
      chrome.tabs.create({ url: this.dataset.url });
    });
  });

  listEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteEntry(this.dataset.url);
    });
  });
}

function deleteEntry(url) {
  chrome.storage.local.get(['propertyHistory'], function (result) {
    const history = (result.propertyHistory || []).filter(h => h.url !== url);
    chrome.storage.local.set({ propertyHistory: history }, () => renderList(history));
  });
}

function loadAndRender() {
  chrome.storage.local.get(
    ['propertyHistory', 'pageViewCount', 'goodCount', 'badCount'],
    function (result) {
      renderList(result.propertyHistory || []);
      const views = result.pageViewCount || 0;
      const goods = result.goodCount || 0;
      const bads  = result.badCount  || 0;
      const count = (result.propertyHistory || []).length;
      document.getElementById('stats').textContent =
        `${count}件保存 ／ 閲覧 ${views}回 ／ 👍${goods} 👎${bads}`;
    }
  );
}

document.addEventListener('DOMContentLoaded', function () {
  loadAndRender();

  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      if (currentSort === this.dataset.sort) {
        sortAsc = !sortAsc;
      } else {
        currentSort = this.dataset.sort;
        sortAsc = false;
      }
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      chrome.storage.local.get(['propertyHistory'], r => renderList(r.propertyHistory || []));
    });
  });

  document.getElementById('clearAll').addEventListener('click', function () {
    if (!confirm('閲覧履歴を全件削除しますか？')) return;
    chrome.storage.local.set({ propertyHistory: [] }, () => loadAndRender());
  });
});
