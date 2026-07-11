/* ============================================================
   Expense & Budget Visualizer — app.js
   TC-1: Vanilla HTML / CSS / JS — no frameworks, no backend
   TC-2: localStorage for all persistence (client-side only)
   TC-3: Compatible with Chrome, Firefox, Edge, Safari
   ============================================================ */

'use strict';

/* ── Constants ─────────────────────────────────────────────── */
const STORAGE_KEY            = 'ebv_transactions';
const STORAGE_KEY_CATEGORIES = 'ebv_custom_categories';
const PAGE_SIZE              = 50;

const DEFAULT_CATEGORIES = [
  { name: 'Food',          color: '#f97316' },
  { name: 'Transport',     color: '#3b82f6' },
  { name: 'Shopping',      color: '#a855f7' },
  { name: 'Health',        color: '#ec4899' },
  { name: 'Entertainment', color: '#14b8a6' },
  { name: 'Salary',        color: '#16a34a' },
  { name: 'Other',         color: '#9ca3af' },
];

const CUSTOM_PALETTE = [
  '#e11d48','#0891b2','#7c3aed','#d97706','#059669',
  '#db2777','#2563eb','#16a34a','#9333ea','#ea580c',
];

/* ── State ──────────────────────────────────────────────────── */
let transactions     = [];
let customCategories = [];
let visibleCount     = PAGE_SIZE;
let storageOk        = true;
let filterCategory   = '';
let filterFrom       = '';
let filterTo         = '';

// Monthly summary state — tracks which month is shown (YYYY-MM string)
let summaryMonth     = (function() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
})();

/* ── DOM refs ───────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const modalOverlay      = $('modal-overlay');
const modalMessage      = $('modal-message');
const modalConfirmBtn   = $('modal-confirm');
const modalCancelBtn    = $('modal-cancel');

const catModalOverlay   = $('cat-modal-overlay');
const catModalList      = $('cat-modal-list');
const catModalEmpty     = $('cat-modal-empty');
const btnManageCat      = $('btn-manage-categories');
const btnCloseCatModal  = $('btn-close-cat-modal');

const btnThemeToggle    = $('btn-theme-toggle');
const btnExport         = $('btn-export');
const inputImportFile   = $('input-import-file');

const balanceDisplay    = $('balance-display');
const summaryIncome     = $('summary-income');
const summaryExpense    = $('summary-expense');
const summaryNet        = $('summary-net');
const summaryEmpty      = $('summary-empty');
const summaryBarContainer = $('summary-bar-container');
const barIncome         = $('bar-income');
const barExpense        = $('bar-expense');
const monthLabel        = $('month-label');
const btnMonthPrev      = $('btn-month-prev');
const btnMonthNext      = $('btn-month-next');
const form              = $('transaction-form');
const inputAmount       = $('input-amount');
const inputType         = $('input-type');
const inputCategory     = $('input-category');
const inputDescription  = $('input-description');
const inputDate         = $('input-date');
const newCategoryRow    = $('new-category-row');
const inputNewCategory  = $('input-new-category');
const btnSaveCategory   = $('btn-save-category');
const btnCancelCategory = $('btn-cancel-category');
const txList            = $('transaction-list');
const listEmpty         = $('list-empty');
const btnLoadMore       = $('btn-load-more');
const btnClearAll       = $('btn-clear-all');
const btnClearFilters   = $('btn-clear-filters');
const filterCat         = $('filter-category');
const filterDateFrom    = $('filter-date-from');
const filterDateTo      = $('filter-date-to');
const chartCanvas       = $('expense-chart');
const chartLegend       = $('chart-legend');
const chartEmpty        = $('chart-empty');
const chartTooltip      = $('chart-tooltip');
const storageWarning    = $('storage-warning');

/* ── Local Storage ──────────────────────────────────────────── */

function testStorage() {
  try {
    localStorage.setItem('__ebv_test__', '1');
    localStorage.removeItem('__ebv_test__');
    return true;
  } catch (e) { return false; }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveToStorage() {
  if (!storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (e) {
    storageOk = false;
    storageWarning.classList.remove('hidden');
  }
}

function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveCustomCategories() {
  if (!storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(customCategories));
  } catch (e) { /* ignore */ }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_CATEGORIES);
  } catch (e) { /* ignore */ }
}

