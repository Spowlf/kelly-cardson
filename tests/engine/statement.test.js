import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementCheck, catchUpTxn, summarizeCycle } from '../../src/engine/index.js';
import { citiRewards, uobPpv, categories, txn } from './fixtures.js';

const citiTxns = [
  txn('citi_rewards', 300, { date: '2026-09-01' }),
  txn('citi_rewards', 200, { date: '2026-09-14' }),
  txn('citi_rewards', 999, { date: '2026-09-20' }), // next statement
  txn('uob_ppv', 50, { date: '2026-09-02' }), // other card
];
const check = (statementTotalSgd) =>
  statementCheck({ card: citiRewards, userCard: { statementDay: 15 }, txns: citiTxns, statementDate: '2026-09-15', statementTotalSgd });

test('statement higher than logged: offer a catch-up for the gap', () => {
  const c = check(620.5);
  assert.equal(c.loggedSgd, 500);
  assert.equal(c.gapSgd, 120.5);
  assert.equal(c.offerCatchUp, true);
  const t = catchUpTxn(c);
  assert.deepEqual(
    { cardId: t.cardId, amount: t.amount, date: t.date, isCatchUp: t.isCatchUp },
    { cardId: 'citi_rewards', amount: 120.5, date: '2026-09-15', isCatchUp: true },
  );
});

test('logged higher than statement: show the gap, no catch-up', () => {
  const c = check(450);
  assert.equal(c.gapSgd, -50);
  assert.equal(c.offerCatchUp, false);
  assert.match(c.message, /posts? (on the )?next statement/i);
});

test('statement matches logged', () => {
  const c = check(500);
  assert.equal(c.gapSgd, 0);
  assert.equal(c.offerCatchUp, false);
});

test('statement check needs a statement day', () => {
  const c = statementCheck({ card: citiRewards, userCard: {}, txns: citiTxns, statementDate: '2026-09-15', statementTotalSgd: 100 });
  assert.equal(c.offerCatchUp, false);
  assert.match(c.message, /statement day/i);
});

test('catch-up counts against every cap on the card, at the base rate', () => {
  const s = summarizeCycle({ card: uobPpv, categories, txns: [txn('uob_ppv', 100, { isCatchUp: true, method: null })], date: '2026-09-10' });
  assert.equal(s.buckets.tap.usedSgd, 100);
  assert.equal(s.buckets.online.usedSgd, 100);
  assert.equal(s.miles, 40);
});

test('catch-up with a chosen cap counts against that cap only', () => {
  const s = summarizeCycle({ card: uobPpv, categories, txns: [txn('uob_ppv', 100, { isCatchUp: true, bucket: 'online' })], date: '2026-09-10' });
  assert.equal(s.buckets.tap.usedSgd, 0);
  assert.equal(s.buckets.online.usedSgd, 100);
});
