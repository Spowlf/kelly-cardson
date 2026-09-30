import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn } from '../../src/engine/index.js';
import { uobPpv, maybankXl, scJourney, ladys, krisflyerUob, categories, txn } from './fixtures.js';

test('payment method matters: physical tap on UOB PPV earns base', () => {
  const r = earn({ card: uobPpv, purchase: txn('uob_ppv', 100, { method: 'physical_tap' }), categories });
  assert.equal(r.miles, 40);
});

test('missing earn_block defaults to S$1 round-down and is unconfirmed', () => {
  const p = txn('sc_journey', 9.99, { method: 'online_card_entry', mcc: '4121', category: 'rides' });
  const r = earn({ card: scJourney, purchase: p, categories });
  assert.equal(r.miles, 27);
  assert.equal(r.unconfirmed, true);
});

test('category-matched rule is unconfirmed', () => {
  const p = txn('sc_journey', 20, { method: 'online_card_entry', mcc: '5814', category: 'food_delivery' });
  const r = earn({ card: scJourney, purchase: p, categories });
  assert.equal(r.miles, 60);
  assert.equal(r.unconfirmed, true);
});

test("UOB Lady's: bonus only in her chosen category", () => {
  const p = txn('uob_ladys', 50, { mcc: '5814', category: 'cafe' });
  assert.equal(earn({ card: ladys, purchase: p, categories, userCard: { choices: { ladys_category: 'Dining' } } }).miles, 200);
  assert.equal(earn({ card: ladys, purchase: p, categories, userCard: { choices: { ladys_category: 'Fashion' } } }).miles, 20);
  assert.equal(earn({ card: ladys, purchase: p, categories }).miles, 20);
});

test('merchant-matched rule', () => {
  const p = txn('krisflyer_uob', 100, { method: 'online_card_entry', merchant: 'Singapore Airlines', mcc: '4511', category: 'airlines' });
  const r = earn({ card: krisflyerUob, purchase: p, categories });
  assert.equal(r.miles, 300);
  assert.equal(r.unconfirmed, true);
});

test('conditional rule is not counted unless she marks it met', () => {
  const p = txn('krisflyer_uob', 100);
  const off = earn({ card: krisflyerUob, purchase: p, categories });
  assert.equal(off.miles, 120);
  assert.ok(off.warnings.some((w) => /S\$1,000 SIA spend/.test(w)));
  const on = earn({ card: krisflyerUob, purchase: p, categories, userCard: { conditionsMet: { lifestyle: true } } });
  assert.equal(on.miles, 240);
});

test('foreign currency: fee and cost per mile', () => {
  const r = earn({ card: maybankXl, purchase: txn('maybank_xl', 100, { fcy: true, mcc: '5999', category: null }), categories, txns: [txn('maybank_xl', 600)] });
  assert.equal(r.miles, 400);
  assert.equal(r.fcyFeeSgd, 3.25);
  assert.equal(r.costPerMileSgd, 0.0081);
});

test('SGD purchase has no foreign-currency fee', () => {
  const r = earn({ card: uobPpv, purchase: txn('uob_ppv', 100), categories });
  assert.equal(r.fcyFeeSgd, 0);
  assert.equal(r.costPerMileSgd, null);
});
