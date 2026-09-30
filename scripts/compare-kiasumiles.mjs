// Runs our recommender on tests/purchases.json for each card profile (full caps) and compares it
// with the saved KiasuMiles answers in tests/expected/<profile>/. Writes tests/kiasumiles-disagreements.md.
// Never edits data/cards.json: every disagreement is for a person to check against bank terms.
// Reviewed disagreements live in tests/kiasumiles-decisions.json and are listed as "Decided".
//
//   npm run compare:kiasumiles

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { recommend } from '../src/engine/index.js';

const url = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => JSON.parse(readFileSync(url(p)));
const { cards } = read('data/cards.json');
const { categories } = read('data/categories.json');
const { _meta, purchases } = read('tests/purchases.json');
const { decisions } = read('tests/kiasumiles-decisions.json');

const byKm = Object.fromEntries(cards.filter((c) => c.kiasumiles_id).map((c) => [c.kiasumiles_id, c]));
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

// Our payment methods -> KiasuMiles' three. SimplyGo is never compared: our engine is the authority.
const KM_METHOD = {
  mobile_tap: 'mobile_contactless',
  physical_tap: 'contactless',
  chip_or_swipe: 'contactless',
  online_card_entry: 'online',
  in_app_wallet: 'online',
};

// The rate a card earns on this purchase as a plain mpd, ignoring rounding and minimum-spend
// timing, so it lines up with KiasuMiles' earn_rate_mpd.
function ourRate(result) {
  if (!result) return null;
  if (/earns nothing|^No miles/i.test(result.reason)) return 0;
  if (!result.ruleId || result.avoid || result.pendingBonusSgd > 0) return result.baseMpd;
  return result.mpd;
}

function decisionFor(purchaseId, cardId, rates) {
  return decisions.find((d) => (d.purchase === '*' || d.purchase === purchaseId) && d.card === cardId
    && (!d.rates || (d.rates[0] === rates[0] && d.rates[1] === rates[1])));
}

const name = (id) => byId[id]?.name || id;
const kmName = (kmId) => name(byKm[kmId]?.id || kmId);

function compareProfile(profileId, profile) {
  const myCards = profile.cards.map((cardId) => ({ cardId, statementDay: 15 })); // full caps: no logged spend
  const out = { open: [], decided: [], agree: [], unresolved: [], skipped: [] };

  for (const p of purchases) {
    const label = `${p.id} ${p.merchant} S$${p.amount} (${p.method})`;
    if (p.method === 'simplygo') { out.skipped.push({ label, why: 'SimplyGo: our engine is the authority.' }); continue; }
    const file = `tests/expected/${profileId}/${p.id}.json`;
    if (!existsSync(url(file))) { out.unresolved.push({ label, why: 'No KiasuMiles answer saved for this profile.' }); continue; }
    const exp = read(file);
    const km = exp.methods[KM_METHOD[p.method]];
    if (!km || (!km.best_guaranteed && !km.best_if_conditions_met)) {
      out.unresolved.push({ label, why: exp.note_unresolved || km?.message || 'No answer for this payment method.' });
      continue;
    }

    const ours = recommend({ purchase: { ...p, mcc: null }, cards, myCards, categories }).results;
    const top = ours[0];
    const resultFor = (cardId) => ours.find((r) => r.cardId === cardId)?.best;
    const kmTop = km.best_if_conditions_met || km.best_guaranteed;
    const issues = [];
    const decided = [];
    const flag = (cardId, rates, text) => {
      const d = decisionFor(p.id, cardId, rates);
      (d ? decided : issues).push(d ? `${text} → **Decided ${d.decided}:** ${d.decision}` : text);
    };

    // 1. Each card KiasuMiles names: does our rate for it match? Skip "guaranteed" picks that
    //    KiasuMiles dropped to base only because remaining cap is unknown: we assume full caps.
    for (const [kind, pick] of [['best if conditions met', km.best_if_conditions_met], ['best guaranteed', km.best_guaranteed]]) {
      if (!pick || pick.reason_codes?.includes('bonus_conditions_unknown')) continue;
      const card = byKm[pick.card_id];
      if (!card) { issues.push(`KiasuMiles ${kind} is ${pick.card_id}, which isn't in cards.json`); continue; }
      const r = resultFor(card.id);
      const mine = ourRate(r);
      if (mine !== pick.earn_rate_mpd) {
        flag(card.id, [mine, pick.earn_rate_mpd], `**${card.name}** (KiasuMiles ${kind}): KiasuMiles ${pick.earn_rate_mpd} mpd, ours ${mine} mpd. Ours: "${r?.reason}". KiasuMiles: "${pick.reason_summary}"${pick.condition_summary ? ` [${pick.condition_summary}]` : ''}`);
      }
    }
    // 2. Our top card: do we rate it above KiasuMiles' best?
    const topRate = ourRate(top.best);
    if (topRate > kmTop.earn_rate_mpd && byId[top.cardId].kiasumiles_id !== kmTop.card_id) {
      flag(top.cardId, [topRate, kmTop.earn_rate_mpd], `**${top.name}** is our top card at ${topRate} mpd ("${top.best.reason}"), above KiasuMiles' best of ${kmTop.earn_rate_mpd} mpd. KiasuMiles was sent this card, so it rates it lower here.`);
    }

    const row = {
      label,
      ours: `${top.name}: ${topRate} mpd, ${top.best.rankMiles} miles${top.best.unconfirmed ? ' (unconfirmed)' : ''}${top.best.warnings.length ? ` — ${top.best.warnings.join('; ')}` : ''}`,
      km: `${kmName(kmTop.card_id)}: ${kmTop.earn_rate_mpd} mpd, ${kmTop.estimated_miles} miles (${kmTop.rate_status})${km.best_guaranteed && km.best_guaranteed !== kmTop ? `; guaranteed: ${kmName(km.best_guaranteed.card_id)} ${km.best_guaranteed.earn_rate_mpd} mpd` : ''}${km.routing_note ? ` — ${km.routing_note}` : ''}`,
      note: p.note,
      issues,
      decided,
    };
    if (issues.length) out.open.push(row);
    else if (decided.length) out.decided.push(row);
    else out.agree.push(row);
  }
  return out;
}

