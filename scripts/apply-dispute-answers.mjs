// Turns her statement answers on disputed rules (from a Miles backup file) into cards.json edits.
//   yes -> the dispute is marked resolved: "confirmed" (rate stays, no more badge)
//   no  -> the merchant is added to the rule's match.exclude_merchants (base rate), or for a
//          recurring-payments dispute match.exclude_recurring is set; the dispute is marked
//          resolved: "base_rate"
// Shows the diff and changes nothing unless --apply is given.
//
//   node scripts/apply-dispute-answers.mjs path/to/miles-backup.json [--apply]

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [backupPath, flag] = process.argv.slice(2);
if (!backupPath) {
  console.error('Usage: node scripts/apply-dispute-answers.mjs <backup.json> [--apply]');
  process.exit(1);
}

const cardsUrl = new URL('../data/cards.json', import.meta.url);
const original = readFileSync(cardsUrl, 'utf8');
const { cards } = JSON.parse(original);
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
const answers = backup.stores?.settings?.find((s) => s.key === 'disputeAnswers')?.value || {};

let text = original;
const summary = [];

// Insert `insert` right after the first `after` found from `from` onwards.
function insertAfter(from, after, insert) {
  const at = text.indexOf(after, from);
  if (at < 0) throw new Error(`Couldn't find ${after}`);
  text = text.slice(0, at + after.length) + insert + text.slice(at + after.length);
}

for (const [id, a] of Object.entries(answers)) {
  let found;
  for (const card of cards) {
    for (const rule of card.bonus_rules) {
      const d = (rule.disputed || []).find((x) => x.id === id);
      if (d) found = { card, rule, d };
    }
  }
  if (!found) { summary.push(`skip ${id}: not in cards.json`); continue; }
  const { card, rule, d } = found;
  if (d.resolved) { summary.push(`skip ${id}: already resolved (${d.resolved})`); continue; }
  const on = a.statementDate || new Date(a.answeredAt).toISOString().slice(0, 10);
  const resolved = a.answer === 'yes' ? 'confirmed' : 'base_rate';

  // Mark the dispute resolved (on its own line, found by its unique id).
  insertAfter(0, `"id": "${id}",`, ` "resolved": "${resolved}", "resolved_on": "${on}",`);

  if (a.answer === 'no') {
    const cardAt = text.indexOf(`"id": "${card.id}",`);
    const ruleAt = text.indexOf(`"id": "${rule.id}",`, cardAt);
    const matchAt = text.indexOf('"match": {', ruleAt);
    if (d.recurring && !d.merchants?.length) {
      if (!rule.match.exclude_recurring) insertAfter(matchAt, '"match": {', ' "exclude_recurring": true,');
      summary.push(`${card.name}, recurring payments: statement said NO -> base rate from now on`);
      continue;
    }
    const existing = text.indexOf('"exclude_merchants": [', matchAt);
    const matchEnd = text.indexOf('}', matchAt);
    if (existing > -1 && existing < matchEnd) insertAfter(existing, '"exclude_merchants": [', `${d.merchants.map((m) => JSON.stringify(m)).join(', ')}, `);
    else insertAfter(matchAt, '"match": {', ` "exclude_merchants": ${JSON.stringify(d.merchants)},`);
  }
  summary.push(`${card.name}, ${d.merchants?.join('/') || 'recurring payments'}: statement said ${a.answer.toUpperCase()} -> ${a.answer === 'yes' ? 'rate confirmed' : 'base rate from now on'}`);
}

JSON.parse(text); // never write broken JSON
console.log(summary.join('\n') || 'No answers in this backup.');
if (text === original) process.exit(0);

const dir = mkdtempSync(join(tmpdir(), 'cards-'));
writeFileSync(join(dir, 'cards.json'), text);
spawnSync('diff', ['-u', '--label', 'data/cards.json', '--label', 'data/cards.json (proposed)', fileURLToPath(cardsUrl), join(dir, 'cards.json')], { stdio: 'inherit' });

if (flag === '--apply') {
  writeFileSync(cardsUrl, text);
  console.log('\nApplied to data/cards.json.');
} else {
  console.log('\nNothing written. Re-run with --apply to change data/cards.json.');
}
