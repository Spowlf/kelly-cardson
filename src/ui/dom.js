// Small DOM helpers shared by the screens. No framework: screens build elements with h().

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// replaceChildren that skips null/false/undefined (the native one would print them as text).
export const fill = (el, ...children) => el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));

// Payment methods as she'd name them.
export const METHOD_NAMES = {
  mobile_tap: 'Phone tap',
  physical_tap: 'Card tap',
  chip_or_swipe: 'Chip or swipe',
  online_card_entry: 'Card number',
  in_app_wallet: 'Apple Pay in app',
  simplygo: 'SimplyGo',
};

// The instruction on a recommendation.
export const METHOD_VERBS = {
  mobile_tap: 'Pay by phone',
  physical_tap: 'Tap the card',
  chip_or_swipe: 'Insert or swipe the card',
  online_card_entry: 'Enter the card number',
  in_app_wallet: 'Use Apple Pay in the app',
  simplygo: 'Tap at the gantry',
};

export const CHANNELS = {
  in_person: { label: 'In store', methods: ['mobile_tap', 'physical_tap', 'chip_or_swipe'] },
  online: { label: 'Online', methods: ['online_card_entry', 'in_app_wallet'] },
  transit: { label: 'MRT / bus', methods: ['simplygo'] },
};

export const money = (n) => `S$${Number(n).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const miles = (n) => Math.floor(n).toLocaleString('en-SG');

// "UOB Preferred Visa (formerly UOB PPV)" -> "UOB Preferred Visa"
export const shortName = (card) => card.name.replace(/\s*\(.*\)\s*$/, '');

export const unconfirmedTag = () => h('span', { class: 'tag tag-unconfirmed' }, 'unconfirmed');

// A chip row where one value is selected. options: [{ value, label }]
export function chips({ name, options, value, onChange, label }) {
  const group = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label });
  const render = (current) => {
    group.replaceChildren(...options.map((o) => h('button', {
      type: 'button',
      class: 'chip',
      role: 'radio',
      'aria-checked': String(o.value === current),
      dataset: { name, value: o.value },
      onclick: () => { render(o.value); onChange(o.value); },
    }, o.label)));
  };
  render(value);
  group.set = render;
  return group;
}

// Category <select>: earning categories first, then the no-miles ones.
export function categorySelect(categories, value, props = {}) {
  const option = (c) => h('option', { value: c.id, selected: c.id === value }, c.label);
  return h('select', props,
    h('option', { value: '', selected: !value }, 'Not sure'),
    h('optgroup', { label: 'Earns miles' }, categories.filter((c) => !c.no_miles).map(option)),
    h('optgroup', { label: 'No miles, use any card' }, categories.filter((c) => c.no_miles).map(option)));
}

let toastTimer;
// Brief confirmation with an optional action (e.g. Undo).
export function toast(message, action) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  fill(el, h('span', {}, message), action && h('button', {
    type: 'button',
    class: 'toast-action',
    onclick: async () => { el.classList.remove('show'); await action.run(); },
  }, action.label));
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

// Bottom sheet. content: element; returns { close }.
export function sheet(title, content) {
  const dialog = h('dialog', { class: 'sheet', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onclick: () => close() }, '✕')),
    content);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return { close, dialog };
}

// A labelled form field.
export const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'field-hint' }, hint));
