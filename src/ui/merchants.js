// Merchant picking shared by Add and "Which card?": chips for her most-used merchants, search by
// name or alias, "Add [name]" for one we don't know, and category code descriptions.

import { h, field, sheet, categorySelect, capitalize, fill } from './dom.js';
import { state, searchMerchants, findMerchant, addMerchant } from '../db/repo.js';
import { shortDescription, fullDescription } from '../engine/index.js';

/**
 * Chips under a merchant input: her 8 most-used merchants when it's empty, matches (names and
 * aliases) while she types, and "Add [name]" when nothing is called exactly that.
 * @returns {{ render: () => void, el: HTMLElement }}
 */
export function merchantChips({ input, onPick }) {
  const el = h('div', { class: 'chips recent', role: 'group', 'aria-label': 'Merchants' });
  const render = () => {
    const text = input.value.trim();
    const exact = findMerchant(text);
    const list = searchMerchants(text, 8);
    fill(el,
      list.map((m) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(m === exact),
        onclick: () => { input.value = m.name; onPick(m); render(); },
      }, m.name)),
      text && !exact ? h('button', {
        type: 'button', class: 'chip chip-add',
        onclick: () => addMerchantSheet(text, (m) => { input.value = m.name; onPick(m); render(); }),
      }, `Add ${text}`) : null);
  };
  render();
  return { el, render };
}

// A merchant we don't know: pick its category ("Not sure" is fine) and save it as a guess.
export function addMerchantSheet(name, onSaved) {
  const nameInput = h('input', { type: 'text', value: name, required: true, autocapitalize: 'words' });
  const category = categorySelect(state.categories, '');
  let s;
  const form = h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const existing = findMerchant(nameInput.value);
      const m = existing || await addMerchant({ name: nameInput.value, category: category.value || null });
      s.close();
      onSaved(m);
    },
  },
  field('Name', nameInput),
  field('Category', category, 'Its category code is guessed from the category until you enter it or a statement confirms it.'),
  h('div', { class: 'sheet-actions' }, h('button', { type: 'submit', class: 'button primary' }, 'Add merchant')));
  s = sheet('Add a merchant', form);
  category.focus();
}

// "5499: Miscellaneous food stores", or just the code if it isn't in the list.
export function codeLabel(mcc) {
  const d = shortDescription(state.codesByMcc[mcc]);
  return d ? `${mcc}: ${d}` : mcc;
}

// A code with its short description; tapping shows the full description and any note.
export function codeButton(mcc) {
  const entry = state.codesByMcc[mcc];
  if (!entry) return h('span', {}, codeLabel(mcc));
  return h('button', {
    type: 'button', class: 'link-button',
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      sheet(`Category code ${mcc}`, h('div', { class: 'sheet-form' },
        h('p', {}, `${fullDescription(entry)}.`),
        entry.note ? h('p', { class: 'muted' }, entry.note) : null));
    },
  }, codeLabel(mcc));
}

export const statusLabel = (status) => capitalize(status || 'guess');