/* ── Category helpers ───────────────────────────────────────── */

function getAllCategories() {
  return [...DEFAULT_CATEGORIES, ...customCategories];
}

function getCategoryColor(name) {
  const found = getAllCategories().find(c => c.name === name);
  return found ? found.color : '#9ca3af';
}

function nextCustomColor() {
  return CUSTOM_PALETTE[customCategories.length % CUSTOM_PALETTE.length];
}

function rebuildCategoryDropdowns() {
  const all            = getAllCategories();
  const currentFormVal = inputCategory.value;

  inputCategory.innerHTML = '<option value="">-- Select category --</option>';
  all.forEach(cat => {
    const opt       = document.createElement('option');
    opt.value       = cat.name;
    opt.textContent = cat.name;
    inputCategory.appendChild(opt);
  });
  const addOpt       = document.createElement('option');
  addOpt.value       = '__add_new__';
  addOpt.textContent = '＋ Add custom category…';
  inputCategory.appendChild(addOpt);
  if (currentFormVal && currentFormVal !== '__add_new__') {
    inputCategory.value = currentFormVal;
  }

  const currentFilterVal = filterCat.value;
  filterCat.innerHTML = '<option value="">All categories</option>';
  all.forEach(cat => {
    const opt       = document.createElement('option');
    opt.value       = cat.name;
    opt.textContent = cat.name;
    filterCat.appendChild(opt);
  });
  if (currentFilterVal) filterCat.value = currentFilterVal;
}

