// History: logged purchases (edit or delete) and merchant memory (edit or delete).

import { h, chips, categorySelect, field, sheet, toast, money, shortName, METHOD_NAMES, methodPhrase, CHANNELS, channelsFor, fill } from './dom.js';
import { state, saveTxn, deleteTxn, saveMerchant, deleteMerchant, engineTxns, findMerchant } from '../db/repo.js';
import { formatDay, today, resultsByTxn, codeFor, EARNED_BONUS, BASE_ONLY } from '../engine/index.js';
import { codeButton, codeLabel, statusLabel } from './merchants.js';

let tab = 'purchases';

export function renderHistory(root) {
  const body = h('div');
  const render = () => fill(body, tab === 'purchases' ? purchases(render) : merchants(render));
  fill(root, 
    chips({
      name: 'history-tab', label: 'Show', value: tab,
      options: [{ value: 'purchases', label: 'Purchases' }, { value: 'merchants', label: 'Merchants' }],
      onChange: (v) => { tab = v; render(); },
    }),
    body);
  render();
}

const methodOptions = (value) => Object.entries(METHOD_NAMES).map(([v, label]) => h('option', { value: v, selected: v === value }, label));
// Her cards, plus the current one if she has since removed it, so saving never moves a purchase silently.
const cardOptions = (value, allowNone) => {
  const ids = state.myCards.map((c) => c.cardId);
  if (value && !ids.includes(value)) ids.push(value);
  const label = (id) => (state.cardsById[id] ? shortName(state.cardsById[id]) : id) + (state.myCards.some((c) => c.cardId === id) ? '' : ', removed');
  return [
    allowNone ? h('option', { value: '', selected: !value }, 'None') : null,
    ...ids.map((id) => h('option', { value: id, selected: id === value }, label(id))),
  ];
};

function purchases(render) {
  const list = [...state.txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  if (!list.length) return h('p', { class: 'empty-line' }, 'Purchases you log appear here.');
  const results = resultsByTxn({ cards: state.cards, myCards: state.myCards, txns: engineTxns(), categories: state.categories, settings: state.settings });
  const groups = [];
  for (const t of list) {
    if (groups.at(-1)?.date !== t.date) groups.push({ date: t.date, items: [] });
    groups.at(-1).items.push(t);
  }
  return h('div', {}, groups.map((g) => h('section', { class: 'day' },
    h('h2', { class: 'subhead' }, g.date === today() ? 'Today' : formatDay(g.date)),
    h('ul', { class: 'list' }, g.items.map((t) => h('li', {}, h('button', { type: 'button', class: 'list-row', onclick: () => editTxn(t, render) },
      h('span', { class: 'list-main' },
        h('span', { class: 'list-title' }, t.isCatchUp ? 'Statement catch-up' : t.merchant || 'No merchant', results.get(t.id)?.disputes?.length ? h('span', { class: 'tag tag-unconfirmed' }, 'Check on statement') : null),
        h('span', { class: 'list-sub' }, `${state.cardsById[t.cardId] ? shortName(state.cardsById[t.cardId]) : t.cardId}${t.method ? `, ${methodPhrase(t.method)}` : ''}${t.fcy ? ', foreign currency' : ''}`)),
      h('span', { class: 'list-amount' }, money(t.amount)))))))));
}

function editTxn(t, render) {
  const amount = h('input', { type: 'text', inputmode: 'decimal', value: String(t.amount), required: true });
  const merchant = h('input', { type: 'text', value: t.merchant || '', autocapitalize: 'words' });
  const date = h('input', { type: 'date', value: t.date, max: today() });
  const card = h('select', {}, cardOptions(t.cardId));
  const method = h('select', {}, methodOptions(t.method));
  const category = categorySelect(state.categories, t.category);
  const fcy = h('input', { type: 'checkbox', checked: t.fcy });
  let s;
  const form = h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const value = Number(amount.value.replace(/[^\d.]/g, ''));
      if (!(value > 0)) { amount.setCustomValidity('Enter an amount above zero.'); amount.reportValidity(); return; }
      // A catch-up has no method or category; its hidden fields must not give it one.
      const details = t.isCatchUp ? { method: t.method, category: t.category } : { method: method.value, category: category.value };
      await saveTxn({ ...t, ...details, amount: value, merchant: merchant.value, date: date.value || t.date, cardId: card.value, fcy: fcy.checked });
      s.close();
      toast('Purchase updated');
      render();
    },
  },
  field('Amount in S$', amount),
  field('Merchant', merchant),
  field('Date', date),
  field('Card', card),
  t.isCatchUp ? null : field('How you paid', method),
  t.isCatchUp ? null : field('Category', category),
  h('label', { class: 'toggle' }, fcy, h('span', {}, 'Charged in foreign currency')),
  h('div', { class: 'sheet-actions' },
    h('button', { type: 'submit', class: 'button primary' }, 'Save changes'),
    h('button', {
      type: 'button', class: 'button danger',
      onclick: async () => {
        if (!confirm(`Delete ${money(t.amount)}${t.merchant ? ` at ${t.merchant}` : ''}?`)) return;
        await deleteTxn(t.id);
        s.close();
        toast('Purchase deleted');
        render();
      },
    }, 'Delete purchase')));
  s = sheet('Edit purchase', form);
}

