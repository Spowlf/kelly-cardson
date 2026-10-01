// Thin promise wrapper over IndexedDB. Store layout comes from schema.js.

import { DB_NAME, DB_VERSION, STORES } from './schema.js';

let dbPromise;

export function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [index, keyPath] of Object.entries(def.indexes)) store.createIndex(index, keyPath);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another copy of the app (a newer version, or an import) needs the database: let go of it.
      // The next read or write reopens it.
      db.onversionchange = () => { db.close(); dbPromise = undefined; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export const getAll = async (name) => done((await store(name)).getAll());
export const get = async (name, key) => done((await store(name)).get(key));
export const put = async (name, value) => done((await store(name, 'readwrite')).put(value));
export const remove = async (name, key) => done((await store(name, 'readwrite')).delete(key));

// Several writes in one transaction; resolves when all are committed.
export async function putMany(name, values) {
  const db = await openDb();
  const tx = db.transaction(name, 'readwrite');
  const s = tx.objectStore(name);
  for (const v of values) s.put(v);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    // An abort (e.g. storage full) may come without an error event; without this the caller would wait forever.
    tx.onabort = () => reject(tx.error || new Error('Saving was cancelled'));
  });
}

// Replace several stores' contents in one transaction: all of it lands, or none of it.
export async function replaceAll(data) {
  const db = await openDb();
  const names = Object.keys(data);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const s = tx.objectStore(name);
    s.clear();
    for (const v of data[name]) s.put(v);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Import was cancelled'));
  });
}
