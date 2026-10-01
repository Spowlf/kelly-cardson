// Monthly statement check: enter the statement total, see the gap from what's logged, add a catch-up.

import { h, field, sheet, toast, money, shortName, capitalize, fill } from './dom.js';
import { state, saveStatement, saveTxn, answerDispute, saveStatementResult, engineTxns } from '../db/repo.js';
import { statementCheck, catchUpTxn, statementQuestions, capName, cycleFor, addDays, formatDay, today } from '../engine/index.js';

export function openStatementCheck(cardId, onDone) {
  const card = state.cardsById[cardId];
  const mine = state.myCards.find((c) => c.cardId === cardId);
  if (!mine?.statementDay) {
    toast('Set this card\'s statement day in My cards first.');
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
  const dateInput = h('select', { onchange: () => { update(); renderQuestions(); } }, dates.map((x) => h('option', { value: x }, formatDay(x))));
  const changes = []; // what her answers changed, for the summary line

  // Purchases whose bonus depends on a code we haven't confirmed, or on a rule sources disagree
  // about: ask what the statement shows.
  function renderQuestions() {
    const list = statementQuestions({ card, userCard: mine, txns: engineTxns(), categories: state.categories, settings: state.settings, statementDate: dateInput.value });
    fill(disputes,
      list.length ? [
        h('h3', {}, 'Check these on the statement'),
        h('p', { class: 'muted small' }, 'We can\'t be sure these earned the bonus. Your statement settles it for next time.'),
        h('ul', { class: 'list' }, list.map(({ txn, question, dispute }) => h('li', { class: 'dispute' },
          h('p', {}, h('strong', {}, txn.merchant), ` ${money(txn.amount)} on ${formatDay(txn.date)}`),
          h('p', { class: 'dispute-q' }, question),
          h('div', { class: 'yes-no' },
            h('button', { type: 'button', class: 'button secondary', onclick: () => answer(txn, dispute, true) }, 'Yes'),
            h('button', { type: 'button', class: 'button secondary', onclick: () => answer(txn, dispute, false) }, 'No')))))] : null,
      changes.length ? h('p', { class: 'hint' }, `Updated: ${changes.join('; ')}.`) : null);
  }

  // Yes: this merchant earns the bonus on this card, confirmed by statement. No: base rate only.
  async function answer(txn, dispute, yes) {
    const name = shortName(card);
    if (dispute) await answerDispute(dispute.id, { answer: yes ? 'yes' : 'no', cardId, ruleId: dispute.ruleId, merchant: txn.merchant, txnId: txn.id, statementDate: dateInput.value });
    if (dispute?.recurring) changes.push(`recurring payments ${yes ? 'earn the bonus' : 'earn the base rate'} on ${name}`);
    else {
      await saveStatementResult(txn.merchant, cardId, yes);
      changes.push(`${txn.merchant} ${yes ? 'earns the bonus' : 'earns the base rate'} on ${name}`);
    }
    renderQuestions();
    onDone?.();
  }
  const totalInput = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00', class: 'amount-input', oninput: () => update() });
  const bucketInput = h('select', {},
    h('option', { value: '' }, 'All of this card\'s caps'),
    Object.keys(card.caps || {}).map((b) => h('option', { value: b }, `${capitalize(capName(card, b))} cap only`)));
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
    try {
      if (withCatchUp) txn = await saveTxn(catchUpTxn(check, bucketInput.value || undefined));
      await saveStatement({ cardId, cycleKey: check.cycle.key, statementTotalSgd: Number(totalInput.value.replace(/[^\d.]/g, '')), loggedTotalSgd: check.loggedSgd, catchUpTxnId: txn?.id ?? null });
    } catch {
      toast(txn
        ? `Added catch-up of ${money(txn.amount)}, but the statement check couldn't be saved. Save it again without a catch-up.`
        : 'Nothing changed: the statement check couldn\'t be saved on this phone. Try again.');
      if (txn) { update(); onDone?.(); }
      return;
    }
    s.close();
    toast(txn ? `Added catch-up of ${money(txn.amount)}` : 'Saved statement check');
    onDone?.();
  }

  s = sheet(`${shortName(card)} statement`, h('div', { class: 'sheet-form' },
    field('Statement date', dateInput),
    field('New spend on the statement in S$', totalInput, 'The total of this card\'s purchases on the statement, not the amount due.'),
    outcome,
    disputes));
  renderQuestions();
  totalInput.focus();
}