function merchants(render) {
  const list = [...state.merchants].sort((a, b) => (b.useCount || 0) - (a.useCount || 0) || a.name.localeCompare(b.name));
  if (!list.length) return h('p', { class: 'empty-line' }, 'Merchants are remembered when you log a purchase.');
  return h('ul', { class: 'list' }, list.map((m) => {
    const code = codeFor(m, state.categoriesById[m.category]);
    return h('li', {}, h('button', { type: 'button', class: 'list-row', onclick: () => editMerchant(m, render) },
      h('span', { class: 'list-main' },
        h('span', { class: 'list-title' }, m.name),
        h('span', { class: 'list-sub' }, [
          state.categoriesById[m.category]?.label || 'No category',
          code.mcc && codeLabel(code.mcc),
          statusLabel(m.status),
        ].filter(Boolean).join(', '))),
      m.useCount ? h('span', { class: 'list-amount' }, `${m.useCount}×`) : null));
  }));
}

const RESULT_LABELS = { [EARNED_BONUS]: 'Earned bonus', [BASE_ONLY]: 'Base rate only' };
const splitList = (text) => text.split(',').map((x) => x.trim()).filter(Boolean);

// Everything merchant memory knows, all of it editable. Saving marks it edited by her.
function editMerchant(m, render) {
  const cat = () => state.categoriesById[category.value];
  const name = h('input', { type: 'text', value: m.name, required: true, autocapitalize: 'words' });
  const aliases = h('input', { type: 'text', value: (m.aliases || []).join(', '), autocapitalize: 'words', placeholder: 'e.g. NTUC, NTUC FairPrice' });
  // MRT / bus only for the MRT / bus category, and not for any other.
  const channelOptions = () => {
    const current = channel.options.length ? channel.value : m.channel;
    fill(channel, h('option', { value: '' }, 'Not set'),
      channelsFor(cat()).map((v) => h('option', { value: v, selected: v === current }, CHANNELS[v].label)));
  };
  const category = categorySelect(state.categories, m.category, { onchange: () => { channelOptions(); describe(); } });
  const mcc = h('input', { type: 'text', inputmode: 'numeric', pattern: '\\d{4}', maxlength: 4, value: m.mcc || '', placeholder: 'e.g. 5812', oninput: () => describe() });
  const codeNote = h('span', { class: 'field-hint' });
  // The code in use and what it means: hers, the reported one, or the category's default.
  const describe = () => {
    const typed = /^\d{4}$/.test(mcc.value) ? mcc.value : null;
    if (typed) return fill(codeNote, codeButton(typed));
    const d = cat()?.default_mcc;
    return fill(codeNote, d ? ['Not known. Using the category default, ', codeButton(d), '.'] : 'Not known.');
  };
  const altMccs = h('input', { type: 'text', inputmode: 'numeric', value: (m.altMccs || []).join(', '), placeholder: 'e.g. 5812, 5814' });
  const channel = h('select');
  channelOptions();
  const method = h('select', {}, h('option', { value: '' }, 'Not set'), methodOptions(m.usualMethod));
  const card = h('select', {}, cardOptions(m.usualCardId, true));
  // Statement results for each of her cards, plus any card she has since removed.
  const resultCards = [...new Set([...state.myCards.map((c) => c.cardId), ...Object.keys(m.cardResults || {})])];
  const results = resultCards.map((id) => ({
    id,
    input: h('select', {},
      h('option', { value: '' }, 'Not checked'),
      [EARNED_BONUS, BASE_ONLY].map((v) => h('option', { value: v, selected: m.cardResults?.[id] === v }, RESULT_LABELS[v]))),
  }));
  describe();
  let s;
  const form = h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      if (mcc.value && !/^\d{4}$/.test(mcc.value)) { mcc.setCustomValidity('Enter 4 digits.'); mcc.reportValidity(); return; }
      const other = findMerchant(name.value);
      if (other && other.id !== m.id) { name.setCustomValidity(`You already have ${other.name}.`); name.reportValidity(); return; }
      const cardResults = Object.fromEntries(results.filter((r) => r.input.value).map((r) => [r.id, r.input.value]));
      await saveMerchant(m, {
        name: name.value, aliases: splitList(aliases.value), category: category.value || null, mcc: mcc.value || null,
        altMccs: splitList(altMccs.value).filter((x) => /^\d{4}$/.test(x)), channel: channel.value || null,
        usualMethod: method.value || null, usualCardId: card.value || null, cardResults,
      });
      s.close();
      toast('Merchant updated');
      render();
    },
  },
  h('dl', { class: 'facts' },
    h('dt', {}, 'Status'), h('dd', {}, statusLabel(m.status)),
    m.source ? [h('dt', {}, 'Source'), h('dd', {}, m.source)] : null,
    h('dt', {}, 'Used'), h('dd', {}, m.useCount ? `${m.useCount} time${m.useCount === 1 ? '' : 's'}${m.lastUsed ? `, last on ${formatDay(today(new Date(m.lastUsed)))}` : ''}` : 'Not yet')),
  field('Name', name),
  field('Other names', aliases, 'Separate them with commas. Search finds the merchant by any of them.'),
  field('Category', category),
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Category code'), mcc, codeNote,
    h('span', { class: 'field-hint' }, 'Find it with HeyMax\'s merchant lookup, or on your bank statement.')),
  field('Other possible codes', altMccs, 'Codes other sources report for this merchant, separated by commas.'),
  field('Where you pay', channel),
  field('Usual way to pay', method),
  field('Usual card', card),
  results.length ? h('h3', {}, 'What your statements showed') : null,
  results.map((r) => field(state.cardsById[r.id] ? shortName(state.cardsById[r.id]) : r.id, r.input)),
  h('div', { class: 'sheet-actions' },
    h('button', { type: 'submit', class: 'button primary' }, 'Save changes'),
    h('button', {
      type: 'button', class: 'button danger',
      onclick: async () => {
        if (!confirm(`Delete ${m.name}? Past purchases stay.`)) return;
        await deleteMerchant(m.id);
        s.close();
        toast('Merchant deleted');
        render();
      },
    }, 'Delete merchant')));
  for (const input of [name, mcc]) input.addEventListener('input', () => input.setCustomValidity(''));
  s = sheet(m.name, form);
}
