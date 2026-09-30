import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleFor, earn } from '../../src/engine/index.js';
import { uobPpv, citiRewards, maybankXl, categories, txn } from './fixtures.js';

test('calendar month: resets on the 1st', () => {
  const sep = cycleFor('2026-09-30', 'calendar_month');
  assert.equal(sep.key, 'M2026-09');
  assert.equal(sep.start, '2026-09-01');
  assert.equal(sep.resetDate, '2026-10-01');
  assert.equal(cycleFor('2026-10-01', 'calendar_month').key, 'M2026-10');
});

test('statement month: statement day belongs to the cycle it closes', () => {
  const a = cycleFor('2026-09-15', 'statement_month', 15);
  assert.equal(a.end, '2026-09-15');
  assert.equal(a.start, '2026-08-16');
  assert.equal(a.resetDate, '2026-09-16');
  const b = cycleFor('2026-09-16', 'statement_month', 15);
  assert.equal(b.end, '2026-10-15');
  assert.notEqual(a.key, b.key);
});

test('statement day 31 falls back to the last day of short months', () => {
  assert.equal(cycleFor('2026-02-28', 'statement_month', 31).end, '2026-02-28');
  const mar = cycleFor('2026-03-01', 'statement_month', 31);
  assert.equal(mar.start, '2026-03-01');
  assert.equal(mar.end, '2026-03-31');
  assert.equal(cycleFor('2026-01-31', 'statement_month', 31).start, '2026-01-01');
});

test('calendar-month cap: last month\'s spend does not count after the 1st', () => {
  const history = [txn('uob_ppv', 600, { date: '2026-09-05' })];
  const r = earn({ card: uobPpv, purchase: txn('uob_ppv', 50, { date: '2026-10-01' }), categories, txns: history });
  assert.equal(r.miles, 200);
});

test('statement-month cap: resets the day after the statement date, not on the 1st', () => {
  const history = [txn('citi_rewards', 1000, { date: '2026-09-10', method: 'physical_tap', mcc: '5651', category: 'fashion' })];
  const shop = (date) => txn('citi_rewards', 100, { date, method: 'physical_tap', mcc: '5651', category: 'fashion' });
  const ctx = { card: citiRewards, categories, txns: history, userCard: { statementDay: 15 } };
  assert.equal(earn({ ...ctx, purchase: shop('2026-09-14') }).miles, 40); // same cycle: cap full
  assert.equal(earn({ ...ctx, purchase: shop('2026-09-16') }).miles, 400); // new cycle
  assert.equal(earn({ ...ctx, purchase: shop('2026-10-01') }).miles, 400); // still the 16 Sep cycle
});

test('posting-date card: "may count next month" within the posting delay of a reset', () => {
  const near = earn({ card: uobPpv, purchase: txn('uob_ppv', 50, { date: '2026-09-29' }), categories, settings: { postingDelayDays: 3 } });
  assert.ok(near.warnings.some((w) => /may count next month/i.test(w)));
  const far = earn({ card: uobPpv, purchase: txn('uob_ppv', 50, { date: '2026-09-20' }), categories });
  assert.ok(!far.warnings.some((w) => /may count next month/i.test(w)));
});

test('posting delay defaults to 3 days and is a setting', () => {
  const p = txn('uob_ppv', 50, { date: '2026-09-27' });
  assert.ok(!earn({ card: uobPpv, purchase: p, categories }).warnings.some((w) => /next month/i.test(w)));
  assert.ok(earn({ card: uobPpv, purchase: p, categories, settings: { postingDelayDays: 5 } }).warnings.some((w) => /next month/i.test(w)));
});

test('transaction-date card: no posting warning', () => {
  const r = earn({ card: maybankXl, purchase: txn('maybank_xl', 50, { date: '2026-09-30' }), categories, txns: [txn('maybank_xl', 600)] });
  assert.ok(!r.warnings.some((w) => /next month/i.test(w)));
});

test('statement-month card without a statement day asks for one', () => {
  const p = txn('citi_rewards', 50, { method: 'online_card_entry', mcc: '5814', category: 'food_delivery' });
  const r = earn({ card: citiRewards, purchase: p, categories });
  assert.ok(r.warnings.some((w) => /statement day/i.test(w)));
});