/* ── Utilities ──────────────────────────────────────────────── */

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatCurrency(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/** Returns current month as "YYYY-MM". */
function todayYYYYMM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

/** Shifts a "YYYY-MM" string by delta months (+1 or -1). */
function shiftMonth(yyyymm, delta) {
  const [y, m] = yyyymm.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

/** Formats "YYYY-MM" as "July 2026". */
function formatYYYYMM(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Export / Import ────────────────────────────────────────── */

function exportData() {
  const backup   = { version: 1, exportedAt: new Date().toISOString(), transactions, customCategories };
  const blob     = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `ebv-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!Array.isArray(backup.transactions)) throw new Error('Invalid backup file.');
      const txCount  = backup.transactions.length;
      const catCount = Array.isArray(backup.customCategories) ? backup.customCategories.length : 0;
      const ok = await showConfirm(`Import ${txCount} transaction(s) and ${catCount} custom category(s) from "${file.name}"? This will REPLACE your current data.`);
      if (!ok) { inputImportFile.value = ''; return; }
      transactions     = backup.transactions;
      customCategories = Array.isArray(backup.customCategories) ? backup.customCategories : [];
      saveToStorage();
      saveCustomCategories();
      rebuildCategoryDropdowns();
      renderAll();
      showToast(`✅ Imported ${txCount} transaction(s) successfully.`);
    } catch (err) {
      showToast('❌ Failed to import: ' + err.message, true);
    }
    inputImportFile.value = '';
  };
  reader.readAsText(file);
}

/* ── Toast ──────────────────────────────────────────────────── */

function showToast(message, isError = false) {
  const toast     = document.createElement('div');
  toast.className = 'toast' + (isError ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/* ── Theme ──────────────────────────────────────────────────── */

function initTheme() {
  const saved     = localStorage.getItem('ebv_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(saved ? saved === 'dark' : prefersDark);
}

function toggleTheme() {
  setTheme(!document.documentElement.classList.contains('dark'));
}

function setTheme(dark) {
  if (dark) {
    document.documentElement.classList.add('dark');
    btnThemeToggle.textContent = '☀️';
    btnThemeToggle.setAttribute('aria-label', 'Switch to light mode');
    localStorage.setItem('ebv_theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    btnThemeToggle.textContent = '🌙';
    btnThemeToggle.setAttribute('aria-label', 'Switch to dark mode');
    localStorage.setItem('ebv_theme', 'light');
  }
}

/* ── Balance ────────────────────────────────────────────────── */

function calcBalance(txArray) {
  return txArray.reduce((sum, tx) => tx.type === 'income' ? sum + tx.amount : sum - tx.amount, 0);
}

function renderBalance() {
  const bal = calcBalance(transactions);
  balanceDisplay.textContent = formatCurrency(bal);
  balanceDisplay.className   = 'balance-amount';
  if (bal > 0)      balanceDisplay.classList.add('positive');
  else if (bal < 0) balanceDisplay.classList.add('negative');
  else              balanceDisplay.classList.add('neutral');
}

/* ── Filtering ──────────────────────────────────────────────── */

function getFilteredTransactions() {
  return transactions.filter(tx => {
    if (filterCategory && tx.category !== filterCategory) return false;
    if (filterFrom     && tx.date < filterFrom)           return false;
    if (filterTo       && tx.date > filterTo)             return false;
    return true;
  });
}

/* ── Transaction List ───────────────────────────────────────── */

function renderList() {
  const filtered = getFilteredTransactions();
  const slice    = filtered.slice(0, visibleCount);
  txList.innerHTML = '';

  if (filtered.length === 0) {
    listEmpty.classList.remove('hidden');
    btnLoadMore.classList.add('hidden');
    return;
  }
  listEmpty.classList.add('hidden');

  slice.forEach(tx => {
    const li      = document.createElement('li');
    li.className  = 'transaction-item';
    li.dataset.id = tx.id;
    const title   = tx.description || tx.category;
    const sign    = tx.type === 'income' ? '+' : '-';
    const color   = getCategoryColor(tx.category);
    li.innerHTML  = `
      <span class="tx-category-dot" style="background:${color}" title="${escapeHtml(tx.category)}"></span>
      <div class="tx-info">
        <span class="tx-title">${escapeHtml(title)}</span>
        <span class="tx-meta">${formatDate(tx.date)} &bull; ${escapeHtml(tx.category)} &bull; ${tx.type}</span>
      </div>
      <span class="tx-amount ${tx.type}">${sign}${formatCurrency(tx.amount)}</span>
      <button class="btn btn-icon" data-delete="${tx.id}" title="Delete" aria-label="Delete ${escapeHtml(title)}">🗑️</button>
    `;
    txList.appendChild(li);
  });

  btnLoadMore.classList.toggle('hidden', filtered.length <= visibleCount);
}

/* ── Chart ──────────────────────────────────────────────────── */

function getExpensesByCategory(txArray) {
  return txArray.reduce((map, tx) => {
    if (tx.type === 'expense') map[tx.category] = (map[tx.category] || 0) + tx.amount;
    return map;
  }, {});
}

function renderChart() {
  const filtered = getFilteredTransactions();
  const expenses = getExpensesByCategory(filtered);
  const keys     = Object.keys(expenses);
  const total    = keys.reduce((s, k) => s + expenses[k], 0);
  const ctx      = chartCanvas.getContext('2d');
  ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  chartLegend.innerHTML = '';

  if (total === 0) {
    chartCanvas.classList.add('hidden');
    chartLegend.classList.add('hidden');
    chartEmpty.classList.remove('hidden');
    return;
  }
  chartCanvas.classList.remove('hidden');
  chartLegend.classList.remove('hidden');
  chartEmpty.classList.add('hidden');

  const cx = chartCanvas.width / 2, cy = chartCanvas.height / 2;
  const r  = Math.min(cx, cy) - 10;
  let startAngle = -Math.PI / 2;
  chartCanvas._segments = [];

  keys.forEach(cat => {
    const slice    = expenses[cat] / total;
    const endAngle = startAngle + slice * 2 * Math.PI;
    const color    = getCategoryColor(cat);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle   = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.stroke();
    chartCanvas._segments.push({ cat, startAngle, endAngle, color, amount: expenses[cat], pct: slice });
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-color" style="background:${color}"></span><span>${escapeHtml(cat)}: ${formatCurrency(expenses[cat])}</span>`;
    chartLegend.appendChild(item);
    startAngle = endAngle;
  });
}

/* ── Chart tooltip ──────────────────────────────────────────── */

function getSegmentAtPoint(clientX, clientY) {
  const rect = chartCanvas.getBoundingClientRect();
  const cx   = chartCanvas.width / 2, cy = chartCanvas.height / 2;
  const r    = Math.min(cx, cy) - 10;
  const px   = (clientX - rect.left) * (chartCanvas.width  / rect.width)  - cx;
  const py   = (clientY - rect.top)  * (chartCanvas.height / rect.height) - cy;
  if (Math.sqrt(px*px + py*py) > r) return null;
  let angle  = Math.atan2(py, px);
  if (angle < -Math.PI / 2) angle += 2 * Math.PI;
  return (chartCanvas._segments || []).find(s => angle >= s.startAngle && angle < s.endAngle) || null;
}

function showTooltip(seg, cx, cy) {
  chartTooltip.innerHTML = `<strong>${escapeHtml(seg.cat)}</strong><br>${formatCurrency(seg.amount)}<br>${(seg.pct*100).toFixed(1)}% of expenses`;
  chartTooltip.classList.remove('hidden');
  const tw = chartTooltip.offsetWidth || 160, th = chartTooltip.offsetHeight || 64;
  let left = cx + 12, top = cy - th / 2;
  if (left + tw > window.innerWidth  - 8) left = cx - tw - 12;
  if (top  < 8)                           top  = 8;
  if (top  + th > window.innerHeight - 8) top  = window.innerHeight - th - 8;
  chartTooltip.style.left = left + 'px';
  chartTooltip.style.top  = top  + 'px';
}

function hideTooltip() { chartTooltip.classList.add('hidden'); }

/* ── Confirm modal ──────────────────────────────────────────── */

function showConfirm(message) {
  return new Promise(resolve => {
    modalMessage.textContent = message;
    modalOverlay.classList.remove('hidden');
    function cleanup() {
      modalOverlay.classList.add('hidden');
      modalConfirmBtn.removeEventListener('click', onConfirm);
      modalCancelBtn.removeEventListener('click', onCancel);
      modalOverlay.removeEventListener('click', onOverlay);
    }
    function onConfirm()  { cleanup(); resolve(true);  }
    function onCancel()   { cleanup(); resolve(false); }
    function onOverlay(e) { if (e.target === modalOverlay) { cleanup(); resolve(false); } }
    modalConfirmBtn.addEventListener('click', onConfirm);
    modalCancelBtn.addEventListener('click', onCancel);
    modalOverlay.addEventListener('click', onOverlay);
    modalConfirmBtn.focus();
  });
}

/* ── Form validation ────────────────────────────────────────── */

function clearErrors() {
  ['amount','type','category'].forEach(f => {
    $(`error-${f}`).textContent = '';
    $(`input-${f}`).classList.remove('invalid');
  });
}

function showError(field, msg) {
  $(`error-${field}`).textContent = msg;
  $(`input-${field}`).classList.add('invalid');
}

function validateForm() {
  clearErrors();
  let valid  = true;
  const amt  = parseFloat(inputAmount.value);
  if (!inputAmount.value || isNaN(amt) || amt <= 0) { showError('amount', 'Enter a valid amount greater than 0.'); valid = false; }
  if (!inputType.value)                              { showError('type',   'Please select a type.');                 valid = false; }
  if (!inputCategory.value || inputCategory.value === '__add_new__') { showError('category', 'Please select a category.'); valid = false; }
  return valid;
}

/* ── Add transaction ────────────────────────────────────────── */

function addTransaction(e) {
  e.preventDefault();
  if (!validateForm()) return;
  const tx = {
    id:          generateId(),
    amount:      parseFloat(parseFloat(inputAmount.value).toFixed(2)),
    type:        inputType.value,
    category:    inputCategory.value,
    description: inputDescription.value.trim(),
    date:        inputDate.value || todayISO(),
    createdAt:   Date.now(),
  };
  transactions.unshift(tx);
  saveToStorage();
  renderAll();
  form.reset();
  inputDate.value = todayISO();
  clearErrors();
  newCategoryRow.classList.add('hidden');
  inputNewCategory.value = '';
  inputAmount.focus();
}

/* ── Delete transaction ─────────────────────────────────────── */

async function deleteTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const ok = await showConfirm(`Delete "${tx.description || tx.category}"?`);
  if (!ok) return;
  transactions = transactions.filter(t => t.id !== id);
  saveToStorage();
  renderAll();
}

