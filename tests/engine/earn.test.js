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

test("UOB Lady's: an option with category codes matches by code and is confirmed", () => {
  const rule = { ...ladys.bonus_rules[0], needs_verification: false, match: { ...ladys.bonus_rules[0].match, option_mccs: { Dining: ['5811', '5812', '5814'] } } };
  const card = { ...ladys, bonus_rules: [rule] };
  const userCard = { choices: { ladys_category: 'Dining' } };
  const cafe = earn({ card, purchase: txn('uob_ladys', 50, { mcc: '5814', category: 'cafe' }), categories, userCard });
  assert.equal(cafe.miles, 200);
  assert.equal(cafe.unconfirmed, false);
  // The code decides, not the category: a "cafe" coded as a grocer earns base.
  assert.equal(earn({ card, purchase: txn('uob_ladys', 50, { mcc: '5411', category: 'cafe' }), categories, userCard }).miles, 20);
});

test('exclude_mccs: a matching merchant under an excluded code earns base', () => {
  const rule = { id: 'named', mpd: 4, methods: ['online_card_entry'], currencies: ['SGD', 'FCY'], match: { mode: 'merchants', merchants: ['Shopee'], exclude_mccs: ['5411'] }, cap_bucket: null };
  const card = { ...scJourney, earn_block: { type: 'per_txn_floor', size_sgd: 1 }, bonus_rules: [rule] };
  const shop = (mcc) => earn({ card, purchase: txn('sc_journey', 10, { method: 'online_card_entry', merchant: 'Shopee', mcc, category: null }), categories }).miles;
  assert.equal(shop('5399'), 40);
  assert.equal(shop('5411'), 12);
});

test('cap reason uses the cap label, or the id with spaces', () => {
  const labelled = { ...uobPpv, caps: { tap: { sgd: 600, label: 'phone tap' }, online: { sgd: 600 } } };
  assert.match(earn({ card: labelled, purchase: txn('uob_ppv', 100), categories }).reason, /S\$600 phone tap cap left/);
  const underscored = { ...uobPpv, caps: { tap_and_go: { sgd: 600 }, online: { sgd: 600 } }, bonus_rules: [{ ...uobPpv.bonus_rules[0], cap_bucket: 'tap_and_go' }] };
  const r = earn({ card: underscored, purchase: txn('uob_ppv', 100), categories });
  assert.match(r.reason, /tap and go cap left/);
  assert.equal(r.capName, 'tap and go');
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
