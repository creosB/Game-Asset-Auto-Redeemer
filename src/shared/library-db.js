/**
 * Owned-asset library index (IndexedDB).
 *
 * This is NOT claim history. Claim history is an append-only log of what the
 * extension claimed. This is a mirror of what the user already owns on a
 * marketplace, upserted by stable id, so "what did I take in 2023" is a real
 * query instead of a guess.
 *
 * Lives on the extension origin, so both the options page and the service
 * worker can open the same database.
 */

const DB_NAME = 'gaarLibrary';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_META = 'meta';

let _dbPromise = null;

export function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const s = db.createObjectStore(STORE_ITEMS, { keyPath: 'uid' });
        s.createIndex('source', 'source');
        s.createIndex('acquiredAt', 'acquiredAt');
        s.createIndex('acquiredYear', 'acquiredYear');
        s.createIndex('tokens', 'tokens', { multiEntry: true });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

/** Derived search payload. Kept here so every source indexes identically. */
function deriveSearch(item) {
  const parts = [
    item.title,
    item.seller,
    item.type,
    (item.formats || []).join(' '),
    item.acquiredYear ? String(item.acquiredYear) : ''
  ].filter(Boolean).join(' ');

  const searchText = parts.toLowerCase();
  const tokens = Array.from(
    new Set(searchText.split(/[^a-z0-9]+/).filter((t) => t.length > 1))
  ).slice(0, 60);

  return { searchText, tokens };
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
        const merged = Object.assign({}, prev, item, deriveSearch(item), {
          firstSeenAt: (prev && prev.firstSeenAt) || Date.now(),
          stale: false,
          syncId: syncId || null
        });
        store.put(merged);
      };
    });

    await txDone(tx);
  }

  return { inserted, updated };
}

/**
 * After a full sync, anything not touched by this syncId is no longer in the
 * user's library. Flag it, never delete it: a failed page must not nuke data.
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

/**
 * Query. Text search seeks the multiEntry token index by prefix on the first
 * term, then filters candidates in memory. No full scan unless the box is
 * empty, in which case we walk acquiredAt descending and page directly.
 */
export async function queryItems(opts = {}) {
  const db = await openDb();

  const terms = String(opts.text || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  const year = opts.year ? Number(opts.year) : null;
  const source = opts.source || null;
  const includeStale = !!opts.includeStale;
  const limit = opts.limit || 200;
  const offset = opts.offset || 0;

  const matches = (it) => {
    if (!includeStale && it.stale) return false;
    if (source && it.source !== source) return false;
    if (year && it.acquiredYear !== year) return false;
    if (!terms.length) return true;
    const hay = it.searchText || '';
    return terms.every((t) => hay.indexOf(t) !== -1);
  };

  const tx = db.transaction(STORE_ITEMS, 'readonly');
  const store = tx.objectStore(STORE_ITEMS);

  let req;
  let needsSort = false;

  if (terms.length) {
    const t0 = terms[0];
    req = store.index('tokens').openCursor(IDBKeyRange.bound(t0, t0 + '\uffff'));
    needsSort = true;
  } else if (year) {
    req = store.index('acquiredYear').openCursor(IDBKeyRange.only(year));
    needsSort = true;
  } else {
    req = store.index('acquiredAt').openCursor(null, 'prev');
  }

  const seen = new Set();
  const out = [];
  let total = 0;

  req.onsuccess = () => {
    const cur = req.result;
    if (!cur) return;
    const it = cur.value;
    if (!seen.has(it.uid)) {
      seen.add(it.uid);
      if (matches(it)) {
        total++;
        if (needsSort || (total > offset && out.length < limit)) out.push(it);
      }
    }
    cur.continue();
  };

  await txDone(tx);

  if (needsSort) {
    out.sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0));
    return { total, items: out.slice(offset, offset + limit) };
  }
  return { total, items: out };
}

/** Year facet counts, newest first. Undated rows land under null. */
export async function getYearFacets(source) {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readonly');
  const store = tx.objectStore(STORE_ITEMS);
  const counts = new Map();

  store.openCursor().onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    const v = cur.value;
    if (!v.stale && (!source || v.source === source)) {
      const y = v.acquiredYear || null;
      counts.set(y, (counts.get(y) || 0) + 1);
    }
    cur.continue();
  };

  await txDone(tx);

  return Array.from(counts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => (b.year || 0) - (a.year || 0));
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

export async function getAll(source) {
  const db = await openDb();
  const tx = db.transaction(STORE_ITEMS, 'readonly');
  const store = tx.objectStore(STORE_ITEMS);
  const out = [];

  store.openCursor().onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    if (!source || cur.value.source === source) out.push(cur.value);
    cur.continue();
  };

  await txDone(tx);
  out.sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0));
  return out;
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