const table = (r) => [`| | Top card |`, `|---|---|`, `| Ours | ${r.ours} |`, `| KiasuMiles | ${r.km} |`, ''];
const lines = [
  '# Our recommender vs KiasuMiles',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run compare:kiasumiles\`. KiasuMiles answers are saved in \`tests/expected/<profile>/\`.`,
  'Our side assumes full caps. Nothing here has been applied to `cards.json`: check each against the bank\'s terms, then record the outcome in `tests/kiasumiles-decisions.json`.',
  '',
];
const totals = [];
for (const [profileId, profile] of Object.entries(_meta.profiles)) {
  const r = compareProfile(profileId, profile);
  totals.push(`${profileId}: ${r.open.length} open, ${r.decided.length} decided, ${r.agree.length} agree, ${r.unresolved.length} unresolved`);
  lines.push(`# Profile: ${profileId}`, '', `${profile.description} Cards: ${profile.cards.map(name).join(', ')}.`, '');
  lines.push(`## Open disagreements (${r.open.length})`, '');
  for (const row of r.open) {
    lines.push(`### ${row.label}`, '', ...table(row));
    if (row.note) lines.push(`_${row.note}_`, '');
    for (const i of row.issues) lines.push(`- ${i}`);
    for (const i of row.decided) lines.push(`- ${i}`);
    lines.push('');
  }
  lines.push(`## Decided (${r.decided.length})`, '');
  for (const row of r.decided) {
    lines.push(`### ${row.label}`, '', ...table(row));
    for (const i of row.decided) lines.push(`- ${i}`);
    lines.push('');
  }
  lines.push(`## Agree (${r.agree.length})`, '');
  for (const a of r.agree) lines.push(`- **${a.label}**: ours ${a.ours} · KiasuMiles ${a.km}${a.note ? ` _(${a.note})_` : ''}`);
  lines.push('', `## KiasuMiles couldn't answer (${r.unresolved.length})`, '');
  for (const u of r.unresolved) lines.push(`- **${u.label}**: ${u.why}`);
  lines.push('', `## Not compared (${r.skipped.length})`, '');
  for (const s of r.skipped) lines.push(`- **${s.label}**: ${s.why}`);
  lines.push('');
}

writeFileSync(url('tests/kiasumiles-disagreements.md'), lines.join('\n'));
console.log(`${totals.join('\n')}\n-> tests/kiasumiles-disagreements.md`);
