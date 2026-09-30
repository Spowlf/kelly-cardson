// Monthly statement check: enter the statement total, see the gap from what's logged, add a catch-up.

import { h, field, sheet, toast, money, shortName, fill } from './dom.js';
import { state, saveStatement, saveTxn, answerDispute } from '../db/repo.js';
import { statementCheck, catchUpTxn, disputedInStatement, capName, cycleFor, addDays, formatDay, today } from '../engine/index.js';

export function openStatementCheck(cardId, onDone) {
  const card = state.cardsById[cardId];
  const mine = state.myCards.find((c) => c.cardId === cardId);
  if (!mine?.statementDay) {
    toast('Set this card\'s statement day in My cards first');
    return;
  }

  // The last three statement dates, most recent first (today counts on statement day).
  const dates = [];
  const current = cycleFor(today(), 'statement_month', mine.statementDay);
  let d = current.end === today() ? current.end : addDays(current.start, -1);
  for (let i = 0; i < 3; i++) {
    dates.push(d);
    d = addDays(cycleFor(d, 'statement_month', mine.statementDay).start, -1);
  }

  const disputes = h('div', { class: 'disputes' });
  const dateInput = h('select', { onchange: () => { update(); renderDisputes(); } }, dates.map((x) => h('option', { value: x }, formatDay(x))));

  // Purchases on this statement that rely on a rule sources disagree about: ask what the statement shows.
  function renderDisputes() {
    const list = disputedInStatement({ card, userCard: mine, txns: state.txns, categories: state.categories, settings: state.settings, statementDate: dateInput.value });
    if (!list.length) { disputes.replaceChildren(); return; }
    fill(disputes, 
      h('h3', {}, 'Check these on the statement'),
      h('p', { class: 'muted small' }, 'Sources disagree on whether these earn the bonus. Your statement settles it.'),
      h('ul', { class: 'list' }, list.map(({ txn, dispute }) => h('li', { class: 'dispute' },
        h('p', {}, h('strong', {}, txn.merchant), ` ${money(txn.amount)} on ${formatDay(txn.date)}`),
        h('p', { class: 'dispute-q' }, dispute.question),
        h('div', { class: 'yes-no' },
          h('button', { type: 'button', class: 'button secondary', onclick: () => answer(dispute, txn, 'yes') }, 'Yes'),
          h('button', { type: 'button', class: 'button secondary', onclick: () => answer(dispute, txn, 'no') }, 'No'))))));
  }

  async function answer(dispute, txn, value) {
    const what = dispute.recurring ? 'Recurring payments' : txn.merchant;
    await answerDispute(dispute.id, { answer: value, cardId, ruleId: dispute.ruleId, merchant: txn.merchant, txnId: txn.id, statementDate: dateInput.value });
    toast(value === 'yes'
      ? `Confirmed: ${what} earn${dispute.recurring ? '' : 's'} the bonus on ${shortName(card)}.`
      : `Noted: ${what} now count${dispute.recurring ? '' : 's'} at the base rate on ${shortName(card)}. Your next backup carries this for the card rules.`);
    renderDisputes();
    onDone?.();
  }
  const totalInput = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', class: 'amount-input', oninput: () => update() });
  const bucketInput = h('select', {},
    h('option', { value: '' }, 'All of this card\'s caps'),
    Object.keys(card.caps || {}).map((b) => h('option', { value: b }, `${capName(card, b)} cap only`)));
  const outcome = h('div', { class: 'statement-outcome', 'aria-live': 'polite' });
  let s;
  let check = null;

  function update() {
    const total = Number(totalInput.value.replace(/[^\d.]/g, ''));
    if (!(total >= 0) || totalInput.value.trim() === '') { outcome.replaceChildren(); check = null; return; }
    check = statementCheck({ card, userCard: mine, txns: state.txns, statementDate: dateInput.value, statementTotalSgd: total });
    const catchUp = check.offerCatchUp;
    fill(outcome, 
      h('dl', { class: 'facts' },
        h('dt', {}, 'Statement'), h('dd', {}, money(total)),
        h('dt', {}, 'You logged'), h('dd', {}, money(check.loggedSgd)),
        h('dt', {}, 'Gap'), h('dd', {}, money(Math.abs(check.gapSgd)))),
      h('p', { class: catchUp ? 'warning' : 'hint' }, check.message),
      catchUp && Object.keys(card.caps || {}).length > 1 ? field('Count the catch-up against', bucketInput, 'If you know where the missing spend went. Otherwise it counts against every cap, which never overstates cap left.') : null,
      h('div', { class: 'sheet-actions' },
        catchUp ? h('button', { type: 'button', class: 'button primary', onclick: () => save(true) }, `Add catch-up of ${money(check.gapSgd)}`) : null,
        h('button', { type: 'button', class: `button ${catchUp ? 'secondary' : 'primary'}`, onclick: () => save(false) }, catchUp ? 'Save without catch-up' : 'Save check')));
  }

  async function save(withCatchUp) {
    let txn = null;
    if (withCatchUp) txn = await saveTxn(catchUpTxn(check, bucketInput.value || undefined));
    await saveStatement({ cardId, cycleKey: check.cycle.key, statementTotalSgd: Number(totalInput.value.replace(/[^\d.]/g, '')), loggedTotalSgd: check.loggedSgd, catchUpTxnId: txn?.id ?? null });
    s.close();
    toast(txn ? `Catch-up of ${money(txn.amount)} added` : 'Statement check saved');
    onDone?.();
  }

  s = sheet(`${shortName(card)} statement`, h('div', { class: 'sheet-form' },
    field('Statement date', dateInput),
    field('New spend on the statement (S$)', totalInput, 'The total of this card\'s purchases on the statement, not the amount due.'),
    outcome,
    disputes));
  renderDisputes();
  totalInput.focus();
}
