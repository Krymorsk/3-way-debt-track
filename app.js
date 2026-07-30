import { requireAuth, logoutUser } from "./auth.js";
const currentUser = await requireAuth();
import { firebaseConfig } from './firebase.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

/* =========================================================
   Shared constants and app state
========================================================= */
const PEOPLE = ['Arish', 'Ayman', 'Vishist'];
const STORAGE_KEY = 'splitwise-trio-local-v2';
const RESET_KEY = 'splitwise-trio-reset-at-v2';
const THEME_KEY = 'splitwise-trio-theme-v2';
const FAVORITES_KEY = 'splitwise-trio-favorites-v2';
const LAST_SUBMIT_KEY = 'splitwise-trio-last-submit-v2';

const DEFAULT_FAVORITES = ['Lunch', 'Tea', 'Fuel', 'Groceries', 'Movie tickets', 'Cab ride'];

const state = {
  transactions: [],
  filteredTransactions: [],
  loading: true,
  backendReady: false,
  theme: localStorage.getItem(THEME_KEY) || 'dark',
  balanceResetAt: Number(localStorage.getItem(RESET_KEY) || 0) || 0,
  favorites: JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null') || DEFAULT_FAVORITES,
  charts: {},
  activeView: 'dashboard',
  lastDeleted: null,
  editingId: null,
  filters: {
    search: '',
    person: 'all',
    type: 'all',
    date: '',
    month: '',
    sort: 'newest'
  }
};

let app = null;
let db = null;
let unsubscribe = null;
let lastToastId = 0;
let lastSubmitHash = '';
let lastSubmitAt = 0;
let confirmResolver = null;

const els = {
  toastRoot: document.getElementById('toastRoot'),
  settingsShortcut: document.getElementById('settingsShortcut'),
  statsGrid: document.getElementById('statsGrid'),
  summaryBadge: document.getElementById('summaryBadge'),
  friendsGrid: document.getElementById('friendsGrid'),
  settlementsSection: document.getElementById('settlementsSection'),
  recentActivity: document.getElementById('recentActivity'),
  historyList: document.getElementById('historyList'),
  quickTemplateChips: document.getElementById('quickTemplateChips'),
  quickExpenseBtn: document.getElementById('quickExpenseBtn'),
  quickBorrowBtn: document.getElementById('quickBorrowBtn'),
  quickRepayBtn: document.getElementById('quickRepayBtn'),
  openHistoryBtn: document.getElementById('openHistoryBtn'),
  searchInput: document.getElementById('searchInput'),
  personFilter: document.getElementById('personFilter'),
  typeFilter: document.getElementById('typeFilter'),
  dateFilter: document.getElementById('dateFilter'),
  monthFilter: document.getElementById('monthFilter'),
  sortFilter: document.getElementById('sortFilter'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  importJsonBtn: document.getElementById('importJsonBtn'),
  resetBalancesBtn: document.getElementById('resetBalancesBtn'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  importFileInput: document.getElementById('importFileInput'),
  fab: document.getElementById('fab'),
  mobileAddBtn: document.getElementById('mobileAddBtn'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalEyebrow: document.getElementById('modalEyebrow'),
  modalTitle: document.getElementById('modalTitle'),
  transactionForm: document.getElementById('transactionForm'),
  transactionId: document.getElementById('transactionId'),
  amountInput: document.getElementById('amountInput'),
  descriptionInput: document.getElementById('descriptionInput'),
  paidByInput: document.getElementById('paidByInput'),
  typeInput: document.getElementById('typeInput'),
  splitField: document.getElementById('splitField'),
  splitCheckGroup: document.getElementById('splitCheckGroup'),
  selectAllSplitBtn: document.getElementById('selectAllSplitBtn'),
  debtField: document.getElementById('debtField'),
  lenderInput: document.getElementById('lenderInput'),
  borrowerInput: document.getElementById('borrowerInput'),
  notesInput: document.getElementById('notesInput'),
  dateInput: document.getElementById('dateInput'),
  timeInput: document.getElementById('timeInput'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  saveBtn: document.getElementById('saveBtn'),
  confirmDialog: document.getElementById('confirmDialog'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmOkBtn: document.getElementById('confirmOkBtn')
};

/* =========================================================
   Formatting helpers
========================================================= */
function money(value) {
  const amount = Number(value || 0);
  const decimals = Math.abs(amount) % 1 ? 2 : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2
  }).format(amount);
}

function moneySigned(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) < 0.005) return money(0);
  return amount > 0 ? `+${money(amount)}` : `-${money(Math.abs(amount))}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(`2000-01-01T${value}:00`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(d);
}

function formatDateTime(tx) {
  const d = new Date(`${tx.date}T${tx.time || '00:00'}:00`);
  if (Number.isNaN(d.getTime())) return `${tx.date} ${tx.time || ''}`.trim();
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function uid() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowParts() {
  const d = new Date();
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toTimeString().slice(0, 5)
  };
}

function toast(title, message, type = 'success', actions = []) {
  const id = ++lastToastId;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.dataset.id = String(id);
  node.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(message)}</p>
    ${actions.length ? '<div class="toast-actions"></div>' : ''}
  `;
  if (actions.length) {
    const wrap = node.querySelector('.toast-actions');
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => action.onClick?.());
      wrap.appendChild(btn);
    });
  }
  els.toastRoot.appendChild(node);
  setTimeout(() => {
    const el = els.toastRoot.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(10px)';
    el.style.transition = 'all .22s ease';
    setTimeout(() => el.remove(), 240);
  }, 3000);
}

