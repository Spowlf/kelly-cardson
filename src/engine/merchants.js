// Merchant memory: which category code a merchant uses and how sure we are, search by name or
// alias, the pre-fill merge, and what her statements showed per card. Pure functions, like the
// rest of the engine; src/db/repo.js stores the records.

/**
 * Status, most to least reliable:
 *   'code entered'           she typed the real category code
 *   'confirmed by statement' her statement showed whether it earned the bonus
 *   'reported'               code published by a third party (data/merchant-mccs.json)
 *   'guess'                  no code; the category's default code is used
 */
export const STATUSES = ['code entered', 'confirmed by statement', 'reported', 'guess'];
// Per-card results from the statement check. They override the code rules for that card.
export const EARNED_BONUS = 'earned bonus';
export const BASE_ONLY = 'base rate only';

const SURE = new Set(['code entered', 'confirmed by statement']);
// Statuses a pre-fill update may overwrite, if she hasn't edited the merchant.
const REPLACEABLE = new Set(['guess', 'reported']);

export const nameKey = (s) => (s || '').trim().toLowerCase();
// For search and ids: "KOI Thé" -> "koi the".
const fold = (s) => nameKey(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const merchantId = (name) => fold(name).replace(/[^a-z0-9+&.]+/g, '-').replace(/^-|-$/g, '');

/**
 * The code used for a merchant: her entered code, else the reported code, else the category default.
 * @returns {{ mcc: string|null, from: 'entered'|'reported'|'default'|null }}
 */
export function codeFor(merchant, category) {
  if (merchant?.mcc && merchant.status === 'code entered') return { mcc: merchant.mcc, from: 'entered' };
  if (merchant?.mcc) return { mcc: merchant.mcc, from: 'reported' };
  if (category?.default_mcc) return { mcc: category.default_mcc, from: 'default' };
  return { mcc: null, from: null };
}

/**
 * A purchase with what merchant memory knows: the merchant's code (unless the purchase has its own),
 * alternative codes, status, and statement results per card. The engine reads these fields.
 */
export function withMerchant(purchase, merchant) {
  if (!merchant || purchase.isCatchUp) return purchase;
  return {
    ...purchase,
    // Older purchases carry a copy of the merchant's code from when they were saved; the current one wins.
    mcc: merchant.mcc || purchase.mcc || null,
    altMccs: merchant.altMccs || [],
    merchantStatus: merchant.status || 'guess',
    cardResults: merchant.cardResults || {},
  };
}

// Is the code for this merchant uncertain? Guesses always are; reported codes when sources disagree.
// A purchase with no merchant memory but a category counts as a guess.
export function codeUncertain(p) {
  if (SURE.has(p.merchantStatus)) return false;
  if (p.merchantStatus === 'reported') return p.altMccs?.length > 0;
  return p.merchantStatus === 'guess' || !!(p.category && !p.mcc);
}

// Other codes to try when checking whether the uncertainty changes the answer. 'other' stands for
// "a code that isn't on any list", for guesses, which have no known alternatives.
export function otherCodes(p) {
  if (!codeUncertain(p)) return [];
  if (p.merchantStatus === 'reported') return p.altMccs;
  return ['other'];
}

// ---- Lookup and search -----------------------------------------------------

const keysOf = (m) => [m.name, ...(m.aliases || [])].map(fold);

// The merchant whose name or alias is exactly this text.
export function findByName(merchants, text) {
  const key = fold(text);
  if (!key) return null;
  return merchants.find((m) => fold(m.name) === key) || merchants.find((m) => (m.aliases || []).some((a) => fold(a) === key)) || null;
}

const byUse = (a, b) => (b.useCount || 0) - (a.useCount || 0) || (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name);

/**
 * Merchants whose name or an alias contains the text. Names and aliases that start with it come
 * first, then the ones she uses most.
 */
export function searchMerchants(merchants, text, limit = 8) {
  const q = fold(text);
  if (!q) return topMerchants(merchants, limit);
  const rank = (m) => {
    const keys = keysOf(m);
    if (keys.some((k) => k.startsWith(q))) return 0;
    if (keys.some((k) => k.split(/[\s.-]+/).some((w) => w.startsWith(q)))) return 1;
    return keys.some((k) => k.includes(q)) ? 2 : 3;
  };
  return merchants
    .map((m) => ({ m, r: rank(m) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || byUse(a.m, b.m))
    .slice(0, limit)
    .map((x) => x.m);
}

/**
 * Chips: her most-used merchants (use count, then last used). Topped up with the common
 * pre-filled ones (`common`, in order) while she has little history.
 */
export function topMerchants(merchants, limit = 8, common = []) {
  const used = merchants.filter((m) => m.useCount > 0).sort(byUse).slice(0, limit);
  const byId = new Map(merchants.map((m) => [m.id, m]));
  for (const id of common) {
    if (used.length >= limit) break;
    const m = byId.get(id);
    if (m && !used.includes(m)) used.push(m);
  }
  return used;
}

// ---- Pre-fill merge --------------------------------------------------------

// Old records (before statuses) and records she typed a code into get a status.
export function normalizeMerchant(m, useCount = 0) {
  const status = m.status || (m.mcc ? 'code entered' : 'guess');
  return {
    aliases: [],
    altMccs: [],
    cardResults: {},
    source: null,
    lastUsed: null,
    ...m,
    nameLower: nameKey(m.name),
    status,
    useCount: m.useCount ?? useCount,
    editedByHer: m.editedByHer ?? status === 'code entered',
  };
}

/**
 * Merge a new pre-fill into her merchants. Adds merchants she doesn't have, and updates ones she
 * hasn't edited that are still 'guess' or 'reported'. Never touches 'code entered', 'confirmed by
 * statement' or anything she edited. Her usage (counts, last card and method, statement results)
 * always stays.
 * @returns {Array} the records to save (new and updated).
 */
export function mergePrefill(existing, prefill) {
  const changed = [];
  const now = Date.now();
  for (const p of prefill) {
    const mine = existing.find((m) => m.id === p.id) || findByName(existing, p.name);
    if (!mine) {
      changed.push(normalizeMerchant({ ...p, updatedAt: now }));
      continue;
    }
    if (mine.editedByHer || !REPLACEABLE.has(mine.status || 'guess')) continue;
    changed.push({
      ...normalizeMerchant(mine),
      name: p.name,
      nameLower: nameKey(p.name),
      category: p.category ?? mine.category,
      channel: mine.channel || p.channel || null,
      mcc: p.mcc ?? null,
      altMccs: p.altMccs || [],
      status: p.status,
      source: p.source ?? null,
      aliases: [...new Set([...(mine.aliases || []), ...(p.aliases || [])])],
      usualMethod: mine.usualMethod || p.usualMethod || null,
      updatedAt: now,
    });
  }
  return changed;
}

// ---- Her edits and statement results ---------------------------------------

/**
 * Apply her edit. Marks the merchant edited; a typed code makes it 'code entered', and clearing
 * the code falls back to what her statements showed, else a guess.
 */
export function editMerchant(m, fields) {
  const next = { ...m, ...fields, editedByHer: true, updatedAt: Date.now() };
  next.name = next.name.trim();
  next.nameLower = nameKey(next.name);
  next.aliases = [...new Set((next.aliases || []).map((a) => a.trim()).filter(Boolean))];
  const codeChanged = 'mcc' in fields && (fields.mcc || null) !== (m.mcc || null);
  if (codeChanged && fields.mcc) {
    next.status = 'code entered';
    next.source = null;
  } else if (codeChanged) {
    next.status = 'guess';
    next.altMccs = [];
    next.source = null;
  }
  // Unless she typed the code, statement results decide: a bonus earned on any card confirms it.
  if (next.status !== 'code entered') {
    if (Object.values(next.cardResults || {}).includes(EARNED_BONUS)) next.status = 'confirmed by statement';
    else if (next.status === 'confirmed by statement') next.status = next.mcc ? 'reported' : 'guess';
  }
  return next;
}

// Her statement's answer for one card. "Yes" also confirms the merchant, unless she typed its code.
export function recordStatementResult(m, cardId, earnedBonus) {
  const cardResults = { ...(m.cardResults || {}), [cardId]: earnedBonus ? EARNED_BONUS : BASE_ONLY };
  const status = earnedBonus && m.status !== 'code entered' ? 'confirmed by statement' : m.status;
  return { ...m, cardResults, status, updatedAt: Date.now() };
}

// ---- Category code descriptions -------------------------------------------

// Codes 3000-3999 name one airline, hotel or car rental firm: keep their capitals.
const isBrand = (mcc) => Number(mcc) >= 3000 && Number(mcc) <= 3999;

// Sentence case, keeping acronyms (UK, TV) as they are.
export function sentenceCase(s) {
  const words = s.trim().split(/(\s+)/);
  let first = true;
  return words.map((w) => {
    if (/^\s+$/.test(w) || !w) return w;
    const keep = /^[A-Z0-9&.'/-]{2,}[,;:]?$/.test(w) && /[A-Z]{2}/.test(w);
    const out = keep ? w : first ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase();
    first = false;
    return out;
  }).join('');
}

/** "Miscellaneous food stores" for 5499: the part of the description before its first dash. */
export function shortDescription(entry) {
  if (!entry) return null;
  const head = entry.description.split(/\s*[–—]\s*|\s+-\s+/)[0];
  return isBrand(entry.mcc) ? head : sentenceCase(head);
}

export const fullDescription = (entry) => (entry ? (isBrand(entry.mcc) ? entry.description : sentenceCase(entry.description)) : null);
