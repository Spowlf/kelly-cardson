// The writing style (CLAUDE.md) for text in the data files that the app shows. Labels drift into
// title case, ampersands and raw links unless a test checks the basics. dev_notes are never shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const { cards } = read('cards.json');
const { categories } = read('categories.json');

// Proper nouns written in capitals: banks, networks, brands, services.
const ACRONYMS = new Set(['UOB', 'UNI$', 'TMRW', 'DBS', 'OCBC', 'OCBC$', 'HSBC', 'SC', 'BOC', 'MRT', 'SPC', 'NETS', 'AXS', 'SAM', 'EZ', 'CDG']);

// [kind, where, text] for every string the app shows.
function shown() {
  const out = [];
  const add = (kind, where, text) => {
    if (Array.isArray(text)) text.forEach((t, i) => add(kind, `${where}[${i}]`, t));
    else if (typeof text === 'string' && text) out.push([kind, where, text]);
  };
  for (const c of cards) {
    add('sentence', `${c.id} fee_notes`, c.fee_notes);
    add('sentence', `${c.id} fee_reminder`, c.fee_reminder);
    add('sentence', `${c.id} gotchas`, c.gotchas);
    add('sentence', `${c.id} points_expiry`, c.points_expiry);
    add('sentence', `${c.id} min_spend notes`, c.min_spend?.notes);
    for (const [id, cap] of Object.entries(c.caps || {})) add('cap', `${c.id} cap ${id}`, cap.label);
    for (const r of c.bonus_rules) {
      add('label', `${c.id} ${r.id} label`, r.label);
      add('sentence', `${c.id} ${r.id} notes`, r.notes);
      // Shown as "… ${condition}.", so it has no period of its own.
      add('label', `${c.id} ${r.id} condition`, r.condition);
      for (const d of r.disputed || []) {
        add('sentence', `${c.id} ${r.id} ${d.id} note`, d.note);
        add('sentence', `${c.id} ${r.id} ${d.id} question`, d.question);
      }
    }
  }
  for (const c of categories) add('label', `category ${c.id}`, c.label);
  return out;
}

const texts = shown();

test('there is text to check', () => assert.ok(texts.length > 100));

test('no "&", no raw links, and "category code" rather than "MCC"', () => {
  for (const [, where, t] of texts) {
    assert.doesNotMatch(t, /&/, `${where}: use "and" or " / ": ${t}`);
    assert.doesNotMatch(t, /https?:\/\//, `${where}: link the source as text, not a raw URL: ${t}`);
    assert.doesNotMatch(t, /\bMCCs?\b/, `${where}: say "category code": ${t}`);
  }
});

test('no capitals for emphasis', () => {
  for (const [, where, t] of texts) {
    for (const word of t.match(/\b[A-Z]{2,}\$?/g) || []) {
      assert.ok(ACRONYMS.has(word), `${where}: "${word}" is in capitals (add it to ACRONYMS if it's a name): ${t}`);
    }
  }
});

test('sentences end with a period; labels, conditions and cap names don\'t', () => {
  for (const [kind, where, t] of texts) {
    if (kind === 'sentence') assert.match(t, /[.?!]$/, `${where}: end the sentence with a period: ${t}`);
    else assert.doesNotMatch(t, /\.$/, `${where}: no period after a label: ${t}`);
  }
});

test('labels are sentence case with no parentheses', () => {
  for (const [kind, where, t] of texts) {
    if (kind === 'sentence') continue;
    assert.doesNotMatch(t, /[()]/, `${where}: no parentheses in names: ${t}`);
    // A capitalised joining word ("Food And Drink") is title case.
    if (kind === 'label') assert.doesNotMatch(t, /^[A-Z][a-z]+ (?:And|Or|Of|For|The|To|In) /, `${where}: sentence case: ${t}`);
  }
});

test('money has thousands separators', () => {
  for (const [, where, t] of texts) assert.doesNotMatch(t, /S\$\d{4,}/, `${where}: write S$1,000: ${t}`);
});
