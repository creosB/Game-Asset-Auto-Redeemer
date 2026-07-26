/**
 * Library Index (Unity) panel (options page).
 *
 * Self-mounting: options.html loads this module and it injects its own section
 * and styles after the FAB Library Index section.
 *
 * IndexedDB is the durable store; the whole Unity working set is pulled into
 * memory once and filtered there, with a virtualized list on top. That mirrors
 * the FAB panel's approach, which is proven at library scale.
 *
 * Opt-in. Nothing is fetched or stored until the user turns it on.
 */

import { getAll, countBySource, clearSource, getMeta } from '../shared/library-db.js';
import {
  startUnityLibrarySync, cancelUnityLibrarySync, getSyncJob, isSyncRunning
} from '../shared/unity-library-sync.js';

const SETTING_KEY = 'unityLibraryIndexEnabled';
const ROW_H = 57;       // must match .gaar-ulib-row height in CSS
const OVERSCAN = 6;

let items = [];         // everything we own, in memory
let view = [];          // filtered + sorted
let lastStart = -1;
let els = {};
let searchTimer = null;
let mounted = false;

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ESC_MAP[c]);

const fmtSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
};

/* ---------------- styles ---------------- */

// Prefixed gaar-ulib-* to stay clear of the FAB panel's gaar-lib-* rules.
const CSS = [
  '.gaar-ulib-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}',
  '.gaar-ulib-status{font-size:12px;opacity:.75;margin:6px 0;min-height:16px}',
  '.gaar-ulib-status.error{color:#ff6b6b;opacity:1}',
  '.gaar-ulib-sel{background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.3);',
  '  color:inherit;border-radius:8px;padding:6px 8px;font-size:12px;max-width:190px;outline:none}',
  '.gaar-ulib-chip{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85;',
  '  border:1px solid rgba(128,128,128,.3);border-radius:8px;padding:5px 9px;cursor:pointer}',
  '.gaar-ulib-list{height:520px;overflow-y:auto;overflow-x:hidden;position:relative;',
  '  border:1px solid rgba(128,128,128,.2);border-radius:10px;overscroll-behavior:contain}',
  '.gaar-ulib-sizer{position:relative;width:100%}',
  '.gaar-ulib-rows{position:absolute;top:0;left:0;right:0}',
  '.gaar-ulib-row{display:flex;gap:10px;padding:8px 10px;align-items:center;height:' + ROW_H + 'px;',
  '  box-sizing:border-box;border-bottom:1px solid rgba(128,128,128,.12);contain:layout paint}',
  '.gaar-ulib-row img{width:72px;height:41px;object-fit:cover;border-radius:4px;',
  '  background:rgba(128,128,128,.15);flex:none}',
  '.gaar-ulib-txt{min-width:0;overflow:hidden;flex:1}',
  '.gaar-ulib-t{font-weight:600;color:inherit;text-decoration:none;display:block;',
  '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.gaar-ulib-t:hover{color:#7aa2ff}',
  '.gaar-ulib-sub{font-size:11.5px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.gaar-ulib-tag{display:inline-block;border:1px solid rgba(128,128,128,.3);border-radius:5px;',
  '  padding:1px 6px;font-size:10.5px;margin-left:6px}',
  '.gaar-ulib-tag.upd{border-color:rgba(95,211,155,.5);color:#5fd39b}',
  '.gaar-ulib-tag.dep{border-color:rgba(255,143,143,.5);color:#ff8f8f}',
  '.gaar-ulib-date{font-size:11.5px;opacity:.7;flex:none;text-align:right;white-space:nowrap}',
  '.gaar-ulib-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
  '  text-align:center;padding:24px;opacity:.6;font-size:13px;pointer-events:none}'
].join('\n');

/* ---------------- markup ---------------- */

