// My cards: her wallet in priority order, the full card list to browse, add/edit forms, settings.

import { h, field, sheet, toast, money, shortName, unconfirmedTag, METHOD_NAMES, fill } from './dom.js';
import { exportBackup, importBackup } from './backup.js';
import { state, addMyCard, updateMyCard, removeMyCard, moveMyCard, hasCard, setSetting } from '../db/repo.js';
import { formatDay, today, DEFAULT_SETTINGS } from '../engine/index.js';

export function renderCards(root) {
  const render = () => renderCards(root);
  fill(root, 
    h('section', {},
      h('h2', { class: 'subhead' }, 'Your cards'),
      state.myCards.length
        ? h('ol', { class: 'list wallet' }, state.myCards.map((c, i) => walletRow(c, i, render)))
        : h('p', { class: 'empty-line' }, 'No cards yet. Add each card when it arrives.'),
      state.myCards.length > 1 ? h('p', { class: 'muted small' }, 'When two cards earn the same, the one higher in this list comes first.') : null),
    h('section', {},
      h('h2', { class: 'subhead' }, 'All cards'),
      h('ul', { class: 'list' }, state.cards.map((card) => h('li', {}, catalogueRow(card, render))))),
    settingsSection(render));
}

function walletRow(c, i, render) {
  const card = state.cardsById[c.cardId];
  const facts = [
    c.statementDay ? `Statement day ${c.statementDay}` : 'Statement day not set',
    c.annualFeeDate ? `annual fee ${formatDay(c.annualFeeDate)}` : null,
  ].filter(Boolean).join(', ');
  const move = (dir, label, disabled) => h('button', {
    type: 'button', class: 'icon-button', 'aria-label': `${label} ${shortName(card)}`, disabled,
    onclick: async () => { await moveMyCard(c.cardId, dir); render(); },
  }, dir < 0 ? '↑' : '↓');
  return h('li', { class: 'wallet-row' },
    h('button', { type: 'button', class: 'list-row', onclick: () => cardForm(card, c, render) },
      h('span', { class: 'list-main' },
        h('span', { class: 'list-title' }, shortName(card)),
        h('span', { class: 'list-sub' }, facts))),
    h('span', { class: 'reorder' }, move(-1, 'Move up', i === 0), move(1, 'Move down', i === state.myCards.length - 1)));
}

const ruleSummary = (r) => {
  const methods = r.methods.length >= 6 ? 'any way to pay' : r.methods.map((m) => METHOD_NAMES[m]).join(', ');
  return `${r.mpd} mpd, ${methods}`;
};

function catalogueRow(card, render) {
  const top = Math.max(card.base_mpd.local, ...card.bonus_rules.map((r) => r.mpd));
  const owned = hasCard(card.id);
  return h('button', { type: 'button', class: 'list-row', onclick: () => cardDetails(card, render) },
    h('span', { class: 'list-main' },
      h('span', { class: 'list-title' }, shortName(card), owned ? h('span', { class: 'tag' }, 'yours') : null),
      h('span', { class: 'list-sub' }, `${card.bank}, up to ${top} mpd, base ${card.base_mpd.local} mpd`)));
}

// Everything the app knows about a card, with unconfirmed parts labelled.
function cardDetails(card, render) {
  const owned = hasCard(card.id);
  let s;
  const content = h('div', { class: 'sheet-form' },
    h('dl', { class: 'facts' },
      h('dt', {}, 'Base rate'), h('dd', {}, `${card.base_mpd.local} mpd local, ${card.base_mpd.fcy} mpd foreign currency`),
      h('dt', {}, 'Annual fee'), h('dd', {}, card.annual_fee_sgd ? money(card.annual_fee_sgd) : 'None', card.fee_notes ? h('span', { class: 'muted block' }, card.fee_notes) : null),
      h('dt', {}, 'Rounding'), h('dd', {}, card.earn_block ? `${card.earn_block.type === 'per_txn_floor' ? 'Rounded down to' : card.earn_block.type === 'per_txn_nearest' ? 'Rounded to the nearest' : 'Month total rounded down to'} S$${card.earn_block.size_sgd}` : 'Not known', card.earn_block?.needs_verification ? unconfirmedTag() : null),
      h('dt', {}, 'Caps reset'), h('dd', {}, card.cap_period === 'statement_month' ? 'On the statement date' : 'On the 1st of each month')),
    card.bonus_rules.length ? h('h3', {}, 'Bonus rates') : null,
    h('ul', { class: 'rules' }, card.bonus_rules.map((r) => h('li', {},
      h('p', { class: 'rule-head' }, ruleSummary(r), r.needs_verification ? unconfirmedTag() : null),
      r.cap_bucket ? h('p', { class: 'muted' }, `Cap S$${card.caps[r.cap_bucket].sgd} a ${card.cap_period === 'statement_month' ? 'statement month' : 'month'}${Object.values(card.bonus_rules).filter((o) => o.cap_bucket === r.cap_bucket).length > 1 ? ', shared' : ''}`) : null,
      r.valid_until ? h('p', { class: 'muted' }, `Until ${formatDay(r.valid_until)}`) : null,
      r.notes ? h('p', { class: 'muted' }, r.notes) : null))),
    card.gotchas?.length ? h('h3', {}, 'Watch out for') : null,
    card.gotchas?.length ? h('ul', { class: 'bullets' }, card.gotchas.map((g) => h('li', {}, g))) : null,
    h('p', { class: 'muted small' }, `Checked ${formatDay(card.last_verified)}. Source: ${card.source}`),
    h('div', { class: 'sheet-actions' },
      owned
        ? h('button', { type: 'button', class: 'button secondary', onclick: () => { s.close(); cardForm(card, state.myCards.find((c) => c.cardId === card.id), render); } }, 'Edit your details')
        : h('button', { type: 'button', class: 'button primary', onclick: () => { s.close(); cardForm(card, null, render); } }, 'Add to your cards')));
  s = sheet(shortName(card), content);
}

