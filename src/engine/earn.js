// Earning engine: miles for one purchase on one card, given what's already logged this cycle.
// Pure functions, no DOM or storage, so the same code runs in the app and in `node --test`.

import { toCents, DEFAULT_BLOCK, isPooled, roundTxn, floorTo, pooledIncrement } from './rounding.js';
import { cycleFor, addDays, formatDay } from './cycles.js';
import { mccInList, merchantMatches, matchRule, disputeApplies, ruleNeedsCode } from './match.js';
import { EARNED_BONUS, BASE_ONLY } from './merchants.js';

export const DEFAULT_SETTINGS = { postingDelayDays: 3 };

const round2 = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;

export function formatSgd(cents) {
  const sgd = cents / 100;
  return `S$${sgd.toLocaleString('en-SG', Number.isInteger(sgd) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const indexCache = new WeakMap();

// Accepts the categories array from data/categories.json (or an already-built index).
export function indexCategories(categories) {
  if (!categories) return {};
  if (!Array.isArray(categories)) return categories;
  let index = indexCache.get(categories);
  if (!index) {
    index = Object.fromEntries(categories.map((c) => [c.id, c]));
    indexCache.set(categories, index);
  }
  return index;
}

export const cycleOf = (card, userCard, date) => cycleFor(date, card.cap_period, userCard?.statementDay);

// A cap's name as she reads it: its label, or its id with spaces ("petrol_contactless" -> "petrol contactless").
export const capName = (card, id) => card.caps?.[id]?.label || id.replace(/_/g, ' ');

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

const periodWord = (card) => (card.cap_period === 'statement_month' ? 'this statement month' : 'this month');

// Fill in the category's guessed code, currency and cents.
function resolve(purchase, categories) {
  const cat = purchase.category ? categories[purchase.category] : null;
  return {
    ...purchase,
    cat,
    mcc: purchase.mcc || cat?.default_mcc || null,
    mccGuessed: !purchase.mcc && !!cat?.default_mcc,
    recurring: purchase.recurring ?? !!cat?.recurring,
    cents: toCents(purchase.amount),
    currency: purchase.fcy ? 'FCY' : 'SGD',
  };
}

function blocksFor(card, method) {
  const override = card.earn_block_overrides?.find((o) => o.methods.includes(method));
  const base = override || card.earn_block || DEFAULT_BLOCK;
  const bonus = override || card.bonus_earn_block || base;
  // Pools are keyed by method when an override applies (e.g. all SimplyGo fares in a month).
  return { base, bonus, poolPrefix: override ? `m:${method}` : null };
}

// Oldest first, and in the order she entered them within a day. Storage returns purchases by their
// random id, so date alone would let a same-day pair swap which one used up a cap.
export const byWhen = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt ?? 0) - (b.createdAt ?? 0));

const newState = () => ({ cardSpend: 0, buckets: {}, pools: {} });

function applyDelta(state, delta) {
  const next = { cardSpend: state.cardSpend + delta.cardSpend, buckets: { ...state.buckets }, pools: { ...state.pools } };
  for (const [id, d] of Object.entries(delta.buckets)) {
    const b = next.buckets[id] || { used: 0, spend: 0 };
    next.buckets[id] = { used: b.used + d.used, spend: b.spend + d.spend };
  }
  for (const [key, cents] of Object.entries(delta.pools)) next.pools[key] = (next.pools[key] || 0) + cents;
  return next;
}

// Base-rate spend. A whole purchase follows the bank's rounding; a split-off part always rounds down.
function baseCents(raw, whole, blocks, state, pools) {
  if (raw <= 0) return 0;
  if (isPooled(blocks.base)) {
    const key = `${blocks.poolPrefix || 'base'}:base`;
    const inc = pooledIncrement((state.pools[key] || 0) + (pools[key] || 0), raw, blocks.base);
    pools[key] = (pools[key] || 0) + raw;
    return inc;
  }
  return whole ? roundTxn(raw, blocks.base) : floorTo(raw, blocks.base);
}

function zeroReason(block, rankMiles) {
  const size = formatSgd(toCents(block.size_sgd));
  return isPooled(block)
    ? `Added to this month's total, which earns per ${size}: about ${rankMiles} miles over the month.`
    : `Under ${size} earns nothing: it rounds down to ${size} blocks.`;
}