/* ── Clear all ──────────────────────────────────────────────── */

async function clearAllData() {
  const ok = await showConfirm('Delete ALL transactions and custom categories? This cannot be undone.');
  if (!ok) return;
  transactions = []; customCategories = []; visibleCount = PAGE_SIZE;
  clearStorage();
  rebuildCategoryDropdowns();
  renderAll();
}

/* ── Custom category inline input ───────────────────────────── */

function saveNewCategory() {
  const name = inputNewCategory.value.trim();
  if (!name) { inputNewCategory.focus(); return; }
  if (getAllCategories().some(c => c.name.toLowerCase() === name.toLowerCase())) {
    inputNewCategory.style.borderColor = 'var(--color-danger)';
    setTimeout(() => { inputNewCategory.style.borderColor = ''; }, 2000);
    inputNewCategory.focus();
    return;
  }
  customCategories.push({ name, color: nextCustomColor() });
  saveCustomCategories();
  rebuildCategoryDropdowns();
  inputCategory.value = name;
  newCategoryRow.classList.add('hidden');
  inputNewCategory.value = '';
}

/* ── Manage Categories modal ────────────────────────────────── */

function renderCatModal() {
  catModalList.innerHTML = '';
  if (customCategories.length === 0) {
    catModalEmpty.classList.remove('hidden');
    return;
  }
  catModalEmpty.classList.add('hidden');
  customCategories.forEach(cat => {
    const usageCount = transactions.filter(tx => tx.category === cat.name).length;
    const li = document.createElement('li');
    li.className = 'cat-modal-item';
    li.innerHTML = `
      <span class="cat-modal-dot" style="background:${cat.color}"></span>
      <span class="cat-modal-name">${escapeHtml(cat.name)}</span>
      <span class="cat-modal-usage">${usageCount} transaction${usageCount !== 1 ? 's' : ''}</span>
      <button class="btn btn-icon btn-icon-sm" data-delete-cat="${escapeHtml(cat.name)}" title="Delete" aria-label="Delete ${escapeHtml(cat.name)}">🗑️</button>
    `;
    catModalList.appendChild(li);
  });
}