// Add or edit her details for a card: statement day, annual fee date, choices, conditions met.
function cardForm(card, mine, render) {
  const statementDay = h('select', { required: true },
    h('option', { value: '', selected: !mine?.statementDay }, 'Choose a day'),
    Array.from({ length: 31 }, (_, i) => h('option', { value: String(i + 1), selected: mine?.statementDay === i + 1 }, String(i + 1))));
  const feeDate = h('input', { type: 'date', value: mine?.annualFeeDate || '' });
  const opened = h('input', { type: 'date', value: mine?.openedDate || '' });
  const signupMin = h('input', { type: 'text', inputmode: 'decimal', value: mine?.signup?.minSpendSgd ?? '', placeholder: 'e.g. 1000' });
  const signupDeadline = h('input', { type: 'date', value: mine?.signup?.deadline || '' });
  const signupMiles = h('input', { type: 'text', inputmode: 'numeric', value: mine?.signup?.bonusMiles ?? '', placeholder: 'e.g. 30000' });

  const choiceRules = card.bonus_rules.filter((r) => r.match?.mode === 'user_category');
  const choiceInputs = choiceRules.map((r) => ({
    key: r.match.user_setting,
    input: h('select', {}, h('option', { value: '' }, 'Not chosen yet'), r.match.options.map((o) => h('option', { value: o, selected: mine?.choices?.[r.match.user_setting] === o }, o))),
  }));
  const conditionRules = card.bonus_rules.filter((r) => r.condition);
  const conditionInputs = conditionRules.map((r) => ({ id: r.id, input: h('input', { type: 'checkbox', checked: !!mine?.conditionsMet?.[r.id] }), rule: r }));

  let s;
  const form = h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const fields = {
        statementDay: statementDay.value ? Number(statementDay.value) : null,
        annualFeeDate: feeDate.value || null,
        openedDate: opened.value || null,
        signup: signupMin.value && signupDeadline.value
          ? { minSpendSgd: Number(signupMin.value.replace(/[^\d.]/g, '')), deadline: signupDeadline.value, bonusMiles: signupMiles.value ? Number(signupMiles.value.replace(/[^\d]/g, '')) : null }
          : null,
        choices: Object.fromEntries(choiceInputs.filter((c) => c.input.value).map((c) => [c.key, c.input.value])),
        conditionsMet: Object.fromEntries(conditionInputs.map((c) => [c.id, c.input.checked])),
      };
      if (mine) await updateMyCard(card.id, fields);
      else await addMyCard({ cardId: card.id, ...fields });
      s.close();
      toast(mine ? `${shortName(card)} updated` : `${shortName(card)} added`);
      render();
    },
  },
  field('Statement day', statementDay, 'The day of the month your statement is issued. Caps and reminders use it.'),
  field('Annual fee date', feeDate, 'Your card anniversary, when the next annual fee is charged.'),
  field('Card opened', opened, 'Sign-up bonus spend counts from this date.'),
  h('details', { class: 'signup', open: !!mine?.signup },
    h('summary', {}, 'Sign-up bonus'),
    field('Minimum spend (S$)', signupMin),
    field('Spend by', signupDeadline),
    field('Bonus miles', signupMiles)),
  choiceInputs.map((c, i) => field('Bonus category', c.input, choiceRules[i].notes)),
  conditionInputs.map((c) => h('label', { class: 'toggle' }, c.input, h('span', {}, `I meet this: ${c.rule.condition} (${c.rule.mpd} mpd)`))),
  h('div', { class: 'sheet-actions' },
    h('button', { type: 'submit', class: 'button primary' }, mine ? 'Save changes' : 'Add card'),
    mine ? h('button', {
      type: 'button', class: 'button danger',
      onclick: async () => {
        if (!confirm(`Remove ${shortName(card)} from your cards? Logged purchases stay.`)) return;
        await removeMyCard(card.id);
        s.close();
        toast(`${shortName(card)} removed`);
        render();
      },
    }, 'Remove card') : null));
  s = sheet(mine ? shortName(card) : `Add ${shortName(card)}`, form);
}

function settingsSection(rerender) {
  const delay = h('input', {
    type: 'number', inputmode: 'numeric', min: 0, max: 10, value: String(state.settings.postingDelayDays ?? DEFAULT_SETTINGS.postingDelayDays),
    onchange: async () => {
      const n = Math.max(0, Math.min(10, Math.round(Number(delay.value) || 0)));
      delay.value = String(n);
      await setSetting('postingDelayDays', n);
      toast('Setting saved');
    },
  });
  const last = state.settings.lastExportAt;
  return h('section', {},
    h('h2', { class: 'subhead' }, 'Settings'),
    field('Posting delay (days)', delay, 'How long purchases take to post. Near a cap reset, purchases within this many days are marked "may count next month".'),
    h('h2', { class: 'subhead' }, 'Backup'),
    h('p', { class: 'muted small' }, last ? `Last backup ${formatDay(today(new Date(last)))}.` : 'Not backed up yet.', ' Everything is stored only on this phone.'),
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'button primary', onclick: async () => { if (await exportBackup()) rerender(); } }, 'Export backup'),
      h('button', { type: 'button', class: 'button secondary', onclick: () => importBackup(rerender) }, 'Import backup')));
}
