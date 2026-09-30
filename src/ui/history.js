// History: logged purchases (edit or delete) and merchant memory (edit or delete).

import { h, chips, categorySelect, field, sheet, toast, money, shortName, METHOD_NAMES, methodPhrase, CHANNELS, channelsFor, fill } from './dom.js';
import { state, saveTxn, deleteTxn, saveMerchant, deleteMerchant } from '../db/repo.js';
import { formatDay, today, resultsByTxn } from '../engine/index.js';

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
  const results = resultsByTxn({ cards: state.cards, myCards: state.myCards, txns: state.txns, categories: state.categories, settings: state.settings });
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
  const list = [...state.merchants].sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return h('p', { class: 'empty-line' }, 'Merchants are remembered when you log a purchase.');
  return h('ul', { class: 'list' }, list.map((m) => h('li', {}, h('button', { type: 'button', class: 'list-row', onclick: () => editMerchant(m, render) },
    h('span', { class: 'list-main' },
      h('span', { class: 'list-title' }, m.name),
      h('span', { class: 'list-sub' }, [
        state.categoriesById[m.category]?.label || 'No category',
        m.usualMethod && methodPhrase(m.usualMethod),
        m.usualCardId && state.cardsById[m.usualCardId] && shortName(state.cardsById[m.usualCardId]),
      ].filter(Boolean).join(', ')))))));
}

function editMerchant(m, render) {
  const name = h('input', { type: 'text', value: m.name, required: true, autocapitalize: 'words' });
  // MRT / bus only for the MRT / bus category, and not for any other.
  const channelOptions = () => {
    const current = channel.options.length ? channel.value : m.channel;
    fill(channel, h('option', { value: '' }, 'Not set'),
      channelsFor(state.categoriesById[category.value]).map((v) => h('option', { value: v, selected: v === current }, CHANNELS[v].label)));
  };
  const category = categorySelect(state.categories, m.category, { onchange: () => channelOptions() });
  const mcc = h('input', { type: 'text', inputmode: 'numeric', pattern: '\\d{4}', maxlength: 4, value: m.mcc || '', placeholder: 'e.g. 5812' });
  const channel = h('select');
  channelOptions();
  const method = h('select', {}, h('option', { value: '' }, 'Not set'), methodOptions(m.usualMethod));
  const card = h('select', {}, cardOptions(m.usualCardId, true));
  let s;
  const form = h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      await saveMerchant({ ...m, name: name.value, category: category.value || null, mcc: mcc.value || null, channel: channel.value || null, usualMethod: method.value || null, usualCardId: card.value || null });
      s.close();
      toast('Merchant updated');
      render();
    },
  },
  field('Name', name),
  field('Category', category),
  field('Category code', mcc, 'Look it up with HeyMax\'s category code lookup: search the merchant name. Or check the category shown next to the purchase on your statement or bank app. With the real code, recommendations are exact.'),
  field('Where you pay', channel),
  field('Usual way to pay', method),
  field('Usual card', card),
  h('div', { class: 'sheet-actions' },
    h('button', { type: 'submit', class: 'button primary' }, 'Save changes'),
    h('button', {
      type: 'button', class: 'button danger',
      onclick: async () => {
        if (!confirm(`Forget ${m.name}? Past purchases stay.`)) return;
        await deleteMerchant(m.id);
        s.close();
        toast('Merchant forgotten');
        render();
      },
    }, 'Forget merchant')));
  s = sheet('Edit merchant', form);
}
