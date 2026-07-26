/**
 * Owned-asset library index (IndexedDB).
 *
 * This is NOT claim history. Claim history is an append-only log of what the
 * extension claimed. This is a mirror of what the user already owns on a
 * marketplace, upserted by stable id, so "what did I take in 2023" is a real
 * query instead of a guess.
 *
 * Durable store only. The options panel holds the working set in memory and
 * filters there: at library scale (10k+ rows) that beats round-tripping IDB on
 * every keystroke, and it keeps the write path cheap.
 *
 * Lives on the extension origin, so both the options page and the service
 * worker can open the same database.
 */

const DB_NAME = 'gaarLibrary';
const DB_VERSION = 2;
const STORE_ITEMS = 'items';
const STORE_META = 'meta';

let _dbPromise = null;

export function openDb() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;

      let items;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        items = db.createObjectStore(STORE_ITEMS, { keyPath: 'uid' });
      } else {
        items = tx.objectStore(STORE_ITEMS);
      }

      const ensure = (name, keyPath) => {
        if (!items.indexNames.contains(name)) items.createIndex(name, keyPath);
      };
      ensure('source', 'source');
      ensure('acquiredAt', 'acquiredAt');
      ensure('acquiredYear', 'acquiredYear');

      // v1 shipped a multiEntry token index for in-DB text search. Filtering
      // now happens in memory, so the index was pure write-amplification.
      if (event.oldVersion < 2 && items.indexNames.contains('tokens')) {
        items.deleteIndex('tokens');
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('db_blocked'));
  });

  return _dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('tx_aborted'));
  });
}

/**
 * Upsert a batch. Existing rows keep firstSeenAt; everything else is replaced
 * by the fresh platform payload. Idempotent, so a re-sync is always safe.
 */
export async function bulkUpsert(items, syncId) {
  const db = await openDb();
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < items.length; i += 250) {
    const chunk = items.slice(i, i + 250);
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    const store = tx.objectStore(STORE_ITEMS);

    chunk.forEach((item) => {
      const getReq = store.get(item.uid);
      getReq.onsuccess = () => {
        const prev = getReq.result;
        if (prev) updated++; else inserted++;
        store.put(Object.assign({}, prev, item, {
          firstSeenAt: (prev && prev.firstSeenAt) || Date.now(),
          stale: false,
          syncId: syncId || null
        }));
      };
    });

    await txDone(tx);
  }

  return { inserted, updated };
}

/**
 * After a completed full sync, anything not touched by this syncId is no longer
 * in the user's library. Flag it, never delete it: a failed page must not be
 * able to destroy data.
 */
export async function markMissingStale(source, syncId) {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readwrite');
  const idx = tx.objectStore(STORE_ITEMS).index('source');
  let flagged = 0;

  idx.openCursor(IDBKeyRange.only(source)).onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    const v = cur.value;
    if (v.syncId !== syncId && !v.stale) {
      v.stale = true;
      cur.update(v);
      flagged++;
    }
    cur.continue();
  };

  await txDone(tx);
  return flagged;
}

/** Which of these uids do we already have? Drives incremental sync early-stop. */
export async function hasUids(uids) {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readonly');
  const store = tx.objectStore(STORE_ITEMS);
  const found = new Set();

  uids.forEach((uid) => {
    const r = store.getKey(uid);
    r.onsuccess = () => { if (r.result) found.add(uid); };
  });

  await txDone(tx);
  return found;
}

/** Full working set for a source, newest acquisition first. */
export async function getAll(source) {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readonly');
  const store = tx.objectStore(STORE_ITEMS);
  const out = [];

  const req = source
    ? store.index('source').openCursor(IDBKeyRange.only(source))
    : store.openCursor();

  req.onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    out.push(cur.value);
    cur.continue();
  };

  await txDone(tx);
  out.sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0));
  return out;
}

export async function countBySource() {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readonly');
  const store = tx.objectStore(STORE_ITEMS);
  const counts = {};
  let total = 0;

  store.openCursor().onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    const v = cur.value;
    if (!v.stale) {
      counts[v.source] = (counts[v.source] || 0) + 1;
      total++;
    }
    cur.continue();
  };

  await txDone(tx);
  return { total, counts };
}

export async function clearSource(source) {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readwrite');
  const store = tx.objectStore(STORE_ITEMS);

  if (!source) {
    store.clear();
  } else {
    store.index('source').openCursor(IDBKeyRange.only(source)).onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) return;
      cur.delete();
      cur.continue();
    };
  }

  await txDone(tx);
}

export async function setMeta(key, value) {
  const db = await openDb();
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ key, value });
  await txDone(tx);
}

export async function getMeta(key) {
  const db = await openDb();
  const tx = db.transaction(STORE_META, 'readonly');
  const req = tx.objectStore(STORE_META).get(key);
  await txDone(tx);
  return req.result ? req.result.value : null;
}
