import { firebaseConfig } from './firebase.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  enableIndexedDbPersistence,
  writeBatch,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const PEOPLE = ['Arish', 'Ayman', 'Vishist'];
const STORAGE_KEY = 'splitwise-trio-local-v1';
const RESET_KEY = 'splitwise-trio-balance-reset-at';
const FAVORITES_KEY = 'splitwise-trio-favorites';
const THEME_KEY = 'splitwise-trio-theme';
const LAST_SUBMIT_KEY = 'splitwise-trio-last-submit';

const state = {
  transactions: [],
  filteredTransactions: [],
  loading: true,
  charts: {},
  backendReady: false,
  balanceResetAt: Number(localStorage.getItem(RESET_KEY) || 0) || 0,
  favorites: JSON.parse(localStorage.getItem(FAVORITES_KEY) || '["Lunch","Tea","Fuel","Groceries","Movie tickets","Cab ride"]'),
  theme: localStorage.getItem(THEME_KEY) || 'dark',
  lastDeleted: null,
  activeView: 'dashboard',
  filters: {
    search: '',
    person: 'all',
    type: 'all',
    date: '',
    month: '',
    sort: 'newest'
  }
};

const els = {
  statsGrid: document.getElementById('statsGrid'),
  friendsGrid: document.getElementById('friendsGrid'),
  settlementsSection: document.getElementById('settlementsSection'),
  recentActivity: document.getElementById('recentActivity'),
  historyList: document.getElementById('historyList'),
  monthlySummaryBadge: document.getElementById('monthlySummaryBadge'),
  fab: document.getElementById('fab'),
  mobileAddBtn: document.getElementById('mobileAddBtn'),
  quickAddExpense: document.getElementById('quickAddExpense'),
  quickAddBorrow: document.getElementById('quickAddBorrow'),
  openHistoryBtn: document.getElementById('openHistoryBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalEyebrow: document.getElementById('modalEyebrow'),
  modalTitle: document.getElementById('modalTitle'),
  closeModalBtn: document.getElementById('closeModalBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  form: document.getElementById('transactionForm'),
  transactionId: document.getElementById('transactionId'),
  amountInput: document.getElementById('amountInput'),
  descriptionInput: document.getElementById('descriptionInput'),
  paidByInput: document.getElementById('paidByInput'),
  typeInput: document.getElementById('typeInput'),
  splitField: document.getElementById('splitField'),
  splitCheckGroup: document.getElementById('splitCheckGroup'),
  debtField: document.getElementById('debtField'),
  lenderInput: document.getElementById('lenderInput'),
  borrowerInput: document.getElementById('borrowerInput'),
  notesInput: document.getElementById('notesInput'),
  dateInput: document.getElementById('dateInput'),
  timeInput: document.getElementById('timeInput'),
  saveBtn: document.getElementById('saveBtn'),
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
  toastRoot: document.getElementById('toastRoot'),
  confirmDialog: document.getElementById('confirmDialog'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmOkBtn: document.getElementById('confirmOkBtn'),
  paidBySelects: [],
  quickTemplateChips: document.getElementById('quickTemplateChips'),
  favoritesChips: document.getElementById('favoritesChips')
};

const palette = [
  ['#6ea8ff', '#7c5cff'],
  ['#48d597', '#2e8cff'],
  ['#f4c76f', '#7c5cff']
];

let app = null;
let db = null;
let unsubscribe = null;
let chartsReady = false;
let transactionWatcherTimer = null;
let confirmResolver = null;
let activeEditId = null;

function money(n) {
  const value = Number(n || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function shortMoney(n) {
  const value = Number(n || 0);
  const sign = value > 0 ? '+' : '';
  return `${sign}${money(Math.abs(value)).replace('₹', '₹')}`;
}

function fmtDate(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function fmtDateTime(date, time) {
  const timePart = time || '00:00';
  const iso = `${date}T${timePart}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${date} ${timePart}`;
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(d);
}

function initials(name) {
  return name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
}

function safeText(value) {
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
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
}

function getStoredTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setStoredTransactions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.chip-button[data-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  updateMetaTheme();
}

function showView(view) {
  state.activeView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `${view}View`));
  document.querySelectorAll('.nav-link[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  if (view === 'analytics') {
    requestAnimationFrame(() => renderCharts());
  }
}

function toast(title, message, type = 'success', actions = []) {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `
    <strong>${safeText(title)}</strong>
    <p>${safeText(message)}</p>
    ${actions.length ? '<div class="toast-actions"></div>' : ''}
  `;
  const actionsWrap = node.querySelector('.toast-actions');
  actions.forEach(action => {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => action.onClick?.());
    actionsWrap.appendChild(btn);
  });
  els.toastRoot.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateX(12px)';
    node.style.transition = 'all .25s ease';
    setTimeout(() => node.remove(), 260);
  }, 3200);
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
  confirmResolver?.(result);
  confirmResolver = null;
}

function renderSelectOptions() {
  const optionsHtml = PEOPLE.map(name => `<option value="${name}">${name}</option>`).join('');
  els.paidByInput.innerHTML = optionsHtml;
  els.lenderInput.innerHTML = optionsHtml;
  els.borrowerInput.innerHTML = optionsHtml;
  els.paidBySelects = [els.paidByInput, els.lenderInput, els.borrowerInput];
}

function renderSplitCheckboxes() {
  els.splitCheckGroup.innerHTML = PEOPLE.map(name => `
    <label class="check-item">
      <input type="checkbox" value="${name}" checked />
      <span>${name}</span>
    </label>
  `).join('');
}

function getFormSplitBetween() {
  return Array.from(els.splitCheckGroup.querySelectorAll('input[type="checkbox"]'))
    .filter(cb => cb.checked)
    .map(cb => cb.value);
}

function setSplitDefaults() {
  els.splitCheckGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
}

function openModal(mode = 'create', tx = null, preset = {}) {
  activeEditId = mode === 'edit' && tx ? tx.id : null;
  els.modalEyebrow.textContent = mode === 'edit' ? 'Edit transaction' : 'Add transaction';
  els.modalTitle.textContent = mode === 'edit' ? 'Update transaction' : 'Record a new transaction';
  els.saveBtn.textContent = mode === 'edit' ? 'Update transaction' : 'Save transaction';

  const { date, time } = nowParts();
  const current = tx || preset || {};
  els.transactionId.value = current.id || '';
  els.amountInput.value = current.amount ?? preset.amount ?? '';
  els.descriptionInput.value = current.description ?? preset.description ?? '';
  els.paidByInput.value = current.paidBy || preset.paidBy || PEOPLE[0];
  els.typeInput.value = current.transactionType || preset.transactionType || 'expense';
  els.notesInput.value = current.notes || preset.notes || '';
  els.dateInput.value = current.date || preset.date || date;
  els.timeInput.value = current.time || preset.time || time;
  els.lenderInput.value = current.lender || preset.lender || PEOPLE[0];
  els.borrowerInput.value = current.borrower || preset.borrower || PEOPLE[1];
  renderSplitCheckboxes();
  const split = current.splitBetween?.length ? current.splitBetween : preset.splitBetween?.length ? preset.splitBetween : PEOPLE;
  els.splitCheckGroup.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = split.includes(cb.value); });
  toggleDebtFields();
  els.modalOverlay.classList.remove('hidden');
  els.modalOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => els.amountInput.focus(), 0);
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  els.modalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  activeEditId = null;
  els.form.reset();
  els.transactionId.value = '';
  renderSplitCheckboxes();
  setSplitDefaults();
  toggleDebtFields();
}

