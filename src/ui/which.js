// "Which card?": merchant, amount, how she's paying -> her cards ranked, with "Paid with this".

import { h, chips, categorySelect, field, sheet, toast, money, miles, shortName, unconfirmedTag, METHOD_NAMES, METHOD_VERBS, CHANNELS, channelsFor, fill } from './dom.js';
import { state, saveTxn, deleteTxn, findMerchant, forEngine, engineTxns, rememberWhereHow, loadDraft, saveDraft } from '../db/repo.js';
import { recommend, kiasumilesPrompt, today } from '../engine/index.js';
import { merchantChips } from './merchants.js';

// Kept between visits to the tab.
const form = { merchant: '', amount: '', category: '', channel: 'in_person', method: 'any', fcy: false };
// The top answer last shown, so its figure moves only when the card or its miles change.
let lastTop = null;
// The form also survives closing the app: it's restored once, from the draft.
let restored = false;

export function renderWhich(root, { go }) {
  if (!state.myCards.length) {
    fill(root, h('section', { class: 'empty' },
      h('h2', {}, 'Add your cards first'),
      h('p', {}, 'Recommendations use only the cards you carry. Add each card as it arrives.'),
      h('button', { type: 'button', class: 'button primary', onclick: () => go('cards') }, 'Add a card')));
    return;
  }

  if (!restored) {
    Object.assign(form, loadDraft('which'));
    restored = true;
  }
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const merchantInput = h('input', {
    type: 'text', value: form.merchant, placeholder: 'e.g. Din Tai Fung', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next',
    oninput: () => { form.merchant = merchantInput.value; applyMemory(); picker.render(); update(); },
  });
  const picker = merchantChips({
    input: merchantInput,
    onPick: () => { form.merchant = merchantInput.value; applyMemory(); update(); amountInput.focus(); },
  });
  const amountInput = h('input', {
    type: 'text', inputmode: 'decimal', value: form.amount, placeholder: '0.00', class: 'amount-input', enterkeyhint: 'done',
    oninput: () => { form.amount = amountInput.value.replace(/[^\d.]/g, ''); update(); },
  });
  const categoryInput = categorySelect(state.categories, form.category, {
    onchange: () => {
      form.category = categoryInput.value;
      const channel = state.categoriesById[form.category]?.channel;
      if (channel) setChannel(channel);
      else renderChannels();
      update();
    },
  });
  const methodChips = h('div');
  const channelChips = h('div');
  const howRow = h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'How'), methodChips);
  const fcyInput = h('input', { type: 'checkbox', checked: form.fcy, onchange: () => { form.fcy = fcyInput.checked; update(); } });

  // Where she can pay depends on the category; MRT / bus has only one way, so the How row goes.
  function renderChannels() {
    const allowed = channelsFor(state.categoriesById[form.category]);
    if (!allowed.includes(form.channel)) { form.channel = allowed[0]; form.method = 'any'; }
    fill(channelChips, chips({
      name: 'channel', label: 'Where', value: form.channel,
      options: allowed.map((value) => ({ value, label: CHANNELS[value].label })),
      onChange: (v) => { form.channel = v; form.method = 'any'; remember(); renderMethods(); update(); },
    }));
    renderMethods();
  }

  function renderMethods() {
    howRow.hidden = form.channel === 'transit';
    const methods = CHANNELS[form.channel].methods;
    const options = methods.length > 1 ? [{ value: 'any', label: 'Best way' }, ...methods.map((m) => ({ value: m, label: METHOD_NAMES[m] }))] : [{ value: 'any', label: METHOD_NAMES[methods[0]] }];
    fill(methodChips, chips({ name: 'method', label: 'How', value: form.method, options, onChange: (v) => { form.method = v; remember(); update(); } }));
  }
  function setChannel(channel) {
    if (form.channel !== channel && channelsFor(state.categoriesById[form.category]).includes(channel)) {
      form.channel = channel;
      form.method = 'any';
    }
    renderChannels();
  }

  // She changed Where or How: use it for this merchant next time.
  const remember = () => rememberWhereHow(form.merchant, { channel: form.channel, method: form.method === 'any' ? null : form.method });

  // Merchant memory fills category, where she pays and how.
  function applyMemory() {
    const m = findMerchant(form.merchant);
    if (!m) return;
    if (m.category) { form.category = m.category; categoryInput.value = m.category; }
    if (m.channel) setChannel(m.channel);
    else renderChannels();
    if (m.usualMethod && CHANNELS[form.channel].methods.length > 1 && CHANNELS[form.channel].methods.includes(m.usualMethod)) {
      form.method = m.usualMethod;
      renderMethods();
    }
  }

  function update() {
    saveDraft('which', form.amount || form.merchant.trim() ? { ...form } : null).catch(() => {});
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      fill(results, h('p', { class: 'muted pad' }, 'Enter the amount to see which card earns the most.'));
      return;
    }
    const m = findMerchant(form.merchant);
    const purchase = {
      amount, date: today(), fcy: form.fcy, channel: form.channel,
      method: form.method === 'any' ? (CHANNELS[form.channel].methods.length === 1 ? CHANNELS[form.channel].methods[0] : undefined) : form.method,
      category: form.category || null, merchant: m?.name || form.merchant.trim() || null,
    };
    const txns = engineTxns();
    const out = recommend({ purchase: forEngine(purchase), cards: state.cards, myCards: state.myCards, categories: state.categories, settings: state.settings, txns });
    if (out.noMiles) {
      fill(results, h('section', { class: 'answer answer-quiet' }, h('p', { class: 'answer-card' }, out.message)));
      return;
    }
    const [top, ...rest] = out.results;
    const topKey = `${top.cardId}:${top.best.method}:${top.best.rankMiles}`;
    const changed = lastTop !== null && topKey !== lastTop;
    lastTop = topKey;
    const prompt = kiasumilesPrompt({ purchase, cards: state.cards, myCards: state.myCards, txns, categories: state.categories, settings: state.settings, today: today() });
    fill(results, 
      answer(top, purchase, true, changed),
      rest.length ? h('h2', { class: 'subhead' }, 'Other cards') : null,
      h('ol', { class: 'fallbacks' }, rest.map((r) => h('li', {}, answer(r, purchase, false)))),
      prompt ? h('div', { class: 'km' },
        h('button', { type: 'button', class: 'button secondary', onclick: () => copyPrompt(prompt) }, 'Copy KiasuMiles prompt'),
        h('p', { class: 'muted small' }, 'For a second opinion: paste it into Claude chat. It lists only your cards with cap left.')) : null,
    );
  }

  async function copyPrompt(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it into Claude chat.');
    } catch {
      // Clipboard blocked: show the text so she can copy it by hand.
      const area = h('textarea', { class: 'prompt-text', readonly: true, rows: 6 }, text);
      sheet('KiasuMiles prompt', h('div', { class: 'sheet-form' }, h('p', { class: 'muted' }, 'Select all and copy it.'), area));
      area.select();
    }
  }

  async function paid(result, purchase, button) {
    let txn;
    try {
      txn = await saveTxn({ ...purchase, cardId: result.cardId, method: result.best.method, date: today() });
    } catch {
      toast('Nothing changed: the purchase couldn\'t be saved on this phone. Try again.');
      button.disabled = false;
      return;
    }
    const card = state.cardsById[result.cardId];
    toast(`Saved ${money(txn.amount)}${txn.merchant ? ` at ${txn.merchant}` : ''} on ${shortName(card)}`, {
      label: 'Undo',
      run: async () => { await deleteTxn(txn.id); form.amount = String(txn.amount); amountInput.value = form.amount; update(); },
    });
    form.amount = '';
    amountInput.value = '';
    update();
  }

  function answer(r, purchase, isTop, changed = false) {
    const b = r.best;
    const card = state.cardsById[r.cardId];
    const pooled = b.rankMiles !== b.miles;
    const tone = b.avoid ? 'avoid' : r.fallback ? 'fallback' : 'bonus';
    // Card number earns the bonus but in-app Apple Pay doesn't (e.g. Citi Rewards): say so in the instruction.
    const rule = card.bonus_rules.find((x) => x.id === b.ruleId);
    const noWallet = b.method === 'online_card_entry' && rule && !rule.methods.includes('in_app_wallet') && b.bonusSgd + b.pendingBonusSgd > 0;
    const verb = noWallet ? 'Enter the card number, don\'t use Apple Pay' : METHOD_VERBS[b.method];
    const hint = noWallet && r.methodHint?.includes('Apple Pay') ? null : r.methodHint;
    const capAfter = b.bucket && b.capSgd > 0 && b.capLeftSgd > 0 ? b.capSgd - b.capLeftSgd + b.bonusSgd + b.pendingBonusSgd : 0;
    const lines = [
      hint && h('p', { class: 'hint' }, hint),
      capAfter > 0 && capAfter >= b.capSgd * 0.85 ? h('p', { class: 'warning' }, `After this, at least ${money(Math.min(capAfter, b.capSgd))} of the ${money(b.capSgd)} ${b.capName} cap will be used.`) : null,
      ...b.warnings.map((w) => h('p', { class: 'warning' }, w)),
      b.fcyFeeSgd ? h('p', { class: 'fee' }, `Foreign currency fee: ${money(b.fcyFeeSgd)}${b.costPerMileSgd ? `, or S$${b.costPerMileSgd.toFixed(4)} a mile` : ''}.`) : null,
    ];
    return h('article', { class: `answer ${isTop ? 'answer-top' : 'answer-row'} tone-${tone}${changed ? ' changed' : ''}` },
      h('div', { class: 'answer-main' },
        h('div', {},
          h('p', { class: 'answer-card' }, shortName(card), b.unconfirmed ? unconfirmedTag() : null),
          h('p', { class: 'answer-method' }, verb)),
        h('p', { class: 'answer-miles', 'aria-label': `${miles(b.rankMiles)} miles` },
          h('span', { class: 'num' }, `${pooled ? '~' : ''}${miles(b.rankMiles)}`), h('span', { class: 'unit' }, 'miles'))),
      h('p', { class: 'reason' }, b.reason),
      lines,
      h('button', { type: 'button', class: `button ${isTop ? 'primary' : 'secondary'}`, onclick: (e) => { e.currentTarget.disabled = true; paid(r, purchase, e.currentTarget); } }, 'Paid with this'));
  }

  renderChannels();
  fill(root, 
    h('form', { class: 'which-form', onsubmit: (e) => e.preventDefault() },
      field('Merchant', merchantInput),
      picker.el,
      h('div', { class: 'row-2' },
        field('Amount in S$', amountInput),
        field('Category', categoryInput)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Where'), channelChips),
      howRow,
      h('label', { class: 'toggle' }, fcyInput, h('span', {}, 'Charged in foreign currency'))),
    results);
  update();
}
