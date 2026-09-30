import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiasumilesPrompt, pointsBalances, signupProgress, reminders, backupDue, overview } from '../../src/engine/index.js';
import { uobPpv, citiRewards, maybankXl, categories, txn } from './fixtures.js';

const ppv = { ...uobPpv, kiasumiles_id: 'uob_ppv', points_pool: 'uob_unidollar', points_currency: 'UNI$', miles_per_point: 2, transfer: { block_miles: 10000 }, points_expiry_months: 24, annual_fee_sgd: 196.2, fee_reminder: 'UOB takes UNI$ to pay the fee. Request a waiver in the UOB TMRW app to get them back.' };
const citi = { ...citiRewards, kiasumiles_id: 'citi_rewards_mc', miles_per_point: 0.4, annual_fee_sgd: 196.2, fee_reminder: 'Ask Citi for an annual fee waiver.' };
const xl = { ...maybankXl, kiasumiles_id: 'maybank_xl' };
const cards = [ppv, citi, xl];
const TODAY = '2026-09-30';

// ---- KiasuMiles prompt ------------------------------------------------------

const dtf = { merchant: 'Din Tai Fung', amount: 45, method: 'mobile_tap', channel: 'in_person', category: 'dining', fcy: false };

test('KiasuMiles prompt lists only cards with cap left, naming the caps that are left', () => {
  const txns = [txn('uob_ppv', 600, { date: '2026-09-05' })]; // tap cap full
  const text = kiasumilesPrompt({ purchase: dtf, cards, myCards: [{ cardId: 'uob_ppv' }, { cardId: 'maybank_xl' }], txns, categories, today: TODAY });
  assert.equal(text, 'Use KiasuMiles. My cards with cap left: UOB PPV [uob_ppv] (online cap only), Maybank XL [maybank_xl]. Merchant: Din Tai Fung, paying by Apple Pay tap in store, S$45.');
});

test('KiasuMiles prompt leaves out a card whose caps are all used', () => {
  const txns = [txn('maybank_xl', 1000, { date: '2026-09-05' })];
  const text = kiasumilesPrompt({ purchase: dtf, cards, myCards: [{ cardId: 'uob_ppv' }, { cardId: 'maybank_xl' }], txns, categories, today: TODAY });
  assert.ok(!text.includes('Maybank'));
});

test('KiasuMiles prompt: no method given, foreign currency', () => {
  const text = kiasumilesPrompt({ purchase: { ...dtf, method: undefined, fcy: true, amount: 12.5 }, cards, myCards: [{ cardId: 'uob_ppv' }], categories, today: TODAY });
  assert.ok(text.endsWith('Merchant: Din Tai Fung, paying by any method (compare them), S$12.50, charged in foreign currency.'));
});

test('no KiasuMiles prompt for SimplyGo', () => {
  assert.equal(kiasumilesPrompt({ purchase: { ...dtf, method: 'simplygo', channel: 'transit' }, cards, myCards: [{ cardId: 'uob_ppv' }], categories, today: TODAY }), null);
  assert.equal(kiasumilesPrompt({ purchase: { ...dtf, method: undefined, channel: 'transit' }, cards, myCards: [{ cardId: 'uob_ppv' }], categories, today: TODAY }), null);
});

// ---- Overview ---------------------------------------------------------------

test('overview: miles and cap bars for each of her cards this cycle', () => {
  const txns = [txn('uob_ppv', 510, { date: '2026-09-05' }), txn('uob_ppv', 100, { date: '2026-08-20' })];
  const o = overview({ cards, myCards: [{ cardId: 'uob_ppv' }], txns, categories, today: TODAY });
  assert.equal(o.totalMiles, 2040);
  const tap = o.cards[0].buckets.find((b) => b.id === 'tap');
  assert.equal(tap.label, 'At least S$510 of S$600 used');
  assert.equal(tap.warn, true);
  assert.equal(tap.resetDate, '2026-10-01');
});

// ---- Points balances --------------------------------------------------------

test('points balance adds only purchases after the balance date', () => {
  const txns = [txn('uob_ppv', 100, { date: '2026-09-01' }), txn('uob_ppv', 200, { date: '2026-09-10' })];
  const balances = [{ id: 'b1', pool: 'uob_unidollar', points: 1000, asOf: '2026-09-05', enteredAt: 1 }];
  const [uob] = pointsBalances({ cards, myCards: [{ cardId: 'uob_ppv' }], txns, balances, categories, today: TODAY });
  assert.equal(uob.earnedPoints, 400); // S$200 x 4 mpd = 800 miles = 400 UNI$
  assert.equal(uob.points, 1400);
  assert.equal(uob.miles, 2800);
  assert.equal(uob.blocksReady, 0);
  assert.equal(uob.milesToNextBlock, 7200);
  assert.equal(uob.expiresAround, '2028-09-05');
});

