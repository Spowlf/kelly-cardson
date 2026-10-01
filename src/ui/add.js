// Quick add: number pad for the amount, pick a merchant to fill everything from last time, save.

import { h, chips, categorySelect, field, toast, money, shortName, METHOD_NAMES, methodPhrase, CHANNELS, fill, scrollBehaviour } from './dom.js';
import { state, saveTxn, deleteTxn, findMerchant, lastTxnAt, forEngine, engineTxns, loadDraft, saveDraft, newId } from '../db/repo.js';
import { recommend, today } from '../engine/index.js';
import { merchantChips } from './merchants.js';

const ALL_METHODS = Object.keys(METHOD_NAMES);

export function renderAdd(root, { go }) {
  if (!state.myCards.length) {
    fill(root, h('section', { class: 'empty' },
      h('h2', {}, 'No cards yet'),
      h('p', {}, 'Add a card before logging purchases on it.'),
      h('button', { type: 'button', class: 'button primary', onclick: () => go('cards') }, 'Add a card')));
    return;
  }

  // id is chosen when the form starts, so saving twice (a double tap, or again after reopening) updates instead of adding a copy.
  const f = { id: newId(), amount: '', merchant: null, category: '', cardId: state.myCards[0].cardId, method: 'mobile_tap', date: today(), fcy: false, from: null };

  // The draft is written on every change, so closing the app mid-entry loses nothing.
  const keep = () => {
    const name = merchantInput.value.trim();
    saveDraft('add', f.amount || name
      ? { id: f.id, amount: f.amount, merchant: name, category: f.category, cardId: f.cardId, method: f.method, date: f.date, fcy: f.fcy }
      : null).catch(() => {});
  };

  const display = h('output', { class: 'pad-display', 'aria-live': 'polite' });
  const saveButton = h('button', { type: 'submit', class: 'button primary save' });
  const summary = h('p', { class: 'save-summary' });
  const renderSummary = () => {
    if (!f.merchant) {
      fill(summary, h('span', {}, 'Pick a merchant to see the best card.'));
      return;
    }
    const why = f.from === 'best' ? 'Best card: ' : 'On ';
    const after = f.from === 'last' ? ', like last time' : '';
    fill(summary,
      h('span', {}, why, h('strong', {}, shortName(state.cardsById[f.cardId])), `, ${methodPhrase(f.method)}${after}`),
      h('button', { type: 'button', class: 'change', onclick: () => document.getElementById('add-details').scrollIntoView({ behavior: scrollBehaviour() }) }, 'Change'));
  };
  const merchantInput = h('input', {
    type: 'text', placeholder: 'Merchant', autocomplete: 'off', autocapitalize: 'words',
    oninput: () => { pickMerchant(findMerchant(merchantInput.value)); picker.render(); keep(); },
  });
  const picker = merchantChips({ input: merchantInput, onPick: (m) => { pickMerchant(m); keep(); } });
  const cardChips = chips({
    name: 'card', label: 'Card', value: f.cardId,
    options: state.myCards.map((c) => ({ value: c.cardId, label: shortName(state.cardsById[c.cardId]) })),
    onChange: (v) => { f.cardId = v; f.from = null; renderSummary(); keep(); },
  });
  const methodChips = chips({
    name: 'method', label: 'How you paid', value: f.method,
    options: ALL_METHODS.map((m) => ({ value: m, label: METHOD_NAMES[m] })),
    onChange: (v) => { f.method = v; f.from = null; renderSummary(); keep(); },
  });
  const categoryInput = categorySelect(state.categories, f.category, {
    onchange: () => {
      f.category = categoryInput.value;
      const channel = state.categoriesById[f.category]?.channel;
      if (channel && !CHANNELS[channel].methods.includes(f.method)) setMethod(CHANNELS[channel].methods[0]);
      keep();
    },
  });
  const dateInput = h('input', { type: 'date', value: f.date, max: today(), onchange: () => { f.date = dateInput.value || today(); keep(); } });
  const fcyInput = h('input', { type: 'checkbox', onchange: () => { f.fcy = fcyInput.checked; keep(); } });

  const setMethod = (m) => { f.method = m; methodChips.set(m); renderSummary(); };
  const setCard = (id) => { if (state.myCards.some((c) => c.cardId === id)) { f.cardId = id; cardChips.set(id); renderSummary(); } };

  // A merchant fills in its category, and the card and method from last time. With no last
  // time, the best of her cards for it.
  function pickMerchant(m) {
    if (m === f.merchant) return;
    f.merchant = m;
    if (!m) { renderSummary(); renderAmount(); return; }
    if (m.category) { f.category = m.category; categoryInput.value = m.category; }
    const last = lastTxnAt(m.name);
    const usual = last || (m.usualCardId && m.usualMethod ? { cardId: m.usualCardId, method: m.usualMethod } : null);
    if (usual && state.myCards.some((c) => c.cardId === usual.cardId)) {
      f.from = 'last';
      setCard(usual.cardId);
      if (usual.method) setMethod(usual.method);
    } else {
      const channel = m.channel || state.categoriesById[m.category]?.channel || 'in_person';
      const purchase = forEngine({ amount: Number(f.amount) || 10, date: f.date, fcy: f.fcy, channel, category: m.category, merchant: m.name, method: m.usualMethod || undefined });
      const top = recommend({ purchase, cards: state.cards, myCards: state.myCards, categories: state.categories, settings: state.settings, txns: engineTxns() }).results[0];
      f.from = top ? 'best' : null;
      if (top) { setCard(top.cardId); setMethod(top.best.method); }
    }
    renderSummary();
    renderAmount();
  }

  function renderAmount() {
    const value = Number(f.amount || 0);
    fill(display, h('span', { class: 'currency' }, 'S$'), h('span', { class: 'num' }, f.amount || '0'));
    saveButton.textContent = !(value > 0) ? 'Enter an amount' : !f.merchant ? 'Pick a merchant' : `Save ${money(value)}`;
    saveButton.disabled = !(value > 0 && f.merchant);
  }

  function press(key) {
    let a = f.amount;
    if (key === 'back') a = a.slice(0, -1);
    else if (key === '.') a = a.includes('.') ? a : `${a || '0'}.`;
    else if (/\.\d{2}$/.test(a) || a.replace('.', '').length >= 7) return;
    else a = a === '0' ? key : a + key;
    f.amount = a;
    renderAmount();
    keep();
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  const pad = h('div', { class: 'keypad' }, keys.map((k) => h('button', {
    type: 'button', class: 'key', 'aria-label': k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k,
    onclick: () => press(k),
  }, k === 'back' ? '⌫' : k)));

  async function save(e) {
    e.preventDefault();
    if (!(Number(f.amount) > 0) || !f.merchant) return;
    saveButton.disabled = true;
    let txn;
    try {
      txn = await saveTxn({ ...f, merchant: f.merchant.name, amount: Number(f.amount) });
    } catch {
      toast('Nothing changed: the purchase couldn\'t be saved on this phone. Try again.');
      renderAmount();
      return;
    }
    f.id = newId();
    toast(`Saved ${money(txn.amount)} at ${txn.merchant}`, { label: 'Undo', run: async () => { await deleteTxn(txn.id); toast(`Deleted ${money(txn.amount)} at ${txn.merchant}`); picker.render(); } });
    // Card, method and date stay for a run of purchases; merchant details don't carry over.
    f.amount = '';
    f.merchant = null;
    f.category = '';
    f.fcy = false;
    f.from = null;
    merchantInput.value = '';
    categoryInput.value = '';
    fcyInput.checked = false;
    renderAmount();
    renderSummary();
    picker.render();
    keep();
  }

  // Back from a draft: what was typed, then the card and method she chose over the merchant's usual ones.
  const draft = loadDraft('add');
  if (draft) {
    Object.assign(f, { id: draft.id || f.id, amount: draft.amount || '', date: draft.date || f.date, fcy: !!draft.fcy });
    dateInput.value = f.date;
    fcyInput.checked = f.fcy;
    merchantInput.value = draft.merchant || '';
    pickMerchant(findMerchant(merchantInput.value));
    picker.render();
    if (draft.category) { f.category = draft.category; categoryInput.value = draft.category; }
    if (draft.cardId && draft.cardId !== f.cardId && state.myCards.some((c) => c.cardId === draft.cardId)) { f.from = null; setCard(draft.cardId); }
    if (draft.method && draft.method !== f.method) { f.from = null; setMethod(draft.method); }
  }

  renderAmount();
  renderSummary();
  merchantInput.setAttribute('aria-label', 'Merchant');
  fill(root, h('form', { class: 'add-form', onsubmit: save },
    display,
    merchantInput,
    picker.el,
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
