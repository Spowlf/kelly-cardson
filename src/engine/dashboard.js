// Overview maths: cycle totals, points balances, sign-up bonuses, reminders, backup timing and the
// KiasuMiles prompt. Pure functions over card rules and her data, like the rest of the engine.

import { summarizeCycle, formatSgd } from './earn.js';
import { cycleFor, addDays, addMonths, daysBetween, formatDay } from './cycles.js';
import { toCents } from './rounding.js';

const shortName = (card) => card.name.replace(/\s*\(.*\)\s*$/, '');
const byPriority = (myCards) => [...myCards].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

/**
 * This cycle for each of her cards: miles so far and a bar for each cap.
 * @returns {{ totalMiles, cards: [{ cardId, name, cycle, miles, buckets: [{ id, usedSgd, capSgd, pct, warn, label, resetDate, ... }], minSpend }] }}
 */
export function overview({ cards, myCards, txns, categories, settings, today }) {
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const rows = byPriority(myCards).filter((m) => byId[m.cardId]).map((userCard) => {
    const card = byId[userCard.cardId];
    const s = summarizeCycle({ card, userCard, categories, settings, txns, date: today });
    return {
      cardId: card.id,
      name: shortName(card),
      cycle: s.cycle,
      miles: s.miles,
      spendSgd: s.cardSpendSgd,
      buckets: Object.entries(s.buckets).map(([id, b]) => ({ id, ...b })),
      minSpend: card.min_spend ? { sgd: card.min_spend.sgd, met: s.minSpendMet, shortBySgd: s.shortBySgd } : null,
    };
  });
  return { totalMiles: Math.round(rows.reduce((sum, r) => sum + r.miles, 0) * 100) / 100, cards: rows };
}

// Final miles (after cycle rules) for this card's purchases dated after `since` (all if null), up to today.
function milesSince({ card, userCard, txns, categories, settings, since, today }) {
  const mine = txns.filter((t) => t.cardId === card.id && (!since || t.date > since) && t.date <= today);
  const seen = new Set();
  let miles = 0;
  let firstDate = null;
  for (const t of mine) {
    const key = cycleFor(t.date, card.cap_period, userCard?.statementDay).key;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = summarizeCycle({ card, userCard, categories, settings, txns, date: t.date });
    for (const e of s.entries) {
      if (since && e.txn.date <= since) continue;
      miles += e.miles;
      if (!firstDate || e.txn.date < firstDate) firstDate = e.txn.date;
    }
  }
  return { miles, firstDate };
}

/**
 * Points balance per bank pool: the latest balance she entered, plus points from purchases dated
 * after that balance's date (so nothing is counted twice).
 */
export function pointsBalances({ cards, myCards, txns, balances, categories, settings, today }) {
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const pools = new Map();
  for (const userCard of byPriority(myCards)) {
    const card = byId[userCard.cardId];
    if (!card) continue;
    const pool = card.points_pool || card.id;
    if (!pools.has(pool)) pools.set(pool, { pool, cards: [], lead: card });
    pools.get(pool).cards.push({ card, userCard });
  }

  return [...pools.values()].map(({ pool, cards: members, lead }) => {
    const balance = (balances || []).filter((b) => b.pool === pool).sort((a, b) => b.enteredAt - a.enteredAt)[0] || null;
    const since = balance?.asOf || null;
    let earnedMiles = 0;
    let firstDate = null;
    for (const { card, userCard } of members) {
      const r = milesSince({ card, userCard, txns, categories, settings, since, today });
      earnedMiles += r.miles;
      if (r.firstDate && (!firstDate || r.firstDate < firstDate)) firstDate = r.firstDate;
    }
    const perPoint = lead.miles_per_point || 1;
    const earnedPoints = Math.floor(earnedMiles / perPoint + 1e-9);
    const points = (balance?.points || 0) + earnedPoints;
    const miles = Math.floor(points * perPoint + 1e-9);
    const block = lead.transfer?.block_miles || 10000;
    const oldest = balance?.points > 0 ? balance.asOf : firstDate;
    return {
      pool,
      currency: (lead.points_currency || 'points').replace(/\s*\(.*\)\s*$/, ''),
      cardNames: members.map(({ card }) => shortName(card)),
      milesPerPoint: perPoint,
      balancePoints: balance?.points ?? null,
      asOf: balance?.asOf ?? null,
      earnedPoints,
      points,
      miles,
      blockMiles: block,
      blocksReady: Math.floor(miles / block),
      milesToNextBlock: block - (miles % block),
      expiryNote: lead.points_expiry || null,
      expiresAround: lead.points_expiry_months && oldest ? addMonths(oldest, lead.points_expiry_months) : null,
    };
  });
}

/** Sign-up bonus: spend on the card from opening to the deadline, including catch-ups. */
export function signupProgress({ myCard, txns, today }) {
  const signup = myCard?.signup;
  if (!signup?.minSpendSgd || !signup.deadline) return null;
  const from = myCard.openedDate || signup.startDate || '0000-01-01';
  const spent = txns
    .filter((t) => t.cardId === myCard.cardId && t.date >= from && t.date <= signup.deadline)
    .reduce((sum, t) => sum + toCents(t.amount), 0);
  const min = toCents(signup.minSpendSgd);
  return {
    spentSgd: spent / 100,
    minSpendSgd: signup.minSpendSgd,
    leftSgd: Math.max(0, min - spent) / 100,
    pct: Math.min(100, Math.floor((spent * 100) / min)),
    deadline: signup.deadline,
    daysLeft: daysBetween(today, signup.deadline),
    bonusMiles: signup.bonusMiles ?? null,
    met: spent >= min,
  };
}

