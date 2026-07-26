/**
 * Unity Asset Store library sync.
 *
 * Walks the Unity My Assets GraphQL endpoint page by page and upserts every
 * owned listing into the library index.
 *
 * Transport: relay-only. The Unity GraphQL endpoint is gated by a _csrf cookie
 * that is domain-locked to assetstore.unity.com, so the options page cannot
 * mint a request itself. Every fetch goes through the content script on an open
 * assetstore.unity.com tab, which is unambiguously same-origin and cookie'd.
 *
 * Mirrors fab-library-sync.js but trades the cursor/next model for Unity's
 * page/pageSize model, with a page-size fallback (100 -> 50 -> 25) since the
 * upstream occasionally rejects large pages.
 */

import { bulkUpsert, markMissingStale, hasUids, setMeta } from './library-db.js';

const UNITY_ORIGIN = 'https://assetstore.unity.com';
const JOB_KEY = 'unityLibrarySyncJob';

const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_FALLBACK = [50, 25];
const SORT_PURCHASED_DESC = 7; // matches the Unity My Assets sort enum
const PAGE_DELAY_MS = 120;
const MAX_RETRIES = 4;
const MAX_PAGES = 3000;
const KNOWN_PAGE_STOP = 2; // incremental: consecutive fully-known pages before stopping

let _running = false;
let _cancel = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function isSyncRunning() { return _running; }
export function cancelUnityLibrarySync() { _cancel = true; }

export async function getSyncJob() {
  const data = await chrome.storage.local.get(JOB_KEY);
  return data[JOB_KEY] || null;
}

async function saveJob(job) {
  await chrome.storage.local.set({ [JOB_KEY]: job });
  return job;
}

/** The GraphQL document for one My Assets page. */
function buildQuery(page, size) {
  return 'query { searchMyAssets(page: ' + page +
    ', pageSize: ' + size +
    ', q: [], tagging: [], assignFrom: [], ids: [], sortBy: ' + SORT_PURCHASED_DESC + ')' +
    ' { total results { id grantTime tagging assignFrom' +
    ' product { id name state downloadSize' +
    ' mainImage { icon75 icon }' +
    ' publisher { id name }' +
    ' currentVersion { name publishedDate }' +
    ' } } } }';
}

/** Same shape as the userscript's normalize(), plus index fields. */
export function normalizeRow(row) {
  const p = row.product || {};
  const grant = row.grantTime || '';
  const cv = p.currentVersion || {};
  const upd = cv.publishedDate || '';
  const img = p.mainImage || {};
  const pub = p.publisher || {};

  const id = p.id || row.id || null;
  const parsed = grant ? Date.parse(grant) : NaN;
  const acquiredAt = Number.isFinite(parsed) ? parsed : null;
  const updAt = upd ? Date.parse(upd) : NaN;

  return {
    uid: 'unity:' + id,
    id: String(id == null ? '' : id),
    source: 'unity',
    title: p.name || '(untitled)',
    seller: pub.name || '',
    state: p.state || '',
    size: Number(p.downloadSize) || 0,
    icon: img.icon75 || img.icon || '',
    version: cv.name || '',
    updated: Number.isFinite(updAt) ? updAt : null,
    labels: Array.isArray(row.tagging) ? row.tagging.slice() : [],
    // A real update (publisher shipped a newer version than your purchase) is a
    // filterable fact. We never fake it; missing dates simply don't qualify.
    outdated: !!(upd && grant && Number.isFinite(updAt) && Number.isFinite(parsed) && updAt > parsed),
    url: id ? UNITY_ORIGIN + '/packages/slug/' + id : '',
    img: img.icon75 || img.icon || '',
    acquiredAt,
    acquiredYear: acquiredAt ? new Date(acquiredAt).getFullYear() : null,
    // Never invent a date. An unknown date is a filterable fact, a fake one is a bug.
    dateSource: acquiredAt ? 'platform' : 'unknown'
  };
}

function httpError(status, retryAfter) {
  const e = new Error('http_' + status);
  e.status = status;
  e.retryAfter = retryAfter ? Number(retryAfter) : null;
  return e;
}

async function findUnityTab() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://assetstore.unity.com/*' });
    return tabs && tabs.length ? tabs[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Fetch one page through the assetstore.unity.com content script.
 *
 * The content script owns the _csrf cookie and the same-origin POST; we only
 * hand it the page index and current page size. On a size rejection (the
 * upstream occasionally 400s large pages) we shrink and retry the same page.
 */
async function fetchViaRelay(page, size) {
  const tab = await findUnityTab();
  if (!tab) {
    const e = new Error('no_unity_tab');
    e.needsTab = true;
    throw e;
  }

  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'UNITY_LIBRARY_RELAY_FETCH',
      query: buildQuery(page, size)
    });
  } catch (_) {
    const e = new Error('no_unity_tab');
    e.needsTab = true;
    throw e;
  }

  if (!resp || !resp.ok) {
    if (resp && resp.badPageSize) {
      const e = new Error('bad_page_size');
      e.badPageSize = true;
      throw e;
    }
    if (resp && resp.status) throw httpError(resp.status, resp.retryAfter);
    throw new Error((resp && resp.error) || 'relay_failed');
  }

  const payload = resp.json;
  const batch = Array.isArray(payload) ? payload[0] : payload;
  if (batch && batch.errors && batch.errors.length) {
    throw new Error((batch.errors[0] && batch.errors[0].message) || 'graphql_error');
  }
  const data = batch && batch.data && batch.data.searchMyAssets;
  if (!data) throw new Error('unexpected_shape');
  return data;
}

