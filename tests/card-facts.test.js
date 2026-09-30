// Facts checked against bank terms and reviews (audit of 2026-09-30), run through the real
// data/cards.json. If a bank changes its terms, update the card AND the fact here, with the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { earn, summarizeCycle } from '../src/engine/index.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const { cards } = load('cards.json');
const { categories } = load('categories.json');
const card = (id) => cards.find((c) => c.id === id);
const date = '2026-09-10';
const buy = (id, amount, extra = {}, more = {}) => earn({ card: card(id), purchase: { amount, date, method: 'mobile_tap', fcy: false, ...extra }, categories, ...more });

// MileLion, "Explained: Citi Rewards Card blacklist for travel-related transactions".
test('Citi Rewards: tour operators (4723) and timeshares (7012) earn base online', () => {
  const userCard = { cardId: 'citi_rewards', statementDay: 15 };
  for (const mcc of ['4723', '7012']) assert.equal(buy('citi_rewards', 100, { method: 'online_card_entry', mcc }, { userCard }).miles, 40, mcc);
});

// Mainly Miles UOB Visa Signature review: only spend above S$1,200 drops to 0.4 mpd, the bonus
// is summed over the month then rounded down once, and SPC/Shell earn nothing.
test('UOB Visa Signature: spend past S$1,200 splits instead of dropping the category', () => {
  const userCard = { cardId: 'uob_visa_signature', statementDay: 15 };
  const txns = [{ id: 'a', cardId: 'uob_visa_signature', amount: 1100, date: '2026-09-05', method: 'mobile_tap', fcy: true }];
  const r = buy('uob_visa_signature', 200, { fcy: true }, { userCard, txns });
  assert.equal(r.avoid, false);
  assert.equal(r.bonusSgd, 100);
  assert.equal(r.miles, 440);
});

test('UOB Visa Signature: bonus is pooled for the month', () => {
  assert.equal(card('uob_visa_signature').bonus_earn_block.type, 'monthly_pooled_floor');
});

test('UOB Visa Signature: SPC and Shell earn nothing', () => {
  const userCard = { cardId: 'uob_visa_signature', statementDay: 15 };
  assert.equal(buy('uob_visa_signature', 100, { merchant: 'Shell Bukit Timah', category: 'petrol' }, { userCard }).miles, 0);
});

// MileLion SC Journey review: online only, SGD only, SimplyGo excluded, statement-month cap.
test('SC Journey: SimplyGo and foreign-currency rides earn the base rate', () => {
  assert.equal(buy('sc_journey', 50, { method: 'simplygo', category: 'public_transport' }).miles, 60);
  assert.equal(buy('sc_journey', 50, { method: 'online_card_entry', category: 'rides', fcy: true }).miles, 100);
  assert.equal(buy('sc_journey', 50, { method: 'online_card_entry', category: 'rides' }).miles, 150);
  assert.equal(card('sc_journey').cap_period, 'statement_month');
});

// DBS Woman's World and Altitude: points per S$5 block (MileLion, Mainly Miles).
test('DBS cards round down to S$5', () => {
  assert.equal(buy('dbs_wwmc', 9.99, { method: 'online_card_entry', category: 'online_shopping' }).miles, 20);
  assert.equal(buy('dbs_altitude', 9.99, { category: null, mcc: '5999' }).miles, 6.5);
  assert.equal(card('dbs_wwmc').cap_basis, 'transaction_date');
  assert.equal(card('dbs_altitude').bonus_rules.length, 0);
});

// Mainly Miles Maybank Horizon review: S$5 blocks; 1.2 mpd on selected local categories.
test('Maybank Horizon: S$5 blocks and 1.2 mpd local dining', () => {
  const txns = [{ id: 'a', cardId: 'maybank_horizon_vs', amount: 900, date: '2026-09-01', method: 'mobile_tap', fcy: false, category: null, mcc: '5999' }];
  assert.equal(buy('maybank_horizon_vs', 9.99, { category: 'dining' }, { txns }).miles, 6);
});

test('KrisFlyer UOB: foreign-currency fee is shown', () => {
  assert.equal(buy('krisflyer_uob', 100, { fcy: true }).fcyFeeSgd, 3.25);
});

// MileLion UOB Lady's review: published category codes, bonus pooled monthly.
test("UOB Lady's: Dining is matched by code and confirmed", () => {
  const userCard = { cardId: 'uob_ladys', choices: { ladys_category: 'Dining' } };
  const r = buy('uob_ladys', 50, { category: 'cafe', mcc: '5499' }, { userCard });
  assert.equal(r.miles, 200);
  assert.equal(r.unconfirmed, false);
  assert.equal(buy('uob_ladys', 50, { category: 'cafe', mcc: '5411' }, { userCard }).miles, 20);
});

// MileLion OCBC Rewards review: fashion codes earn 4 mpd; supermarket-coded purchases don't.
test('OCBC Rewards: fashion by code, groceries at a named platform excluded', () => {
  assert.equal(buy('ocbc_rewards', 50, { category: 'fashion', mcc: '5651' }).miles, 200);
  assert.equal(buy('ocbc_rewards', 50, { method: 'online_card_entry', merchant: 'Shopee', category: 'online_groceries' }).miles, 20);
});

// Subscriptions: UOB PPV's online bonus excludes recurring charges (Mainly Miles notes); Citi's is unconfirmed.
test('subscriptions: UOB Preferred Visa earns base, Citi Rewards is "check on statement"', () => {
  assert.equal(categories.find((c) => c.id === 'subscriptions').no_miles, undefined);
  assert.equal(buy('uob_preferred_visa', 100, { method: 'online_card_entry', category: 'subscriptions', merchant: 'Netflix' }).miles, 40);
  const citi = buy('citi_rewards', 100, { method: 'online_card_entry', category: 'subscriptions', merchant: 'Netflix' }, { userCard: { cardId: 'citi_rewards', statementDay: 15 } });
  assert.equal(citi.miles, 400);
  assert.equal(citi.disputes.length, 1);
});

test('every cap has a readable name', () => {
  for (const c of cards) {
    const s = summarizeCycle({ card: c, categories, txns: [], date });
    for (const b of Object.values(s.buckets)) assert.doesNotMatch(b.name, /_/, `${c.id} ${b.name}`);
  }
});