function openCatModal()  { renderCatModal(); catModalOverlay.classList.remove('hidden'); btnCloseCatModal.focus(); }
function closeCatModal() { catModalOverlay.classList.add('hidden'); }

async function deleteCustomCategory(name) {
  const usageCount = transactions.filter(tx => tx.category === name).length;
  let msg = `Delete category "${name}"?`;
  if (usageCount > 0) msg += ` Used by ${usageCount} transaction(s) — they keep the label but it won't appear in the dropdown.`;
  const ok = await showConfirm(msg);
  if (!ok) return;
  customCategories = customCategories.filter(c => c.name !== name);
  saveCustomCategories();
  rebuildCategoryDropdowns();
  renderCatModal();
  renderAll();
}

/* ── Monthly Summary ────────────────────────────────────────── */

function renderSummary() {
  monthLabel.textContent = formatYYYYMM(summaryMonth);

  // Filter transactions to the selected month
  const monthTx = transactions.filter(tx => tx.date && tx.date.startsWith(summaryMonth));

  const totalIncome  = monthTx.filter(tx => tx.type === 'income') .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
  const net          = totalIncome - totalExpense;

  summaryIncome.textContent  = formatCurrency(totalIncome);
  summaryExpense.textContent = formatCurrency(totalExpense);
  summaryNet.textContent     = formatCurrency(net);

  // Net color
  summaryNet.className = 'summary-card-value';
  if (net > 0)      summaryNet.classList.add('positive');
  else if (net < 0) summaryNet.classList.add('negative');

  if (monthTx.length === 0) {
    summaryEmpty.classList.remove('hidden');
    summaryBarContainer.classList.add('hidden');
    return;
  }

  summaryEmpty.classList.add('hidden');
  summaryBarContainer.classList.remove('hidden');

  // Progress bars — relative to the larger of the two
  const maxVal = Math.max(totalIncome, totalExpense) || 1;
  barIncome.style.width  = (totalIncome  / maxVal * 100).toFixed(1) + '%';
  barExpense.style.width = (totalExpense / maxVal * 100).toFixed(1) + '%';

  // Disable next button if already on current month
  btnMonthNext.disabled = summaryMonth >= todayYYYYMM();
}