function bonusOption(card, rule, p, state, blocks, baseMpd) {
  const amt = p.cents;
  const bucketId = rule.cap_bucket || null;
  const bucket = bucketId ? card.caps?.[bucketId] : null;
  const capCents = bucket ? toCents(bucket.sgd) : Infinity;
  const bucketState = (bucketId && state.buckets[bucketId]) || { used: 0, spend: 0 };
  const left = Math.max(0, capCents - bucketState.used);
  const pools = {};
  let bonus;
  let base;
  let capUse;
  let counted;
  let expected;

  if (isPooled(blocks.bonus)) {
    capUse = Math.min(amt, left);
    counted = amt;
    const key = `${blocks.poolPrefix || `b:${bucketId || rule.id}`}:bonus`;
    bonus = pooledIncrement(state.pools[key] || 0, capUse, blocks.bonus);
    pools[key] = capUse;
    base = baseCents(amt - capUse, capUse === 0, blocks, state, pools);
    // Pooled spend earns on the month's total, so rank on the unrounded amount.
    const baseExpected = isPooled(blocks.base) ? amt - capUse : base;
    expected = (capUse / 100) * rule.mpd + (baseExpected / 100) * baseMpd;
  } else {
    const rounded = roundTxn(amt, blocks.bonus);
    capUse = Math.min(rounded, left);
    counted = rounded;
    bonus = floorTo(capUse, blocks.bonus);
    base = floorTo(rounded - capUse, blocks.base);
  }

  const warnings = [];
  let conditional = false;
  let avoid = false;
  let pendingBonus = 0; // bonus that only counts once the category minimum is met
  let reason;
  const spendAfter = bucketState.spend + amt;
  const short = bucket?.min_spend_sgd ? toCents(bucket.min_spend_sgd) - spendAfter : 0;

  // Category spend is capped hard: going past it may drop the whole category to base.
  const asBase = () => {
    base = roundTxn(amt, blocks.base);
    bonus = 0;
    expected = undefined;
  };
  if (bucket?.hard_limit && spendAfter > capCents) {
    asBase();
    avoid = true;
    reason = `Would take this category past ${formatSgd(capCents)}, which may drop it all to ${baseMpd} mpd. Use another card.`;
  } else if (short > 0 && bonus > 0 && bucket.rank_until_min_met === 'base') {
    pendingBonus = bonus;
    asBase();
    reason = `${rule.mpd} mpd once ${formatSgd(short)} more is spent in this category.`;
  } else if (short > 0 && bonus > 0) {
    warnings.push(`Needs ${formatSgd(short)} more in this category ${periodWord(card)} for ${rule.mpd} mpd.`);
    conditional = true;
  }

  const miles = (bonus / 100) * rule.mpd + (base / 100) * baseMpd;
  expected ??= miles;

  if (!reason) {
    if (!bucket) reason = `${rule.mpd} mpd, no cap.`;
    else if (left === 0) reason = `${capitalize(capName(card, bucketId))} cap of ${formatSgd(capCents)} is full: ${baseMpd} mpd.`;
    else {
      reason = `${formatSgd(left)} of ${formatSgd(capCents)} ${capName(card, bucketId)} cap left`;
      if (capUse < counted) reason += `: ${formatSgd(bonus)} at ${rule.mpd} mpd, ${formatSgd(base)} at ${baseMpd} mpd`;
      reason += '.';
    }
  }

  return {
    rule, bucketId, capCents, left, bonus, base, miles, expected, warnings, conditional, reason, avoid, pendingBonus,
    unconfirmed: !!bucket?.needs_verification,
    delta: { buckets: bucketId ? { [bucketId]: { used: capUse, spend: amt } } : {}, pools },
  };
}