function toggleDebtFields() {
  const type = els.typeInput.value;
  const show = type === 'borrow' || type === 'repayment';
  els.splitField.classList.toggle('hidden', show);
  els.debtField.classList.toggle('hidden', !show);
}

function transactionFingerprint(data) {
  return [
    data.amount,
    data.description.trim().toLowerCase(),
    data.paidBy,
    data.transactionType,
    data.lender || '',
    data.borrower || '',
    data.date,
    data.time
  ].join('|');
}

function recentDuplicateGuard(data) {
  const fp = transactionFingerprint(data);
  const raw = localStorage.getItem(LAST_SUBMIT_KEY);
  const last = raw ? JSON.parse(raw) : null;
  const now = Date.now();
  if (last && last.fp === fp && now - last.at < 5000) return true;
  localStorage.setItem(LAST_SUBMIT_KEY, JSON.stringify({ fp, at: now }));
  return false;
}

function validateTransaction(data) {
  if (!Number.isFinite(data.amount) || data.amount <= 0) return 'Amount must be greater than zero.';
  if (!data.description.trim()) return 'Description is required.';
  if (!PEOPLE.includes(data.paidBy)) return 'Select a valid paid-by person.';
  if (!['expense', 'borrow', 'repayment'].includes(data.transactionType)) return 'Choose a valid transaction type.';
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(data.date)) return 'Date is invalid.';
  if (!/^\\d{2}:\\d{2}$/.test(data.time)) return 'Time is invalid.';
  if (data.transactionType === 'expense') {
    if (!Array.isArray(data.splitBetween) || !data.splitBetween.length) return 'Select at least one person to split between.';
    if (data.splitBetween.some(name => !PEOPLE.includes(name))) return 'Split list contains invalid names.';
  }
  if (data.transactionType === 'borrow' || data.transactionType === 'repayment') {
    if (!PEOPLE.includes(data.lender) || !PEOPLE.includes(data.borrower)) return 'Pick valid lender and borrower.';
    if (data.lender === data.borrower) return 'Lender and borrower must be different people.';
  }
  return null;
}