/** One page, with bounded backoff on 429/5xx and page-size fallback. */
async function fetchPage(page, size, ctx, onProgress) {
  let attempt = 0;
  let currentSize = size;

  for (;;) {
    try {
      return await fetchViaRelay(page, currentSize);
    } catch (err) {
      if (err.badPageSize) {
        const next = PAGE_SIZE_FALLBACK.find((s) => s < currentSize);
        if (!next) throw err;
        currentSize = next;
        onProgress({ note: 'page_size_fallback', size: currentSize });
        continue;
      }
      if (err.needsTab) throw err;

      const retriable = err.status === 429 || (err.status >= 500 && err.status < 600);
      if (!retriable || attempt >= MAX_RETRIES) throw err;

      const backoff = err.retryAfter
        ? err.retryAfter * 1000
        : Math.min(30000, 1000 * Math.pow(2, attempt));
      attempt++;
      onProgress({ note: 'rate_limited', waitMs: backoff });
      await wait(backoff);
    }
  }
}

/**
 * @param {object}   opts
 * @param {boolean}  opts.full     full walk; otherwise stop early once pages are all known
 * @param {boolean}  opts.resume   continue from the stored cursor
 * @param {function} opts.onProgress
 */
export async function startUnityLibrarySync(opts = {}) {
  if (_running) return { ok: false, error: 'already_running' };

  _running = true;
  _cancel = false;

  const onProgress = opts.onProgress || (() => {});
  const previous = await getSyncJob();
  const resuming = !!(opts.resume && previous && (previous.page || 0) > 0);

  const job = {
    status: 'running',
    full: !!opts.full,
    startedAt: resuming ? previous.startedAt : Date.now(),
    syncId: resuming ? previous.syncId : String(Date.now()),
    page: resuming ? previous.page || 0 : 0,
    pageSize: resuming ? previous.pageSize || PAGE_SIZE_DEFAULT : PAGE_SIZE_DEFAULT,
    total: resuming ? previous.total || null : null,
    seen: resuming ? previous.seen || 0 : 0,
    inserted: resuming ? previous.inserted || 0 : 0,
    updated: resuming ? previous.updated || 0 : 0,
    error: null
  };

  let knownStreak = 0;
  let stoppedEarly = false;

  try {
    await saveJob(job);
    onProgress(job);

    while (job.page < MAX_PAGES) {
      if (_cancel) {
        job.status = 'cancelled';
        break;
      }

      const data = await fetchPage(job.page, job.pageSize, {}, onProgress);
      job.total = data.total != null ? data.total : job.total;

      const rows = (data.results) || [];
      const items = rows.map(normalizeRow).filter((it) => it.id);

      if (items.length) {
        if (!job.full) {
          const known = await hasUids(items.map((it) => it.uid));
          knownStreak = known.size === items.length ? knownStreak + 1 : 0;
        }
        const res = await bulkUpsert(items, job.syncId);
        job.inserted += res.inserted;
        job.updated += res.updated;
        job.seen += items.length;
      }

      job.page++;
      await saveJob(job);
      onProgress(job);

      // Stop conditions: empty page, or we've walked every page the server reports.
      if (!rows.length) break;
      if (job.total != null && job.seen >= job.total) break;
      if (!job.full && knownStreak >= KNOWN_PAGE_STOP) {
        stoppedEarly = true;
        break;
      }
      await wait(PAGE_DELAY_MS);
    }

    if (job.status !== 'cancelled') {
      // Only a completed full walk is authoritative about what disappeared.
      if (job.full && !stoppedEarly) {
        job.flaggedStale = await markMissingStale('unity', job.syncId);
      }
      job.status = 'done';
      job.finishedAt = Date.now();
      await setMeta('unity:lastSyncedAt', job.finishedAt);
    }

    await saveJob(job);
    onProgress(job);
    return { ok: true, job };
  } catch (err) {
    job.status = 'error';
    job.error = err.needsTab ? 'no_unity_tab' : (err.message || 'sync_failed');
    await saveJob(job); // page survives, so Resume picks up here
    onProgress(job);
    return { ok: false, error: job.error, job };
  } finally {
    _running = false;
  }
}
