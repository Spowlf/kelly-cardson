// App data: card rules from data/*.json, her own data from IndexedDB, kept in memory in `state`.
// Screens read `state` and change it only through these functions.

import * as db from './idb.js';
import {
  today, withMerchant, findByName, searchMerchants as search, topMerchants as top, normalizeMerchant, mergePrefill,
  editMerchant, recordStatementResult, merchantId, nameKey,
} from '../engine/index.js';

export const state = {
  cards: [],
  cardsById: {},
  categories: [],
  categoriesById: {},
  myCards: [],
  txns: [],
  merchants: [],
  commonMerchants: [], // pre-filled merchant ids for the chips before she has history
  codesByMcc: {}, // data/mcc-codes.json by code, for descriptions
  statements: [],
  balances: [],
  settings: {},
};

const fetchJson = async (path) => (await fetch(path, { cache: 'no-cache' })).json();

export async function load() {
  const [cardsJson, catsJson] = await Promise.all([fetchJson('data/cards.json'), fetchJson('data/categories.json')]);
  state.cards = cardsJson.cards;
  state.cardsById = Object.fromEntries(state.cards.map((c) => [c.id, c]));
  state.categories = catsJson.categories;
  state.categoriesById = Object.fromEntries(state.categories.map((c) => [c.id, c]));

  let stores;
  try {
    stores = await Promise.all([
      db.getAll('myCards'), db.getAll('txns'), db.getAll('merchants'), db.getAll('statements'), db.getAll('balances'), db.getAll('settings'),
    ]);
  } catch (err) {
    // Not the card data: the phone's storage. Said apart, so the app shows the right fix.
    throw Object.assign(new Error(err?.message || 'Storage unavailable'), { storage: true });
  }
  const [myCards, txns, merchants, statements, balances, settings] = stores;
  state.myCards = sortByPriority(myCards);
  state.txns = txns;
  state.statements = statements;
  state.balances = balances;
  state.settings = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  // Records from before merchant statuses get one, and a use count from her log.
  const uses = {};
  for (const t of txns) if (t.merchant && !t.isCatchUp) uses[nameKey(t.merchant)] = (uses[nameKey(t.merchant)] || 0) + 1;
  state.merchants = merchants.map((m) => normalizeMerchant(m, uses[nameKey(m.name)] || 0));

  await mergeMerchantPrefill();
  loadCodes();
}

// Category code descriptions: only for display, so the app doesn't wait for them.
function loadCodes() {
  fetchJson('data/mcc-codes.json')
    .then(({ codes }) => { state.codesByMcc = Object.fromEntries(codes.map((c) => [c.mcc, c])); })
    .catch(() => {});
}

// Merchant memory pre-filled from data/merchants.prefill.json. When its version goes up, new
// merchants are added and ones she hasn't touched are updated (see mergePrefill).
async function mergeMerchantPrefill() {
  try {
    const { _meta, merchants } = await fetchJson('data/merchants.prefill.json');
    state.commonMerchants = _meta.common || [];
    const version = _meta.version || 1;
    if ((state.settings.merchantsPrefillVersion || 0) >= version) return;
    const rows = mergePrefill(state.merchants, merchants);
    await db.putMany('merchants', rows);
    for (const row of rows) {
      const i = state.merchants.findIndex((m) => m.id === row.id);
      if (i >= 0) state.merchants[i] = row;
      else state.merchants.push(row);
    }
    await setSetting('merchantsPrefillVersion', version);
  } catch {
    // No pre-fill available (e.g. first open offline before it was cached): try again next time.
  }
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put('settings', { key, value });
}

// ---- Drafts ----------------------------------------------------------------
// A half-typed form, kept on the phone so closing the app (or a call at the till) loses nothing.
// Written on every change and cleared after a save. Kept out of backups.

const DRAFT = 'draft:';
export const loadDraft = (name) => state.settings[DRAFT + name] ?? null;

