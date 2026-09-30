// IndexedDB layout for her data. All of it stays on the phone. Card rules are NOT stored
// here: they come from data/cards.json. Never store card numbers, expiry dates or CVVs.

export const DB_NAME = 'miles-card-app';
export const DB_VERSION = 1;

// store name -> { keyPath, indexes: { name: keyPath } }
export const STORES = {
  myCards: { keyPath: 'cardId', indexes: {} },
  txns: { keyPath: 'id', indexes: { byCard: 'cardId', byDate: 'date', byMerchant: 'merchantId' } },
  merchants: { keyPath: 'id', indexes: { byName: 'nameLower' } },
  statements: { keyPath: ['cardId', 'cycleKey'], indexes: { byCard: 'cardId' } },
  balances: { keyPath: 'id', indexes: { byPool: 'pool' } },
  settings: { keyPath: 'key', indexes: {} },
};

/**
 * @typedef {object} MyCard  One of her cards. Links to a card in data/cards.json by id.
 * @property {string} cardId            cards.json id
 * @property {number|null} statementDay 1-31; drives statement-month caps and due reminders
 * @property {string|null} annualFeeDate 'YYYY-MM-DD', next fee date (card anniversary)
 * @property {string|null} openedDate   'YYYY-MM-DD'
 * @property {Object<string,string>} choices     e.g. { ladys_category: 'Dining' }
 * @property {Object<string,boolean>} conditionsMet e.g. { lifestyle: true } for KrisFlyer UOB
 * @property {{minSpendSgd:number, deadline:string, bonusMiles:number}|null} signup
 * @property {boolean} active
 * @property {number} priority        tie-break order in "Which card?", lower first; she reorders in My cards
 */

/**
 * @typedef {object} Txn  A logged purchase (the engine's `purchase`).
 * @property {string} id
 * @property {string} cardId
 * @property {string} date          'YYYY-MM-DD' transaction date
 * @property {number} amount        SGD (for FCY, the SGD amount charged)
 * @property {boolean} fcy
 * @property {string} method        one of cards.json _meta.payment_methods
 * @property {string|null} merchantId
 * @property {string|null} merchant name, copied so history survives merchant edits
 * @property {string|null} category categories.json id
 * @property {string|null} mcc      real code if known
 * @property {boolean} [isCatchUp]  statement-check top-up; counts against caps
 * @property {string} [bucket]      catch-up only: which cap it belongs to (default: all)
 * @property {string} [note]
 * @property {number} createdAt     ms timestamp
 */

/**
 * @typedef {object} Merchant  Merchant memory.
 * @property {string} id
 * @property {string} name
 * @property {string} nameLower     for autocomplete
 * @property {string|null} category
 * @property {string|null} mcc
 * @property {'in_person'|'online'|'transit'|null} channel
 * @property {string|null} usualMethod
 * @property {string|null} usualCardId
 * @property {'user'|'kiasumiles'} source
 * @property {number} updatedAt
 */

/**
 * @typedef {object} Statement  Monthly statement check.
 * @property {string} cardId
 * @property {string} cycleKey      from cycleFor()
 * @property {number} statementTotalSgd
 * @property {number} loggedTotalSgd at time of entry
 * @property {string|null} catchUpTxnId
 * @property {number} enteredAt
 */

/**
 * @typedef {object} Balance  Points balance she typed in. Only purchases dated after
 * `asOf` are added on top, so nothing is counted twice.
 * @property {string} id
 * @property {string} pool          cards.json points_pool (or card id when a card has none)
 * @property {number} points
 * @property {string} asOf          'YYYY-MM-DD'
 * @property {number} enteredAt
 */

/**
 * settings store rows: { key, value }
 *   postingDelayDays: number (default 3)
 *   lastExportAt: ms timestamp | null
 */
