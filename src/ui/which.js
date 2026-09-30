// "Which card?": merchant, amount, how she's paying -> her cards ranked, with "Paid with this".

import { h, chips, categorySelect, field, sheet, toast, money, miles, shortName, unconfirmedTag, METHOD_NAMES, METHOD_VERBS, CHANNELS, fill } from './dom.js';
import { state, saveTxn, deleteTxn, findMerchant, merchantSuggestions } from '../db/repo.js';
import { recommend, kiasumilesPrompt, today } from '../engine/index.js';

// Kept between visits to the tab.
const form = { merchant: '', amount: '', category: '', channel: 'in_person', method: 'any', fcy: false };

export function renderWhich(root, { go }) {
  if (!state.myCards.length) {
    fill(root, h('section', { class: 'empty' },
      h('h2', {}, 'Add your cards first'),
      h('p', {}, 'Recommendations use only the cards you carry. Add each card as it arrives.'),
      h('button', { type: 'button', class: 'button primary', onclick: () => go('cards') }, 'Add a card')));
    return;
  }

  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const suggestions = h('div', { class: 'suggestions' });

  const merchantInput = h('input', {
    type: 'text', value: form.merchant, placeholder: 'e.g. Din Tai Fung', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next',
    oninput: () => { form.merchant = merchantInput.value; applyMemory(); showSuggestions(); update(); },
    onfocus: () => showSuggestions(),
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
      update();
    },
  });
  const methodChips = h('div');
  const channelChips = chips({
    name: 'channel', label: 'Where', value: form.channel,
    options: Object.entries(CHANNELS).map(([value, c]) => ({ value, label: c.label })),
    onChange: (v) => { form.channel = v; form.method = 'any'; renderMethods(); update(); },
  });
  const fcyInput = h('input', { type: 'checkbox', checked: form.fcy, onchange: () => { form.fcy = fcyInput.checked; update(); } });

  function renderMethods() {
    const methods = CHANNELS[form.channel].methods;
    const options = methods.length > 1 ? [{ value: 'any', label: 'Best way' }, ...methods.map((m) => ({ value: m, label: METHOD_NAMES[m] }))] : [{ value: 'any', label: METHOD_NAMES[methods[0]] }];
    fill(methodChips, chips({ name: 'method', label: 'How', value: form.method, options, onChange: (v) => { form.method = v; update(); } }));
  }
  function setChannel(channel) {
    if (form.channel === channel) return;
    form.channel = channel;
    form.method = 'any';
    channelChips.set(channel);
    renderMethods();
  }

  // Merchant memory fills category and where she pays.
  function applyMemory() {
    const m = findMerchant(form.merchant);
    if (!m) return;
    if (m.category) { form.category = m.category; categoryInput.value = m.category; }
    if (m.channel) setChannel(m.channel);
  }

  function showSuggestions() {
    const list = form.merchant.trim() ? merchantSuggestions(form.merchant, 5).filter((m) => m.nameLower !== form.merchant.trim().toLowerCase()) : [];
    fill(suggestions, ...list.map((m) => h('button', {
      type: 'button', class: 'suggestion',
      onclick: () => { form.merchant = m.name; merchantInput.value = m.name; applyMemory(); suggestions.replaceChildren(); update(); amountInput.focus(); },
    }, m.name)));
  }

  function update() {
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      fill(results, h('p', { class: 'muted pad' }, 'Enter the amount to see which card earns the most.'));
      return;
    }
    const purchase = {
      amount, date: today(), fcy: form.fcy, channel: form.channel,
      method: form.method === 'any' ? (CHANNELS[form.channel].methods.length === 1 ? CHANNELS[form.channel].methods[0] : undefined) : form.method,
      category: form.category || null, merchant: form.merchant.trim() || null, mcc: findMerchant(form.merchant)?.mcc || null,
    };
    const out = recommend({ purchase, cards: state.cards, myCards: state.myCards, categories: state.categories, settings: state.settings, txns: state.txns });
    if (out.noMiles) {
      fill(results, h('section', { class: 'answer answer-quiet' }, h('p', { class: 'answer-card' }, out.message)));
      return;
    }
    const [top, ...rest] = out.results;
    const prompt = kiasumilesPrompt({ purchase, cards: state.cards, myCards: state.myCards, txns: state.txns, categories: state.categories, settings: state.settings, today: today() });
    fill(results, 
      answer(top, purchase, true),
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
      sheet('KiasuMiles prompt', h('div', { class: 'sheet-form' }, h('p', { class: 'muted' }, 'Select all and copy:'), area));
      area.select();
    }
  }

  async function paid(result, purchase) {
    const txn = await saveTxn({ ...purchase, cardId: result.cardId, method: result.best.method, date: today() });
    const card = state.cardsById[result.cardId];
    toast(`Saved ${money(txn.amount)}${txn.merchant ? ` at ${txn.merchant}` : ''} on ${shortName(card)}`, {
      label: 'Undo',
      run: async () => { await deleteTxn(txn.id); form.amount = String(txn.amount); amountInput.value = form.amount; update(); },
    });
    form.amount = '';
    amountInput.value = '';
    update();
  }

  function answer(r, purchase, isTop) {
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
      capAfter > 0 && capAfter >= b.capSgd * 0.85 ? h('p', { class: 'warning' }, `After this, at least ${money(Math.min(capAfter, b.capSgd))} of the ${money(b.capSgd)} ${b.bucket} cap will be used.`) : null,
      ...b.warnings.map((w) => h('p', { class: 'warning' }, w)),
      b.fcyFeeSgd ? h('p', { class: 'fee' }, `Foreign-currency fee ${money(b.fcyFeeSgd)}${b.costPerMileSgd ? `, S$${b.costPerMileSgd.toFixed(4)} a mile` : ''}`) : null,
    ];
    return h('article', { class: `answer ${isTop ? 'answer-top' : 'answer-row'} tone-${tone}` },
      h('div', { class: 'answer-main' },
        h('div', {},
          h('p', { class: 'answer-card' }, shortName(card), b.unconfirmed ? unconfirmedTag() : null),
          h('p', { class: 'answer-method' }, verb)),
        h('p', { class: 'answer-miles', 'aria-label': `${miles(b.rankMiles)} miles` },
          h('span', { class: 'num' }, `${pooled ? '~' : ''}${miles(b.rankMiles)}`), h('span', { class: 'unit' }, 'miles'))),
      h('p', { class: 'reason' }, b.reason),
      lines,
      h('button', { type: 'button', class: `button ${isTop ? 'primary' : 'secondary'}`, onclick: (e) => { e.currentTarget.disabled = true; paid(r, purchase); } }, 'Paid with this'));
  }

  renderMethods();
  fill(root, 
    h('form', { class: 'which-form', onsubmit: (e) => e.preventDefault() },
      field('Merchant', merchantInput),
      suggestions,
      h('div', { class: 'row-2' },
        field('Amount (S$)', amountInput),
        field('Category', categoryInput)),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Where'), channelChips),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'How'), methodChips),
      h('label', { class: 'toggle' }, fcyInput, h('span', {}, 'Charged in foreign currency'))),
    results);
  update();
}