/** Remind her about an export every 7 days once there is something to lose. */
export function backupDue({ lastExportAt, now = Date.now(), hasData }) {
  if (!hasData) return { due: false, days: null };
  if (!lastExportAt) return { due: true, days: null };
  const days = Math.floor((now - lastExportAt) / 86400000);
  return { due: days > 7, days };
}

/**
 * Reminders, soonest first: statements coming up (7 days) or just issued and not yet checked
 * (10 days), annual fees within 30 days either side, sign-up deadlines within 30 days, backups.
 * @returns {[{ kind, cardId?, date?, text }]}
 */
export function reminders({ cards, myCards, txns, statements, settings, today, now = Date.now() }) {
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const list = [];
  for (const myCard of byPriority(myCards)) {
    const card = byId[myCard.cardId];
    if (!card) continue;
    const name = shortName(card);

    if (myCard.statementDay) {
      const cycle = cycleFor(today, 'statement_month', myCard.statementDay);
      const until = daysBetween(today, cycle.end);
      if (until <= 7) list.push({ kind: 'statement', cardId: card.id, date: cycle.end, text: `${name} statement on ${formatDay(cycle.end)}. Enter its total once it arrives to check your log.` });
      const last = addDays(cycle.start, -1);
      const lastKey = cycleFor(last, 'statement_month', myCard.statementDay).key;
      const checked = (statements || []).some((s) => s.cardId === card.id && s.cycleKey === lastKey);
      if (daysBetween(last, today) <= 10 && !checked) list.push({ kind: 'statement-check', cardId: card.id, date: last, text: `${name} statement from ${formatDay(last)}: enter its total to check your log.` });
    }

    if (myCard.annualFeeDate && card.annual_fee_sgd > 0) {
      const d = daysBetween(today, myCard.annualFeeDate);
      const tip = card.fee_reminder ? ` ${card.fee_reminder}` : '';
      if (d >= 0 && d <= 30) list.push({ kind: 'fee', cardId: card.id, date: myCard.annualFeeDate, text: `${name} annual fee on ${formatDay(myCard.annualFeeDate)}.${tip}` });
      else if (d < 0 && d >= -30) list.push({ kind: 'fee', cardId: card.id, date: myCard.annualFeeDate, text: `${name} annual fee was due ${formatDay(myCard.annualFeeDate)}.${tip} Then set next year's date in My cards.` });
    }

    const p = signupProgress({ myCard, txns, today });
    if (p && !p.met && p.daysLeft >= 0 && p.daysLeft <= 30) {
      list.push({ kind: 'signup', cardId: card.id, date: p.deadline, text: `${name} sign-up bonus: ${formatSgd(toCents(p.leftSgd))} more by ${formatDay(p.deadline)}${p.bonusMiles ? ` for ${p.bonusMiles.toLocaleString('en-SG')} miles` : ''}.` });
    }
  }

  const backup = backupDue({ lastExportAt: settings?.lastExportAt, now, hasData: txns.length > 0 });
  if (backup.due) list.push({ kind: 'backup', date: null, text: backup.days == null ? 'You haven\'t backed up yet. Export a backup so your log is safe if the phone is lost.' : `Last backup was ${backup.days} days ago. Export a new one.` });

  return list.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

const KM_METHODS = {
  mobile_tap: 'Apple Pay tap in store',
  physical_tap: 'tapping the physical card',
  chip_or_swipe: 'chip or swipe',
  online_card_entry: 'card number entered online',
  in_app_wallet: 'Apple Pay inside the app',
};

/**
 * Text to paste into Claude chat: her cards that still have cap left (with KiasuMiles ids), the
 * merchant, how she's paying and the amount. Null for SimplyGo, where our engine is the authority.
 */
export function kiasumilesPrompt({ purchase, cards, myCards, txns = [], categories, settings, today }) {
  if (purchase.method === 'simplygo' || (!purchase.method && purchase.channel === 'transit')) return null;
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const listed = [];
  for (const userCard of byPriority(myCards)) {
    const card = byId[userCard.cardId];
    if (!card) continue;
    const s = summarizeCycle({ card, userCard, categories, settings, txns, date: today });
    const ids = Object.keys(s.buckets);
    const left = ids.filter((id) => s.buckets[id].leftSgd > 0);
    if (ids.length && !left.length) continue;
    const note = left.length < ids.length ? ` (${left.map((id) => s.buckets[id].name).join(' and ')} cap only)` : '';
    listed.push(`${shortName(card)}${card.kiasumiles_id ? ` [${card.kiasumiles_id}]` : ''}${note}`);
  }
  const how = KM_METHODS[purchase.method] || 'any method (compare them)';
  return `Use KiasuMiles. My cards with cap left: ${listed.join(', ') || 'none'}. Merchant: ${purchase.merchant || 'not given'}, paying by ${how}, ${formatSgd(toCents(purchase.amount))}${purchase.fcy ? ', charged in foreign currency' : ''}.`;
}

/** Each logged purchase's result (as replayed in its cycle), keyed by purchase id. */
export function resultsByTxn({ cards, myCards, txns, categories, settings }) {
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const map = new Map();
  for (const userCard of myCards) {
    const card = byId[userCard.cardId];
    if (!card) continue;
    const seen = new Set();
    for (const t of txns) {
      if (t.cardId !== card.id) continue;
      const key = cycleFor(t.date, card.cap_period, userCard.statementDay).key;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = summarizeCycle({ card, userCard, categories, settings, txns, date: t.date });
      for (const e of s.entries) map.set(e.txn.id, { ...e.result, finalMiles: e.miles });
    }
  }
  return map;
}