function buildSection() {
  const section = document.createElement('section');
  section.className = 'options-section';
  section.id = 'unity-library-index-section';

  const h2 = document.createElement('h2');
  h2.className = 'section-title';
  h2.textContent = 'Library Index (Unity)';
  section.appendChild(h2);

  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = [
    '<div class="option-info">',
    '  <label class="option-label">Index My Unity Library</label>',
    '  <span class="option-desc">Scan everything you already own on the Unity Asset Store',
    '    (not only what this extension claimed) into a local, searchable index with',
    '    acquisition dates. Stays on your machine. Off by default.</span>',
    '</div>',
    '<div class="option-control">',
    '  <label class="toggle">',
    '    <input type="checkbox" id="opt-unity-library-index">',
    '    <span class="toggle-slider"></span>',
    '  </label>',
    '</div>'
  ].join('');
  section.appendChild(row);

  const body = document.createElement('div');
  body.id = 'gaar-ulib-body';
  body.style.display = 'none';
  body.innerHTML = [
    '<div class="gaar-ulib-bar">',
    '  <button class="claim-history-btn" id="gaar-ulib-sync"',
    '    title="Only fetches items newer than your last sync">Sync new</button>',
    '  <button class="claim-history-btn" id="gaar-ulib-full"',
    '    title="Re-walks every page">Full</button>',
    '  <button class="claim-history-btn" id="gaar-ulib-cancel" style="display:none">Stop</button>',
    '  <button class="claim-history-btn" id="gaar-ulib-json">JSON</button>',
    '  <button class="claim-history-btn" id="gaar-ulib-csv">CSV</button>',
    '  <button class="claim-history-btn danger" id="gaar-ulib-clear">Clear index</button>',
    '  <a class="claim-history-btn" id="gaar-ulib-open" target="_blank" rel="noopener"',
    '    href="https://assetstore.unity.com/account/assets" title="Open your Unity library on assetstore.unity.com">Open Library \u2197</a>',
    '</div>',
    '<div class="gaar-ulib-status" id="gaar-ulib-status"></div>',
    '<div class="claim-history-search">',
    '  <span class="claim-history-search-icon">\u{1F50D}</span>',
    '  <input type="text" id="gaar-ulib-q" placeholder="Search title, seller, category...">',
    '</div>',
    '<div class="gaar-ulib-bar">',
    '  <select class="gaar-ulib-sel" id="gaar-ulib-year"></select>',
    '  <select class="gaar-ulib-sel" id="gaar-ulib-seller"></select>',
    '  <select class="gaar-ulib-sel" id="gaar-ulib-category"></select>',
    '  <select class="gaar-ulib-sel" id="gaar-ulib-sort">',
    '    <option value="new">Newest</option>',
    '    <option value="old">Oldest</option>',
    '    <option value="az">Title A-Z</option>',
    '    <option value="seller">Seller A-Z</option>',
    '    <option value="updated">Recently updated</option>',
    '    <option value="size">Largest size</option>',
    '  </select>',
    '  <label class="gaar-ulib-chip"><input type="checkbox" id="gaar-ulib-outdated"> only updates</label>',
    '  <label class="gaar-ulib-chip"><input type="checkbox" id="gaar-ulib-deprecated"> hide deprecated</label>',
    '  <button class="claim-history-btn" id="gaar-ulib-reset">Reset</button>',
    '</div>',
    '<div class="gaar-ulib-list" id="gaar-ulib-list">',
    '  <div class="gaar-ulib-sizer" id="gaar-ulib-sizer"><div class="gaar-ulib-rows" id="gaar-ulib-rowsel"></div></div>',
    '  <div class="gaar-ulib-msg" id="gaar-ulib-msg">Hit <b>Sync new</b> to pull your Unity library.</div>',
    '</div>'
  ].join('');
  section.appendChild(body);

  return section;
}

/* ---------------- virtual list ---------------- */

const fmtDate = (ts) => (
  ts
    ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
    : 'no date'
);

