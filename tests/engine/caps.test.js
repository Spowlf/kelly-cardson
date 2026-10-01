import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn, summarizeCycle } from '../../src/engine/index.js';
import { uobPpv, citiRewards, categories, txn } from './fixtures.js';

const ppv = (purchase, txns = []) => earn({ card: uobPpv, purchase, categories, txns });

test('purchase over a cap splits into bonus and base parts', () => {
  const history = [txn('uob_ppv', 580)];
  const r = ppv(txn('uob_ppv', 45), history);
  assert.equal(r.bonusSgd, 20);
  assert.equal(r.baseSgd, 25);
  assert.equal(r.miles, 90); // 20 x 4 + 25 x 0.4
  assert.match(r.reason, /S\$20 of S\$600 tap cap left/);
});

test('both parts of a split are rounded down to the earn block', () => {
  // Catch-up entries count raw amounts, leaving S$12 of cap.
  const history = [txn('uob_ppv', 588, { isCatchUp: true, bucket: 'tap' })];
  const r = ppv(txn('uob_ppv', 20), history);
  assert.equal(r.bonusSgd, 10); // S$12 rounded down to S$10
  assert.equal(r.baseSgd, 5); // S$8 rounded down to S$5
  assert.equal(r.miles, 42);
});

test('a full cap earns the base rate and says so', () => {
  const r = ppv(txn('uob_ppv', 50), [txn('uob_ppv', 600)]);
  assert.equal(r.miles, 20);
  assert.equal(r.bonusSgd, 0);
  assert.match(r.reason, /tap cap of S\$600 is full/i);
});

test('separate caps within one card: full tap cap does not touch online cap', () => {
  const history = [txn('uob_ppv', 600)];
  const online = txn('uob_ppv', 50, { method: 'in_app_wallet', mcc: '5814', category: 'food_delivery' });
  const r = ppv(online, history);
  assert.equal(r.bucket, 'online');
  assert.equal(r.miles, 200);
  assert.match(r.reason, /S\$600 of S\$600 online cap left/);
});

test('cap usage replays history: tap bucket stops at S$600', () => {
  const txns = [txn('uob_ppv', 400), txn('uob_ppv', 300), txn('uob_ppv', 100, { method: 'online_card_entry', mcc: '5399', category: 'online_shopping' })];
  const s = summarizeCycle({ card: uobPpv, categories, txns, date: '2026-09-10' });
  assert.equal(s.buckets.tap.usedSgd, 600);
  assert.equal(s.buckets.online.usedSgd, 100);
  assert.equal(s.miles, 600 * 4 + 100 * 0.4 + 100 * 4);
});

test('shared cap: two Citi bonus categories draw from one S$1,000', () => {
  const history = [txn('citi_rewards', 800, { method: 'physical_tap', mcc: '5651', category: 'fashion' })];
  const p = txn('citi_rewards', 300, { method: 'online_card_entry', mcc: '5814', category: 'food_delivery' });
  const r = earn({ card: citiRewards, purchase: p, categories, txns: history, userCard: { statementDay: 15 } });
  assert.equal(r.bonusSgd, 200);
  assert.equal(r.baseSgd, 100);
  assert.equal(r.miles, 840);
});

test('cap warning at 85%, shown as "at least" used', () => {
  const s = summarizeCycle({ card: uobPpv, categories, txns: [txn('uob_ppv', 510)], date: '2026-09-10' });
  assert.equal(s.buckets.tap.pct, 85);
  assert.equal(s.buckets.tap.warn, true);
  assert.equal(s.buckets.tap.label, 'At least S$510 of S$600 used');
  assert.equal(s.buckets.online.warn, false);
});

test('same-day purchases fill a cap in the order they were entered, whatever order storage returns', () => {
  const first = txn('uob_ppv', 500, { id: 'zzz', createdAt: 1 });
  const second = txn('uob_ppv', 200, { id: 'aaa', createdAt: 2 });
  for (const txns of [[first, second], [second, first]]) {
    const s = summarizeCycle({ card: uobPpv, categories, txns, date: first.date });
    const byId = Object.fromEntries(s.entries.map((e) => [e.txn.id, e.result]));
    assert.equal(byId.zzz.bonusSgd, 500);
    assert.equal(byId.aaa.bonusSgd, 100);
  }
});
