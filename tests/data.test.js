// Checks data/cards.json and data/categories.json are well-formed, so a typo in a
// bank-terms edit is caught before it reaches her phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const { _meta, cards } = load('cards.json');
const { categories } = load('categories.json');

const METHODS = Object.keys(_meta.payment_methods);
const BLOCKS = Object.keys(_meta.earn_block_types);
const MODES = ['whitelist', 'blacklist', 'all', 'categories', 'merchants', 'user_category'];
const CATEGORY_IDS = new Set(categories.map((c) => c.id));
const MCC = /^\d{4}(-\d{4})?$/;
const disputeIds = new Set();

test('schema version 2', () => assert.equal(_meta.schema_version, 2));

test('card ids are unique', () => {
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
});

for (const card of cards) {
  test(`card ${card.id}`, () => {
    for (const f of ['name', 'bank', 'source', 'last_verified', 'base_mpd', 'caps', 'bonus_rules', 'no_points']) {
      assert.ok(f in card, `missing ${f}`);
    }
    assert.ok('kiasumiles_id' in card, 'missing kiasumiles_id');
    assert.equal(typeof card.base_mpd.local, 'number');
    assert.equal(typeof card.base_mpd.fcy, 'number');
    for (const b of [card.earn_block, card.bonus_earn_block, ...(card.earn_block_overrides || [])].filter(Boolean)) {
      assert.ok(BLOCKS.includes(b.type), `bad earn block ${b.type}`);
      assert.ok(b.size_sgd > 0);
    }
    assert.ok([null, undefined, 'calendar_month', 'statement_month'].includes(card.cap_period));
    for (const m of card.no_points.mccs) assert.match(m, MCC);
    for (const [id, cap] of Object.entries(card.caps)) {
      assert.ok(cap.sgd > 0, `cap ${id}`);
      assert.ok([undefined, 'bonus', 'base'].includes(cap.rank_until_min_met), `cap ${id} rank_until_min_met`);
      if (cap.rank_until_min_met) assert.ok(cap.min_spend_sgd > 0, `cap ${id} rank_until_min_met needs min_spend_sgd`);
      assert.ok([undefined, true, false].includes(cap.hard_limit), `cap ${id} hard_limit`);
    }
    if (card.min_spend) assert.ok([undefined, 'bonus'].includes(card.min_spend.rank_until_met), 'min_spend.rank_until_met');

    for (const r of card.bonus_rules) {
      assert.equal(typeof r.mpd, 'number', `${r.id} mpd`);
      assert.ok(r.methods.length && r.methods.every((m) => METHODS.includes(m)), `${r.id} methods`);
      assert.ok(r.currencies.every((c) => ['SGD', 'FCY'].includes(c)), `${r.id} currencies`);
      assert.ok(MODES.includes(r.match.mode), `${r.id} mode ${r.match.mode}`);
      if (r.cap_bucket) assert.ok(card.caps[r.cap_bucket], `${r.id} bucket ${r.cap_bucket}`);
      for (const d of [r.valid_from, r.valid_until].filter(Boolean)) assert.match(d, /^\d{4}-\d{2}-\d{2}$/, `${r.id} date ${d}`);
      if (r.promotion) assert.ok(r.valid_until, `${r.id} promotion needs valid_until`);
      for (const d of r.disputed || []) {
        assert.ok(d.id && (d.merchants?.length || d.recurring === true) && d.note && d.question, `${r.id} disputed entry needs id, merchants (or recurring: true), note, question`);
        assert.ok(!disputeIds.has(d.id), `duplicate dispute id ${d.id}`);
        disputeIds.add(d.id);
      }
      for (const m of [...(r.match.mccs || []), ...(r.match.exclude_mccs || []), ...Object.values(r.match.option_mccs || {}).flat()]) assert.match(m, MCC, `${r.id} code ${m}`);
      for (const o of Object.keys(r.match.option_mccs || {})) assert.ok(r.match.options?.includes(o), `${r.id} option_mccs ${o} is not an option`);
      const cats = [...(r.match.categories || []), ...Object.values(r.match.option_categories || {}).flat()];
      for (const c of cats) assert.ok(CATEGORY_IDS.has(c), `${r.id} category ${c}`);
    }
  });
}

test('categories', () => {
  for (const c of categories) {
    assert.match(c.default_mcc, MCC, c.id);
    assert.equal(c.mcc_is_guess, true, c.id);
    assert.ok(['in_person', 'online', 'transit'].includes(c.channel), c.id);
    assert.ok(!(c.no_miles && c.recurring), `${c.id}: recurring categories earn miles`);
  }
});