function confirmAction(title, message) {
  return new Promise(resolve => {
    confirmResolver = resolve;
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmDialog.classList.remove('hidden');
    els.confirmDialog.setAttribute('aria-hidden', 'false');
  });
}

function closeConfirm(result = false) {
  els.confirmDialog.classList.add('hidden');
  els.confirmDialog.setAttribute('aria-hidden', 'true');
  if (confirmResolver) confirmResolver(result);
  confirmResolver = null;
}

/* =========================================================
   Local storage helpers
========================================================= */
function readLocalTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalTransactions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function saveResetPoint(value) {
  localStorage.setItem(RESET_KEY, String(value || 0));
}

/* =========================================================
   Theme and navigation
========================================================= */
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  saveTheme(theme);
  document.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  updateChartsTheme();
}

function showView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(section => {
    section.classList.toggle('active', section.id === `${view}View`);
  });
  document.querySelectorAll('.nav-link, .mobile-nav-btn').forEach(btn => {
    if (btn.dataset.view) btn.classList.toggle('active', btn.dataset.view === view);
  });
  if (view === 'analytics') {
    requestAnimationFrame(renderCharts);
  }
}

/* =========================================================
   Modal and form controls
========================================================= */
function renderPeopleOptions() {
  const options = PEOPLE.map(p => `<option value="${p}">${p}</option>`).join('');
  els.paidByInput.innerHTML = options;
  els.lenderInput.innerHTML = options;
  els.borrowerInput.innerHTML = options;
}

function renderSplitChecks(selected = PEOPLE) {
  els.splitCheckGroup.innerHTML = PEOPLE.map(name => `
    <label class="check-item">
      <input type="checkbox" value="${name}" ${selected.includes(name) ? 'checked' : ''} />
      <span>${name}</span>
    </label>
  `).join('');
}

function setDefaultDateTime() {
  const { date, time } = nowParts();
  els.dateInput.value = date;
  els.timeInput.value = time;
}

function toggleDebtFields() {
  const type = els.typeInput.value;
  const isDebt = type === 'borrow' || type === 'repayment';
  els.splitField.classList.toggle('hidden', isDebt);
  els.debtField.classList.toggle('hidden', !isDebt);
}

function openModal(mode = 'create', preset = {}) {
  const now = nowParts();
  state.editingId = mode === 'edit' && preset.id ? preset.id : null;
  els.modalEyebrow.textContent = mode === 'edit' ? 'Edit transaction' : 'Add transaction';
  els.modalTitle.textContent = mode === 'edit' ? 'Update transaction' : 'Record a new transaction';
  els.saveBtn.textContent = mode === 'edit' ? 'Update transaction' : 'Save transaction';

  els.transactionForm.reset();
  els.transactionId.value = preset.id || '';
  els.amountInput.value = preset.amount ?? '';
  els.descriptionInput.value = preset.description ?? '';
  els.paidByInput.value = preset.paidBy || PEOPLE[0];
  els.typeInput.value = preset.transactionType || 'expense';
  els.notesInput.value = preset.notes || '';
  els.lenderInput.value = preset.lender || PEOPLE[0];
  els.borrowerInput.value = preset.borrower || PEOPLE[1];
  els.dateInput.value = preset.date || now.date;
  els.timeInput.value = preset.time || now.time;
  renderSplitChecks(preset.splitBetween?.length ? preset.splitBetween : PEOPLE);
  toggleDebtFields();
  els.modalOverlay.classList.remove('hidden');
  els.modalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => els.amountInput.focus());
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  els.modalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.editingId = null;
}

