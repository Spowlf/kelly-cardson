import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earn, recommend } from '../../src/engine/index.js';
import { uobPpv, citiRewards, categories as baseCategories, txn } from './fixtures.js';

const categories = [...baseCategories, { id: 'subscriptions', channel: 'online', default_mcc: '5968', mcc_is_guess: true, recurring: true }];

// UOB PPV: the online bonus excludes recurring payments, even in an eligible code.
const uob = {
  ...uobPpv,
  bonus_rules: uobPpv.bonus_rules.map((r) => (r.id === 'selected_online' ? { ...r, match: { ...r.match, mccs: [...r.match.mccs, '5968'], exclude_recurring: true } } : r)),
};

const DISPUTE = { id: 'citi_recurring', recurring: true, note: 'Sources do not say whether subscriptions earn 10X.', question: 'Did this subscription earn 10X points?' };
const citi = {
  ...citiRewards,
  bonus_rules: citiRewards.bonus_rules.map((r) => (r.id === 'online_non_travel' ? { ...r, disputed: [DISPUTE] } : r)),
};
const userCard = { cardId: 'citi_rewards', statementDay: 15 };

const sub = (cardId, amount = 20) => txn(cardId, amount, { method: 'online_card_entry', merchant: 'Netflix', mcc: null, category: 'subscriptions' });

test('subscriptions are an ordinary online category, not "no miles"', () => {
  const out = recommend({ purchase: { amount: 20, date: '2026-09-10', fcy: false, category: 'subscriptions', merchant: 'Netflix' }, cards: [uob, citi], myCards: [{ cardId: 'uob_ppv' }, userCard], categories });
  assert.equal(out.noMiles, false);
  assert.deepEqual(out.methods, ['online_card_entry', 'in_app_wallet']);
});

test('UOB PPV: a recurring payment earns the base rate, with the reason', () => {
  const r = earn({ card: uob, purchase: sub('uob_ppv'), categories });
  assert.equal(r.miles, 8);
  assert.ok(r.warnings.some((w) => /recurring/i.test(w)), r.warnings.join(' | '));
  // The same code as a one-off online purchase still earns the bonus.
  const oneOff = earn({ card: uob, purchase: txn('uob_ppv', 20, { method: 'online_card_entry', mcc: '5968', category: null }), categories });
  assert.equal(oneOff.miles, 80);
});

test('Citi Rewards: a subscription keeps the bonus but is flagged "check on statement"', () => {
  const r = earn({ card: citi, purchase: sub('citi_rewards'), categories, userCard });
  assert.equal(r.miles, 80);
  assert.deepEqual(r.disputes.map((d) => d.id), ['citi_recurring']);
  assert.equal(r.unconfirmed, true);
  // One-off online spend is not part of this dispute.
  const oneOff = earn({ card: citi, purchase: txn('citi_rewards', 20, { method: 'online_card_entry', mcc: '5999', category: null }), categories, userCard });
  assert.deepEqual(oneOff.disputes, []);
});

test('Citi Rewards: "no" on the statement sends recurring payments to the base rate', () => {
  const settings = { disputeAnswers: { citi_recurring: { answer: 'no', answeredAt: 1 } } };
  assert.equal(earn({ card: citi, purchase: sub('citi_rewards'), categories, userCard, settings }).miles, 8);
  const oneOff = earn({ card: citi, purchase: txn('citi_rewards', 20, { method: 'online_card_entry', mcc: '5999', category: null }), categories, userCard, settings });
  assert.equal(oneOff.miles, 80);
});