export async function saveDraft(name, form) {
  if (form) return setSetting(DRAFT + name, form);
  if (!(DRAFT + name in state.settings)) return;
  delete state.settings[DRAFT + name];
  await db.remove('settings', DRAFT + name);
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

// ---- Her cards -------------------------------------------------------------

const sortByPriority = (list) => list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

export const hasCard = (cardId) => state.myCards.some((c) => c.cardId === cardId);

export async function addMyCard(fields) {
  const priority = state.myCards.reduce((max, c) => Math.max(max, c.priority ?? 0), 0) + 1;
  const record = {
    cardId: fields.cardId,
    statementDay: fields.statementDay ?? null,
    annualFeeDate: fields.annualFeeDate || null,
    openedDate: fields.openedDate || null,
    choices: fields.choices || {},
    conditionsMet: fields.conditionsMet || {},
    signup: fields.signup || null,
    active: true,
    priority,
  };
  await db.put('myCards', record);
  state.myCards.push(record);
  return record;
}

export async function updateMyCard(cardId, patch) {
  const record = state.myCards.find((c) => c.cardId === cardId);
  Object.assign(record, patch);
  await db.put('myCards', record);
  return record;
}

// Returns the removed record, so Undo can put it back with its statement day, choices and place.
export async function removeMyCard(cardId) {
  const record = state.myCards.find((c) => c.cardId === cardId);
  await db.remove('myCards', cardId);
  state.myCards = state.myCards.filter((c) => c.cardId !== cardId);
  return record;
}

export async function restoreMyCard(record) {
  await db.put('myCards', record);
  state.myCards = sortByPriority([...state.myCards.filter((c) => c.cardId !== record.cardId), record]);
}

// Swap with the neighbour above (-1) or below (+1) in her priority order.
export async function moveMyCard(cardId, direction) {
  const list = state.myCards;
  const i = list.findIndex((c) => c.cardId === cardId);
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  list.forEach((c, n) => { c.priority = n + 1; });
  [list[i].priority, list[j].priority] = [list[j].priority, list[i].priority];
  // Save every card: renumbering changed them all, and gaps left by removed cards would reorder them on reload.
  await db.putMany('myCards', list);
  sortByPriority(list);
}

// ---- Purchases -------------------------------------------------------------

export async function saveTxn(fields) {
  const existing = fields.id && state.txns.find((t) => t.id === fields.id);
  const txn = {
    id: fields.id || newId(),
    cardId: fields.cardId,
    date: fields.date || today(),
    amount: Math.round(Number(fields.amount) * 100) / 100,
    fcy: !!fields.fcy,
    method: fields.method,
    merchant: fields.merchant?.trim() || null,
    merchantId: null,
    category: fields.category || null,
    mcc: fields.mcc || null,
    isCatchUp: !!fields.isCatchUp,
    ...(fields.bucket ? { bucket: fields.bucket } : {}),
    note: fields.note || '',
    createdAt: existing?.createdAt || Date.now(),
  };
  // The merchant's code isn't copied: the engine reads merchant memory, so a code she enters
  // later applies to past purchases too. Editing a purchase doesn't count as another use.
  if (txn.merchant && !txn.isCatchUp) {
    const m = existing ? findMerchant(txn.merchant) : await rememberMerchant(txn);
    txn.merchantId = m?.id || null;
    if (m) txn.merchant = m.name;
  }
  await db.put('txns', txn);
  if (existing) Object.assign(existing, txn);
  else state.txns.push(txn);
  return txn;
}

// Returns the deleted purchase, so Undo can put it back.
export async function deleteTxn(id) {
  const txn = state.txns.find((t) => t.id === id);
  const m = txn && !txn.isCatchUp && merchantOf(txn);
  if (m?.useCount > 0) await putMerchant({ ...m, useCount: m.useCount - 1 });
  await db.remove('txns', id);
  state.txns = state.txns.filter((t) => t.id !== id);
  return txn;
}

// Undo a delete: the same purchase under the same id, and its merchant's use counted again.
export async function restoreTxn(txn) {
  const m = !txn.isCatchUp && merchantOf(txn);
  if (m) await putMerchant({ ...m, useCount: (m.useCount || 0) + 1 });
  await db.put('txns', txn);
  state.txns = [...state.txns.filter((t) => t.id !== txn.id), txn];
}

// ---- Merchant memory -------------------------------------------------------

// By name or alias.
export const findMerchant = (name) => findByName(state.merchants, name);
const merchantOf = (t) => (t.merchantId && state.merchants.find((m) => m.id === t.merchantId)) || findMerchant(t.merchant);

// Merchants matching what she typed (names and aliases); her most-used ones when she hasn't typed.
export const searchMerchants = (text, limit = 8) => (text.trim() ? search(state.merchants, text, limit) : top(state.merchants, limit, state.commonMerchants));

// A purchase with its merchant's code, status and statement results, ready for the engine.
export const forEngine = (purchase) => withMerchant(purchase, merchantOf(purchase));
// Every logged purchase, ready for the engine.
export const engineTxns = () => state.txns.map(forEngine);

// Last purchase at a merchant, to fill in card and method "from last time".
export const lastTxnAt = (name) => {
  const m = findMerchant(name);
  const key = nameKey(m?.name || name);
  return state.txns
    .filter((t) => !t.isCatchUp && (m ? merchantOf(t) === m : nameKey(t.merchant) === key))
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
};

async function putMerchant(m) {
  await db.put('merchants', m);
  const i = state.merchants.findIndex((x) => x.id === m.id);
  if (i >= 0) state.merchants[i] = m;
  else state.merchants.push(m);
  return m;
}

// A merchant she typed that we don't know: saved as a guess (the category's default code).
export async function addMerchant({ name, category }) {
  const clean = name.trim();
  let id = merchantId(clean) || `merchant-${newId()}`;
  if (state.merchants.some((m) => m.id === id)) id = `${id}-${newId().slice(0, 4)}`;
  const cat = category ? state.categoriesById[category] : null;
  return putMerchant(normalizeMerchant({
    id, name: clean, category: category || null, channel: cat?.channel || null, mcc: null,
    status: 'guess', source: 'Added by you', usualMethod: null, usualCardId: null, updatedAt: Date.now(),
    ...(cat?.recurring ? { recurring: true } : {}),
  }));
}

// After a purchase: count the use, and remember category, method and card for next time.
async function rememberMerchant(txn) {
  const m = findMerchant(txn.merchant) || await addMerchant({ name: txn.merchant, category: txn.category });
  const changedCategory = !!txn.category && !!m.category && txn.category !== m.category;
  return putMerchant({
    ...m,
    category: txn.category || m.category,
    usualMethod: txn.method,
    usualCardId: txn.cardId,
    useCount: (m.useCount || 0) + 1,
    lastUsed: Date.now(),
    ...(changedCategory ? { editedByHer: true } : {}),
    updatedAt: Date.now(),
  });
}

// She changed Where or How for a merchant on "Which card?": use it next time.
export async function rememberWhereHow(name, { channel, method }) {
  const m = findMerchant(name);
  if (!m) return;
  const patch = {};
  if (channel && channel !== m.channel) patch.channel = channel;
  if (method !== undefined && method !== m.usualMethod) patch.usualMethod = method;
  if (Object.keys(patch).length) await putMerchant({ ...m, ...patch, updatedAt: Date.now() });
}

// Her edit on the merchant screen. Marks it edited, so pre-fill updates leave it alone.
export const saveMerchant = (m, fields) => putMerchant(editMerchant(m, fields));

// Returns the deleted merchant, so Undo can put it back with her edits.
export async function deleteMerchant(id) {
  const m = state.merchants.find((x) => x.id === id);
  await db.remove('merchants', id);
  state.merchants = state.merchants.filter((x) => x.id !== id);
  return m;
}

export const restoreMerchant = (m) => putMerchant(m);

// What her statement showed for this merchant on one card.
export async function saveStatementResult(name, cardId, earnedBonus) {
  const m = findMerchant(name);
  if (!m) return null;
  return putMerchant(recordStatementResult(m, cardId, earnedBonus));
}

// ---- Statements and points balances ---------------------------------------

export async function saveStatement(record) {
  const row = { ...record, enteredAt: Date.now() };
  await db.put('statements', row);
  state.statements = state.statements.filter((s) => !(s.cardId === row.cardId && s.cycleKey === row.cycleKey)).concat(row);
  return row;
}

export async function addBalance({ pool, points, asOf }) {
  const row = { id: newId(), pool, points: Math.round(Number(points)), asOf, enteredAt: Date.now() };
  await db.put('balances', row);
  state.balances.push(row);
  return row;
}

// ---- Backup ----------------------------------------------------------------

const BACKUP_STORES = ['myCards', 'txns', 'merchants', 'statements', 'balances', 'settings'];

export async function exportData() {
  const stores = {};
  for (const name of BACKUP_STORES) stores[name] = await db.getAll(name);
  stores.settings = stores.settings.filter((row) => !String(row.key).startsWith(DRAFT));
  return { app: 'miles-card-app', version: 1, exportedAt: new Date().toISOString(), stores };
}

// Replaces everything on the phone with the backup. Checks the file first so a wrong file changes nothing.
export async function importData(backup) {
  if (backup?.app !== 'miles-card-app' || !backup.stores) throw new Error('This isn\'t a Miles backup file.');
  for (const name of BACKUP_STORES) {
    if (!Array.isArray(backup.stores[name] ?? [])) throw new Error(`The backup's ${name} section is damaged.`);
  }
  await db.replaceAll(Object.fromEntries(BACKUP_STORES.map((name) => [name, backup.stores[name] ?? []])));
  await load();
}

// Her answer from a statement to a rule sources disagree about ('yes' = bonus earned).
export async function answerDispute(id, fields) {
  const answers = { ...(state.settings.disputeAnswers || {}), [id]: { ...fields, answeredAt: Date.now() } };
  await setSetting('disputeAnswers', answers);
}