function getSplitBetween() {
  return Array.from(els.splitCheckGroup.querySelectorAll('input[type="checkbox"]'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
}

function buildFingerprint(payload) {
  return [
    payload.amount,
    payload.description.trim().toLowerCase(),
    payload.paidBy,
    payload.transactionType,
    payload.lender || '',
    payload.borrower || '',
    (payload.splitBetween || []).join(','),
    payload.date,
    payload.time
  ].join('|');
}

function isRapidDuplicate(payload) {
  const hash = buildFingerprint(payload);
  const now = Date.now();
  if (hash === lastSubmitHash && now - lastSubmitAt < 4500) return true;
  lastSubmitHash = hash;
  lastSubmitAt = now;
  localStorage.setItem(LAST_SUBMIT_KEY, JSON.stringify({ hash, at: now }));
  return false;
}

function validateTransaction(tx) {
  if (!Number.isFinite(tx.amount) || tx.amount <= 0) return 'Amount must be greater than zero.';
  if (!tx.description.trim()) return 'Description is required.';
  if (!PEOPLE.includes(tx.paidBy)) return 'Choose a valid paid-by person.';
  if (!['expense', 'borrow', 'repayment'].includes(tx.transactionType)) return 'Choose a valid transaction type.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) return 'Date is invalid.';
  if (!/^\d{2}:\d{2}$/.test(tx.time)) return 'Time is invalid.';

  if (tx.transactionType === 'expense') {
    if (!Array.isArray(tx.splitBetween) || tx.splitBetween.length === 0) return 'Pick at least one split participant.';
    if (tx.splitBetween.some(name => !PEOPLE.includes(name))) return 'Split list contains an invalid name.';
  }

  if (tx.transactionType === 'borrow' || tx.transactionType === 'repayment') {
    if (!PEOPLE.includes(tx.lender) || !PEOPLE.includes(tx.borrower)) return 'Choose valid lender and borrower.';
    if (tx.lender === tx.borrower) return 'Lender and borrower must be different people.';
  }

  return null;
}

/* =========================================================
   Firestore / local data layer
========================================================= */
function normalizeTx(tx) {
  return {
    id: tx.id || uid(),
    amount: Number(tx.amount) || 0,
    description: String(tx.description || '').trim(),
    paidBy: tx.paidBy || PEOPLE[0],
    splitBetween: Array.isArray(tx.splitBetween) ? tx.splitBetween.filter(name => PEOPLE.includes(name)) : [],
    transactionType: tx.transactionType || 'expense',
    lender: tx.lender || '',
    borrower: tx.borrower || '',
    notes: String(tx.notes || '').trim(),
    date: tx.date || nowParts().date,
    time: tx.time || nowParts().time,
    createdAt: Number(tx.createdAt || Date.now()),
    updatedAt: Number(tx.updatedAt || tx.createdAt || Date.now())
  };
}

function normalizeDoc(docSnap) {
  const data = docSnap.data();
  return normalizeTx({ id: docSnap.id, ...data });
}

function loadLocalSeed() {
  state.transactions = readLocalTransactions().map(normalizeTx);
  state.loading = false;
  renderAll();
}

async function initFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    state.backendReady = false;
    loadLocalSeed();
    toast('Local mode', 'Firebase config is still a placeholder, so the app is using browser storage for now.', 'warning');
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    state.backendReady = true;
    try {
      await enableIndexedDbPersistence(db);
    } catch (error) {
      console.warn('Offline persistence unavailable:', error?.message || error);
    }

    const txQuery = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(txQuery, snapshot => {
      state.transactions = snapshot.docs.map(normalizeDoc);
      state.loading = false;
      renderAll();
    }, error => {
      console.error(error);
      state.loading = false;
      toast('Sync issue', 'Firestore could not be read. Check the config or network.', 'error');
      renderAll();
    });
  } catch (error) {
    console.error(error);
    state.backendReady = false;
    loadLocalSeed();
    toast('Fallback enabled', 'Firestore could not be initialized, so local storage is being used.', 'warning');
  }
}

async function saveTransaction(payload) {
  if (isRapidDuplicate(payload)) {
    toast('Duplicate blocked', 'That looks like a rapid repeat submission.', 'warning');
    return;
  }

  const tx = normalizeTx(payload);
  const existing = tx.id ? state.transactions.find(item => item.id === tx.id) : null;
  tx.createdAt = existing?.createdAt || tx.createdAt || Date.now();
  tx.updatedAt = Date.now();

  if (!state.backendReady) {
    const list = [tx, ...state.transactions.filter(item => item.id !== tx.id)];
    state.transactions = list;
    writeLocalTransactions(list);
    state.loading = false;
    renderAll();
    toast(existing ? 'Transaction updated' : 'Transaction saved', 'Your record has been stored successfully.', 'success');
    return;
  }

  const ref = doc(db, 'transactions', tx.id);
  const data = { ...tx };
  if (existing) {
    await updateDoc(ref, data);
    toast('Transaction updated', 'The record has been saved.', 'success');
  } else {
    await setDoc(ref, data);
    toast('Transaction saved', 'The record has been added successfully.', 'success');
  }
}

async function deleteTransaction(tx) {
  const ok = await confirmAction('Delete transaction?', 'This will permanently remove the record.');
  if (!ok) return;

  state.lastDeleted = tx;
  if (!state.backendReady) {
    state.transactions = state.transactions.filter(item => item.id !== tx.id);
    writeLocalTransactions(state.transactions);
    renderAll();
  } else {
    await deleteDoc(doc(db, 'transactions', tx.id));
  }

  toast('Deleted', 'Transaction removed. Undo is available right now.', 'warning', [
    { label: 'Undo', onClick: () => undoDelete() }
  ]);
}

