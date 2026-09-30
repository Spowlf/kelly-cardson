// Quick add: number pad for the amount, pick a past merchant to fill everything from last time, save.

import { h, chips, categorySelect, field, toast, money, shortName, METHOD_NAMES, methodPhrase, CHANNELS, fill } from './dom.js';
import { state, saveTxn, deleteTxn, findMerchant, lastTxnAt, merchantSuggestions } from '../db/repo.js';
import { today } from '../engine/index.js';

const ALL_METHODS = Object.keys(METHOD_NAMES);

export function renderAdd(root, { go }) {
  if (!state.myCards.length) {
    fill(root, h('section', { class: 'empty' },
      h('h2', {}, 'No cards yet'),
      h('p', {}, 'Add a card before logging purchases on it.'),
      h('button', { type: 'button', class: 'button primary', onclick: () => go('cards') }, 'Add a card')));
    return;
  }

  const f = { amount: '', merchant: '', category: '', cardId: state.myCards[0].cardId, method: 'mobile_tap', date: today(), fcy: false };

  const display = h('output', { class: 'pad-display', 'aria-live': 'polite' });
  const saveButton = h('button', { type: 'submit', class: 'button primary save' });
  const summary = h('p', { class: 'save-summary' });
  const renderSummary = () => fill(summary, 
    h('span', {}, 'On ', h('strong', {}, shortName(state.cardsById[f.cardId])), `, ${methodPhrase(f.method)}`),
    h('button', { type: 'button', class: 'change', onclick: () => document.getElementById('add-details').scrollIntoView({ behavior: 'smooth' }) }, 'Change'));
  const merchantInput = h('input', {
    type: 'text', placeholder: 'Merchant', autocomplete: 'off', autocapitalize: 'words',
    oninput: () => { f.merchant = merchantInput.value; renderRecent(); },
    onchange: () => fillFromMemory(),
  });
  const recent = h('div', { class: 'chips recent', role: 'group', 'aria-label': 'Recent merchants' });
  const cardChips = chips({
    name: 'card', label: 'Card', value: f.cardId,
    options: state.myCards.map((c) => ({ value: c.cardId, label: shortName(state.cardsById[c.cardId]) })),
    onChange: (v) => { f.cardId = v; renderSummary(); },
  });
  const methodChips = chips({
    name: 'method', label: 'How you paid', value: f.method,
    options: ALL_METHODS.map((m) => ({ value: m, label: METHOD_NAMES[m] })),
    onChange: (v) => { f.method = v; renderSummary(); },
  });
  const categoryInput = categorySelect(state.categories, f.category, {
    onchange: () => {
      f.category = categoryInput.value;
      const channel = state.categoriesById[f.category]?.channel;
      if (channel && !CHANNELS[channel].methods.includes(f.method)) setMethod(CHANNELS[channel].methods[0]);
    },
  });
  const dateInput = h('input', { type: 'date', value: f.date, max: today(), onchange: () => { f.date = dateInput.value || today(); } });
  const fcyInput = h('input', { type: 'checkbox', onchange: () => { f.fcy = fcyInput.checked; } });

  const setMethod = (m) => { f.method = m; methodChips.set(m); renderSummary(); };
  const setCard = (id) => { if (state.myCards.some((c) => c.cardId === id)) { f.cardId = id; cardChips.set(id); renderSummary(); } };

  // Past merchant: category, method and card from last time.
  function fillFromMemory() {
    const m = findMerchant(f.merchant);
    if (!m) return;
    f.merchant = m.name;
    merchantInput.value = m.name;
    const last = lastTxnAt(m.name);
    if (m.category) { f.category = m.category; categoryInput.value = m.category; }
    const method = last?.method || m.usualMethod;
    if (method) setMethod(method);
    setCard(last?.cardId || m.usualCardId);
    renderRecent();
  }

  function renderRecent() {
    const list = merchantSuggestions(f.merchant, 8);
    fill(recent, ...list.map((m) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(m.nameLower === f.merchant.trim().toLowerCase()),
      onclick: () => { f.merchant = m.name; fillFromMemory(); },
    }, m.name)));
  }

  function renderAmount() {
    const value = Number(f.amount || 0);
    fill(display, h('span', { class: 'currency' }, 'S$'), h('span', { class: 'num' }, f.amount || '0'));
    saveButton.textContent = value > 0 ? `Save ${money(value)}` : 'Enter an amount';
    saveButton.disabled = !(value > 0);
  }

  function press(key) {
    let a = f.amount;
    if (key === 'back') a = a.slice(0, -1);
    else if (key === '.') a = a.includes('.') ? a : `${a || '0'}.`;
    else if (/\.\d{2}$/.test(a) || a.replace('.', '').length >= 7) return;
    else a = a === '0' ? key : a + key;
    f.amount = a;
    renderAmount();
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  const pad = h('div', { class: 'keypad' }, keys.map((k) => h('button', {
    type: 'button', class: 'key', 'aria-label': k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k,
    onclick: () => press(k),
  }, k === 'back' ? '⌫' : k)));

  async function save(e) {
    e.preventDefault();
    if (!(Number(f.amount) > 0)) return;
    const txn = await saveTxn({ ...f, amount: Number(f.amount) });
    toast(`Saved ${money(txn.amount)}${txn.merchant ? ` at ${txn.merchant}` : ''}`, { label: 'Undo', run: async () => { await deleteTxn(txn.id); toast('Removed'); } });
    // Card, method and date stay for a run of purchases; merchant details don't carry over.
    f.amount = '';
    f.merchant = '';
    f.category = '';
    f.fcy = false;
    merchantInput.value = '';
    categoryInput.value = '';
    fcyInput.checked = false;
    renderAmount();
    renderRecent();
  }

  renderAmount();
  renderRecent();
  renderSummary();
  merchantInput.setAttribute('aria-label', 'Merchant');
  fill(root, h('form', { class: 'add-form', onsubmit: save },
    display,
    merchantInput,
    recent,
    pad,
    summary,
    saveButton,
    h('div', { id: 'add-details', class: 'add-details' },
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Card'), cardChips),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'How you paid'), methodChips),
      field('Category', categoryInput),
      field('Date', dateInput),
      h('label', { class: 'toggle' }, fcyInput, h('span', {}, 'Charged in foreign currency')))));
}