function normalizeTxFromDoc(docSnap) {
  const data = docSnap.data();
  const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : Date.now());
  const updatedAt = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : (data.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : createdAt);
  return {
    id: docSnap.id,
    ...data,
    createdAt,
    updatedAt
  };
}

function normalizeTxPlain(tx) {
  return {
    ...tx,
    createdAt: tx.createdAt || Date.now(),
    updatedAt: tx.updatedAt || tx.createdAt || Date.now()
  };
}

async function initFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    state.backendReady = false;
    state.transactions = getStoredTransactions().map(normalizeTxPlain);
    state.loading = false;
    renderAll();
    toast('Local mode', 'Firebase config is missing, so the app is using local browser storage for now.', 'warning');
    return;
  }

  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  state.backendReady = true;

  try {
    await enableIndexedDbPersistence(db);
  } catch (error) {
    console.warn('Offline persistence unavailable:', error?.message || error);
  }

  subscribeToTransactions();
}

function subscribeToTransactions() {
  if (unsubscribe) unsubscribe();

  const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
  unsubscribe = onSnapshot(q, snapshot => {
    state.transactions = snapshot.docs.map(normalizeTxFromDoc);
    state.loading = false;
    renderAll();
  }, error => {
    console.error(error);
    state.loading = false;
    toast('Sync issue', 'Could not read Firestore. Check your config or network.', 'error');
    renderAll();
  });
}

function persistLocal(transactions) {
  setStoredTransactions(transactions);
  state.transactions = transactions;
  state.loading = false;
  renderAll();
}