// Miles for one resolved purchase against a running cycle state. Returns the result plus the
// state change (delta) so logged purchases can be replayed in order.
function evaluate(card, p, state, ctx) {
  const { userCard, settings } = ctx;
  const baseMpd = p.fcy ? card.base_mpd.fcy : card.base_mpd.local;
  const blocks = blocksFor(card, p.method);
  // miles: exactly what this purchase adds. rankMiles: what it's worth over the month, which
  // differs only for monthly-pooled rounding (e.g. one SimplyGo fare adds 0 but is worth S$1.80 x mpd).
  const result = {
    cardId: card.id, method: p.method, miles: 0, rankMiles: 0, bonusSgd: 0, baseSgd: 0, mpd: baseMpd, baseMpd,
    ruleId: null, needsCode: false, bucket: null, capName: null, capSgd: null, capLeftSgd: null, reason: '', warnings: [], avoid: false, pendingBonusSgd: 0, disputes: [],
    unconfirmed: !!(blocks.base.needs_verification || blocks.bonus.needs_verification),
    conditional: false, mccGuessed: p.mccGuessed, fcyFeeSgd: 0, costPerMileSgd: null,
  };
  const delta = { cardSpend: p.cents, buckets: {}, pools: {} };

  if (p.isCatchUp) {
    // Unknown method and category: count against every cap (or the one given) at the base rate.
    for (const id of p.bucket ? [p.bucket] : Object.keys(card.caps || {})) delta.buckets[id] = { used: p.cents, spend: p.cents };
    const counted = roundTxn(p.cents, blocks.base);
    const miles = round2((counted / 100) * baseMpd);
    Object.assign(result, { baseSgd: counted / 100, miles, rankMiles: miles, reason: 'Catch-up entry, counted against caps at the base rate.' });
    return { result, delta };
  }

  if (p.cat?.no_miles) {
    result.reason = p.cat.no_miles_label || 'No miles, use any card';
    return { result, delta };
  }
  // Her statement already showed how this merchant earns on this card: that beats the code rules.
  const statement = p.cardResults?.[card.id] || null;
  result.statementResult = statement;
  if (!statement && (mccInList(p.mcc, card.no_points?.mccs) || merchantMatches(p.merchant, card.no_points?.merchants))) {
    result.reason = 'Earns nothing on this card: this kind of purchase is excluded.';
    result.unconfirmed ||= !!card.no_points.needs_verification;
    return { result, delta };
  }

  const options = [];
  const skipped = [];
  const rejected = []; // disputed rules her statement showed don't apply here
  const notRecurring = []; // rules that would apply, but exclude recurring payments
  const answers = settings.disputeAnswers || {};
  for (const rule of card.bonus_rules || []) {
    if (!(rule.currencies || ['SGD', 'FCY']).includes(p.currency)) continue;
    if (!rule.methods.includes(p.method)) continue;
    if (p.date && ((rule.valid_from && p.date < rule.valid_from) || (rule.valid_until && p.date > rule.valid_until))) continue;
    if (statement === BASE_ONLY) break;
    const m = statement === EARNED_BONUS ? { ok: true, unconfirmed: false } : matchRule(rule, p, userCard);
    if (m.recurring) notRecurring.push(rule);
    if (!m.ok) continue;
    const no = !statement && (rule.disputed || []).find((d) => !d.resolved && answers[d.id]?.answer === 'no' && disputeApplies(d, p));
    if (no) {
      rejected.push(answers[no.id]);
      continue;
    }
    if (rule.condition && !userCard?.conditionsMet?.[rule.id]) {
      skipped.push(rule);
      continue;
    }
    options.push({ ...bonusOption(card, rule, p, state, blocks, baseMpd), matchUnconfirmed: m.unconfirmed });
  }

  if (options.length) {
    // We can't tell which matching category the bank will count it in, so if any of them
    // would break a hard limit, the card is to be avoided. Otherwise take the most miles.
    const best = options.find((o) => o.avoid) || options.reduce((a, b) => (b.expected > a.expected ? b : a));
    Object.assign(result, {
      miles: round2(best.miles),
      rankMiles: round2(best.expected),
      bonusSgd: best.bonus / 100,
      baseSgd: best.base / 100,
      mpd: best.rule.mpd,
      ruleId: best.rule.id,
      // The exact category code decided this (a whitelist), so a guessed code may be wrong here.
      needsCode: !statement && ruleNeedsCode(best.rule, userCard),
      bucket: best.bucketId,
      capName: best.bucketId ? capName(card, best.bucketId) : null,
      capSgd: best.bucketId ? best.capCents / 100 : null,
      capLeftSgd: best.bucketId ? best.left / 100 : null,
      reason: best.miles === 0 && p.cents > 0 ? zeroReason(blocks.bonus, round2(best.expected)) : best.reason,
      conditional: best.conditional,
      avoid: best.avoid,
      pendingBonusSgd: best.pendingBonus / 100,
    });
    result.warnings.push(...best.warnings);
    // unconfirmed_methods: the rule lists a method the bank's terms don't clearly cover (e.g. in-app Apple Pay).
    result.unconfirmed ||= !!(best.matchUnconfirmed || best.rule.needs_verification || best.unconfirmed || best.rule.unconfirmed_methods?.includes(p.method));
    if (best.rule.promotion && best.rule.valid_until) result.warnings.push(`Promotion ends ${formatDay(best.rule.valid_until)}.`);
    for (const d of best.rule.disputed || []) {
      if (statement || d.resolved || answers[d.id]?.answer === 'yes' || !disputeApplies(d, p)) continue;
      result.warnings.push(d.note);
      result.unconfirmed = true;
      result.disputes.push({ id: d.id, recurring: !!d.recurring, note: d.note, question: d.question || `Did this earn the ${best.rule.mpd} mpd bonus?`, ruleId: best.rule.id });
    }
    delta.buckets = best.delta.buckets;
    delta.pools = best.delta.pools;
  } else {
    const pools = {};
    const counted = baseCents(p.cents, true, blocks, state, pools);
    const expected = isPooled(blocks.base) ? p.cents : counted;
    Object.assign(result, {
      miles: round2((counted / 100) * baseMpd),
      rankMiles: round2((expected / 100) * baseMpd),
      baseSgd: counted / 100,
      reason: counted === 0 && p.cents > 0 ? zeroReason(blocks.base, round2((expected / 100) * baseMpd)) : `Not a bonus purchase: ${baseMpd} mpd.`,
    });
    delta.pools = pools;
  }

  if (statement === BASE_ONLY) result.warnings.push(`Your statement showed only the base rate here, so this counts at ${baseMpd} mpd.`);
  for (const a of rejected) {
    result.warnings.push(`Your ${a.statementDate ? `${formatDay(a.statementDate)} ` : ''}statement showed no bonus here, so this counts at ${baseMpd} mpd.`);
  }

  for (const rule of notRecurring) {
    if (rule.mpd > result.mpd) result.warnings.push(`Recurring payments don't earn the ${rule.mpd} mpd bonus on this card: ${result.baseMpd} mpd.`);
  }

  for (const rule of skipped) {
    if (rule.mpd > result.mpd) result.warnings.push(`${rule.mpd} mpd bonus not counted. ${rule.condition}. Mark it met in My cards if it is.`);
  }

  if (card.min_spend && result.bonusSgd > 0) {
    const short = toCents(card.min_spend.sgd) - (state.cardSpend + p.cents);
    if (short > 0) {
      result.warnings.push(`Needs ${formatSgd(short)} more ${periodWord(card)} on this card, or all its spend earns ${baseMpd} mpd.`);
      result.conditional = true;
      result.unconfirmed ||= !!card.min_spend.needs_verification;
    }
  }

  const hasCycleRules = Object.keys(card.caps || {}).length > 0 || !!card.min_spend || isPooled(blocks.bonus) || isPooled(blocks.base);
  if (hasCycleRules && p.date) {
    const cycle = cycleOf(card, userCard, p.date);
    if (cycle.assumed) result.warnings.push('Add the statement day for this card so its caps reset on the right date.');
    const delay = settings.postingDelayDays ?? DEFAULT_SETTINGS.postingDelayDays;
    if (card.cap_basis !== 'transaction_date' && addDays(p.date, delay) >= cycle.resetDate) {
      result.warnings.push(`May count next month: it may post after the cap resets on ${formatDay(cycle.resetDate)}.`);
    }
  }

  if (p.fcy) {
    if (card.fcy_fee_pct == null) result.fcyFeeSgd = null;
    else {
      const fee = (p.cents * card.fcy_fee_pct) / 100 / 100;
      result.fcyFeeSgd = round2(fee);
      result.costPerMileSgd = result.miles > 0 ? round4(fee / result.miles) : null;
    }
  }

  return { result, delta };
}

