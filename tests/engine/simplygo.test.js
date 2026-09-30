import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn, summarizeCycle } from '../../src/engine/index.js';
import { uobPpv, categories, txn } from './fixtures.js';

const fare = (date = '2026-09-10') => txn('uob_ppv', 1.8, { method: 'simplygo', mcc: '4111', category: 'public_transport', merchant: 'SimplyGo', date });

test('SimplyGo fares are totalled for the month before rounding to S$5', () => {
  const history = [];
  const miles = [];
  for (let i = 0; i < 3; i++) {
    const f = fare();
    miles.push(earn({ card: uobPpv, purchase: f, categories, txns: history }).miles);
    history.push(f);
  }
  assert.deepEqual(miles, [0, 0, 20]); // S$5.40 total: first S$5 block lands on the third fare
});

test('SimplyGo month: 10 fares of S$1.80 = S$18, rounded down to S$15', () => {
  const txns = Array.from({ length: 10 }, () => fare());
  assert.equal(summarizeCycle({ card: uobPpv, categories, txns, date: '2026-09-10' }).miles, 60);
});

test('the same fare paid by phone tap is rounded per purchase', () => {
  assert.equal(earn({ card: uobPpv, purchase: txn('uob_ppv', 1.8), categories }).miles, 0);
});

test('SimplyGo totals restart each month', () => {
  const history = [fare('2026-09-10'), fare('2026-09-11')];
  const r = earn({ card: uobPpv, purchase: fare('2026-10-02'), categories, txns: history });
  assert.equal(r.miles, 0);
});
