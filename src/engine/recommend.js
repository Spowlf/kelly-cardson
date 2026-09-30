// "Which card?": rank her cards for one purchase.

import { earn, indexCategories } from './earn.js';

// Methods compared when she doesn't say how she'll pay, by where the shop is.
export const CHANNEL_METHODS = {
  in_person: ['mobile_tap', 'physical_tap', 'chip_or_swipe'],
  online: ['online_card_entry', 'in_app_wallet'],
  transit: ['simplygo'],
};

// Short wording for hints like "Pay by phone, not the plastic card".
export const METHOD_LABELS = {
  mobile_tap: 'phone',
  physical_tap: 'the plastic card',
  chip_or_swipe: 'chip or swipe',
  online_card_entry: 'entering the card number',
  in_app_wallet: 'Apple Pay in the app',
  simplygo: 'SimplyGo',
};

/**
 * @param {object} args
 * @param {object} args.purchase { amount, date, fcy, method?, channel?, category?, mcc?, merchant? }
 * @param {Array}  args.cards    data/cards.json `cards` (the full list).
 * @param {Array}  args.myCards  Her card records; only these are ranked. `priority` (lower first,
 *                              default: order in the list) breaks ties after cap left.
 * @returns {{ noMiles, message?, channel, methods, results }} results sorted by miles, best first.
 */
export function recommend({ purchase, cards, myCards, categories, settings, txns }) {
  const cats = indexCategories(categories);
  const cat = purchase.category ? cats[purchase.category] : null;
  if (cat?.no_miles) return { noMiles: true, message: cat.no_miles_label || 'No miles, use any card', results: [] };

  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const channel = purchase.channel || cat?.channel || 'in_person';
  const methods = purchase.method ? [purchase.method] : CHANNEL_METHODS[channel] || CHANNEL_METHODS.in_person;

  const ordered = myCards
    .map((userCard, i) => ({ userCard, order: userCard.priority ?? i }))
    .sort((a, b) => a.order - b.order);

  const results = [];
  for (const { userCard, order } of ordered) {
    const card = byId[userCard.cardId];
    if (!card) continue;
    const byMethod = {};
    for (const method of methods) {
      byMethod[method] = earn({ card, purchase: { ...purchase, method }, userCard, categories: cats, settings, txns });
    }
    const options = Object.values(byMethod);
    const best = options.reduce((a, b) => (b.rankMiles > a.rankMiles ? b : a));
    const worst = options.reduce((a, b) => (b.rankMiles < a.rankMiles ? b : a));
    results.push({
      cardId: card.id,
      name: card.name,
      best,
      byMethod,
      methodHint: worst.rankMiles < best.rankMiles ? `Pay by ${METHOD_LABELS[best.method]}, not ${METHOD_LABELS[worst.method]}.` : null,
      fallback: !best.ruleId || best.capLeftSgd === 0,
      order,
    });
  }

  // Cards to avoid go last. Then most miles (worth over the month), most cap left
  // (uncapped counts as unlimited), then her priority order.
  const capLeft = (r) => r.best.capLeftSgd ?? Infinity;
  results.sort((a, b) =>
    Number(a.best.avoid) - Number(b.best.avoid)
    || b.best.rankMiles - a.best.rankMiles
    || (capLeft(b) === capLeft(a) ? 0 : capLeft(b) > capLeft(a) ? 1 : -1)
    || a.order - b.order);
  return { noMiles: false, channel, methods, results };
}
