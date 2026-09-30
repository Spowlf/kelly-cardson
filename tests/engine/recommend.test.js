import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../../src/engine/index.js';
import { uobPpv, uobVs, citiRewards, maybankXl, hsbcRevo, categories, txn } from './fixtures.js';

const cards = [uobPpv, citiRewards, maybankXl];
const myCards = [{ cardId: 'uob_ppv' }, { cardId: 'citi_rewards', statementDay: 15 }, { cardId: 'maybank_xl' }];
const maybankMet = [txn('maybank_xl', 600, { date: '2026-09-02' })];

test('ranks her cards by miles, ties by most cap left, and gives a method hint', () => {
  const purchase = { amount: 45, date: '2026-09-10', category: 'dining', mcc: '5812', merchant: 'Din Tai Fung', fcy: false };
  const out = recommend({ purchase, cards, myCards, categories, txns: maybankMet });
  // PPV and Maybank both earn 180; Maybank has S$400 cap left vs PPV's S$600.
  assert.deepEqual(out.results.map((r) => r.cardId), ['uob_ppv', 'maybank_xl', 'citi_rewards']);
  const ppv = out.results[0];
  assert.equal(ppv.best.method, 'mobile_tap');
  assert.equal(ppv.best.miles, 180);
  assert.equal(ppv.methodHint, 'Pay by phone, not the plastic card');
});

test('ties with equal cap left follow her priority order', () => {
  const purchase = { amount: 45, date: '2026-09-10', category: 'dining', mcc: '5812', fcy: false };
  const twins = [uobPpv, { ...uobPpv, id: 'uob_ppv_2', name: 'UOB PPV 2' }];
  const run = (mine) => recommend({ purchase, cards: twins, myCards: mine, categories }).results.map((r) => r.cardId);
  assert.deepEqual(run([{ cardId: 'uob_ppv' }, { cardId: 'uob_ppv_2' }]), ['uob_ppv', 'uob_ppv_2']);
  assert.deepEqual(run([{ cardId: 'uob_ppv', priority: 2 }, { cardId: 'uob_ppv_2', priority: 1 }]), ['uob_ppv_2', 'uob_ppv']);
});

test('a card to avoid goes last even if it would earn more', () => {
  const purchase = { amount: 200, date: '2026-09-10', category: 'dining', mcc: '5812', method: 'chip_or_swipe', fcy: true };
  const txns = [txn('uob_vs', 1100, { fcy: true })];
  const out = recommend({ purchase, cards: [uobVs, hsbcRevo], myCards: [{ cardId: 'uob_vs', statementDay: 20 }, { cardId: 'hsbc_revo' }], categories, txns });
  // UOB VS would earn 80 (base) vs HSBC's 66, but it would push the category past S$1,200.
  assert.deepEqual(out.results.map((r) => [r.cardId, r.best.miles]), [['hsbc_revo', 66], ['uob_vs', 80]]);
});

test('card with no cap left drops below one that has cap', () => {
  const purchase = { amount: 45, date: '2026-09-10', category: 'dining', mcc: '5812', merchant: 'Din Tai Fung', fcy: false };
  const txns = [...maybankMet, txn('uob_ppv', 600, { date: '2026-09-03' })];
  const out = recommend({ purchase, cards, myCards, categories, txns });
  assert.equal(out.results[0].cardId, 'maybank_xl');
});

test('only her cards are ranked', () => {
  const purchase = { amount: 45, date: '2026-09-10', category: 'dining', mcc: '5812', fcy: false };
  const out = recommend({ purchase, cards, myCards: [{ cardId: 'citi_rewards', statementDay: 15 }], categories });
  assert.deepEqual(out.results.map((r) => r.cardId), ['citi_rewards']);
});

test('online purchase compares online methods only', () => {
  const purchase = { amount: 30, date: '2026-09-10', category: 'food_delivery', mcc: '5814', merchant: 'foodpanda', fcy: false };
  const out = recommend({ purchase, cards: [citiRewards], myCards: [{ cardId: 'citi_rewards', statementDay: 15 }], categories });
  const citi = out.results[0];
  assert.deepEqual(Object.keys(citi.byMethod).sort(), ['in_app_wallet', 'online_card_entry']);
  assert.equal(citi.best.method, 'online_card_entry');
  assert.equal(citi.methodHint, 'Pay by entering the card number, not Apple Pay in the app');
});

test('given a method, only that method is used', () => {
  const purchase = { amount: 45, date: '2026-09-10', category: 'dining', mcc: '5812', method: 'physical_tap', fcy: false };
  const out = recommend({ purchase, cards: [uobPpv], myCards: [{ cardId: 'uob_ppv' }], categories });
  assert.deepEqual(Object.keys(out.results[0].byMethod), ['physical_tap']);
  assert.equal(out.results[0].methodHint, null);
});

test('SimplyGo: a card that totals fares for the month ranks by expected miles, not this fare alone', () => {
  const purchase = { amount: 1.8, date: '2026-09-10', category: 'public_transport', mcc: '4111', fcy: false };
  const out = recommend({ purchase, cards: [citiRewards, uobPpv], myCards: [{ cardId: 'citi_rewards', statementDay: 15 }, { cardId: 'uob_ppv' }], categories });
  const ppv = out.results[0];
  assert.equal(ppv.cardId, 'uob_ppv');
  assert.equal(ppv.best.miles, 0); // this fare alone doesn't complete a S$5 block
  assert.equal(ppv.best.rankMiles, 7.2); // S$1.80 x 4 mpd over the month
});

test('no-miles category', () => {
  const purchase = { amount: 80, date: '2026-09-10', category: 'bills_utilities', fcy: false };
  const out = recommend({ purchase, cards, myCards, categories });
  assert.equal(out.noMiles, true);
  assert.equal(out.message, 'No miles, use any card');
});
