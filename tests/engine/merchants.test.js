// Merchant memory: pre-fill merge, code priority, statement results per card, when a
// recommendation is "unconfirmed", search by alias and the statement-check questions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergePrefill, codeFor, withMerchant, editMerchant, recordStatementResult, searchMerchants, findByName, topMerchants,
  shortDescription, earn, recommend, statementQuestions,
} from '../../src/engine/index.js';
import { uobPpv, citiRewards, maybankXl, categories, txn } from './fixtures.js';

const cat = (id) => categories.find((c) => c.id === id);
const merchant = (name, fields = {}) => ({
  id: name.toLowerCase().replace(/\W+/g, '-'), name, nameLower: name.toLowerCase(), aliases: [], category: 'dining', channel: 'in_person',
  mcc: null, altMccs: [], status: 'guess', source: null, cardResults: {}, useCount: 0, lastUsed: null, editedByHer: false, ...fields,
});

// ---- Pre-fill merge ---------------------------------------------------------

test('pre-fill merge adds new merchants and never overwrites her edits', () => {
  const existing = [
    merchant('Edited', { status: 'reported', mcc: '5812', editedByHer: true, category: 'cafe' }),
    merchant('Entered', { status: 'code entered', mcc: '5999', editedByHer: true }),
    merchant('Confirmed', { status: 'confirmed by statement', cardResults: { uob_ppv: 'earned bonus' } }),
    merchant('Guessed', { useCount: 4, usualCardId: 'uob_ppv', usualMethod: 'mobile_tap', cardResults: { citi_rewards: 'base rate only' } }),
    merchant('Reported', { status: 'reported', mcc: '5812', source: 'Reported by MoneySmart, Jan 2026' }),
  ];
  const prefill = ['Edited', 'Entered', 'Confirmed', 'Guessed', 'Reported', 'New Shop'].map((name) => merchant(name, {
    status: 'reported', mcc: '5814', altMccs: ['5812'], source: 'Reported by HeyMax, Apr 2025', aliases: ['Alias'],
  }));
  const changed = mergePrefill(existing, prefill);
  const byName = Object.fromEntries(changed.map((m) => [m.name, m]));

  assert.deepEqual(Object.keys(byName).sort(), ['Guessed', 'New Shop', 'Reported']);
  assert.equal(byName['New Shop'].status, 'reported');
  assert.equal(byName.Guessed.mcc, '5814');
  assert.equal(byName.Guessed.status, 'reported');
  // Her usage and statement results stay.
  assert.equal(byName.Guessed.useCount, 4);
  assert.equal(byName.Guessed.usualCardId, 'uob_ppv');
  assert.deepEqual(byName.Guessed.cardResults, { citi_rewards: 'base rate only' });
  assert.deepEqual(byName.Reported.aliases, ['Alias']);
});

test('pre-fill merge finds her merchant by name when the id differs', () => {
  const mine = merchant("McDonald's", { id: "mcdonald's", editedByHer: true });
  assert.deepEqual(mergePrefill([mine], [merchant("McDonald's", { id: 'mcdonald-s', status: 'reported', mcc: '5814' })]), []);
});

// ---- Code priority ------------------------------------------------------------

test('code used: her entered code, else the reported code, else the category default', () => {
  const dining = cat('dining');
  assert.deepEqual(codeFor(merchant('A', { status: 'code entered', mcc: '5999' }), dining), { mcc: '5999', from: 'entered' });
  assert.deepEqual(codeFor(merchant('B', { status: 'reported', mcc: '5814' }), dining), { mcc: '5814', from: 'reported' });
  assert.deepEqual(codeFor(merchant('C'), dining), { mcc: '5812', from: 'default' });
  // Typing a code over a reported one makes hers the one used.
  const edited = editMerchant(merchant('D', { status: 'reported', mcc: '5814', source: 'Reported by MoneySmart, Jan 2026' }), { mcc: '5999' });
  assert.equal(edited.status, 'code entered');
  assert.equal(edited.editedByHer, true);
  assert.deepEqual(codeFor(edited, dining), { mcc: '5999', from: 'entered' });
  // Clearing it falls back to a guess, which uses the category default.
  assert.deepEqual(codeFor(editMerchant(edited, { mcc: null }), dining), { mcc: '5812', from: 'default' });
});

test('the merchant\'s current code beats one copied onto an old purchase', () => {
  const p = withMerchant({ amount: 10, mcc: '5812' }, merchant('E', { status: 'code entered', mcc: '5999' }));
  assert.equal(p.mcc, '5999');
});

// ---- Statement results per card -------------------------------------------

const online = (mcc, m) => withMerchant({ amount: 100, date: '2026-09-10', method: 'online_card_entry', fcy: false, category: 'food_delivery', merchant: m.name, mcc }, m);

