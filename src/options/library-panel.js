/**
 * Library Index panel (options page).
 *
 * Self-mounting: options.html loads this module and it injects its own section
 * and styles after Claim History.
 *
 * IndexedDB is the durable store; the whole FAB working set is pulled into
 * memory once and filtered there, with a virtualized list on top. That is the
 * approach the userscript already proved at library scale.
 *
 * Opt-in. Nothing is fetched or stored until the user turns it on.
 */

import { getAll, countBySource, clearSource, getMeta } from '../shared/library-db.js';
import {
  startFabLibrarySync, cancelFabLibrarySync, getSyncJob, isSyncRunning
} from '../shared/fab-library-sync.js';

const SETTING_KEY = 'libraryIndexEnabled';
const ROW_H = 57;       // must match .gaar-lib-row height in CSS
const OVERSCAN = 6;

let items = [];         // everything we own, in memory
let view = [];          // filtered + sorted
let lastStart = -1;
let els = {};
let searchTimer = null;
let mounted = false;

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ESC_MAP[c]);

/* ---------------- styles ---------------- */

const CSS = [
  '.gaar-lib-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}',
  '.gaar-lib-status{font-size:12px;opacity:.75;margin:6px 0;min-height:16px}',
  '.gaar-lib-status.error{color:#ff6b6b;opacity:1}',
  '.gaar-lib-sel{background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.3);',
  '  color:inherit;border-radius:8px;padding:6px 8px;font-size:12px;max-width:190px;outline:none}',
  '.gaar-lib-chip{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85;',
  '  border:1px solid rgba(128,128,128,.3);border-radius:8px;padding:5px 9px;cursor:pointer}',
  '.gaar-lib-list{height:520px;overflow-y:auto;overflow-x:hidden;position:relative;',
  '  border:1px solid rgba(128,128,128,.2);border-radius:10px;overscroll-behavior:contain}',
  '.gaar-lib-sizer{position:relative;width:100%}',
  '.gaar-lib-rows{position:absolute;top:0;left:0;right:0}',
  '.gaar-lib-row{display:flex;gap:10px;padding:8px 10px;align-items:center;height:' + ROW_H + 'px;',
  '  box-sizing:border-box;border-bottom:1px solid rgba(128,128,128,.12);contain:layout paint}',
  '.gaar-lib-row img{width:72px;height:41px;object-fit:cover;border-radius:4px;',
  '  background:rgba(128,128,128,.15);flex:none}',
  '.gaar-lib-txt{min-width:0;overflow:hidden;flex:1}',
  '.gaar-lib-t{font-weight:600;color:inherit;text-decoration:none;display:block;',
  '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.gaar-lib-t:hover{color:#7aa2ff}',
  '.gaar-lib-sub{font-size:11.5px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.gaar-lib-tag{display:inline-block;border:1px solid rgba(128,128,128,.3);border-radius:5px;',
  '  padding:1px 6px;font-size:10.5px;margin-left:6px}',
  '.gaar-lib-date{font-size:11.5px;opacity:.7;flex:none;text-align:right;white-space:nowrap}',
  '.gaar-lib-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
  '  text-align:center;padding:24px;opacity:.6;font-size:13px;pointer-events:none}'
].join('\n');

/* ---------------- markup ---------------- */