function makeCtx({ userCard, categories, settings }) {
  return { userCard: userCard || null, categories: indexCategories(categories), settings: { ...DEFAULT_SETTINGS, ...settings } };
}

// Replay this card's logged purchases in the cycle, oldest first.
function replay(card, ctx, txns, cycle, excludeId) {
  const inCycle = (txns || [])
    .filter((t) => t.cardId === card.id && (excludeId === undefined || t.id !== excludeId))
    .filter((t) => cycleOf(card, ctx.userCard, t.date).key === cycle.key)
    .sort(byWhen);
  let state = newState();
  const entries = [];
  for (const txn of inCycle) {
    const { result, delta } = evaluate(card, resolve(txn, ctx.categories), state, ctx);
    state = applyDelta(state, delta);
    entries.push({ txn, result });
  }
  return { state, entries };
}

/**
 * Miles for one purchase on one card.
 * @param {object} args
 * @param {object} args.card      A card from data/cards.json.
 * @param {object} args.purchase  { amount, date, method, fcy, mcc?, category?, merchant?, id? }
 * @param {object} [args.userCard] Her card record: { statementDay, choices, conditionsMet }.
 * @param {Array}  [args.categories] data/categories.json `categories`.
 * @param {object} [args.settings] { postingDelayDays }.
 * @param {Array}  [args.txns]     Logged purchases (any cards; filtered to this card and cycle).
 */