function paint(force) {
  const top = els.list.scrollTop;
  const visible = Math.ceil(els.list.clientHeight / ROW_H);
  const start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const end = Math.min(view.length, start + visible + OVERSCAN * 2);
  if (!force && start === lastStart) return;
  lastStart = start;

  let html = '';
  for (let n = start; n < end; n++) {
    const i = view[n];
    const dep = i.state && i.state !== 'published';
    const imgSrc = i.icon || i.img || '';
    html += '<div class="gaar-ulib-row">' +
      '<img loading="lazy" decoding="async" src="' + esc(imgSrc) + '" alt="">' +
      '<div class="gaar-ulib-txt">' +
        '<a class="gaar-ulib-t" href="' + esc(i.url) + '" target="_blank" rel="noopener">' +
          esc(i.title) + '</a>' +
        '<div class="gaar-ulib-sub">' + esc(i.seller || 'unknown seller') +
          (i.size ? ' \u00b7 ' + esc(fmtSize(i.size)) : '') +
          (i.version ? '<span class="gaar-ulib-tag">v' + esc(i.version) + '</span>' : '') +
          (i.outdated ? '<span class="gaar-ulib-tag upd">update</span>' : '') +
          (dep ? '<span class="gaar-ulib-tag dep">' + esc(i.state) + '</span>' : '') +
          (i.stale ? '<span class="gaar-ulib-tag">not in library</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="gaar-ulib-date">' + esc(fmtDate(i.acquiredAt)) + '</div>' +
    '</div>';
  }

  els.rows.style.transform = 'translateY(' + (start * ROW_H) + 'px)';
  els.rows.innerHTML = html;
}

function setView(rows) {
  view = rows;
  els.sizer.style.height = (rows.length * ROW_H) + 'px';
  els.msg.style.display = rows.length ? 'none' : '';
  if (!rows.length) {
    els.msg.textContent = items.length
      ? 'Nothing matches.'
      : 'Nothing indexed yet. Hit Sync new to pull your Unity library.';
  }
  els.list.scrollTop = 0;
  lastStart = -1;
  paint(true);
}

/* ---------------- filters ---------------- */

// One-time lowercase haystack so filtering never re-joins strings.
function indexItem(i) {
  i._hay = [
    i.title, i.seller, i.state,
    (i.labels || []).join(' '),
    i.acquiredYear || ''
  ].join(' ').toLowerCase();
  return i;
}

function fillSelect(el, label, values) {
  const keep = el.value;
  const counts = new Map();
  values.forEach((v) => { if (v || v === 0) counts.set(v, (counts.get(v) || 0) + 1); });

  const opts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

  el.innerHTML = '<option value="">' + esc(label) + ' (all)</option>' +
    opts.map(([v, n]) => (
      '<option value="' + esc(v) + '">' + esc(v) + ' \u00b7 ' + n + '</option>'
    )).join('');

  if (Array.from(el.options).some((o) => o.value === keep)) el.value = keep;
}

function buildFilters() {
  const years = items.map((i) => i.acquiredYear).filter(Boolean).sort((a, b) => b - a);
  fillSelect(els.year, 'Year', years);
  // Years read better chronologically than by count.
  const yearOpts = Array.from(els.year.options).slice(1)
    .sort((a, b) => Number(b.value) - Number(a.value));
  const keepYear = els.year.value;
  yearOpts.forEach((o) => els.year.appendChild(o));
  els.year.value = keepYear;

  fillSelect(els.seller, 'Seller', items.map((i) => i.seller));
  fillSelect(els.category, 'Category', items.flatMap((i) => i.labels || []));
}

function apply() {
  const terms = els.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const year = els.year.value ? Number(els.year.value) : null;
  const seller = els.seller.value;
  const category = els.category.value;
  const onlyOutdated = els.outdated.checked;
  const hideDeprecated = els.deprecated.checked;

  const out = [];
  for (let n = 0; n < items.length; n++) {
    const i = items[n];
    if (year && i.acquiredYear !== year) continue;
    if (seller && i.seller !== seller) continue;
    if (hideDeprecated && i.state && i.state !== 'published') continue;
    if (onlyOutdated && !i.outdated) continue;
    if (category && (i.labels || []).indexOf(category) === -1) continue;
    if (terms.length) {
      let ok = true;
      for (let t = 0; t < terms.length; t++) {
        if (i._hay.indexOf(terms[t]) === -1) { ok = false; break; }
      }
      if (!ok) continue;
    }
    out.push(i);
  }

  const s = els.sort.value;
  out.sort(
    s === 'old' ? (a, b) => (a.acquiredAt || Infinity) - (b.acquiredAt || Infinity)
      : s === 'az' ? (a, b) => a.title.localeCompare(b.title)
        : s === 'seller' ? (a, b) => a.seller.localeCompare(b.seller) || a.title.localeCompare(b.title)
          : s === 'updated' ? (a, b) => (b.updated || 0) - (a.updated || 0)
            : s === 'size' ? (a, b) => (b.size || 0) - (a.size || 0)
              : (a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0)
  );

  els.count.textContent = out.length + ' / ' + items.length + ' products';
  setView(out);
}

/* ---------------- load ---------------- */

async function loadFromDb() {
  items = (await getAll('unity')).map(indexItem);
  buildFilters();
  apply();
}

async function refreshStatus() {
  if (isSyncRunning()) return;
  const [bySource, lastSync] = await Promise.all([countBySource(), getMeta('unity:lastSyncedAt')]);
  const unity = bySource.counts.unity || 0;
  els.status.classList.remove('error');
  els.status.textContent = unity
    ? unity + ' Unity items indexed' +
      (lastSync ? ' \u00b7 last synced ' + new Date(lastSync).toLocaleString() : '')
    : '';
}

/* ---------------- sync ---------------- */

function progressText(job) {
  if (job.note === 'rate_limited') {
    return 'Rate limited, backing off ' + Math.round(job.waitMs / 1000) + 's...';
  }
  if (job.note === 'page_size_fallback') {
    return 'Page size rejected, retrying at ' + job.size + '...';
  }
  if (job.status === 'running') {
    return 'Fetching... ' + job.seen + (job.total ? ' / ' + job.total : '') +
      ' items over ' + job.page + ' page(s)';
  }
  if (job.status === 'cancelled') return 'Stopped. ' + job.seen + ' items indexed so far.';
  if (job.status === 'done') {
    return 'Synced ' + job.seen + ' items \u00b7 ' + job.inserted + ' new, ' +
      job.updated + ' updated' +
      (job.flaggedStale ? ' \u00b7 ' + job.flaggedStale + ' no longer in library' : '');
  }
  if (job.status === 'error') {
    return job.error === 'no_unity_tab'
      ? 'Could not reach the Unity API. Open assetstore.unity.com in a tab (logged in), then hit Resume.'
      : 'Sync failed: ' + job.error + '. Progress kept, hit Resume.';
  }
  return '';
}

async function doSync(opts) {
  els.sync.disabled = true;
  els.full.disabled = true;
  els.cancel.style.display = '';
  els.status.classList.remove('error');

  const result = await startUnityLibrarySync({
    full: opts.full,
    resume: opts.resume,
    onProgress: (job) => {
      els.status.textContent = progressText(job);
      els.status.classList.toggle('error', job.status === 'error');
    }
  });

  els.cancel.style.display = 'none';
  els.sync.disabled = false;
  els.full.disabled = false;
  els.sync.textContent = result.ok ? 'Sync new' : 'Resume';

  await loadFromDb();
}

/* ---------------- export ---------------- */

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const clean = items.map((i) => {
    const copy = Object.assign({}, i);
    delete copy._hay;
    return copy;
  });
  download('unity-library.json', JSON.stringify(clean, null, 2), 'application/json');
}

