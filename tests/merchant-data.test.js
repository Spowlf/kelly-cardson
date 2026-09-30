// Checks data/merchants.prefill.json against data/merchant-mccs.json and data/categories.json,
// and keeps UOB Preferred Visa's code lists in data/cards.json in step with data/mcc-codes.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATUSES, nameKey, searchMerchants } from '../src/engine/index.js';

const load = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url)));
const prefill = load('merchants.prefill.json');
const reported = load('merchant-mccs.json');
const { categories } = load('categories.json');
const { codes } = load('mcc-codes.json');
const { cards } = load('cards.json');

const CATEGORY_IDS = new Set(categories.map((c) => c.id));
const byName = Object.fromEntries(prefill.merchants.map((m) => [m.name, m]));
const expand = (list) => new Set(list.flatMap((x) => {
  const [from, to] = x.split('-');
  if (!to) return [from];
  return Array.from({ length: Number(to) - Number(from) + 1 }, (_, i) => String(Number(from) + i));
}));
const sorted = (set) => [...set].sort();

test('pre-fill has a version, unique ids, known categories and statuses', () => {
  assert.ok(prefill._meta.version >= 2);
  assert.equal(new Set(prefill.merchants.map((m) => m.id)).size, prefill.merchants.length);
  for (const m of prefill.merchants) {
    assert.ok(CATEGORY_IDS.has(m.category), `${m.name} category ${m.category}`);
    assert.ok(['in_person', 'online', 'transit'].includes(m.channel), `${m.name} channel`);
    assert.ok(STATUSES.includes(m.status), `${m.name} status ${m.status}`);
    assert.equal(m.nameLower, nameKey(m.name), m.name);
  }
  for (const id of prefill._meta.common) assert.ok(prefill.merchants.some((m) => m.id === id), `common ${id}`);
  assert.equal(prefill._meta.common.length, 8);
});

test('merchants with a reported code are "reported" with its code, other codes and source', () => {
  for (const r of reported.merchants) {
    const m = byName[r.merchant];
    assert.ok(m, `${r.merchant} missing from the pre-fill`);
    assert.equal(m.status, 'reported', r.merchant);
    assert.equal(m.mcc, r.mcc, r.merchant);
    assert.deepEqual(m.altMccs, r.alt_mccs || [], r.merchant);
    assert.match(m.source, /^Reported by /, r.merchant);
  }
});

test('merchants with no reported code stay "guess" with no code', () => {
  for (const name of reported.not_found) {
    const m = byName[name];
    assert.ok(m, `${name} missing from the pre-fill`);
    assert.equal(m.status, 'guess', name);
    assert.equal(m.mcc, null, name);
  }
});

test('shown sources never say "MCC"', () => {
  for (const m of prefill.merchants) if (m.source) assert.doesNotMatch(m.source, /MCC/i, m.name);
});

test('pre-fill aliases find their merchants', () => {
  const pairs = [['NTUC', 'FairPrice'], ['NTUC FairPrice', 'FairPrice'], ['McD', "McDonald's"], ['Macs', "McDonald's"], ['ComfortDelGro', 'CDG Zig'],
    ['Comfort', 'CDG Zig'], ['GV', 'Golden Village'], ['Donki', 'Don Don Donki'], ['Ya Kun', 'Ya Kun Kaya Toast']];
  for (const [alias, name] of pairs) assert.equal(searchMerchants(prefill.merchants, alias)[0]?.name, name, alias);
});

test('UOB Preferred Visa: cards.json code lists match mcc-codes.json', () => {
  const card = cards.find((c) => c.id === 'uob_preferred_visa');
  const online = card.bonus_rules.find((r) => r.id === 'selected_online');
  const listedOnline = new Set(codes.filter((c) => c.banks?.uob_preferred_visa?.online_bonus).map((c) => c.mcc));
  const listedExcluded = new Set(codes.filter((c) => c.banks?.uob_preferred_visa?.excluded).map((c) => c.mcc));
  assert.deepEqual(sorted(expand(online.match.mccs)), sorted(listedOnline), 'online bonus list');
  assert.deepEqual(sorted(expand(card.no_points.mccs)), sorted(listedExcluded), 'exclusions');
});