function renderAll() {
  renderBalance();
  renderSummary();
  renderList();
  renderChart();
}

/* ── Event listeners ────────────────────────────────────────── */

btnMonthPrev.addEventListener('click', () => { summaryMonth = shiftMonth(summaryMonth, -1); renderSummary(); });
btnMonthNext.addEventListener('click', () => { summaryMonth = shiftMonth(summaryMonth, +1); renderSummary(); });

btnThemeToggle.addEventListener('click', toggleTheme);
btnExport.addEventListener('click', exportData);
inputImportFile.addEventListener('change', e => importData(e.target.files[0]));

form.addEventListener('submit', addTransaction);
btnClearAll.addEventListener('click', clearAllData);

btnLoadMore.addEventListener('click', () => { visibleCount += PAGE_SIZE; renderList(); });

btnClearFilters.addEventListener('click', () => {
  filterCategory = ''; filterFrom = ''; filterTo = '';
  filterCat.value = ''; filterDateFrom.value = ''; filterDateTo.value = '';
  visibleCount = PAGE_SIZE;
  renderAll();
});

filterCat.addEventListener('change',      () => { filterCategory = filterCat.value;      visibleCount = PAGE_SIZE; renderAll(); });
filterDateFrom.addEventListener('change', () => { filterFrom     = filterDateFrom.value; visibleCount = PAGE_SIZE; renderAll(); });
filterDateTo.addEventListener('change',   () => { filterTo       = filterDateTo.value;   visibleCount = PAGE_SIZE; renderAll(); });

btnManageCat.addEventListener('click', openCatModal);
btnCloseCatModal.addEventListener('click', closeCatModal);
catModalOverlay.addEventListener('click', e => { if (e.target === catModalOverlay) closeCatModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !catModalOverlay.classList.contains('hidden')) closeCatModal(); });
catModalList.addEventListener('click', e => { const b = e.target.closest('[data-delete-cat]'); if (b) deleteCustomCategory(b.dataset.deleteCat); });

inputCategory.addEventListener('change', () => {
  if (inputCategory.value === '__add_new__') {
    newCategoryRow.classList.remove('hidden');
    inputNewCategory.value = '';
    inputNewCategory.focus();
  } else {
    newCategoryRow.classList.add('hidden');
    inputNewCategory.value = '';
  }
});

btnSaveCategory.addEventListener('click', saveNewCategory);
btnCancelCategory.addEventListener('click', () => {
  newCategoryRow.classList.add('hidden');
  inputNewCategory.value = '';
  inputCategory.value    = '';
});
inputNewCategory.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); saveNewCategory(); }
  if (e.key === 'Escape') { newCategoryRow.classList.add('hidden'); inputNewCategory.value = ''; inputCategory.value = ''; }
});

txList.addEventListener('click', e => { const b = e.target.closest('[data-delete]'); if (b) deleteTransaction(b.dataset.delete); });

chartCanvas.addEventListener('mousemove', e => { const s = getSegmentAtPoint(e.clientX, e.clientY); s ? showTooltip(s, e.clientX, e.clientY) : hideTooltip(); });
chartCanvas.addEventListener('mouseleave', hideTooltip);
chartCanvas.addEventListener('touchstart', e => {
  const t = e.touches[0], s = getSegmentAtPoint(t.clientX, t.clientY);
  if (s) { showTooltip(s, t.clientX, t.clientY); e.preventDefault(); }
}, { passive: false });
chartCanvas.addEventListener('touchend', hideTooltip);

/* ── Bootstrap ──────────────────────────────────────────────── */

(function init() {
  storageOk = testStorage();
  if (!storageOk) storageWarning.classList.remove('hidden');

  initTheme();

  transactions     = loadFromStorage();
  customCategories = loadCustomCategories();

  rebuildCategoryDropdowns();
  inputDate.value = todayISO();
  renderAll();
})();
