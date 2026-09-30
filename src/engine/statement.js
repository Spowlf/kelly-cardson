// Monthly statement check: compare her statement total with what she logged.

import { cycleFor, formatDay } from './cycles.js';
import { resultsByTxn } from './dashboard.js';
import { toCents, toSgd } from './rounding.js';
import { formatSgd } from './earn.js';

/**
 * @param {object} args
 * @param {string} args.statementDate     The statement date, 'YYYY-MM-DD'.
 * @param {number} args.statementTotalSgd New spend on the statement for this card.
 * @returns {{ cardId, cycle, loggedSgd, gapSgd, offerCatchUp, message }}
 *   gapSgd > 0: statement is higher, so offer a catch-up entry for the difference.
 *   gapSgd < 0: she logged more, likely a purchase posting on the next statement; just show it.
 */
export function statementCheck({ card, userCard, txns, statementDate, statementTotalSgd }) {
  const statementDay = userCard?.statementDay;
  if (!statementDay) {
    return { cardId: card.id, cycle: null, loggedSgd: null, gapSgd: null, offerCatchUp: false, message: 'Add the statement day for this card first.' };
  }
  // Statements always follow the statement cycle, whatever the card's cap period.
  const cycle = cycleFor(statementDate, 'statement_month', statementDay);
  const logged = (txns || [])
    .filter((t) => t.cardId === card.id && t.date >= cycle.start && t.date <= cycle.end)
    .reduce((sum, t) => sum + toCents(t.amount), 0);
  const gap = toCents(statementTotalSgd) - logged;

  let message;
  if (gap > 0) message = `Statement is ${formatSgd(gap)} more than you logged. Add a catch-up entry for the difference?`;
  else if (gap < 0) message = `You logged ${formatSgd(-gap)} more than the statement. Probably a purchase that posts on the next statement.`;
  else message = 'Matches what you logged.';

  return { cardId: card.id, cycle, loggedSgd: toSgd(logged), gapSgd: toSgd(gap), offerCatchUp: gap > 0, message };
}

// The catch-up purchase to save. Counts against every cap on the card unless `bucket` is given,
// and earns the base rate. The caller assigns id and createdAt.
export function catchUpTxn(check, bucket) {
  return {
    cardId: check.cardId,
    amount: check.gapSgd,
    date: check.cycle.end,
    method: null,
    fcy: false,
    merchant: 'Statement catch-up',
    merchantId: null,
    category: null,
    mcc: null,
    isCatchUp: true,
    ...(bucket ? { bucket } : {}),
  };
}

/**
 * Purchases on this statement that rely on a rule sources disagree about and that she hasn't
 * answered yet, each with the yes/no question to check against the statement.
 */
export function disputedInStatement({ card, userCard, txns, categories, settings, statementDate }) {
  if (!userCard?.statementDay) return [];
  const cycle = cycleFor(statementDate, 'statement_month', userCard.statementDay);
  const results = resultsByTxn({ cards: [card], myCards: [userCard], txns, categories, settings });
  return txns
    .filter((t) => t.cardId === card.id && t.date >= cycle.start && t.date <= cycle.end)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .flatMap((txn) => (results.get(txn.id)?.disputes || []).map((dispute) => ({ txn, dispute })));
}

const ONLINE = new Set(['online_card_entry', 'in_app_wallet']);

// "Did your foodpanda order on 3 Oct 2026 earn 10X points?"
function bonusQuestion(card, rule, txn) {
  const base = txn.fcy ? card.base_mpd.fcy : card.base_mpd.local;
  const times = base > 0 ? Math.round(rule.mpd / base) : 0;
  const bonus = times > 1 ? `${times}X points` : `the ${rule.mpd} mpd bonus`;
  return `Did your ${txn.merchant} ${ONLINE.has(txn.method) ? 'order' : 'purchase'} on ${formatDay(txn.date)} earn ${bonus}?`;
}

/**
 * What to check on this statement, one question per merchant (or per recurring-payment dispute):
 *  - purchases at merchants whose code isn't confirmed ('guess' or 'reported') that earned a bonus
 *    from a rule that needs the exact code (a whitelist), and
 *  - purchases relying on a rule sources disagree about.
 * Merchants her statements already settled for this card are left out.
 * Pass purchases with merchant memory applied (withMerchant).
 * @returns {[{ txn, kind: 'code'|'dispute', question, ruleId, dispute? }]}
 */
export function statementQuestions({ card, userCard, txns, categories, settings, statementDate }) {
  if (!userCard?.statementDay) return [];
  const cycle = cycleFor(statementDate, 'statement_month', userCard.statementDay);
  const results = resultsByTxn({ cards: [card], myCards: [userCard], txns, categories, settings });
  const seen = new Set();
  const out = [];
  const list = txns
    .filter((t) => t.cardId === card.id && !t.isCatchUp && t.merchant && t.date >= cycle.start && t.date <= cycle.end)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const txn of list) {
    const r = results.get(txn.id);
    if (!r || txn.cardResults?.[card.id]) continue;
    const rule = card.bonus_rules.find((x) => x.id === r.ruleId);
    for (const dispute of r.disputes || []) {
      const key = dispute.recurring ? `d:${dispute.id}` : `m:${txn.merchant.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ txn, kind: 'dispute', dispute, ruleId: dispute.ruleId, question: dispute.recurring ? dispute.question : bonusQuestion(card, rule, txn) });
    }
    const unsure = txn.merchantStatus === 'guess' || txn.merchantStatus === 'reported';
    const key = `m:${txn.merchant.toLowerCase()}`;
    if (unsure && r.needsCode && r.bonusSgd + r.pendingBonusSgd > 0 && !seen.has(key)) {
      seen.add(key);
      out.push({ txn, kind: 'code', ruleId: r.ruleId, question: bonusQuestion(card, rule, txn) });
    }
  }
  return out;
}
