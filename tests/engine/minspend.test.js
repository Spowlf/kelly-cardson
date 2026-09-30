import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn, summarizeCycle } from '../../src/engine/index.js';
import { maybankXl, uobVs, categories, txn } from './fixtures.js';

const xl = (purchase, txns = []) => earn({ card: maybankXl, purchase, categories, txns });

test('Maybank under S$500: still ranked at 4 mpd, with a "needs S$X more" warning', () => {
  const r = xl(txn('maybank_xl', 50), [txn('maybank_xl', 300)]);
  assert.equal(r.miles, 200);
  assert.equal(r.conditional, true);
  assert.ok(r.warnings.some((w) => /needs S\$150 more this month/i.test(w)));
});

test('Maybank: purchase that reaches S$500 has no warning', () => {
  const r = xl(txn('maybank_xl', 250), [txn('maybank_xl', 300)]);
  assert.equal(r.conditional, false);
  assert.deepEqual(r.warnings, []);
});

test('Maybank month under S$500 earns 0.4 mpd on everything', () => {
  const s = summarizeCycle({ card: maybankXl, categories, txns: [txn('maybank_xl', 400)], date: '2026-09-10' });
  assert.equal(s.minSpendMet, false);
  assert.equal(s.shortBySgd, 100);
  assert.equal(s.miles, 160);
});

test('Maybank month at S$500 or more earns the bonus', () => {
  const s = summarizeCycle({ card: maybankXl, categories, txns: [txn('maybank_xl', 300), txn('maybank_xl', 300)], date: '2026-09-10' });
  assert.equal(s.minSpendMet, true);
  assert.equal(s.miles, 2400);
});

const vs = (purchase, txns = []) => earn({ card: uobVs, purchase, categories, txns, userCard: { statementDay: 20 } });
const fcy = (amount) => txn('uob_vs', amount, { fcy: true });

test('UOB Visa Signature: ranked at base until S$1,000 in the category, unconfirmed', () => {
  const r = vs(fcy(200));
  assert.equal(r.miles, 80);
  assert.equal(r.bonusSgd, 0);
  assert.equal(r.reason, '4 mpd once S$800 more is spent in this category.');
  assert.equal(r.unconfirmed, true);
});

test('UOB Visa Signature: the purchase that reaches S$1,000 earns the bonus', () => {
  const r = vs(fcy(100), [fcy(900)]);
  assert.equal(r.miles, 400);
});

test('UOB Visa Signature: never recommends taking the category past S$1,200', () => {
  const over = vs(fcy(200), [fcy(1100)]);
  assert.equal(over.avoid, true);
  assert.equal(over.miles, 80);
  assert.match(over.reason, /past S\$1,200/);
  const exact = vs(fcy(100), [fcy(1100)]);
  assert.equal(exact.avoid, false);
  assert.equal(exact.miles, 400);
});

test('UOB Visa Signature: a purchase that fits two categories is avoided if either would pass S$1,200', () => {
  // A foreign-currency phone tap matches both FCY and contactless; the bank may count it as FCY.
  const r = vs(fcy(200), [fcy(1100)]);
  assert.equal(r.avoid, true);
  assert.equal(r.bucket, 'fcy');
});

test('UOB Visa Signature: once S$1,000 is reached, earlier purchases in the category earn the bonus too', () => {
  const s = summarizeCycle({ card: uobVs, categories, userCard: { statementDay: 20 }, txns: [fcy(600), fcy(500)], date: '2026-09-10' });
  assert.equal(s.buckets.fcy.minMet, true);
  assert.equal(s.miles, 4400);
});

test('UOB Visa Signature: past S$1,200 the whole category is counted at base', () => {
  const s = summarizeCycle({ card: uobVs, categories, userCard: { statementDay: 20 }, txns: [fcy(700), fcy(600)], date: '2026-09-10' });
  assert.equal(s.buckets.fcy.overLimit, true);
  assert.equal(s.miles, 520);
});

test('UOB Visa Signature: category under S$1,000 earns base; over earns bonus up to cap', () => {
  const under = summarizeCycle({ card: uobVs, categories, userCard: { statementDay: 20 }, txns: [txn('uob_vs', 900, { fcy: true })], date: '2026-09-10' });
  assert.equal(under.miles, 360);
  assert.equal(under.buckets.fcy.minMet, false);
  const over = summarizeCycle({ card: uobVs, categories, userCard: { statementDay: 20 }, txns: [txn('uob_vs', 1100, { fcy: true })], date: '2026-09-10' });
  assert.equal(over.miles, 4400);
  assert.equal(over.buckets.fcy.minMet, true);
});
