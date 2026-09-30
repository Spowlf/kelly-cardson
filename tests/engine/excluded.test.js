import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn, mccInList } from '../../src/engine/index.js';
import { uobPpv, citiRewards, categories, txn } from './fixtures.js';

test('code ranges', () => {
  assert.equal(mccInList('3000', ['3000-3350']), true);
  assert.equal(mccInList('3350', ['3000-3350']), true);
  assert.equal(mccInList('3351', ['3000-3350']), false);
  assert.equal(mccInList('4511', ['4411', '4511']), true);
});

test('blacklisted code on a bonus rule earns the base rate', () => {
  const p = txn('citi_rewards', 100, { method: 'online_card_entry', mcc: '4511', category: 'airlines' });
  const r = earn({ card: citiRewards, purchase: p, categories, userCard: { statementDay: 15 } });
  assert.equal(r.ruleId, null);
  assert.equal(r.miles, 40);
});

test('code not on a whitelist earns the base rate', () => {
  const p = txn('uob_ppv', 100, { method: 'in_app_wallet', mcc: '5411', category: 'groceries' });
  const r = earn({ card: uobPpv, purchase: p, categories });
  assert.equal(r.miles, 40);
  assert.match(r.reason, /not a bonus/i);
});

test('no-points code earns nothing', () => {
  const p = txn('citi_rewards', 100, { method: 'online_card_entry', mcc: '8220', category: null });
  const r = earn({ card: citiRewards, purchase: p, categories, userCard: { statementDay: 15 } });
  assert.equal(r.miles, 0);
  assert.match(r.reason, /earns nothing/i);
});

test('no-points merchant name earns nothing, matched as a whole word', () => {
  assert.equal(earn({ card: uobPpv, purchase: txn('uob_ppv', 100, { merchant: 'AXS Station' }), categories }).miles, 0);
  assert.equal(earn({ card: uobPpv, purchase: txn('uob_ppv', 100, { merchant: 'Taxsaver' }), categories }).miles, 400);
});

test('no-miles category: "No miles, use any card"', () => {
  const p = txn('uob_ppv', 100, { mcc: null, category: 'bills_utilities' });
  const r = earn({ card: uobPpv, purchase: p, categories });
  assert.equal(r.miles, 0);
  assert.equal(r.reason, 'No miles, use any card');
});

test('missing code uses the category\'s guessed code and says so', () => {
  const p = txn('uob_ppv', 100, { method: 'in_app_wallet', mcc: null, category: 'food_delivery' });
  const r = earn({ card: uobPpv, purchase: p, categories });
  assert.equal(r.miles, 400);
  assert.equal(r.mccGuessed, true);
});

test('whitelist with no code and no category earns the base rate', () => {
  const p = txn('uob_ppv', 100, { method: 'in_app_wallet', mcc: null, category: null });
  assert.equal(earn({ card: uobPpv, purchase: p, categories }).miles, 40);
});
