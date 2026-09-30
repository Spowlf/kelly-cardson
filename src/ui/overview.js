// Overview: reminders, miles this month, cap bars with reset dates, points per bank, sign-up bonuses,
// and the monthly statement check.

import { h, field, sheet, toast, money, miles, shortName, fill } from './dom.js';
import { state, addBalance } from '../db/repo.js';
import { overview, pointsBalances, signupProgress, reminders, formatDay, today } from '../engine/index.js';
import { openStatementCheck } from './statement.js';
import { exportBackup } from './backup.js';

export function renderOverview(root, { go }) {
  const render = () => renderOverview(root, { go });
  if (!state.myCards.length) {
    fill(root, h('section', { class: 'empty' },
      h('h2', {}, 'Nothing to show yet'),
      h('p', {}, 'Caps, points and reminders appear here once you add your cards.'),
      h('button', { type: 'button', class: 'button primary', onclick: () => go('cards') }, 'Add a card')));
    return;
  }

  const day = today();
  const args = { cards: state.cards, myCards: state.myCards, txns: state.txns, categories: state.categories, settings: state.settings, today: day };
  const o = overview(args);
  const due = reminders({ ...args, statements: state.statements });
  const pools = pointsBalances({ ...args, balances: state.balances });
  const signups = state.myCards.map((m) => ({ m, p: signupProgress({ myCard: m, txns: state.txns, today: day }) })).filter((x) => x.p);

  fill(root, 
    due.length ? h('section', {}, h('ul', { class: 'reminders' }, due.map((r) => h('li', { class: `reminder reminder-${r.kind}` },
      h('p', {}, r.text),
      reminderAction(r, render, go))))) : null,

    h('section', { class: 'total' },
      h('p', { class: 'total-num' }, miles(o.totalMiles)),
      h('p', { class: 'total-label' }, 'miles estimated this month'),
      h('p', { class: 'muted small' }, 'Cards with statement-date caps count their current statement month.')),

    h('section', {},
      h('h2', { class: 'subhead' }, 'Caps'),
      h('div', { class: 'cap-cards' }, o.cards.map((c) => h('article', { class: 'cap-card' },
        h('div', { class: 'cap-head' },
          h('h3', {}, c.name),
          h('span', { class: 'cap-miles' }, `${miles(c.miles)} miles`)),
        c.buckets.length ? c.buckets.map((b) => capBar(b)) : h('p', { class: 'muted small' }, 'No bonus cap on this card.'),
        c.minSpend && !c.minSpend.met ? h('p', { class: 'warning' }, `${money(c.minSpend.shortBySgd)} more this month to reach the ${money(c.minSpend.sgd)} minimum, or everything earns the base rate.`) : null,
        h('button', { type: 'button', class: 'text-button', onclick: () => openStatementCheck(c.cardId, render) }, 'Check statement'))))),

    h('section', {},
      h('h2', { class: 'subhead' }, 'Points'),
      h('ul', { class: 'list' }, pools.map((p) => h('li', { class: 'pool' },
        h('div', { class: 'pool-head' },
          h('div', {},
            h('p', { class: 'list-title' }, p.currency),
            h('p', { class: 'list-sub' }, p.cardNames.join(', '))),
          h('p', { class: 'pool-num' }, p.points.toLocaleString('en-SG'), h('span', { class: 'unit' }, `${miles(p.miles)} miles`))),
        h('p', { class: p.blocksReady ? 'hint' : 'muted small' }, p.blocksReady
          ? `${p.blocksReady} transfer block${p.blocksReady > 1 ? 's' : ''} of ${p.blockMiles.toLocaleString('en-SG')} miles ready to transfer`
          : `${miles(p.milesToNextBlock)} miles to the next ${p.blockMiles.toLocaleString('en-SG')}-mile transfer block`),
        p.expiresAround ? h('p', { class: 'muted small' }, `Oldest points expire around ${formatDay(p.expiresAround)}${p.expiryNote ? ` (${p.expiryNote})` : ''}.`) : null,
        h('p', { class: 'muted small' }, p.asOf ? `Balance of ${p.balancePoints.toLocaleString('en-SG')} entered for ${formatDay(p.asOf)}, plus purchases since.` : 'Estimated from logged purchases. Enter the balance from the bank app to make it exact.'),
        h('button', { type: 'button', class: 'text-button', onclick: () => balanceForm(p, render) }, 'Update balance'))))),

    signups.length ? h('section', {},
      h('h2', { class: 'subhead' }, 'Sign-up bonuses'),
      h('ul', { class: 'list' }, signups.map(({ m, p }) => h('li', { class: 'pool' },
        h('p', { class: 'list-title' }, shortName(state.cardsById[m.cardId])),
        progress(p.pct, p.met ? 'met' : p.daysLeft < 14 ? 'warn' : 'ok', `${money(p.spentSgd)} of ${money(p.minSpendSgd)}`),
        h('p', { class: 'list-sub' }, p.met
          ? `Minimum spend reached${p.bonusMiles ? `: ${p.bonusMiles.toLocaleString('en-SG')} bonus miles on the way` : ''}.`
          : p.daysLeft < 0 ? `Deadline ${formatDay(p.deadline)} has passed.` : `${money(p.leftSgd)} more by ${formatDay(p.deadline)}, ${p.daysLeft} days left.`))))) : null,
  );
}