test('"earned bonus" on her statement overrides the code rules for that card', () => {
  const m = recordStatementResult(merchant('Odd Shop', { category: 'food_delivery' }), 'uob_ppv', true);
  assert.equal(m.status, 'confirmed by statement');
  const r = earn({ card: uobPpv, purchase: online('5999', m), categories });
  assert.equal(r.miles, 400);
  assert.equal(r.unconfirmed, false);
  // Only for that card.
  const other = { ...uobPpv, id: 'uob_ppv_2' };
  assert.equal(earn({ card: other, purchase: online('5999', m), categories }).miles, 40);
});

test('"base rate only" on her statement overrides the code rules for that card', () => {
  const m = recordStatementResult(merchant('Listed Shop', { category: 'food_delivery' }), 'uob_ppv', false);
  assert.equal(m.status, 'guess');
  const r = earn({ card: uobPpv, purchase: online('5814', m), categories });
  assert.equal(r.miles, 40);
  assert.ok(r.warnings.some((w) => /statement showed only the base rate/.test(w)));
});

test('a statement result settles a disputed rule too', () => {
  const disputed = { ...citiRewards, bonus_rules: citiRewards.bonus_rules.map((r) => (r.id === 'online_non_travel' ? { ...r, disputed: [{ id: 'd', merchants: ['foodpanda'], note: 'Sources disagree.', question: 'Did this earn 10X points?' }] } : r)) };
  const userCard = { cardId: 'citi_rewards', statementDay: 15 };
  const m = merchant('foodpanda', { category: 'food_delivery', status: 'reported', mcc: '5499' });
  assert.equal(earn({ card: disputed, purchase: online(null, m), categories, userCard }).disputes.length, 1);
  const yes = earn({ card: disputed, purchase: online(null, recordStatementResult(m, 'citi_rewards', true)), categories, userCard });
  assert.equal(yes.disputes.length, 0);
  assert.equal(yes.miles, 400);
});

// ---- "Unconfirmed" only when the code could change the answer ---------------

const rank = (m, { method = 'online_card_entry', cards = [uobPpv], extra = {} } = {}) => recommend({
  purchase: withMerchant({ amount: 100, date: '2026-09-10', fcy: false, method, category: m.category, merchant: m.name, ...extra }, m),
  cards, myCards: cards.map((c) => ({ cardId: c.id })), categories,
});
const flags = (out) => Object.fromEntries(out.results.map((r) => [r.cardId, r.best.unconfirmed]));

test('reported with other codes: unconfirmed only if one of them changes the miles', () => {
  // Both codes are on the whitelist: same answer, so no flag.
  assert.deepEqual(flags(rank(merchant('Same', { category: 'food_delivery', status: 'reported', mcc: '5812', altMccs: ['5814'] }))), { uob_ppv: false });
  // One isn't: 400 or 40 miles, so flag it.
  assert.deepEqual(flags(rank(merchant('Differs', { category: 'food_delivery', status: 'reported', mcc: '5499', altMccs: ['5812'] }))), { uob_ppv: true });
  // No other codes reported: nothing to be unsure about.
  assert.deepEqual(flags(rank(merchant('Single', { category: 'food_delivery', status: 'reported', mcc: '5499' }))), { uob_ppv: false });
});

test('a change in top card flags the top result, only on the cards it affects', () => {
  const m = merchant('Split', { category: 'dining', status: 'reported', mcc: '5499', altMccs: ['5812'] });
  // Maybank XL's dining list (5811-5814) decides; UOB PPV's phone tap is a blacklist and doesn't care.
  // UOB PPV stays on top at 400 either way (Maybank only ties it), so only Maybank is flagged.
  const out = rank(m, { method: 'mobile_tap', cards: [uobPpv, maybankXl] });
  assert.deepEqual(flags(out), { uob_ppv: false, maybank_xl: true });
  // Tapping the card: UOB PPV earns 40 either way but tops the list only if the code is 5499.
  const card = rank(m, { method: 'physical_tap', cards: [uobPpv, maybankXl] });
  assert.equal(card.results[0].cardId, 'uob_ppv');
  assert.deepEqual(flags(card), { uob_ppv: true, maybank_xl: true });
});

test('guess: flagged when a whitelist decides, not for a blacklist', () => {
  assert.deepEqual(flags(rank(merchant('Guess Online', { category: 'food_delivery' }))), { uob_ppv: true });
  assert.deepEqual(flags(rank(merchant('Guess Tap', { category: 'dining' }), { method: 'mobile_tap' })), { uob_ppv: false });
});

test('reported code on a blacklist card: flagged only if another code is excluded', () => {
  const excluded = merchant('Maybe Excluded', { category: 'dining', status: 'reported', mcc: '5812', altMccs: ['4900'] });
  assert.deepEqual(flags(rank(excluded, { method: 'mobile_tap' })), { uob_ppv: true });
  const fine = merchant('Fine', { category: 'dining', status: 'reported', mcc: '5812', altMccs: ['5999'] });
  assert.deepEqual(flags(rank(fine, { method: 'mobile_tap' })), { uob_ppv: false });
});

test('code entered, confirmed or settled by statement: never flagged for the code', () => {
  assert.deepEqual(flags(rank(merchant('Entered', { category: 'food_delivery', status: 'code entered', mcc: '5814' }))), { uob_ppv: false });
  const settled = recordStatementResult(merchant('Settled', { category: 'food_delivery', status: 'reported', mcc: '5499', altMccs: ['5812'] }), 'uob_ppv', false);
  assert.deepEqual(flags(rank(settled)), { uob_ppv: false });
});

