import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundTxn, pooledIncrement, toCents, earn } from '../../src/engine/index.js';
import { uobPpv, citiRewards, hsbcRevo, categories, txn } from './fixtures.js';

const AMOUNTS = [4.99, 9.99, 10.0];
const round = (block) => AMOUNTS.map((a) => roundTxn(toCents(a), block) / 100);

test('per_txn_floor S$1', () => {
  assert.deepEqual(round({ type: 'per_txn_floor', size_sgd: 1 }), [4, 9, 10]);
});

test('per_txn_floor S$5', () => {
  assert.deepEqual(round({ type: 'per_txn_floor', size_sgd: 5 }), [0, 5, 10]);
});

test('per_txn_nearest S$1', () => {
  assert.deepEqual(round({ type: 'per_txn_nearest', size_sgd: 1 }), [5, 10, 10]);
});

test('per_txn_nearest S$5', () => {
  assert.deepEqual(round({ type: 'per_txn_nearest', size_sgd: 5 }), [5, 10, 10]);
});

test('monthly_pooled_floor S$1: each amount alone from an empty pool', () => {
  const block = { type: 'monthly_pooled_floor', size_sgd: 1 };
  assert.deepEqual(AMOUNTS.map((a) => pooledIncrement(0, toCents(a), block) / 100), [4, 9, 10]);
});

test('monthly_pooled_floor S$1: pooling beats per-purchase rounding over a month', () => {
  const block = { type: 'monthly_pooled_floor', size_sgd: 1 };
  let pool = 0;
  let counted = 0;
  for (const a of AMOUNTS) {
    counted += pooledIncrement(pool, toCents(a), block);
    pool += toCents(a);
  }
  assert.equal(counted / 100, 24); // 24.98 pooled, vs 4 + 9 + 10 = 23 per purchase
});

test('UOB S$5 blocks in the engine: S$4.99 earns nothing, S$9.99 earns as S$5', () => {
  const at = (amount) => earn({ card: uobPpv, purchase: txn('uob_ppv', amount), categories });
  assert.equal(at(4.99).miles, 0);
  assert.match(at(4.99).reason, /S\$5/);
  assert.equal(at(9.99).miles, 20);
  assert.equal(at(10).miles, 40);
});

test('Citi S$1 blocks in the engine: S$9.99 online earns as S$9', () => {
  const p = txn('citi_rewards', 9.99, { method: 'online_card_entry', mcc: '5814', category: 'food_delivery' });
  assert.equal(earn({ card: citiRewards, purchase: p, categories }).miles, 36);
});

test('HSBC bonus is pooled for the month, then rounded down once', () => {
  const first = txn('hsbc_revo', 4.6);
  const r1 = earn({ card: hsbcRevo, purchase: first, categories });
  assert.equal(r1.miles, 13.32); // S$4 of S$4.60 pooled
  const r2 = earn({ card: hsbcRevo, purchase: txn('hsbc_revo', 4.6), categories, txns: [first] });
  assert.equal(r2.miles, 16.65); // pool S$9.20: S$9 total, S$5 more
});

test('HSBC base-rate purchase rounds to the nearest S$1', () => {
  const p = txn('hsbc_revo', 4.6, { method: 'chip_or_swipe' });
  assert.equal(earn({ card: hsbcRevo, purchase: p, categories }).miles, 1.65); // S$5 at 0.33
});