function exportCsv() {
  const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [
    ['title', 'seller', 'state', 'version', 'size_bytes', 'categories',
      'acquired', 'year', 'dateSource', 'url']
  ].concat(items.map((i) => [
    i.title,
    i.seller,
    i.state,
    i.version,
    i.size || 0,
    (i.labels || []).join('|'),
    i.acquiredAt ? new Date(i.acquiredAt).toISOString() : '',
    i.acquiredYear || '',
    i.dateSource,
    i.url
  ]));
  download('unity-library.csv', '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');
}

/* ---------------- boot ---------------- */

async function setEnabled(on, persist) {
  els.body.style.display = on ? '' : 'none';
  if (persist) await chrome.storage.sync.set({ [SETTING_KEY]: on });
  if (!on) return;

  await loadFromDb();
  await refreshStatus();
  paint(true); // list has zero height while hidden

  const job = await getSyncJob();
  if (job && (job.page || 0) > 0 && job.status !== 'done') {
    els.sync.textContent = 'Resume';
    els.status.textContent = 'Unfinished sync: ' + job.seen + ' items so far. Hit Resume.';
  }
}

function init() {
  if (mounted) return;
  const anchor = document.getElementById('library-index-section');
  if (!anchor || !anchor.parentNode) return;
  mounted = true;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const section = buildSection();
  anchor.parentNode.insertBefore(section, anchor.nextSibling);

  const $ = (sel) => section.querySelector(sel);
  els = {
    toggle: $('#opt-unity-library-index'),
    body: $('#gaar-ulib-body'),
    sync: $('#gaar-ulib-sync'),
    full: $('#gaar-ulib-full'),
    cancel: $('#gaar-ulib-cancel'),
    json: $('#gaar-ulib-json'),
    csv: $('#gaar-ulib-csv'),
    clear: $('#gaar-ulib-clear'),
    status: $('#gaar-ulib-status'),
    q: $('#gaar-ulib-q'),
    year: $('#gaar-ulib-year'),
    seller: $('#gaar-ulib-seller'),
    category: $('#gaar-ulib-category'),
    sort: $('#gaar-ulib-sort'),
    outdated: $('#gaar-ulib-outdated'),
    deprecated: $('#gaar-ulib-deprecated'),
    reset: $('#gaar-ulib-reset'),
    list: $('#gaar-ulib-list'),
    sizer: $('#gaar-ulib-sizer'),
    rows: $('#gaar-ulib-rowsel'),
    msg: $('#gaar-ulib-msg')
  };

  // Reuse the status line as the count readout.
  els.count = document.createElement('span');
  els.count.style.cssText = 'float:right;opacity:.8';
  els.status.parentNode.insertBefore(els.count, els.status.nextSibling);

  els.toggle.addEventListener('change', () => setEnabled(els.toggle.checked, true));
  els.sync.addEventListener('click', () => doSync({ full: false, resume: true }));
  els.full.addEventListener('click', () => doSync({ full: true, resume: false }));

  els.cancel.addEventListener('click', () => {
    cancelUnityLibrarySync();
    els.cancel.disabled = true;
    setTimeout(() => { els.cancel.disabled = false; }, 1500);
  });

  els.json.addEventListener('click', exportJson);
  els.csv.addEventListener('click', exportCsv);

  els.clear.addEventListener('click', async () => {
    if (!confirm('Delete the local Unity library index? Your Unity account is untouched.')) return;
    await clearSource('unity');
    await chrome.storage.local.remove('unityLibrarySyncJob');
    els.sync.textContent = 'Sync new';
    await loadFromDb();
    await refreshStatus();
  });

  els.reset.addEventListener('click', () => {
    els.q.value = '';
    els.year.value = '';
    els.seller.value = '';
    els.category.value = '';
    els.sort.value = 'new';
    els.outdated.checked = false;
    els.deprecated.checked = false;
    apply();
  });

  els.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(apply, 120);
  });

  [els.year, els.seller, els.category, els.sort, els.outdated, els.deprecated]
    .forEach((el) => el.addEventListener('change', apply));

  let ticking = false;
  els.list.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; paint(false); });
  }, { passive: true });

  window.addEventListener('resize', () => paint(true));

  chrome.storage.sync.get({ [SETTING_KEY]: false }).then((cfg) => {
    els.toggle.checked = !!cfg[SETTING_KEY];
    setEnabled(!!cfg[SETTING_KEY], false);
  });

  // Premium gating runs before this module mounts; re-apply now that the
  // section exists so the overlay matches the user's premium state.
  if (window.PremiumGate && typeof window.PremiumGate.check === 'function') {
    window.PremiumGate.check();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
