import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn, disputedInStatement, resultsByTxn } from '../../src/engine/index.js';
import { citiRewards, categories, txn } from './fixtures.js';

const DISPUTED = [
  { id: 'citi_grab', merchants: ['Grab'], note: 'Sources disagree on Grab rides.', question: 'Did this earn 10X points?' },
  { id: 'citi_foodpanda', merchants: ['foodpanda'], note: 'Sources disagree on foodpanda.', question: 'Did this earn 10X points?' },
];
const citi = {
  ...citiRewards,
  bonus_rules: citiRewards.bonus_rules.map((r) => (r.id === 'online_non_travel' ? { ...r, disputed: DISPUTED } : r)),
};
const userCard = { cardId: 'citi_rewards', statementDay: 15 };
const online = (merchant, amount, date = '2026-09-10') => txn('citi_rewards', amount, { date, method: 'online_card_entry', merchant, mcc: '5814', category: 'food_delivery' });

test('a purchase relying on a disputed rule lists the dispute', () => {
  const r = earn({ card: citi, purchase: online('foodpanda', 30), categories, userCard });
  assert.deepEqual(r.disputes.map((d) => d.id), ['citi_foodpanda']);
  assert.equal(r.unconfirmed, true);
});

test('"yes" on her statement confirms it: bonus kept, no warning, no badge', () => {
  const settings = { disputeAnswers: { citi_foodpanda: { answer: 'yes', answeredAt: 1 } } };
  const r = earn({ card: citi, purchase: online('foodpanda', 30), categories, userCard, settings });
  assert.equal(r.miles, 120);
  assert.deepEqual(r.disputes, []);
  assert.equal(r.unconfirmed, false);
});

test('"no" on her statement: that merchant earns the base rate on this card from now on', () => {
  const settings = { disputeAnswers: { citi_foodpanda: { answer: 'no', answeredAt: 1, statementDate: '2026-09-15' } } };
  const r = earn({ card: citi, purchase: online('foodpanda', 30), categories, userCard, settings });
  assert.equal(r.miles, 12);
  assert.ok(r.warnings.some((w) => /statement showed no bonus/i.test(w)));
  // Other merchants on the same rule are unaffected.
  assert.equal(earn({ card: citi, purchase: online('Deliveroo', 30), categories, userCard, settings }).miles, 120);
});

test('a dispute marked confirmed in cards.json is no longer flagged', () => {
  const card = { ...citi, bonus_rules: citi.bonus_rules.map((r) => (r.disputed ? { ...r, disputed: r.disputed.map((d) => ({ ...d, resolved: 'confirmed' })) } : r)) };
  const r = earn({ card, purchase: online('Grab', 18), categories, userCard });
  assert.deepEqual(r.disputes, []);
  assert.equal(r.unconfirmed, false);
});

test('exclude_merchants on a rule sends that merchant to the base rate', () => {
  const card = { ...citi, bonus_rules: citi.bonus_rules.map((r) => (r.id === 'online_non_travel' ? { ...r, match: { ...r.match, exclude_merchants: ['foodpanda'] } } : r)) };
  assert.equal(earn({ card, purchase: online('foodpanda', 30), categories, userCard }).miles, 12);
  assert.equal(earn({ card, purchase: online('Deliveroo', 30), categories, userCard }).miles, 120);
});

test('statement check lists purchases in that statement that rely on an open dispute', () => {
  const txns = [
    online('foodpanda', 30, '2026-09-02'),
    online('Grab', 18, '2026-09-14'),
    online('Deliveroo', 25, '2026-09-10'),
    online('Grab', 18, '2026-09-20'), // next statement
  ];
  const settings = { disputeAnswers: {} };
  const list = disputedInStatement({ card: citi, userCard, txns, categories, settings, statementDate: '2026-09-15' });
  assert.deepEqual(list.map((x) => `${x.txn.merchant}:${x.dispute.id}`), ['foodpanda:citi_foodpanda', 'Grab:citi_grab']);
  assert.equal(list[0].dispute.question, 'Did this earn 10X points?');
});

test('results by purchase, for badges in History', () => {
  const txns = [online('foodpanda', 30), online('Deliveroo', 25)];
  const map = resultsByTxn({ cards: [citi], myCards: [userCard], txns, categories, settings: {} });
  assert.equal(map.get(txns[0].id).disputes.length, 1);
  assert.equal(map.get(txns[1].id).disputes.length, 0);
});