async function saveTransaction(payload) {
  const existing = payload.id ? state.transactions.find(item => item.id === payload.id) : null;
  if (recentDuplicateGuard(payload)) {
    toast('Duplicate blocked', 'That looks like a rapid repeat submission.', 'warning');
    return;
  }

  if (!state.backendReady) {
    const now = Date.now();
    const tx = {
      id: payload.id || uid(),
      ...payload,
      createdAt: payload.createdAt || now,
      updatedAt: now
    };
    const list = [tx, ...state.transactions.filter(item => item.id !== tx.id)];
    persistLocal(list);
    toast(payload.transactionType === 'borrow' ? 'Borrow saved' : 'Transaction saved', 'Your record has been added successfully.', 'success');
    return;
  }

  const data = {
    amount: Number(payload.amount),
    description: payload.description.trim(),
    paidBy: payload.paidBy,
    splitBetween: payload.splitBetween || [],
    transactionType: payload.transactionType,
    lender: payload.lender || '',
    borrower: payload.borrower || '',
    notes: payload.notes || '',
    date: payload.date,
    time: payload.time,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (payload.id) {
    await updateDoc(doc(db, 'transactions', payload.id), {
      ...data,
      createdAt: existing?.createdAt ? new Date(existing.createdAt) : serverTimestamp()
    });
    toast('Transaction updated', 'The record has been saved.', 'success');
  } else {
    await addDoc(collection(db, 'transactions'), data);
    toast('Transaction saved', 'The record has been added successfully.', 'success');
  }
}

async function removeTransaction(tx) {
  const confirmed = await confirmAction('Delete transaction?', 'This will permanently remove the record from the database.');
  if (!confirmed) return;

  state.lastDeleted = tx;
  if (!state.backendReady) {
    const remaining = state.transactions.filter(item => item.id !== tx.id);
    persistLocal(remaining);
  } else {
    await deleteDoc(doc(db, 'transactions', tx.id));
  }
  toast('Deleted', 'Transaction removed. You can undo it from the history card if needed.', 'warning', [
    { label: 'Undo', onClick: () => undoDelete() }
  ]);
}

async function undoDelete() {
  if (!state.lastDeleted) return;
  const tx = state.lastDeleted;
  if (!state.backendReady) {
    const list = [tx, ...state.transactions.filter(item => item.id !== tx.id)];
    persistLocal(list);
  } else {
    await setDoc(doc(db, 'transactions', tx.id), {
      amount: Number(tx.amount),
      description: tx.description,
      paidBy: tx.paidBy,
      splitBetween: tx.splitBetween || [],
      transactionType: tx.transactionType,
      lender: tx.lender || '',
      borrower: tx.borrower || '',
      notes: tx.notes || '',
      date: tx.date,
      time: tx.time,
      createdAt: tx.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  toast('Restored', 'The deleted transaction has been restored.', 'success');
  state.lastDeleted = null;
}

function clearFormWithDefaults() {
  els.form.reset();
  els.amountInput.value = '';
  els.descriptionInput.value = '';
  els.paidByInput.value = PEOPLE[0];
  els.typeInput.value = 'expense';
  els.notesInput.value = '';
  const { date, time } = nowParts();
  els.dateInput.value = date;
  els.timeInput.value = time;
  renderSplitCheckboxes();
  setSplitDefaults();
  toggleDebtFields();
}

function currentTxList() {
  const cutoff = state.balanceResetAt || 0;
  return state.transactions
    .filter(tx => (tx.createdAt || 0) >= cutoff);
}

function txDateTimeMs(tx) {
  const when = `${tx.date}T${tx.time || '00:00'}:00`;
  const ms = new Date(when).getTime();
  return Number.isNaN(ms) ? (tx.createdAt || 0) : ms;
}

function computeBalances(transactions) {
  const balances = Object.fromEntries(PEOPLE.map(name => [name, 0]));
  const given = Object.fromEntries(PEOPLE.map(name => [name, 0]));
  const taken = Object.fromEntries(PEOPLE.map(name => [name, 0]));
  const txCount = Object.fromEntries(PEOPLE.map(name => [name, 0]));
  const expenseCount = Object.fromEntries(PEOPLE.map(name => [name, 0]));

  for (const tx of transactions) {
    txCount[tx.paidBy] = (txCount[tx.paidBy] || 0) + 1;
    if (tx.transactionType === 'expense') {
      const split = Array.isArray(tx.splitBetween) ? tx.splitBetween.filter(name => PEOPLE.includes(name)) : [];
      if (!split.length) continue;
      const share = tx.amount / split.length;
      given[tx.paidBy] += tx.amount;
      expenseCount[tx.paidBy] += tx.amount;
      balances[tx.paidBy] += tx.amount;
      for (const person of split) {
        taken[person] += share;
        balances[person] -= share;
      }
    } else if (tx.transactionType === 'borrow') {
      given[tx.lender] += tx.amount;
      taken[tx.borrower] += tx.amount;
      balances[tx.lender] += tx.amount;
      balances[tx.borrower] -= tx.amount;
    } else if (tx.transactionType === 'repayment') {
      given[tx.borrower] += tx.amount;
      taken[tx.lender] += tx.amount;
      balances[tx.borrower] += tx.amount;
      balances[tx.lender] -= tx.amount;
    }
  }

  return { balances, given, taken, txCount, expenseCount };
}

function buildSettlements(balances) {
  const debtors = PEOPLE.map(name => ({ name, amount: balances[name] }))
    .filter(item => item.amount < 0)
    .map(item => ({ ...item, amount: Math.abs(item.amount) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = PEOPLE.map(name => ({ name, amount: balances[name] }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    result.push({
      from: debtors[i].name,
      to: creditors[j].name,
      amount: pay
    });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= 0.01) i++;
    if (creditors[j].amount <= 0.01) j++;
  }

  return result;
}

function getFilteredTransactions(transactions) {
  const { search, person, type, date, month, sort } = state.filters;
  const q = search.trim().toLowerCase();
  const filtered = transactions.filter(tx => {
    const text = `${tx.description} ${tx.notes} ${tx.paidBy} ${tx.lender || ''} ${tx.borrower || ''}`.toLowerCase();
    const matchesSearch = !q || text.includes(q);
    const matchesPerson = person === 'all' || tx.paidBy === person || tx.lender === person || tx.borrower === person || (tx.splitBetween || []).includes(person);
    const matchesType = type === 'all' || tx.transactionType === type;
    const matchesDate = !date || tx.date === date;
    const matchesMonth = !month || tx.date.startsWith(month);
    return matchesSearch && matchesPerson && matchesType && matchesDate && matchesMonth;
  });

  filtered.sort((a, b) => {
    const ad = txDateTimeMs(a);
    const bd = txDateTimeMs(b);
    const amountDiff = Number(a.amount) - Number(b.amount);
    switch (sort) {
      case 'oldest': return ad - bd;
      case 'highest': return Number(b.amount) - Number(a.amount);
      case 'lowest': return Number(a.amount) - Number(b.amount);
      default: return bd - ad;
    }
  });

  return filtered;
}

function txIcon(type) {
  if (type === 'borrow') return '🤝';
  if (type === 'repayment') return '↩️';
  return '💸';
}

function typeLabel(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function renderStats(summary, allTransactions) {
  const totalTransactions = allTransactions.length;
  const totalRecorded = allTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaysTransactions = allTransactions.filter(tx => tx.date === today).length;
  const pendingSettlements = buildSettlements(summary.balances).length;

  const cards = [
    ['Total transactions', totalTransactions, `${pendingSettlements} pending settlement${pendingSettlements === 1 ? '' : 's'}`],
    ['Total money recorded', money(totalRecorded), 'All recorded amounts'],
    ['Pending settlements', pendingSettlements, 'Automatic settlement pairs'],
    ['Today’s transactions', todaysTransactions, 'Transactions added today']
  ];

  els.statsGrid.innerHTML = cards.map((card, index) => `
    <article class="stat-card glass">
      <div class="stat-label">
        <span>${safeText(card[0])}</span>
        <span class="loading-dot"></span>
      </div>
      <div class="stat-value" data-target="${safeText(card[1])}">${safeText(card[1])}</div>
      <div class="stat-sub">${safeText(card[2])}</div>
    </article>
  `).join('');

  animateCounters();
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlyTotal = allTransactions
    .filter(tx => tx.transactionType === 'expense' && tx.date.startsWith(monthKey))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  els.monthlySummaryBadge.textContent = `This month: ${money(monthlyTotal)} in expenses`;
}

function animateCounters() {
  document.querySelectorAll('.stat-value').forEach(el => {
    const target = el.dataset.target;
    if (String(target).startsWith('₹') || String(target).includes(',')) return;
    const finalValue = Number(target);
    if (!Number.isFinite(finalValue)) return;
    const start = 0;
    const duration = 650;
    const began = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(start + (finalValue - start) * eased).toString();
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

function renderFriends(summary) {
  const statusText = amount => {
    if (Math.abs(amount) < 0.01) return 'Settled up';
    return amount > 0 ? `You should receive ${money(amount)}` : `You owe ${money(Math.abs(amount))}`;
  };

  els.friendsGrid.innerHTML = PEOPLE.map((name, index) => {
    const balance = summary.balances[name];
    const given = summary.given[name];
    const taken = summary.taken[name];
    const txCount = summary.txCount[name];
    const statusClass = Math.abs(balance) < 0.01 ? 'neutral' : balance > 0 ? 'good' : 'bad';
    const accent = palette[index % palette.length];
    return `
      <article class="friend-card glass" style="--friend-accent-1:${accent[0]}; --friend-accent-2:${accent[1]};">
        <div class="friend-head">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar" style="background:linear-gradient(145deg, ${accent[0]}, ${accent[1]})">${initials(name)}</div>
            <div>
              <h4 class="friend-name">${safeText(name)}</h4>
              <div class="friend-meta">Balance overview</div>
            </div>
          </div>
        </div>

        <div class="balance ${statusClass}">${balance > 0 ? '+' : balance < 0 ? '-' : ''}${money(Math.abs(balance))}</div>
        <div class="friend-meta">${statusText(balance)}</div>

        <div class="friend-stats">
          <div class="mini-stat">
            <span>Money given</span>
            <strong>${money(given)}</strong>
          </div>
          <div class="mini-stat">
            <span>Money taken</span>
            <strong>${money(taken)}</strong>
          </div>
          <div class="mini-stat">
            <span>Transactions</span>
            <strong>${txCount}</strong>
          </div>
          <div class="mini-stat">
            <span>Status</span>
            <strong>${Math.abs(balance) < 0.01 ? 'Settled' : balance > 0 ? 'Receivable' : 'Payable'}</strong>
          </div>
        </div>

        <div class="status-pill">
          <span>${Math.abs(balance) < 0.01 ? '⚪' : balance > 0 ? '🟢' : '🔴'}</span>
          <span>${safeText(statusText(balance))}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderSettlements(summary) {
  const settlementPairs = buildSettlements(summary.balances);
  if (!settlementPairs.length) {
    els.settlementsSection.innerHTML = `<div class="muted">Everything is settled. Great job ✨</div>`;
    return;
  }

  els.settlementsSection.innerHTML = `
    <div class="settlement-list">
      ${settlementPairs.map(item => `
        <div class="settlement-chip">${safeText(item.from)} owes ${safeText(item.to)} <strong>${money(item.amount)}</strong></div>
      `).join('')}
    </div>
  `;
}

function renderFavorites() {
  els.favoritesChips.innerHTML = state.favorites.map(item => `<button class="chip" data-favorite="${safeText(item)}">${safeText(item)}</button>`).join('');
  els.quickTemplateChips.innerHTML = state.favorites.map(item => `<button class="chip" data-quick="${safeText(item)}">${safeText(item)}</button>`).join('');
}

function splitDetailText(tx) {
  if (tx.transactionType === 'expense') {
    const split = tx.splitBetween || [];
    const share = split.length ? Number(tx.amount) / split.length : Number(tx.amount);
    return `${tx.paidBy} split with ${split.join(', ')} · ${money(share)} each`;
  }
  return `${tx.lender} lent ${tx.borrower} ${money(tx.amount)}`;
}

function renderHistory(list) {
  if (!list.length) {
    els.historyList.innerHTML = `
      <div class="panel glass">
        <h3>No transactions yet</h3>
        <p class="muted">Add your first record with the floating action button.</p>
      </div>
    `;
    els.recentActivity.innerHTML = `
      <div class="panel glass">
        <h3>Nothing to show yet</h3>
        <p class="muted">Your latest activity will appear here once you save a transaction.</p>
      </div>
    `;
    return;
  }

  els.historyList.innerHTML = list.map(tx => renderTxCard(tx)).join('');
  els.recentActivity.innerHTML = list.slice(0, 5).map(tx => renderTxCard(tx)).join('');
  attachHistoryHandlers();
}

function renderTxCard(tx) {
  const splitText = splitDetailText(tx);
  const actionClass = tx.transactionType === 'expense' ? 'good' : 'bad';
  return `
    <article class="history-card glass" data-id="${tx.id}">
      <div class="history-top">
        <div>
          <div class="tag ${actionClass}">${txIcon(tx.transactionType)} ${safeText(typeLabel(tx.transactionType))}</div>
          <h4 style="margin:12px 0 6px; font-size:1.15rem">${safeText(tx.description)}</h4>
          <div class="friend-meta">${safeText(tx.paidBy)} · ${safeText(fmtDateTime(tx.date, tx.time))}</div>
        </div>
        <div class="tx-amount">${money(tx.amount)}</div>
      </div>

      <div class="tx-meta">
        <span class="tag">Paid by ${safeText(tx.paidBy)}</span>
        <span class="tag">${safeText(splitText)}</span>
        ${tx.notes ? `<span class="tag">Note: ${safeText(tx.notes)}</span>` : ''}
      </div>

      <div class="tx-actions">
        <button data-action="edit" data-id="${tx.id}">Edit</button>
        <button data-action="delete" data-id="${tx.id}">Delete</button>
        <button data-action="undo" data-id="${tx.id}">Undo</button>
      </div>
    </article>
  `;
}

function attachHistoryHandlers() {
  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tx = state.transactions.find(item => item.id === btn.dataset.id);
      if (tx) openModal('edit', tx);
    });
  });

  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tx = state.transactions.find(item => item.id === btn.dataset.id);
      if (tx) removeTransaction(tx);
    });
  });

  document.querySelectorAll('[data-action="undo"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.lastDeleted && state.lastDeleted.id === btn.dataset.id) {
        undoDelete();
      } else {
        toast('Nothing to undo', 'Delete a transaction first, then use Undo.', 'warning');
      }
    });
  });
}

function monthlyAggregate(transactions) {
  const months = {};
  transactions.filter(tx => tx.transactionType === 'expense').forEach(tx => {
    const key = tx.date.slice(0, 7);
    months[key] = (months[key] || 0) + Number(tx.amount || 0);
  });
  return Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
}

function renderCharts() {
  const allTx = currentTxList();
  const summary = computeBalances(allTx);

  const monthlyData = monthlyAggregate(allTx);
  const labels = monthlyData.map(([k]) => k);
  const amounts = monthlyData.map(([, v]) => v);

  const expenseByFriend = PEOPLE.map(name => allTx.filter(tx => tx.transactionType === 'expense' && tx.paidBy === name).reduce((s, tx) => s + Number(tx.amount || 0), 0));
  const given = PEOPLE.map(name => summary.given[name]);
  const taken = PEOPLE.map(name => summary.taken[name]);
  const txCounts = PEOPLE.map(name => summary.txCount[name]);

  const destroyIfExists = chart => chart && typeof chart.destroy === 'function' && chart.destroy();
  destroyIfExists(state.charts.monthly);
  destroyIfExists(state.charts.expense);
  destroyIfExists(state.charts.flow);
  destroyIfExists(state.charts.count);

  state.charts.monthly = new Chart(document.getElementById('monthlyChart'), {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: [{
        label: 'Monthly spending',
        data: amounts.length ? amounts : [0],
        borderWidth: 0,
        borderRadius: 14
      }]
    },
    options: chartOptions(false)
  });

  state.charts.expense = new Chart(document.getElementById('expenseChart'), {
    type: 'doughnut',
    data: {
      labels: PEOPLE,
      datasets: [{
        data: expenseByFriend,
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: chartOptions(true)
  });

  state.charts.flow = new Chart(document.getElementById('flowChart'), {
    type: 'bar',
    data: {
      labels: PEOPLE,
      datasets: [
        { label: 'Money given', data: given, borderWidth: 0, borderRadius: 14 },
        { label: 'Money taken', data: taken, borderWidth: 0, borderRadius: 14 }
      ]
    },
    options: chartOptions(false, true)
  });

  state.charts.count = new Chart(document.getElementById('countChart'), {
    type: 'bar',
    data: {
      labels: PEOPLE,
      datasets: [{
        label: 'Transaction count',
        data: txCounts,
        borderWidth: 0,
        borderRadius: 14
      }]
    },
    options: chartOptions(false)
  });
  chartsReady = true;
}

function chartOptions(isDoughnut = false, stacked = false) {
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: textColor,
          boxWidth: 12,
          boxHeight: 12,
          usePointStyle: true
        }
      }
    },
    scales: isDoughnut ? {} : {
      x: {
        ticks: { color: muted },
        grid: { color: 'rgba(255,255,255,.06)' },
        stacked
      },
      y: {
        ticks: { color: muted },
        grid: { color: 'rgba(255,255,255,.06)' },
        stacked
      }
    }
  };
}

function renderAll() {
  const allTx = currentTxList();
  const summary = computeBalances(allTx);
  state.filteredTransactions = getFilteredTransactions(allTx);
  renderStats(summary, allTx);
  renderFriends(summary);
  renderSettlements(summary);
  renderHistory(state.filteredTransactions);
  renderFavorites();
  if (chartsReady && state.activeView === 'analytics') {
    renderCharts();
  }
  updateThemePills();
  if (!allTx.length) {
    els.monthlySummaryBadge.textContent = 'No transactions yet';
  }
}

function updateThemePills() {
  document.querySelectorAll('.chip-button[data-theme]').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === state.theme));
}

function loadChartLibGuard() {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js is not available.');
    return;
  }
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.querySelectorAll('.chip-button[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  els.fab.addEventListener('click', () => {
    clearFormWithDefaults();
    openModal('create');
  });
  els.mobileAddBtn?.addEventListener('click', () => {
    clearFormWithDefaults();
    openModal('create');
  });
  els.quickAddExpense.addEventListener('click', () => {
    clearFormWithDefaults();
    openModal('create', null, { transactionType: 'expense', splitBetween: [...PEOPLE], paidBy: PEOPLE[0], description: 'Dinner', notes: '' });
  });
  els.quickAddBorrow.addEventListener('click', () => {
    clearFormWithDefaults();
    openModal('create', null, { transactionType: 'borrow', lender: PEOPLE[0], borrower: PEOPLE[1], description: 'Loan', splitBetween: PEOPLE });
  });
  els.openHistoryBtn.addEventListener('click', () => showView('history'));
  els.settingsBtn.addEventListener('click', () => showView('settings'));
  els.closeModalBtn.addEventListener('click', closeModal);
  els.cancelBtn.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', e => { if (e.target === els.modalOverlay) closeModal(); });
  els.typeInput.addEventListener('change', toggleDebtFields);

  els.form.addEventListener('submit', async e => {
    e.preventDefault();

    const existing = els.transactionId.value ? state.transactions.find(item => item.id === els.transactionId.value) : null;
    const payload = {
      id: els.transactionId.value || undefined,
      amount: Number(els.amountInput.value),
      description: els.descriptionInput.value.trim(),
      paidBy: els.paidByInput.value,
      transactionType: els.typeInput.value,
      splitBetween: els.typeInput.value === 'expense' ? getFormSplitBetween() : [],
      lender: els.typeInput.value !== 'expense' ? els.lenderInput.value : '',
      borrower: els.typeInput.value !== 'expense' ? els.borrowerInput.value : '',
      notes: els.notesInput.value.trim(),
      date: els.dateInput.value,
      time: els.timeInput.value,
      createdAt: existing?.createdAt || undefined
    };

    const error = validateTransaction(payload);
    if (error) {
      toast('Validation failed', error, 'error');
      return;
    }

    try {
      els.saveBtn.disabled = true;
      els.saveBtn.textContent = 'Saving…';
      await saveTransaction(payload);
      closeModal();
    } catch (err) {
      console.error(err);
      toast('Save failed', err?.message || 'Could not save transaction.', 'error');
    } finally {
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = activeEditId ? 'Update transaction' : 'Save transaction';
    }
  });

  const debounce = (fn, delay = 220) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const applyFilterChange = () => {
    state.filters.search = els.searchInput.value;
    state.filters.person = els.personFilter.value;
    state.filters.type = els.typeFilter.value;
    state.filters.date = els.dateFilter.value;
    state.filters.month = els.monthFilter.value;
    state.filters.sort = els.sortFilter.value;
    renderAll();
  };

  els.searchInput.addEventListener('input', debounce(applyFilterChange, 180));
  [els.personFilter, els.typeFilter, els.dateFilter, els.monthFilter, els.sortFilter].forEach(el => el.addEventListener('change', applyFilterChange));

  els.clearFiltersBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.personFilter.value = 'all';
    els.typeFilter.value = 'all';
    els.dateFilter.value = '';
    els.monthFilter.value = '';
    els.sortFilter.value = 'newest';
    state.filters = { search: '', person: 'all', type: 'all', date: '', month: '', sort: 'newest' };
    renderAll();
    toast('Filters cleared', 'History is now showing all transactions.', 'success');
  });

  els.exportJsonBtn.addEventListener('click', () => exportJson());
  els.importJsonBtn.addEventListener('click', () => els.importFileInput.click());
  els.importFileInput.addEventListener('change', handleImportFile);
  els.resetBalancesBtn.addEventListener('click', async () => {
    const ok = await confirmAction('Reset balances?', 'This keeps your history but makes current balances start from zero from now on.');
    if (!ok) return;
    state.balanceResetAt = Date.now();
    localStorage.setItem(RESET_KEY, String(state.balanceResetAt));
    renderAll();
    toast('Balances reset', 'The app will now calculate from this reset point forward.', 'success');
  });

  els.clearAllBtn.addEventListener('click', async () => {
    const ok = await confirmAction('Clear all transactions?', 'This permanently removes every transaction from the app.');
    if (!ok) return;
    if (!state.backendReady) {
      persistLocal([]);
    } else {
      const batch = writeBatch(db);
      for (const tx of state.transactions) {
        batch.delete(doc(db, 'transactions', tx.id));
      }
      await batch.commit();
    }
    state.balanceResetAt = 0;
    localStorage.removeItem(RESET_KEY);
    toast('Cleared', 'All transactions have been removed.', 'success');
  });

  els.confirmCancelBtn.addEventListener('click', () => closeConfirm(false));
  els.confirmOkBtn.addEventListener('click', () => closeConfirm(true));
  els.confirmDialog.addEventListener('click', e => { if (e.target === els.confirmDialog) closeConfirm(false); });

  document.addEventListener('click', e => {
    const favoriteBtn = e.target.closest('[data-favorite]');
    if (favoriteBtn) {
      els.descriptionInput.value = favoriteBtn.dataset.favorite;
      openModal('create', null, { description: favoriteBtn.dataset.favorite, transactionType: 'expense' });
    }
    const quickBtn = e.target.closest('[data-quick]');
    if (quickBtn) {
      els.descriptionInput.value = quickBtn.dataset.quick;
      toast('Template selected', `${quickBtn.dataset.quick} was added to the description field.`, 'success');
    }
  });
}

function exportJson() {
  const data = {
    exportedAt: new Date().toISOString(),
    balanceResetAt: state.balanceResetAt,
    transactions: state.transactions
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `splitwise-trio-export-${new Date().toISOString().slice(0, 10)}.json`;
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
    const imported = Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed) ? parsed : [];
    if (!imported.length) throw new Error('No transactions found in the file.');
    const normalized = imported.map(item => ({
      id: item.id || uid(),
      amount: Number(item.amount),
      description: String(item.description || ''),
      paidBy: item.paidBy || PEOPLE[0],
      splitBetween: Array.isArray(item.splitBetween) ? item.splitBetween : [...PEOPLE],
      transactionType: item.transactionType || 'expense',
      lender: item.lender || '',
      borrower: item.borrower || '',
      notes: item.notes || '',
      date: item.date || nowParts().date,
      time: item.time || nowParts().time,
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now()
    })).filter(tx => !Number.isNaN(tx.amount));

    if (!state.backendReady) {
      persistLocal(normalized);
    } else {
      const batch = writeBatch(db);
      for (const tx of normalized) {
        batch.set(doc(db, 'transactions', tx.id), {
          amount: tx.amount,
          description: tx.description,
          paidBy: tx.paidBy,
          splitBetween: tx.splitBetween,
          transactionType: tx.transactionType,
          lender: tx.lender,
          borrower: tx.borrower,
          notes: tx.notes,
          date: tx.date,
          time: tx.time,
          createdAt: new Date(tx.createdAt),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
    }

    toast('Imported', `${normalized.length} transaction(s) imported successfully.`, 'success');
  } catch (error) {
    console.error(error);
    toast('Import failed', error?.message || 'Could not import JSON.', 'error');
  } finally {
    event.target.value = '';
  }
}

function initQuickTime() {
  const { date, time } = nowParts();
  els.dateInput.value = date;
  els.timeInput.value = time;
}

function initThemeButtons() {
  setTheme(state.theme);
}

function updateMetaTheme() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0b1020' : '#eff4ff');
}

function autoRefreshFilterContext() {
  const today = new Date().toISOString().slice(0, 10);
  if (!els.dateFilter.value) els.dateFilter.placeholder = today;
}

function periodicRepaint() {
  clearInterval(transactionWatcherTimer);
  transactionWatcherTimer = setInterval(() => {
    if (state.activeView === 'analytics' && chartsReady) {
      renderCharts();
    }
  }, 60000);
}

function bootstrap() {
  renderSelectOptions();
  renderSplitCheckboxes();
  initQuickTime();
  initThemeButtons();
  updateMetaTheme();
  bindEvents();
  autoRefreshFilterContext();
  periodicRepaint();
  renderFavorites();

  if (window.innerWidth < 860) {
    showView('dashboard');
  }

  initFirebase().catch(err => {
    console.error(err);
    state.loading = false;
    toast('Startup failed', err?.message || 'Could not initialize the app.', 'error');
    renderAll();
  });

  window.addEventListener('resize', () => {
    if (state.activeView === 'analytics' && chartsReady) {
      renderCharts();
    }
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!els.modalOverlay.classList.contains('hidden')) closeModal();
      if (!els.confirmDialog.classList.contains('hidden')) closeConfirm(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      showView('history');
      els.searchInput.focus();
    }
  });

}

bootstrap();