async function undoDelete() {
  const tx = state.lastDeleted;
  if (!tx) return;
  if (!state.backendReady) {
    state.transactions = [tx, ...state.transactions.filter(item => item.id !== tx.id)];
    writeLocalTransactions(state.transactions);
    renderAll();
  } else {
    await setDoc(doc(db, 'transactions', tx.id), normalizeTx(tx));
  }
  state.lastDeleted = null;
  toast('Restored', 'The deleted transaction was restored.', 'success');
}

/* =========================================================
   Calculation engine
========================================================= */
function activeTransactions() {
  const cutoff = state.balanceResetAt || 0;
  return state.transactions.filter(tx => (tx.createdAt || 0) >= cutoff);
}

function txTimestamp(tx) {
  const stamp = new Date(`${tx.date}T${tx.time || '00:00'}:00`).getTime();
  return Number.isNaN(stamp) ? (tx.createdAt || 0) : stamp;
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function computeSummary(transactions) {
  const result = Object.fromEntries(PEOPLE.map(name => [name, {
    balance: 0,
    given: 0,
    taken: 0,
    count: 0
  }]));

  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0;
    if (!amount) continue;

    if (tx.transactionType === 'expense') {
      const split = tx.splitBetween?.length ? [...new Set(tx.splitBetween)].filter(name => PEOPLE.includes(name)) : PEOPLE;
      const share = round(amount / split.length);
      result[tx.paidBy].given += amount;
      result[tx.paidBy].balance += amount;
      result[tx.paidBy].count += 1;
      split.forEach(name => {
        result[name].taken += share;
        result[name].balance -= share;
        result[name].count += 1;
      });
    } else if (tx.transactionType === 'borrow') {
      result[tx.lender].given += amount;
      result[tx.lender].balance += amount;
      result[tx.lender].count += 1;
      result[tx.borrower].taken += amount;
      result[tx.borrower].balance -= amount;
      result[tx.borrower].count += 1;
    } else if (tx.transactionType === 'repayment') {
      result[tx.borrower].given += amount;
      result[tx.borrower].balance -= amount;
      result[tx.borrower].count += 1;
      result[tx.lender].taken += amount;
      result[tx.lender].balance += amount;
      result[tx.lender].count += 1;
    }
  }

  PEOPLE.forEach(name => {
    result[name].balance = round(result[name].balance);
    result[name].given = round(result[name].given);
    result[name].taken = round(result[name].taken);
  });

  return result;
}