function progress(pct, tone, label) {
  return h('div', { class: `bar bar-${tone}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label },
    h('span', { class: 'bar-fill', style: `transform: scaleX(${Math.min(pct, 100) / 100})` }));
}

function capBar(b) {
  const tone = b.overLimit ? 'over' : b.warn ? 'warn' : 'ok';
  return h('div', { class: 'cap' },
    h('div', { class: 'cap-line' },
      h('span', { class: 'cap-name' }, `${b.id[0].toUpperCase()}${b.id.slice(1)} cap`),
      h('span', { class: 'cap-left' }, `${money(b.leftSgd)} left`)),
    progress(b.pct, tone, b.label),
    h('p', { class: 'cap-sub' }, `${b.label}, resets ${formatDay(b.resetDate)}`),
    b.minSpendSgd && !b.minMet ? h('p', { class: 'muted small' }, `Bonus needs ${money(b.minSpendSgd)} in this category; ${money(b.spendSgd)} so far.`) : null,
    b.overLimit ? h('p', { class: 'warning' }, 'Past the limit: this category may earn the base rate for the whole period.') : null);
}

function reminderAction(r, render, go) {
  if (r.kind === 'statement-check') return h('button', { type: 'button', class: 'text-button', onclick: () => openStatementCheck(r.cardId, render) }, 'Check statement');
  if (r.kind === 'backup') return h('button', { type: 'button', class: 'text-button', onclick: async () => { if (await exportBackup()) render(); } }, 'Export backup');
  if (r.kind === 'fee') return h('button', { type: 'button', class: 'text-button', onclick: () => go('cards') }, 'Open My cards');
  return null;
}

function balanceForm(p, render) {
  const points = h('input', { type: 'text', inputmode: 'numeric', value: p.balancePoints != null ? String(p.balancePoints) : '', placeholder: '0' });
  const asOf = h('input', { type: 'date', value: today(), max: today() });
  let s;
  s = sheet(`${p.currency} balance`, h('form', {
    class: 'sheet-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const n = Number(points.value.replace(/[^\d]/g, ''));
      if (!(n >= 0) || points.value.trim() === '') { points.setCustomValidity('Enter the balance'); points.reportValidity(); return; }
      await addBalance({ pool: p.pool, points: n, asOf: asOf.value || today() });
      s.close();
      toast('Balance saved');
      render();
    },
  },
  field(`Balance (${p.currency})`, points, 'From the bank app. Purchases dated after the date below are added on top.'),
  field('Balance as of', asOf),
  h('div', { class: 'sheet-actions' }, h('button', { type: 'submit', class: 'button primary' }, 'Save balance'))));
}
