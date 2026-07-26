/**
 * FAB library sync.
 *
 * Walks /i/library/search?sort_by=-createdAt&source=acquired page by page and
 * upserts every owned listing into the library index.
 *
 * Transport: the extension origin has host permission for www.fab.com, so a
 * direct credentialed fetch usually works. If FAB's session cookie is not
 * attached (SameSite) the API answers with a login redirect / non-JSON body;
 * we then fall back to relaying the same request through the content script on
 * an open fab.com tab, which is unambiguously same-origin.
 */

import { bulkUpsert, markMissingStale, hasUids, setMeta } from './library-db.js';

const FAB_ORIGIN = 'https://www.fab.com';
const START_PATH = '/i/library/search?sort_by=-createdAt&source=acquired';
const JOB_KEY = 'fabLibrarySyncJob';

const PAGE_DELAY_MS = 120;
const MAX_RETRIES = 4;
const MAX_PAGES = 3000;
const KNOWN_PAGE_STOP = 2; // incremental: consecutive fully-known pages before stopping

let _running = false;
let _cancel = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function isSyncRunning() { return _running; }
export function cancelFabLibrarySync() { _cancel = true; }

export async function getSyncJob() {
  const data = await chrome.storage.local.get(JOB_KEY);
  return data[JOB_KEY] || null;
}

async function saveJob(job) {
  await chrome.storage.local.set({ [JOB_KEY]: job });
  return job;
}

/** Same shape as the userscript's normalize(), plus index fields. */
export function normalizeRow(row) {
  const l = row.listing || {};
  const thumb = (l.thumbnails && l.thumbnails[0]) || {};
  const imgs = thumb.images || [];
  const pick = imgs.find((i) => i.width >= 320) || imgs[0] || {};
  const formats = l.assetFormats || [];

  const id = l.uid || row.uid || null;
  const parsed = row.createdAt ? Date.parse(row.createdAt) : NaN;
  const acquiredAt = Number.isFinite(parsed) ? parsed : null;

  return {
    uid: 'fab:' + id,
    id,
    source: 'fab',
    title: l.title || '(untitled)',
    seller: (l.publisher && l.publisher.sellerName) || '',
    type: l.listingType || '',
    formats: formats
      .map((f) => f.assetFormatType && f.assetFormatType.name)
      .filter(Boolean),
    engines: Array.from(new Set(
      formats.flatMap((f) => (
        (f.technicalSpecs && f.technicalSpecs.unrealEngineEngineVersions) || []
      ))
    )),
    mature: !!l.isMature,
    url: id ? FAB_ORIGIN + '/listings/' + id : '',
    img: pick.url || thumb.mediaUrl || '',
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

async function fetchDirect(path) {
  const res = await fetch(FAB_ORIGIN + path, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw httpError(res.status, res.headers.get('Retry-After'));

  const ct = res.headers.get('content-type') || '';
  if (ct.indexOf('json') === -1) {
    const e = new Error('not_authenticated');
    e.auth = true;
    throw e;
  }
  return res.json();
}

async function findFabTab() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.fab.com/*' });
    return tabs && tabs.length ? tabs[0] : null;
  } catch (_) {
    return null;
  }
}

async function fetchViaRelay(path) {
  const tab = await findFabTab();
  if (!tab) {
    const e = new Error('no_fab_tab');
    e.needsTab = true;
    throw e;
  }

  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'FAB_LIBRARY_RELAY_FETCH',
      path
    });
  } catch (_) {
    const e = new Error('no_fab_tab');
    e.needsTab = true;
    throw e;
  }

  if (!resp || !resp.ok) {
    if (resp && resp.status) throw httpError(resp.status, resp.retryAfter);
    throw new Error((resp && resp.error) || 'relay_failed');
  }
  return resp.json;
}

/** One page, with transport fallback and bounded backoff on 429/5xx. */
async function fetchPage(path, ctx) {
  let attempt = 0;

  for (;;) {
    try {
      return ctx.mode === 'relay'
        ? await fetchViaRelay(path)
        : await fetchDirect(path);
    } catch (err) {
      const authProblem = err.auth || err.status === 401 || err.status === 403;
      if (authProblem && ctx.mode === 'direct') {
        ctx.mode = 'relay';
        continue; // same page, better transport
      }
      if (err.needsTab) throw err;

      const retriable = err.status === 429 || (err.status >= 500 && err.status < 600);
      if (!retriable || attempt >= MAX_RETRIES) throw err;

      const backoff = err.retryAfter
        ? err.retryAfter * 1000
        : Math.min(30000, 1000 * Math.pow(2, attempt));
      attempt++;
      ctx.onProgress({ note: 'rate_limited', waitMs: backoff });
      await wait(backoff);
    }
  }
}

function toPath(next) {
  if (!next) return null;
  return next.replace(/^https?:\/\/[^/]+/, '');
}

/**
 * @param {object}   opts
 * @param {boolean}  opts.full     full walk; otherwise stop early once pages are all known
 * @param {boolean}  opts.resume   continue from the stored cursor
 * @param {function} opts.onProgress
 */
export async function startFabLibrarySync(opts = {}) {
  if (_running) return { ok: false, error: 'already_running' };

  _running = true;
  _cancel = false;

  const onProgress = opts.onProgress || (() => {});
  const previous = await getSyncJob();
  const resuming = !!(opts.resume && previous && previous.cursorPath);

  const job = {
    status: 'running',
    mode: 'direct',
    full: !!opts.full,
    startedAt: resuming ? previous.startedAt : Date.now(),
    syncId: resuming ? previous.syncId : String(Date.now()),
    cursorPath: resuming ? previous.cursorPath : START_PATH,
    pages: resuming ? previous.pages || 0 : 0,
    seen: resuming ? previous.seen || 0 : 0,
    inserted: resuming ? previous.inserted || 0 : 0,
    updated: resuming ? previous.updated || 0 : 0,
    error: null
  };

  const ctx = { mode: job.mode, onProgress };
  let knownStreak = 0;
  let stoppedEarly = false;

  try {
    await saveJob(job);
    onProgress(job);

    while (job.cursorPath && job.pages < MAX_PAGES) {
      if (_cancel) {
        job.status = 'cancelled';
        break;
      }

      const json = await fetchPage(job.cursorPath, ctx);
      job.mode = ctx.mode;

      const rows = (json && json.results) || [];
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

      job.pages++;
      job.cursorPath = toPath(json && json.next);
      await saveJob(job);
      onProgress(job);

      if (!job.full && knownStreak >= KNOWN_PAGE_STOP) {
        stoppedEarly = true;
        break;
      }
      if (job.cursorPath) await wait(PAGE_DELAY_MS);
    }

    if (job.status !== 'cancelled') {
      // Only a completed full walk is authoritative about what disappeared.
      if (job.full && !job.cursorPath && !stoppedEarly) {
        job.flaggedStale = await markMissingStale('fab', job.syncId);
      }
      job.status = 'done';
      job.cursorPath = null;
      job.finishedAt = Date.now();
      await setMeta('fab:lastSyncedAt', job.finishedAt);
    }

    await saveJob(job);
    onProgress(job);
    return { ok: true, job };
  } catch (err) {
    job.status = 'error';
    job.error = err.needsTab ? 'no_fab_tab' : (err.message || 'sync_failed');
    await saveJob(job); // cursorPath survives, so Resume picks up here
    onProgress(job);
    return { ok: false, error: job.error, job };
  } finally {
    _running = false;
  }
}
