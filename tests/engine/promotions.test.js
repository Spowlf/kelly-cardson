import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn } from '../../src/engine/index.js';
import { citiRewards, categories, txn } from './fixtures.js';

const ALL = ['mobile_tap', 'physical_tap', 'chip_or_swipe', 'online_card_entry', 'in_app_wallet', 'simplygo'];
const ocbc = {
  id: 'ocbc_rewards', name: 'OCBC Rewards', bank: 'OCBC',
  base_mpd: { local: 0.4, fcy: 0.4 },
  earn_block: { type: 'per_txn_floor', size_sgd: 5 },
  cap_period: 'calendar_month', cap_basis: null,
  caps: { shared: { sgd: 1110 } },
  min_spend: null,
  bonus_rules: [
    { id: 'promo', mpd: 6, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'merchants', merchants: ['Shopee', 'Watsons'] }, cap_bucket: 'shared', promotion: true, valid_from: '2026-07-01', valid_until: '2027-03-31', needs_verification: true },
    { id: 'named', mpd: 4, methods: ALL, currencies: ['SGD', 'FCY'], match: { mode: 'merchants', merchants: ['Shopee', 'Watsons'] }, cap_bucket: 'shared', needs_verification: true },
  ],
  no_points: { mccs: [], merchants: [], notes: [], needs_verification: true },
};
const shopee = (date) => txn('ocbc_rewards', 50, { date, method: 'online_card_entry', merchant: 'Shopee', mcc: null, category: 'online_shopping' });

test('promotion applies inside its dates and says when it ends', () => {
  const r = earn({ card: ocbc, purchase: shopee('2027-03-31'), categories });
  assert.equal(r.miles, 300);
  assert.equal(r.ruleId, 'promo');
  assert.equal(r.unconfirmed, true);
  assert.ok(r.warnings.some((w) => w === 'Promotion ends 31 Mar 2027.'));
});

test('promotion stops after its end date and before its start date', () => {
  assert.equal(earn({ card: ocbc, purchase: shopee('2027-04-01'), categories }).miles, 200);
  assert.equal(earn({ card: ocbc, purchase: shopee('2026-06-30'), categories }).miles, 200);
});

test('disputed merchant keeps the rate but warns and marks unconfirmed', () => {
  const card = {
    ...citiRewards,
    bonus_rules: citiRewards.bonus_rules.map((r) => (r.id === 'online_non_travel'
      ? { ...r, disputed: [{ merchants: ['Grab'], note: 'Sources disagree on Grab rides. Confirm on her first statement.' }] }
      : r)),
  };
  const grab = txn('citi_rewards', 18, { method: 'online_card_entry', merchant: 'Grab', mcc: '4121', category: 'rides' });
  const r = earn({ card, purchase: grab, categories, userCard: { statementDay: 15 } });
  assert.equal(r.miles, 72);
  assert.equal(r.unconfirmed, true);
  assert.ok(r.warnings.includes('Sources disagree on Grab rides. Confirm on her first statement.'));
  const other = earn({ card, purchase: { ...grab, merchant: 'foodpanda' }, categories, userCard: { statementDay: 15 } });
  assert.equal(other.unconfirmed, false);
});