function computeSettlements(summary) {
  const debtors = [];
  const creditors = [];

  PEOPLE.forEach(name => {
    const balance = round(summary[name].balance);
    if (balance < -0.01) debtors.push({ name, amount: Math.abs(balance) });
    if (balance > 0.01) creditors.push({ name, amount: balance });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round(Math.min(debtor.amount, creditor.amount));
    if (amount > 0) {
      pairs.push({ from: debtor.name, to: creditor.name, amount });
      debtor.amount = round(debtor.amount - amount);
      creditor.amount = round(creditor.amount - amount);
    }
    if (debtor.amount <= 0.01) i += 1;
    if (creditor.amount <= 0.01) j += 1;
  }

  return pairs;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function applyFilters(list) {
  const { search, person, type, date, month, sort } = state.filters;
  const q = String(search || '').trim().toLowerCase();
  let filtered = [...list];

  if (q) {
    filtered = filtered.filter(tx => {
      const haystack = [
        tx.description,
        tx.notes,
        tx.paidBy,
        tx.lender,
        tx.borrower,
        tx.transactionType,
        tx.amount,
        ...(tx.splitBetween || [])
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  if (person !== 'all') {
    filtered = filtered.filter(tx => {
      if (tx.transactionType === 'expense') return tx.paidBy === person || (tx.splitBetween || []).includes(person);
      if (tx.transactionType === 'borrow') return tx.lender === person || tx.borrower === person;
      if (tx.transactionType === 'repayment') return tx.lender === person || tx.borrower === person;
      return false;
    });
  }

  if (type !== 'all') filtered = filtered.filter(tx => tx.transactionType === type);
  if (date) filtered = filtered.filter(tx => tx.date === date);
  if (month) filtered = filtered.filter(tx => tx.date.startsWith(month));

  filtered.sort((a, b) => {
    if (sort === 'oldest') return txTimestamp(a) - txTimestamp(b);
    if (sort === 'highest') return (b.amount || 0) - (a.amount || 0);
    if (sort === 'lowest') return (a.amount || 0) - (b.amount || 0);
    return txTimestamp(b) - txTimestamp(a);
  });

  return filtered;
}

/* =========================================================
   Rendering
========================================================= */
function renderSkeletonStats() {
  els.statsGrid.innerHTML = Array.from({ length: 4 }).map(() => `
    <article class="stat-card glass skeleton">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line long"></div>
    </article>
  `).join('');
}

function animateNumber(el, target, formatter) {
  const duration = 520;
  const start = Number(el.dataset.value || 0);
  const begin = performance.now();
  const tick = now => {
    const progress = Math.min((now - begin) / duration, 1);
    const value = start + (target - start) * (1 - Math.pow(1 - progress, 3));
    el.textContent = formatter(value);
    if (progress < 1) requestAnimationFrame(tick);
    else el.dataset.value = String(target);
  };
  requestAnimationFrame(tick);
}

function renderStats(summary, transactions) {
  const today = getTodayKey();
  const total = transactions.length;
  const totalMoney = transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const pending = computeSettlements(summary).length;
  const todays = transactions.filter(tx => tx.date === today).length;

  const cards = [
    { label: 'Total transactions', value: total, sub: `${pending} pending settlements` },
    { label: 'Total money recorded', value: totalMoney, sub: 'All recorded amounts' },
    { label: 'Pending settlements', value: pending, sub: 'Automatic settlement pairs' },
    { label: 'Today’s transactions', value: todays, sub: 'Transactions added today' }
  ];

  els.statsGrid.innerHTML = cards.map((card, index) => `
    <article class="stat-card glass">
      <div class="stat-dot"></div>
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="stat-value" data-stat="${index}" data-value="0">0</div>
      <div class="stat-sub">${escapeHtml(card.sub)}</div>
    </article>
  `).join('');

  const valueEls = [...els.statsGrid.querySelectorAll('.stat-value')];
  animateNumber(valueEls[0], total, v => String(Math.round(v)));
  animateNumber(valueEls[1], totalMoney, v => money(v));
  animateNumber(valueEls[2], pending, v => String(Math.round(v)));
  animateNumber(valueEls[3], todays, v => String(Math.round(v)));
}

function friendStatus(balance) {
  if (balance > 0.01) return { label: `You should receive ${money(balance)}`, cls: 'good', dot: 'good' };
  if (balance < -0.01) return { label: `You owe ${money(Math.abs(balance))}`, cls: 'bad', dot: 'bad' };
  return { label: 'Settled up', cls: 'neutral', dot: 'neutral' };
}

function renderFriends(summary) {
  els.friendsGrid.innerHTML = PEOPLE.map((name, index) => {
    const data = summary[name];
    const status = friendStatus(data.balance);
    const accentGradient = `linear-gradient(135deg, ${['#6ea8ff','#48d597','#f4c76f'][index]}, ${['#7c5cff','#2e8cff','#7c5cff'][index]})`;
    return `
      <article class="friend-card glass">
        <div class="friend-head">
          <div class="avatar" style="background:${accentGradient}">${initials(name)}</div>
          <div>
            <div class="friend-name">${escapeHtml(name)}</div>
            <div class="friend-meta">Balance overview</div>
          </div>
        </div>

        <div class="balance-block">
          <div class="balance-value">${money(data.balance)}</div>
          <div class="balance-status ${status.cls}">${escapeHtml(status.label)}</div>
        </div>

        <div class="friend-stats">
          <div class="mini-stat"><span>Money given</span><strong>${money(data.given)}</strong></div>
          <div class="mini-stat"><span>Money taken</span><strong>${money(data.taken)}</strong></div>
          <div class="mini-stat"><span>Transactions</span><strong>${Math.round(data.count)}</strong></div>
          <div class="mini-stat"><span>Status</span><strong>${status.cls === 'neutral' ? 'Settled' : status.cls === 'good' ? 'Receivable' : 'Payable'}</strong></div>
        </div>

        <div class="friend-foot">
          <span class="pulse ${status.dot}"></span>
          <span>${status.label}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderSettlements(summary) {
  const pairs = computeSettlements(summary);
  if (!pairs.length) {
    els.settlementsSection.innerHTML = '<div class="empty-state">Everyone is settled up right now ✨</div>';
    return;
  }

  els.settlementsSection.innerHTML = pairs.map(pair => `
    <div class="settlement-row">
      <div class="settlement-side">
        <div class="settlement-name">${escapeHtml(pair.from)}</div>
        <div class="settlement-label">owes</div>
      </div>
      <div class="settlement-core">
        <div class="settlement-arrow">→</div>
        <div class="settlement-amount">${money(pair.amount)}</div>
      </div>
      <div class="settlement-side right">
        <div class="settlement-name">${escapeHtml(pair.to)}</div>
        <div class="settlement-label">receives</div>
      </div>
    </div>
  `).join('');
}

function txTypeLabel(type) {
  return type === 'borrow' ? 'Borrow' : type === 'repayment' ? 'Repayment' : 'Expense';
}

function txIcon(type) {
  if (type === 'borrow') return '↗';
  if (type === 'repayment') return '↺';
  return '•';
}

function splitSummary(tx) {
  if (tx.transactionType === 'expense') {
    return `Split between ${tx.splitBetween?.join(', ') || PEOPLE.join(', ')}.`;
  }
  return `Lender: ${tx.lender}. Borrower: ${tx.borrower}.`;
}

function renderTransactionCard(tx, { compact = false } = {}) {
  const tagClass = `type-${tx.transactionType}`;
  const details = compact ? '' : `
    <div class="tx-details">
      <div>${escapeHtml(splitSummary(tx))}</div>
      ${tx.notes ? `<div><strong>Notes:</strong> ${escapeHtml(tx.notes)}</div>` : ''}
      <div>${escapeHtml(formatDate(tx.date))} · ${escapeHtml(formatTime(tx.time))}</div>
    </div>
  `;

  return `
    <article class="transaction-card glass">
      <div class="transaction-top">
        <div class="tx-title">
          <div class="tx-icon">${txIcon(tx.transactionType)}</div>
          <div>
            <div class="tx-name">${escapeHtml(tx.description)}</div>
            <div class="tx-meta">Paid by ${escapeHtml(tx.paidBy)} · ${escapeHtml(formatDateTime(tx))}</div>
          </div>
        </div>
        <div class="tx-amount">${money(tx.amount)}</div>
      </div>

      <div class="badge-row">
        <span class="tag ${tagClass}">${txTypeLabel(tx.transactionType)}</span>
        <span class="tag">${escapeHtml(tx.transactionType === 'expense' ? `Split ${tx.splitBetween?.length || PEOPLE.length}` : `${tx.lender} → ${tx.borrower}`)}</span>
      </div>

      ${details}

      <div class="tx-actions">
        <button class="action-chip" data-action="edit" data-id="${tx.id}">Edit</button>
        <button class="action-chip danger" data-action="delete" data-id="${tx.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderHistory(list, root) {
  if (!list.length) {
    root.innerHTML = '<div class="empty-state">No transactions yet. Add your first one with the floating button ✨</div>';
    return;
  }
  root.innerHTML = list.map(tx => renderTransactionCard(tx)).join('');
}

function renderFavorites() {
  els.quickTemplateChips.innerHTML = state.favorites.map(label => `
    <button class="quick-chip" type="button" data-template="${escapeHtml(label)}">${escapeHtml(label)}</button>
  `).join('');
}

function renderLoading() {
  renderSkeletonStats();
  els.friendsGrid.innerHTML = ['Arish', 'Ayman', 'Vishist'].map(name => `
    <article class="friend-card glass skeleton" style="min-height:280px">
      <div class="friend-head">
        <div class="avatar">${initials(name)}</div>
        <div>
          <div class="friend-name">${escapeHtml(name)}</div>
          <div class="friend-meta">Loading…</div>
        </div>
      </div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line long"></div>
    </article>
  `).join('');
  els.settlementsSection.innerHTML = '<div class="empty-state">Loading settlements…</div>';
  els.recentActivity.innerHTML = '<div class="empty-state">Loading recent activity…</div>';
  els.historyList.innerHTML = '<div class="empty-state">Loading history…</div>';
}

function renderCharts() {
  if (typeof window.Chart === 'undefined') return;
  const list = activeTransactions();
  const expenseTx = list.filter(tx => tx.transactionType === 'expense');
  const borrowTx = list.filter(tx => tx.transactionType === 'borrow');
  const repaymentTx = list.filter(tx => tx.transactionType === 'repayment');

  const months = [];
  const monthMap = new Map();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    months.push(key);
    monthMap.set(key, 0);
  }
  expenseTx.forEach(tx => {
    const key = tx.date.slice(0, 7);
    if (monthMap.has(key)) monthMap.set(key, monthMap.get(key) + Number(tx.amount || 0));
  });

  const expenseByFriend = PEOPLE.map(name => expenseTx
    .filter(tx => tx.paidBy === name)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
  );

  const given = PEOPLE.map(name => list.reduce((sum, tx) => {
    if (tx.transactionType === 'expense' && tx.paidBy === name) return sum + Number(tx.amount || 0);
    if (tx.transactionType === 'borrow' && tx.lender === name) return sum + Number(tx.amount || 0);
    if (tx.transactionType === 'repayment' && tx.borrower === name) return sum + Number(tx.amount || 0);
    return sum;
  }, 0));

  const taken = PEOPLE.map(name => list.reduce((sum, tx) => {
    if (tx.transactionType === 'expense' && (tx.splitBetween || PEOPLE).includes(name)) return sum + (Number(tx.amount || 0) / (tx.splitBetween?.length || PEOPLE.length));
    if (tx.transactionType === 'borrow' && tx.borrower === name) return sum + Number(tx.amount || 0);
    if (tx.transactionType === 'repayment' && tx.lender === name) return sum + Number(tx.amount || 0);
    return sum;
  }, 0));

  const txCounts = PEOPLE.map(name => list.filter(tx => tx.paidBy === name || tx.lender === name || tx.borrower === name || (tx.splitBetween || []).includes(name)).length);

  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  const grid = 'rgba(255,255,255,.08)';

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: textColor, usePointStyle: true, pointStyle: 'circle' }
      }
    },
    scales: {
      x: { ticks: { color: muted }, grid: { color: grid } },
      y: { ticks: { color: muted }, grid: { color: grid } }
    }
  };

  const destroy = chart => chart && typeof chart.destroy === 'function' && chart.destroy();
  destroy(state.charts.monthly);
  destroy(state.charts.expense);
  destroy(state.charts.flow);
  destroy(state.charts.count);

  state.charts.monthly = new window.Chart(document.getElementById('monthlyChart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Monthly spending',
        data: months.map(m => round(monthMap.get(m) || 0)),
        tension: .38,
        fill: true,
        borderWidth: 2,
        pointRadius: 3
      }]
    },
    options: baseOptions
  });

  state.charts.expense = new window.Chart(document.getElementById('expenseChart'), {
    type: 'doughnut',
    data: {
      labels: PEOPLE,
      datasets: [{
        label: 'Expenses by friend',
        data: expenseByFriend,
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, usePointStyle: true } }
      }
    }
  });

  state.charts.flow = new window.Chart(document.getElementById('flowChart'), {
    type: 'bar',
    data: {
      labels: PEOPLE,
      datasets: [
        { label: 'Money given', data: given, borderWidth: 0, borderRadius: 12 },
        { label: 'Money taken', data: taken, borderWidth: 0, borderRadius: 12 }
      ]
    },
    options: baseOptions
  });

  state.charts.count = new window.Chart(document.getElementById('countChart'), {
    type: 'bar',
    data: {
      labels: PEOPLE,
      datasets: [{ label: 'Transaction count', data: txCounts, borderWidth: 0, borderRadius: 12 }]
    },
    options: baseOptions
  });
}