function buildSection() {
  const section = document.createElement('section');
  section.className = 'options-section';
  section.id = 'library-index-section';

  const h2 = document.createElement('h2');
  h2.className = 'section-title';
  h2.textContent = 'Library Index (FAB)';
  section.appendChild(h2);

  const row = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = [
    '<div class="option-info">',
    '  <label class="option-label">Index My Library</label>',
    '  <span class="option-desc">Scan everything you already own on FAB (not only what',
    '    this extension claimed) into a local, searchable index with acquisition dates.',
    '    Stays on your machine. Off by default.</span>',
    '</div>',
    '<div class="option-control">',
    '  <label class="toggle">',
    '    <input type="checkbox" id="opt-library-index">',
    '    <span class="toggle-slider"></span>',
    '  </label>',
    '</div>'
  ].join('');
  section.appendChild(row);

  const body = document.createElement('div');
  body.id = 'gaar-lib-body';
  body.style.display = 'none';
  body.innerHTML = [
    '<div class="gaar-lib-bar">',
    '  <button class="claim-history-btn" id="gaar-lib-sync"',
    '    title="Only fetches items newer than your last sync">Sync new</button>',
    '  <button class="claim-history-btn" id="gaar-lib-full"',
    '    title="Re-walks every page">Full</button>',
    '  <button class="claim-history-btn" id="gaar-lib-cancel" style="display:none">Stop</button>',
    '  <button class="claim-history-btn" id="gaar-lib-json">JSON</button>',
    '  <button class="claim-history-btn" id="gaar-lib-csv">CSV</button>',
    '  <button class="claim-history-btn danger" id="gaar-lib-clear">Clear index</button>',
    '</div>',
    '<div class="gaar-lib-status" id="gaar-lib-status"></div>',
    '<div class="claim-history-search">',
    '  <span class="claim-history-search-icon">\u{1F50D}</span>',
    '  <input type="text" id="gaar-lib-q" placeholder="Search title, seller, type, format...">',
    '</div>',
    '<div class="gaar-lib-bar">',
    '  <select class="gaar-lib-sel" id="gaar-lib-year"></select>',
    '  <select class="gaar-lib-sel" id="gaar-lib-type"></select>',
    '  <select class="gaar-lib-sel" id="gaar-lib-format"></select>',
    '  <select class="gaar-lib-sel" id="gaar-lib-engine"></select>',
    '  <select class="gaar-lib-sel" id="gaar-lib-seller"></select>',
    '  <select class="gaar-lib-sel" id="gaar-lib-sort">',
    '    <option value="new">Newest</option>',
    '    <option value="old">Oldest</option>',
    '    <option value="az">Title A-Z</option>',
    '    <option value="seller">Seller A-Z</option>',
    '  </select>',
    '  <label class="gaar-lib-chip"><input type="checkbox" id="gaar-lib-mature"> hide 18+</label>',
    '  <button class="claim-history-btn" id="gaar-lib-reset">Reset</button>',
    '</div>',
    '<div class="gaar-lib-list" id="gaar-lib-list">',
    '  <div class="gaar-lib-sizer" id="gaar-lib-sizer"><div class="gaar-lib-rows" id="gaar-lib-rowsel"></div></div>',
    '  <div class="gaar-lib-msg" id="gaar-lib-msg">Hit <b>Sync new</b> to pull your library.</div>',
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
    html += '<div class="gaar-lib-row">' +
      '<img loading="lazy" decoding="async" src="' + esc(i.img) + '" alt="">' +
      '<div class="gaar-lib-txt">' +
        '<a class="gaar-lib-t" href="' + esc(i.url) + '" target="_blank" rel="noopener">' +
          esc(i.title) + '</a>' +
        '<div class="gaar-lib-sub">' + esc(i.seller || 'unknown seller') +
          (i.type ? '<span class="gaar-lib-tag">' + esc(i.type) + '</span>' : '') +
          (i.formats && i.formats.length
            ? '<span class="gaar-lib-tag">' + esc(i.formats[0]) + '</span>' : '') +
          (i.stale ? '<span class="gaar-lib-tag">not in library</span>' : '') +
          (i.mature ? '<span class="gaar-lib-tag">18+</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="gaar-lib-date">' + esc(fmtDate(i.acquiredAt)) + '</div>' +
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
      : 'Nothing indexed yet. Hit Sync new to pull your library.';
  }
  els.list.scrollTop = 0;
  lastStart = -1;
  paint(true);
}

/* ---------------- filters ---------------- */

// One-time lowercase haystack so filtering never re-joins strings.
function indexItem(i) {
  i._hay = [
    i.title, i.seller, i.type,
    (i.formats || []).join(' '),
    (i.engines || []).join(' '),
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

  fillSelect(els.type, 'Type', items.map((i) => i.type));
  fillSelect(els.format, 'Format', items.flatMap((i) => i.formats || []));
  fillSelect(els.engine, 'UE version', items.flatMap((i) => i.engines || []));
  fillSelect(els.seller, 'Seller', items.map((i) => i.seller));
}

function apply() {
  const terms = els.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const year = els.year.value ? Number(els.year.value) : null;
  const type = els.type.value;
  const format = els.format.value;
  const engine = els.engine.value;
  const seller = els.seller.value;
  const hideMature = els.mature.checked;

  const out = [];
  for (let n = 0; n < items.length; n++) {
    const i = items[n];
    if (year && i.acquiredYear !== year) continue;
    if (type && i.type !== type) continue;
    if (seller && i.seller !== seller) continue;
    if (hideMature && i.mature) continue;
    if (format && (i.formats || []).indexOf(format) === -1) continue;
    if (engine && (i.engines || []).indexOf(engine) === -1) continue;
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
          : (a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0)
  );

  els.count.textContent = out.length + ' / ' + items.length + ' products';
  setView(out);
}

/* ---------------- load ---------------- */

async function loadFromDb() {
  items = (await getAll('fab')).map(indexItem);
  buildFilters();
  apply();
}

async function refreshStatus() {
  if (isSyncRunning()) return;
  const [bySource, lastSync] = await Promise.all([countBySource(), getMeta('fab:lastSyncedAt')]);
  const fab = bySource.counts.fab || 0;
  els.status.classList.remove('error');
  els.status.textContent = fab
    ? fab + ' FAB items indexed' +
      (lastSync ? ' \u00b7 last synced ' + new Date(lastSync).toLocaleString() : '')
    : '';
}

/* ---------------- sync ---------------- */

function progressText(job) {
  if (job.note === 'rate_limited') {
    return 'Rate limited, backing off ' + Math.round(job.waitMs / 1000) + 's...';
  }
  if (job.status === 'running') {
    return 'Fetching... ' + job.seen + ' items over ' + job.pages + ' page(s)' +
      (job.mode === 'relay' ? ' (via fab.com tab)' : '');
  }
  if (job.status === 'cancelled') return 'Stopped. ' + job.seen + ' items indexed so far.';
  if (job.status === 'done') {
    return 'Synced ' + job.seen + ' items \u00b7 ' + job.inserted + ' new, ' +
      job.updated + ' updated' +
      (job.flaggedStale ? ' \u00b7 ' + job.flaggedStale + ' no longer in library' : '');
  }
  if (job.status === 'error') {
    return job.error === 'no_fab_tab'
      ? 'Could not reach the FAB API from the extension. Open fab.com in a tab (logged in), then hit Resume.'
      : 'Sync failed: ' + job.error + '. Progress kept, hit Resume.';
  }
  return '';
}

async function doSync(opts) {
  els.sync.disabled = true;
  els.full.disabled = true;
  els.cancel.style.display = '';
  els.status.classList.remove('error');

  const result = await startFabLibrarySync({
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
  download('fab-library.json', JSON.stringify(clean, null, 2), 'application/json');
}

function exportCsv() {
  const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [
    ['title', 'seller', 'type', 'formats', 'engines', 'acquired', 'year', 'dateSource', 'url']
  ].concat(items.map((i) => [
    i.title,
    i.seller,
    i.type,
    (i.formats || []).join('|'),
    (i.engines || []).join('|'),
    i.acquiredAt ? new Date(i.acquiredAt).toISOString() : '',
    i.acquiredYear || '',
    i.dateSource,
    i.url
  ]));
  download('fab-library.csv', rows.map((r) => r.map(cell).join(',')).join('\n'), 'text/csv');
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
  if (job && job.cursorPath && job.status !== 'done') {
    els.sync.textContent = 'Resume';
    els.status.textContent = 'Unfinished sync: ' + job.seen + ' items so far. Hit Resume.';
  }
}

function init() {
  if (mounted) return;
  const anchor = document.getElementById('claim-history-section');
  if (!anchor || !anchor.parentNode) return;
  mounted = true;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const section = buildSection();
  anchor.parentNode.insertBefore(section, anchor.nextSibling);

  const $ = (sel) => section.querySelector(sel);
  els = {
    toggle: $('#opt-library-index'),
    body: $('#gaar-lib-body'),
    sync: $('#gaar-lib-sync'),
    full: $('#gaar-lib-full'),
    cancel: $('#gaar-lib-cancel'),
    json: $('#gaar-lib-json'),
    csv: $('#gaar-lib-csv'),
    clear: $('#gaar-lib-clear'),
    status: $('#gaar-lib-status'),
    q: $('#gaar-lib-q'),
    year: $('#gaar-lib-year'),
    type: $('#gaar-lib-type'),
    format: $('#gaar-lib-format'),
    engine: $('#gaar-lib-engine'),
    seller: $('#gaar-lib-seller'),
    sort: $('#gaar-lib-sort'),
    mature: $('#gaar-lib-mature'),
    reset: $('#gaar-lib-reset'),
    list: $('#gaar-lib-list'),
    sizer: $('#gaar-lib-sizer'),
    rows: $('#gaar-lib-rowsel'),
    msg: $('#gaar-lib-msg')
  };

  // Reuse the status line as the count readout.
  els.count = document.createElement('span');
  els.count.style.cssText = 'float:right;opacity:.8';
  els.status.parentNode.insertBefore(els.count, els.status.nextSibling);

  els.toggle.addEventListener('change', () => setEnabled(els.toggle.checked, true));
  els.sync.addEventListener('click', () => doSync({ full: false, resume: true }));
  els.full.addEventListener('click', () => doSync({ full: true, resume: false }));

  els.cancel.addEventListener('click', () => {
    cancelFabLibrarySync();
    els.cancel.disabled = true;
    setTimeout(() => { els.cancel.disabled = false; }, 1500);
  });

  els.json.addEventListener('click', exportJson);
  els.csv.addEventListener('click', exportCsv);

  els.clear.addEventListener('click', async () => {
    if (!confirm('Delete the local FAB library index? Your FAB account is untouched.')) return;
    await clearSource('fab');
    await chrome.storage.local.remove('fabLibrarySyncJob');
    els.sync.textContent = 'Sync new';
    await loadFromDb();
    await refreshStatus();
  });

  els.reset.addEventListener('click', () => {
    els.q.value = '';
    els.year.value = els.type.value = els.format.value = els.engine.value = els.seller.value = '';
    els.sort.value = 'new';
    els.mature.checked = false;
    apply();
  });

  els.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(apply, 120);
  });

  [els.year, els.type, els.format, els.engine, els.seller, els.sort, els.mature]
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
