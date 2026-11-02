// The only module that touches IndexedDB. Everything else goes through these helpers.

const DB_NAME = 'ministry-log';
const DB_VERSION = 1;

let dbPromise = null;

function upgrade(db, oldVersion) {
  // Each block runs only for databases older than that version, so upgrades stack in order.
  if (oldVersion < 1) {
    const entries = db.createObjectStore('serviceEntries', { keyPath: 'id', autoIncrement: true });
    entries.createIndex('date', 'date');

    const contacts = db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
    contacts.createIndex('name', 'name');
    contacts.createIndex('nextVisitDate', 'nextVisitDate');

    const sessions = db.createObjectStore('studySessions', { keyPath: 'id', autoIncrement: true });
    sessions.createIndex('contactId', 'contactId');
    sessions.createIndex('date', 'date');

    db.createObjectStore('monthlyRemarks', { keyPath: 'month' });
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  // Future: if (oldVersion < 2) { ... }
}

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

// Runs one request inside a transaction and resolves when the transaction commits.
async function run(storeName, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const count = (store) => run(store, 'readonly', (s) => s.count());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const remove = (store, key) => run(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => run(store, 'readwrite', (s) => s.clear());

export const getAllByIndex = (store, indexName, range) =>
  run(store, 'readonly', (s) => s.index(indexName).getAll(range));

// Several records into one store in a single transaction: all are saved, or none.
export async function putMany(storeName, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    values.forEach((value) => tx.objectStore(storeName).put(value));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function removeMany(storeName, keys) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    keys.forEach((key) => tx.objectStore(storeName).delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Every store read in one transaction, so a backup is a consistent snapshot.
export async function exportAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, 'readonly');
    const result = {};
    STORE_NAMES.forEach((name) => {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { result[name] = request.result; };
    });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Replaces everything with the given data in one transaction. If anything fails the transaction is
// aborted and the existing data is left exactly as it was.
export async function replaceAll(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Restore aborted'));
    try {
      STORE_NAMES.forEach((name) => {
        const store = tx.objectStore(name);
        store.clear();
        (data[name] || []).forEach((record) => store.put(record));
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

// Records whose indexed value falls between lower and upper (inclusive). ISO dates sort correctly as text.
export const getByIndexRange = (store, indexName, lower, upper) =>
  run(store, 'readonly', (s) => s.index(indexName).getAll(IDBKeyRange.bound(lower, upper)));

// Settings are a key/value store; these keep callers from repeating the shape.
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export const setSetting = (key, value) => put('settings', { key, value });

export const STORE_NAMES = ['serviceEntries', 'contacts', 'studySessions', 'monthlyRemarks', 'settings'];
export { DB_VERSION };