function updateChartsTheme() {
  if (state.activeView === 'analytics') {
    renderCharts();
  }
}

function renderAll() {
  const txs = applyFilters(activeTransactions());
  state.filteredTransactions = txs;
  const summary = computeSummary(activeTransactions());
  const settlements = computeSettlements(summary);

  if (state.loading) {
    renderLoading();
    return;
  }

  renderStats(summary, activeTransactions());
  renderFriends(summary);
  renderSettlements(summary);
  const recent = [...activeTransactions()].sort((a, b) => txTimestamp(b) - txTimestamp(a)).slice(0, 6);
  renderHistory(recent, els.recentActivity);
  renderHistory(txs, els.historyList);
  els.summaryBadge.textContent = settlements.length ? `${settlements.length} settlement${settlements.length > 1 ? 's' : ''} pending` : 'Everyone is settled up';

  if (state.activeView === 'analytics') renderCharts();
}

/* =========================================================
   Data import/export and admin tools
========================================================= */
function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    balanceResetAt: state.balanceResetAt,
    transactions: state.transactions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `splitwise-trio-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Exported', 'Your JSON backup has been downloaded.', 'success');
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed.transactions) ? parsed.transactions : [];
    if (!incoming.length) throw new Error('No transactions found in the file.');
    const normalized = incoming.map(normalizeTx).filter(tx => PEOPLE.includes(tx.paidBy) && tx.amount > 0);

    if (!state.backendReady) {
      state.transactions = normalized;
      writeLocalTransactions(state.transactions);
    } else {
      const batch = writeBatch(db);
      normalized.forEach(tx => batch.set(doc(db, 'transactions', tx.id), tx));
      await batch.commit();
    }

    state.loading = false;
    renderAll();
    toast('Imported', `${normalized.length} transaction${normalized.length > 1 ? 's were' : ' was'} imported successfully.`, 'success');
  } catch (error) {
    console.error(error);
    toast('Import failed', error?.message || 'Could not read that file.', 'error');
  } finally {
    event.target.value = '';
  }
}

async function resetBalances() {
  const ok = await confirmAction('Reset balances?', 'This keeps your history but starts the balance calculation from now on.');
  if (!ok) return;
  state.balanceResetAt = Date.now();
  saveResetPoint(state.balanceResetAt);
  renderAll();
  toast('Balances reset', 'All future calculations will use the new starting point.', 'success');
}

async function clearAllTransactions() {
  const ok = await confirmAction('Clear all transactions?', 'This permanently removes every transaction from the app.');
  if (!ok) return;

  if (!state.backendReady) {
    state.transactions = [];
    writeLocalTransactions([]);
  } else {
    const batch = writeBatch(db);
    state.transactions.forEach(tx => batch.delete(doc(db, 'transactions', tx.id)));
    await batch.commit();
  }

  state.balanceResetAt = 0;
  saveResetPoint(0);
  state.lastDeleted = null;
  renderAll();
  toast('Cleared', 'All transactions were removed.', 'warning');
}

/* =========================================================
   Event binding
========================================================= */
function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.querySelectorAll('.segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  els.settingsShortcut.addEventListener('click', () => showView('settings'));
  const logoutBtn = document.getElementById("logoutBtn");

logoutBtn?.addEventListener("click", async () => {
    const ok = await confirmAction(
        "Logout?",
        "Are you sure you want to logout?"
    );

    if (!ok) return;

    try {
        await logoutUser();

        toast("Logged out", "See you next time 👋", "success");

        setTimeout(() => {
            window.location.href = "./index.html";
        }, 400);
    } catch (err) {
        console.error(err);
        toast("Logout failed", err.message || "Unable to logout.", "error");
    }
});
  els.fab.addEventListener('click', () => openModal('create'));
  els.mobileAddBtn.addEventListener('click', () => openModal('create'));
  els.quickExpenseBtn.addEventListener('click', () => openModal('create', {
    transactionType: 'expense',
    description: 'Dinner',
    splitBetween: PEOPLE,
    paidBy: PEOPLE[0]
  }));
  els.quickBorrowBtn.addEventListener('click', () => openModal('create', {
    transactionType: 'borrow',
    description: 'Loan',
    lender: PEOPLE[0],
    borrower: PEOPLE[1]
  }));
  els.quickRepayBtn.addEventListener('click', () => openModal('create', {
    transactionType: 'repayment',
    description: 'Repayment',
    lender: PEOPLE[0],
    borrower: PEOPLE[1]
  }));
  els.openHistoryBtn.addEventListener('click', () => showView('history'));

  els.closeModalBtn.addEventListener('click', closeModal);
  els.cancelBtn.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', e => { if (e.target === els.modalOverlay) closeModal(); });
  els.typeInput.addEventListener('change', toggleDebtFields);
  els.selectAllSplitBtn.addEventListener('click', () => {
    els.splitCheckGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
  });

  els.transactionForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      id: els.transactionId.value || uid(),
      amount: Number(els.amountInput.value),
      description: els.descriptionInput.value.trim(),
      paidBy: els.paidByInput.value,
      splitBetween: els.typeInput.value === 'expense' ? getSplitBetween() : [],
      transactionType: els.typeInput.value,
      lender: els.typeInput.value === 'expense' ? '' : els.lenderInput.value,
      borrower: els.typeInput.value === 'expense' ? '' : els.borrowerInput.value,
      notes: els.notesInput.value.trim(),
      date: els.dateInput.value,
      time: els.timeInput.value
    };

    const error = validateTransaction(payload);
    if (error) {
      toast('Validation failed', error, 'error');
      return;
    }

    const existing = state.transactions.find(tx => tx.id === payload.id);
    payload.createdAt = existing?.createdAt || Date.now();
    payload.updatedAt = Date.now();

    try {
      els.saveBtn.disabled = true;
      els.saveBtn.textContent = 'Saving…';
      await saveTransaction(payload);
      closeModal();
    } catch (error) {
      console.error(error);
      toast('Save failed', error?.message || 'Could not save transaction.', 'error');
    } finally {
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = state.editingId ? 'Update transaction' : 'Save transaction';
    }
  });

  const debounce = (fn, delay = 180) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const syncFilters = () => {
    state.filters.search = els.searchInput.value;
    state.filters.person = els.personFilter.value;
    state.filters.type = els.typeFilter.value;
    state.filters.date = els.dateFilter.value;
    state.filters.month = els.monthFilter.value;
    state.filters.sort = els.sortFilter.value;
    renderAll();
  };

  els.searchInput.addEventListener('input', debounce(syncFilters));
  [els.personFilter, els.typeFilter, els.dateFilter, els.monthFilter, els.sortFilter].forEach(el => el.addEventListener('change', syncFilters));

  els.clearFiltersBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.personFilter.value = 'all';
    els.typeFilter.value = 'all';
    els.dateFilter.value = '';
    els.monthFilter.value = '';
    els.sortFilter.value = 'newest';
    state.filters = { search: '', person: 'all', type: 'all', date: '', month: '', sort: 'newest' };
    renderAll();
    toast('Filters cleared', 'History is back to full view.', 'success');
  });

  els.exportJsonBtn.addEventListener('click', exportJson);
  els.importJsonBtn.addEventListener('click', () => els.importFileInput.click());
  els.importFileInput.addEventListener('change', handleImportFile);
  els.resetBalancesBtn.addEventListener('click', resetBalances);
  els.clearAllBtn.addEventListener('click', clearAllTransactions);

  els.confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
  els.confirmOkBtn.addEventListener('click', () => closeConfirm(true));
  els.confirmDialog.addEventListener('click', e => { if (e.target === els.confirmDialog) closeConfirm(false); });

  document.addEventListener('click', async e => {
    const template = e.target.closest('[data-template]');
    if (template) {
      openModal('create', { transactionType: 'expense', description: template.dataset.template, splitBetween: PEOPLE });
      return;
    }

    const action = e.target.closest('[data-action]');
    if (!action) return;
    const id = action.dataset.id;
    const tx = state.transactions.find(item => item.id === id);
    if (!tx) return;

    if (action.dataset.action === 'edit') {
      openModal('edit', tx);
    }

    if (action.dataset.action === 'delete') {
      await deleteTransaction(tx);
    }
  });

  window.addEventListener('resize', () => {
    if (state.activeView === 'analytics') renderCharts();
  });
}

/* =========================================================
   Initial boot
========================================================= */
function init() {
  renderPeopleOptions();
  renderSplitChecks();
  applyTheme(state.theme);
  setDefaultDateTime();
  bindEvents();
  state.loading = true;
  renderLoading();
  loadLocalSeed();
  renderFavorites();
  initFirebase();
}

if (currentUser) {
  document.body.classList.remove('auth-pending');
  document.getElementById('authGate')?.remove();
  init();
}
// else: requireAuth() has already redirected to the login page
