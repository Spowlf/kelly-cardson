// Monthly statement check: compare her statement total with what she logged.

import { cycleFor } from './cycles.js';
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
    return { cardId: card.id, cycle: null, loggedSgd: null, gapSgd: null, offerCatchUp: false, message: 'Add the statement day for this card first' };
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
  else message = 'Matches what you logged';

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