export function earn({ card, purchase, userCard, categories, settings, txns }) {
  const ctx = makeCtx({ userCard, categories, settings });
  const cycle = cycleOf(card, ctx.userCard, purchase.date);
  const { state } = replay(card, ctx, txns, cycle, purchase.id);
  return evaluate(card, resolve(purchase, ctx.categories), state, ctx).result;
}

/**
 * Totals for the cycle containing `date`: miles (after minimum-spend rules), cap usage per
 * bucket and card spend. Cap usage is shown as "at least", since some purchases may not be logged.
 */
export function summarizeCycle({ card, userCard, categories, settings, txns, date }) {
  const ctx = makeCtx({ userCard, categories, settings });
  const cycle = cycleOf(card, ctx.userCard, date);
  const { state, entries } = replay(card, ctx, txns, cycle);

  // Each entry's final miles once the cycle's minimum-spend and hard-limit rules are known.
  for (const e of entries) e.miles = e.result.miles;
  const buckets = {};
  for (const [id, cap] of Object.entries(card.caps || {})) {
    const capCents = toCents(cap.sgd);
    const b = state.buckets[id] || { used: 0, spend: 0 };
    const used = Math.min(b.used, capCents);
    const minMet = !cap.min_spend_sgd || b.spend >= toCents(cap.min_spend_sgd);
    const overLimit = !!cap.hard_limit && b.spend > capCents;
    for (const e of entries) {
      if (e.result.bucket !== id) continue;
      const uplift = e.result.mpd - e.result.baseMpd;
      // Missed minimum or broken hard limit: the whole category earns base.
      if (!minMet || overLimit) e.miles -= e.result.bonusSgd * uplift;
      // Minimum met: purchases made before it was reached earn the bonus after all.
      else e.miles += e.result.pendingBonusSgd * uplift;
    }
    const pct = Math.floor((used * 100) / capCents);
    buckets[id] = {
      name: capName(card, id),
      usedSgd: used / 100,
      capSgd: capCents / 100,
      leftSgd: (capCents - used) / 100,
      spendSgd: b.spend / 100,
      pct,
      warn: pct >= 85,
      label: `At least ${formatSgd(used)} of ${formatSgd(capCents)} used`,
      minSpendSgd: cap.min_spend_sgd ?? null,
      minMet,
      overLimit,
      resetDate: cycle.resetDate,
    };
  }

  let minSpendMet = true;
  let shortBySgd = 0;
  if (card.min_spend) {
    const short = toCents(card.min_spend.sgd) - state.cardSpend;
    minSpendMet = short <= 0;
    if (!minSpendMet) {
      shortBySgd = short / 100;
      if (card.min_spend.failure === 'all_base') {
        for (const e of entries) e.miles = (e.result.bonusSgd + e.result.baseSgd) * e.result.baseMpd;
      }
    }
  }
  for (const e of entries) e.miles = round2(e.miles);
  const miles = entries.reduce((sum, e) => sum + e.miles, 0);

  return { cycle, miles: round2(miles), cardSpendSgd: state.cardSpend / 100, minSpendMet, shortBySgd, buckets, entries };
}