test('points balance: transfer block reached', () => {
  const balances = [{ id: 'b1', pool: 'uob_unidollar', points: 5200, asOf: '2026-09-05', enteredAt: 1 }];
  const [uob] = pointsBalances({ cards, myCards: [{ cardId: 'uob_ppv' }], txns: [], balances, categories, today: TODAY });
  assert.equal(uob.blocksReady, 1);
  assert.equal(uob.milesToNextBlock, 9600);
});

test('points balance: latest entered balance wins; no balance counts every purchase', () => {
  const balances = [
    { id: 'old', pool: 'uob_unidollar', points: 50, asOf: '2026-08-01', enteredAt: 1 },
    { id: 'new', pool: 'uob_unidollar', points: 300, asOf: '2026-09-20', enteredAt: 2 },
  ];
  const txns = [txn('uob_ppv', 50, { date: '2026-09-10' })];
  assert.equal(pointsBalances({ cards, myCards: [{ cardId: 'uob_ppv' }], txns, balances, categories, today: TODAY })[0].points, 300);
  const none = pointsBalances({ cards, myCards: [{ cardId: 'uob_ppv' }], txns, balances: [], categories, today: TODAY })[0];
  assert.equal(none.points, 100);
  assert.equal(none.asOf, null);
});

// ---- Sign-up bonus ----------------------------------------------------------

test('sign-up bonus progress counts spend from opening to the deadline', () => {
  const myCard = { cardId: 'citi_rewards', openedDate: '2026-09-01', signup: { minSpendSgd: 1000, deadline: '2026-11-30', bonusMiles: 30000 } };
  const txns = [
    txn('citi_rewards', 300, { date: '2026-09-02' }),
    txn('citi_rewards', 200, { date: '2026-09-20', isCatchUp: true }),
    txn('citi_rewards', 999, { date: '2026-08-31' }),
    txn('uob_ppv', 999, { date: '2026-09-10' }),
  ];
  const p = signupProgress({ myCard, txns, today: TODAY });
  assert.equal(p.spentSgd, 500);
  assert.equal(p.leftSgd, 500);
  assert.equal(p.pct, 50);
  assert.equal(p.daysLeft, 61);
  assert.equal(p.met, false);
});

// ---- Reminders --------------------------------------------------------------

const kinds = (list) => list.map((r) => `${r.kind}:${r.cardId ?? ''}`);

test('reminders: upcoming statement, statement to check, annual fee, backup', () => {
  const myCards = [
    { cardId: 'citi_rewards', statementDay: 3 },
    { cardId: 'uob_ppv', statementDay: 25, annualFeeDate: '2026-10-20' },
  ];
  const list = reminders({ cards, myCards, txns: [txn('uob_ppv', 10)], statements: [], settings: {}, today: TODAY });
  assert.deepEqual(kinds(list).sort(), ['backup:', 'fee:uob_ppv', 'statement-check:uob_ppv', 'statement:citi_rewards'].sort());
  const fee = list.find((r) => r.kind === 'fee');
  assert.match(fee.text, /20 Oct 2026/);
  assert.match(fee.text, /TMRW/);
  assert.match(list.find((r) => r.kind === 'statement').text, /3 Oct/);
});

test('reminders: checked statement, far-off fee and recent backup are quiet', () => {
  const myCards = [{ cardId: 'uob_ppv', statementDay: 25, annualFeeDate: '2027-03-01' }];
  const list = reminders({
    cards, myCards, txns: [txn('uob_ppv', 10)],
    statements: [{ cardId: 'uob_ppv', cycleKey: 'S2026-09-25' }],
    settings: { lastExportAt: Date.parse('2026-09-28T10:00:00') }, today: TODAY, now: Date.parse('2026-09-30T10:00:00'),
  });
  assert.deepEqual(list, []);
});

test('backup is due after 7 days, or never done, once there is data', () => {
  const now = Date.parse('2026-09-30T10:00:00');
  assert.deepEqual(backupDue({ lastExportAt: now - 8 * 86400000, now, hasData: true }), { due: true, days: 8 });
  assert.equal(backupDue({ lastExportAt: now - 3 * 86400000, now, hasData: true }).due, false);
  assert.deepEqual(backupDue({ lastExportAt: null, now, hasData: true }), { due: true, days: null });
  assert.equal(backupDue({ lastExportAt: null, now, hasData: false }).due, false);
});
