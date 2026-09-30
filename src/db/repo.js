// App data: card rules from data/*.json, her own data from IndexedDB, kept in memory in `state`.
// Screens read `state` and change it only through these functions.

import * as db from './idb.js';
import { today } from '../engine/index.js';

export const state = {
  cards: [],
  cardsById: {},
  categories: [],
  categoriesById: {},
  myCards: [],
  txns: [],
  merchants: [],
  statements: [],
  balances: [],
  settings: {},
};

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const fetchJson = async (path) => (await fetch(path, { cache: 'no-cache' })).json();

export async function load() {
  const [cardsJson, catsJson] = await Promise.all([fetchJson('data/cards.json'), fetchJson('data/categories.json')]);
  state.cards = cardsJson.cards;
  state.cardsById = Object.fromEntries(state.cards.map((c) => [c.id, c]));
  state.categories = catsJson.categories;
  state.categoriesById = Object.fromEntries(state.categories.map((c) => [c.id, c]));

  const [myCards, txns, merchants, statements, balances, settings] = await Promise.all([
    db.getAll('myCards'), db.getAll('txns'), db.getAll('merchants'), db.getAll('statements'), db.getAll('balances'), db.getAll('settings'),
  ]);
  state.myCards = sortByPriority(myCards);
  state.txns = txns;
  state.merchants = merchants;
  state.statements = statements;
  state.balances = balances;
  state.settings = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  if (!state.settings.merchantsSeeded) await seedMerchants();
}

// First run: load merchant memory pre-filled from KiasuMiles checks (data/merchants.prefill.json).
async function seedMerchants() {
  try {
    const { merchants } = await fetchJson('data/merchants.prefill.json');
    const now = Date.now();
    const rows = merchants.map((m) => ({ ...m, updatedAt: now }));
    await db.putMany('merchants', rows);
    state.merchants.push(...rows.filter((r) => !state.merchants.some((m) => m.id === r.id)));
  } catch {
    // No pre-fill available: merchant memory simply starts empty.
  }
  await setSetting('merchantsSeeded', true);
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put('settings', { key, value });
}

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

export async function removeMyCard(cardId) {
  await db.remove('myCards', cardId);
  state.myCards = state.myCards.filter((c) => c.cardId !== cardId);
}

// Swap with the neighbour above (-1) or below (+1) in her priority order.
export async function moveMyCard(cardId, direction) {
  const list = state.myCards;
  const i = list.findIndex((c) => c.cardId === cardId);
  const j = i + direction;
  if (j < 0 || j >= list.length) return;
  list.forEach((c, n) => { c.priority = n + 1; });
  [list[i].priority, list[j].priority] = [list[j].priority, list[i].priority];
  await db.putMany('myCards', [list[i], list[j]]);
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
  if (txn.merchant && !txn.isCatchUp) {
    const m = await rememberMerchant(txn);
    txn.merchantId = m.id;
    txn.mcc ||= m.mcc || null;
  }
  await db.put('txns', txn);
  if (existing) Object.assign(existing, txn);
  else state.txns.push(txn);
  return txn;
}

export async function deleteTxn(id) {
  await db.remove('txns', id);
  state.txns = state.txns.filter((t) => t.id !== id);
}

// ---- Merchant memory -------------------------------------------------------

const slug = (name) => name.toLowerCase().trim().replace(/\s+/g, '-');

export const findMerchant = (name) => {
  const key = name?.trim().toLowerCase();
  return key ? state.merchants.find((m) => m.nameLower === key) : null;
};

// Last purchase at a merchant, to fill in card and method "from last time".
export const lastTxnAt = (name) => {
  const key = name?.trim().toLowerCase();
  return state.txns
    .filter((t) => t.merchant?.toLowerCase() === key && !t.isCatchUp)
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
};

// Merchants matching what she's typed, most recently used first.
export function merchantSuggestions(text, limit = 6) {
  const q = text.trim().toLowerCase();
  const lastUsed = {};
  for (const t of state.txns) if (t.merchant) lastUsed[t.merchant.toLowerCase()] = Math.max(lastUsed[t.merchant.toLowerCase()] || 0, t.createdAt);
  return state.merchants
    .filter((m) => !q || m.nameLower.includes(q))
    .sort((a, b) => (lastUsed[b.nameLower] || 0) - (lastUsed[a.nameLower] || 0) || (a.nameLower.indexOf(q) - b.nameLower.indexOf(q)) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// After a purchase: remember category, usual method and card for this merchant.
async function rememberMerchant(txn) {
  let m = findMerchant(txn.merchant);
  if (!m) {
    m = { id: slug(txn.merchant), name: txn.merchant, nameLower: txn.merchant.toLowerCase(), category: null, mcc: null, channel: null, usualMethod: null, usualCardId: null, source: 'user' };
    state.merchants.push(m);
  }
  const cat = txn.category && state.categoriesById[txn.category];
  Object.assign(m, {
    category: txn.category || m.category,
    channel: cat?.channel || m.channel,
    usualMethod: txn.method,
    usualCardId: txn.cardId,
    updatedAt: Date.now(),
  });
  await db.put('merchants', m);
  return m;
}

export async function saveMerchant(fields) {
  const existing = state.merchants.find((m) => m.id === fields.id);
  const m = { ...existing, ...fields, nameLower: fields.name.trim().toLowerCase(), name: fields.name.trim(), source: 'user', updatedAt: Date.now() };
  await db.put('merchants', m);
  if (existing) Object.assign(existing, m);
  else state.merchants.push(m);
  return m;
}

export async function deleteMerchant(id) {
  await db.remove('merchants', id);
  state.merchants = state.merchants.filter((m) => m.id !== id);
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