// ---- Search -----------------------------------------------------------------

const list = [
  merchant('FairPrice', { aliases: ['NTUC', 'NTUC FairPrice'], useCount: 1 }),
  merchant('FairPrice Online', { useCount: 5 }),
  merchant('Golden Village', { aliases: ['GV'] }),
  merchant("McDonald's", { aliases: ['McD', 'Macs'] }),
  merchant('KOI Thé'),
  merchant('Don Don Donki', { aliases: ['Donki'] }),
];

test('search finds merchants by alias', () => {
  assert.deepEqual(searchMerchants(list, 'ntuc').map((m) => m.name), ['FairPrice']);
  assert.deepEqual(searchMerchants(list, 'gv').map((m) => m.name), ['Golden Village']);
  assert.deepEqual(searchMerchants(list, 'macs').map((m) => m.name), ["McDonald's"]);
  assert.deepEqual(searchMerchants(list, 'donki').map((m) => m.name), ['Don Don Donki']);
  assert.deepEqual(searchMerchants(list, 'koi the').map((m) => m.name), ['KOI Thé']);
  assert.equal(findByName(list, 'Macs').name, "McDonald's");
  assert.equal(findByName(list, 'NTUC fairprice').name, 'FairPrice');
  assert.equal(findByName(list, 'Mac'), null);
});

test('search puts names that start with the text first, then the most used', () => {
  assert.deepEqual(searchMerchants(list, 'fair').map((m) => m.name), ['FairPrice Online', 'FairPrice']);
  assert.deepEqual(searchMerchants(list, 'price').map((m) => m.name), ['FairPrice Online', 'FairPrice']);
});

test('chips: most used first, ties by last used, topped up with common merchants', () => {
  const used = [
    merchant('A', { useCount: 2, lastUsed: 1 }), merchant('B', { useCount: 2, lastUsed: 5 }), merchant('C', { useCount: 9 }), merchant('D'), merchant('E'),
  ];
  assert.deepEqual(topMerchants(used, 8, ['e', 'c', 'd']).map((m) => m.name), ['C', 'B', 'A', 'E', 'D']);
  assert.deepEqual(topMerchants(used, 2).map((m) => m.name), ['C', 'B']);
  assert.deepEqual(topMerchants(used.map((m) => ({ ...m, useCount: 0 })), 8, ['d', 'a']).map((m) => m.name), ['D', 'A']);
});

// ---- Statement check questions --------------------------------------------

test('statement check asks about unconfirmed merchants on a whitelist, once each', () => {
  const userCard = { cardId: 'uob_ppv', statementDay: 15 };
  const guess = merchant('foodpanda', { category: 'food_delivery' });
  const entered = merchant('Sure Shop', { category: 'food_delivery', status: 'code entered', mcc: '5814' });
  const tap = merchant('Din Tai Fung', { category: 'dining' });
  const txns = [
    withMerchant(txn('uob_ppv', 30, { date: '2026-10-03', method: 'online_card_entry', merchant: 'foodpanda', category: 'food_delivery', mcc: null }), guess),
    withMerchant(txn('uob_ppv', 20, { date: '2026-10-05', method: 'online_card_entry', merchant: 'foodpanda', category: 'food_delivery', mcc: null }), guess),
    withMerchant(txn('uob_ppv', 20, { date: '2026-10-05', method: 'online_card_entry', merchant: 'Sure Shop', category: 'food_delivery', mcc: null }), entered),
    withMerchant(txn('uob_ppv', 50, { date: '2026-10-06', merchant: 'Din Tai Fung', mcc: null }), tap),
  ];
  const qs = statementQuestions({ card: uobPpv, userCard, txns, categories, statementDate: '2026-10-15' });
  assert.deepEqual(qs.map((q) => q.question), ['Did your foodpanda order on 3 Oct 2026 earn 10X points?']);
  assert.equal(qs[0].kind, 'code');
  // Once her statement settled it, it isn't asked again.
  const settled = recordStatementResult(guess, 'uob_ppv', true);
  const again = txns.map((t) => (t.merchant === 'foodpanda' ? withMerchant(t, settled) : t));
  assert.deepEqual(statementQuestions({ card: uobPpv, userCard, txns: again, categories, statementDate: '2026-10-15' }), []);
});

test('category code descriptions: sentence case, the part before the first dash', () => {
  const entry = { mcc: '5499', description: 'Miscellaneous Food Stores–Convenience Stores, Markets, Specialty Stores, and Vending Machines' };
  assert.equal(shortDescription(entry), 'Miscellaneous food stores');
  assert.equal(shortDescription({ mcc: '9751', description: 'UK Supermarkets, Electronic Hot File' }), 'UK supermarkets, electronic hot file');
  assert.equal(shortDescription({ mcc: '3075', description: 'Singapore Airlines' }), 'Singapore Airlines');
});
