// Matching a purchase against category codes, merchant names and categories.

const listCache = new WeakMap();

function parseList(list) {
  let parsed = listCache.get(list);
  if (!parsed) {
    parsed = { singles: new Set(), ranges: [] };
    for (const item of list) {
      const [from, to] = item.split('-');
      if (to) parsed.ranges.push([Number(from), Number(to)]);
      else parsed.singles.add(from);
    }
    listCache.set(list, parsed);
  }
  return parsed;
}

// Does a disputed entry cover this purchase? By merchant name, or all recurring payments.
export const disputeApplies = (d, purchase) => merchantMatches(purchase.merchant, d.merchants) || (!!d.recurring && !!purchase.recurring);

// True if a 4-digit code is in a list of codes and 'from-to' ranges.
export function mccInList(mcc, list) {
  if (!mcc || !list?.length) return false;
  const { singles, ranges } = parseList(list);
  if (singles.has(mcc)) return true;
  const n = Number(mcc);
  return ranges.some(([from, to]) => n >= from && n <= to);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word, case-insensitive: "AXS" matches "AXS Station" but not "Taxsaver".
export function merchantMatches(merchant, names) {
  if (!merchant || !names?.length) return false;
  return names.some((name) => new RegExp(`(^|\\W)${escape(name)}($|\\W)`, 'i').test(merchant));
}

// Only listed codes earn this rule's bonus (a whitelist, or her chosen option's published codes),
// so the exact category code decides it.
export function ruleNeedsCode(rule, userCard) {
  const m = rule?.match;
  if (!m) return false;
  if (m.mode === 'whitelist') return true;
  return m.mode === 'user_category' && !!m.option_mccs?.[userCard?.choices?.[m.user_setting]];
}

/**
 * Does a bonus rule's `match` apply to this purchase?
 * Returns { ok, unconfirmed }: rules matched by category, merchant name or her chosen
 * category are unconfirmed (no category codes behind them), unless the chosen option lists codes.
 */
export function matchRule(rule, purchase, userCard) {
  const m = rule.match || { mode: 'all' };
  if (m.exclude_merchants?.length && merchantMatches(purchase.merchant, m.exclude_merchants)) return { ok: false, unconfirmed: false };
  if (mccInList(purchase.mcc, m.exclude_mccs)) return { ok: false, unconfirmed: false };
  if (m.exclude_recurring && purchase.recurring) return { ok: false, unconfirmed: false, recurring: true };
  switch (m.mode) {
    case 'all':
      return { ok: true, unconfirmed: false };
    case 'whitelist':
      return { ok: mccInList(purchase.mcc, m.mccs), unconfirmed: false };
    case 'blacklist':
      return { ok: !mccInList(purchase.mcc, m.mccs), unconfirmed: false };
    case 'categories':
      return { ok: !!purchase.category && (m.categories || []).includes(purchase.category), unconfirmed: true };
    case 'merchants':
      return { ok: merchantMatches(purchase.merchant, m.merchants), unconfirmed: true };
    case 'user_category': {
      const choice = userCard?.choices?.[m.user_setting];
      // Published category codes for the option decide; otherwise fall back to our categories.
      const mccs = choice && m.option_mccs?.[choice];
      if (mccs) return { ok: mccInList(purchase.mcc, mccs), unconfirmed: false };
      const cats = (choice && m.option_categories?.[choice]) || [];
      return { ok: !!purchase.category && cats.includes(purchase.category), unconfirmed: true };
    }
    default:
      return { ok: false, unconfirmed: true };
  }
}
