/**
 * Library Index panel (options page).
 *
 * Self-mounting: options.html only needs
 *   <script type="module" src="library-panel.js"></script>
 * and this module injects its own section + styles after Claim History.
 *
 * Opt-in. Nothing is fetched or stored until the user turns it on.
 */

import {
  queryItems, getYearFacets, countBySource, getAll, clearSource, getMeta
} from '../shared/library-db.js';
import {
  startFabLibrarySync, cancelFabLibrarySync, getSyncJob, isSyncRunning
} from '../shared/fab-library-sync.js';

const PAGE_SIZE = 200;
const SETTING_KEY = 'libraryIndexEnabled';

const state = {
  enabled: false,
  text: '',
  year: null,
  offset: 0,
  total: 0,
  loaded: 0
};

let els = {};
let searchTimer = null;

/* ---------------- styles ---------------- */

const CSS = [
  '.gaar-lib-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}',
  '.gaar-lib-status{font-size:12px;opacity:.75;margin:6px 0;min-height:16px}',
  '.gaar-lib-status.error{color:#ff6b6b;opacity:1}',
  '.gaar-lib-years{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}',
  '.gaar-lib-year{border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;',
  '  border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;opacity:.8}',
  '.gaar-lib-year:hover{opacity:1}',
  '.gaar-lib-year.active{background:rgba(122,162,255,.18);border-color:#7aa2ff;opacity:1}',
  '.gaar-lib-rows{max-height:520px;overflow:auto;border:1px solid rgba(128,128,128,.2);border-radius:10px}',
  '.gaar-lib-row{display:flex;gap:10px;align-items:center;padding:8px 10px;',
  '  border-bottom:1px solid rgba(128,128,128,.12)}',
  '.gaar-lib-row:last-child{border-bottom:none}',
  '.gaar-lib-row img{width:72px;height:41px;object-fit:cover;border-radius:4px;',
  '  background:rgba(128,128,128,.15);flex:none}',
  '.gaar-lib-main{min-width:0;flex:1}',
  '.gaar-lib-title{font-weight:600;text-decoration:none;color:inherit;display:block;',
  '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.gaar-lib-title:hover{color:#7aa2ff}',
  '.gaar-lib-sub{font-size:11.5px;opacity:.65;display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
  '.gaar-lib-tag{border:1px solid rgba(128,128,128,.3);border-radius:5px;padding:0 6px;font-size:10.5px}',
  '.gaar-lib-date{font-size:11.5px;opacity:.7;flex:none;text-align:right}',
  '.gaar-lib-empty{padding:22px;text-align:center;opacity:.6;font-size:13px}',
  '.gaar-lib-gate{line-height:1.5}'
].join('\n');

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

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
    '  <span class="option-desc gaar-lib-gate">Scan everything you already own on FAB',
    '    (not only what this extension claimed) into a local, searchable index with',
    '    acquisition dates. Stays on your machine. Off by default.</span>',
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
    '<div class="gaar-lib-toolbar">',
    '  <button class="claim-history-btn" id="gaar-lib-sync">Sync new</button>',
    '  <button class="claim-history-btn" id="gaar-lib-full">Full re-scan</button>',
    '  <button class="claim-history-btn" id="gaar-lib-cancel" style="display:none">Stop</button>',
    '  <button class="claim-history-btn" id="gaar-lib-json">JSON</button>',
    '  <button class="claim-history-btn" id="gaar-lib-csv">CSV</button>',
    '  <button class="claim-history-btn danger" id="gaar-lib-clear">Clear index</button>',
    '</div>',
    '<div class="gaar-lib-status" id="gaar-lib-status"></div>',
    '<div class="claim-history-search">',
    '  <span class="claim-history-search-icon">\u{1F50D}</span>',
    '  <input type="text" id="gaar-lib-search" placeholder="Search title, seller, type, format, year...">',
    '</div>',
    '<div class="gaar-lib-years" id="gaar-lib-years"></div>',
    '<div class="gaar-lib-rows" id="gaar-lib-rows">',
    '  <div class="gaar-lib-empty">Nothing indexed yet. Hit <b>Sync new</b>.</div>',
    '</div>',
    '<div class="gaar-lib-toolbar" style="justify-content:center">',
    '  <button class="claim-history-btn" id="gaar-lib-more" style="display:none">Load more</button>',
    '</div>'
  ].join('');
  section.appendChild(body);

  return section;
}

/* ---------------- rendering ---------------- */

const fmtDate = (ts) => (
  ts
    ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
    : 'unknown date'
);

// Built with DOM APIs on purpose: every value here comes from a remote API.
function renderRow(item) {
  const row = document.createElement('div');
  row.className = 'gaar-lib-row';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = '';
  if (item.img) img.src = item.img;
  row.appendChild(img);

  const main = document.createElement('div');
  main.className = 'gaar-lib-main';

  const a = document.createElement('a');
  a.className = 'gaar-lib-title';
  a.href = item.url || '#';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = item.title || '(untitled)';
  main.appendChild(a);

  const sub = document.createElement('div');
  sub.className = 'gaar-lib-sub';

  const seller = document.createElement('span');
  seller.textContent = item.seller || 'unknown seller';
  sub.appendChild(seller);

  [item.type, item.stale ? 'not in library' : null, item.mature ? '18+' : null]
    .filter(Boolean)
    .forEach((t) => {
      const tag = document.createElement('span');
      tag.className = 'gaar-lib-tag';
      tag.textContent = t;
      sub.appendChild(tag);
    });

  main.appendChild(sub);
  row.appendChild(main);

  const date = document.createElement('div');
  date.className = 'gaar-lib-date';
  date.textContent = fmtDate(item.acquiredAt);
  row.appendChild(date);

  return row;
}

async function runQuery(append) {
  if (!append) {
    state.offset = 0;
    state.loaded = 0;
    els.rows.textContent = '';
  }

  const res = await queryItems({
    text: state.text,
    year: state.year,
    source: 'fab',
    limit: PAGE_SIZE,
    offset: state.offset
  });

  state.total = res.total;
  state.loaded += res.items.length;
  state.offset += res.items.length;

  if (!res.items.length && !append) {
    const empty = document.createElement('div');
    empty.className = 'gaar-lib-empty';
    empty.textContent = (state.text || state.year)
      ? 'Nothing matches.'
      : 'Nothing indexed yet. Hit Sync new.';
    els.rows.appendChild(empty);
  } else {
    const frag = document.createDocumentFragment();
    res.items.forEach((it) => frag.appendChild(renderRow(it)));
    els.rows.appendChild(frag);
  }

  els.more.style.display = state.loaded < state.total ? '' : 'none';
  els.more.textContent = 'Load more (' + (state.total - state.loaded) + ' left)';
  return res;
}

async function refreshFacets() {
  const [bySource, years, lastSync] = await Promise.all([
    countBySource(),
    getYearFacets('fab'),
    getMeta('fab:lastSyncedAt')
  ]);

  const fabCount = bySource.counts.fab || 0;
  els.years.textContent = '';

  const mkChip = (label, value, active) => {
    const b = document.createElement('button');
    b.className = 'gaar-lib-year' + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => {
      state.year = value;
      refreshFacets();
      runQuery(false);
    });
    return b;
  };

  els.years.appendChild(mkChip('All (' + fabCount + ')', null, !state.year));
  years.forEach((f) => {
    if (!f.year) return;
    els.years.appendChild(
      mkChip(f.year + ' (' + f.count + ')', f.year, state.year === f.year)
    );
  });

  if (!isSyncRunning()) {
    els.status.classList.remove('error');
    els.status.textContent = fabCount
      ? fabCount + ' FAB items indexed' +
        (lastSync ? ' \u00b7 last synced ' + new Date(lastSync).toLocaleString() : '')
      : '';
  }
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
  if (job.status === 'cancelled') {
    return 'Stopped. ' + job.seen + ' items indexed so far.';
  }
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

  await refreshFacets();
  await runQuery(false);
}

/* ---------------- export ---------------- */

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

async function exportJson() {
  const items = await getAll('fab');
  download('fab-library.json', JSON.stringify(items, null, 2), 'application/json');
}

async function exportCsv() {
  const items = await getAll('fab');
  const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['title', 'seller', 'type', 'formats', 'acquired', 'year', 'dateSource', 'url']]
    .concat(items.map((i) => [
      i.title,
      i.seller,
      i.type,
      (i.formats || []).join('|'),
      i.acquiredAt ? new Date(i.acquiredAt).toISOString() : '',
      i.acquiredYear || '',
      i.dateSource,
      i.url
    ]));
  download(
    'fab-library.csv',
    rows.map((r) => r.map(cell).join(',')).join('\n'),
    'text/csv'
  );
}

/* ---------------- boot ---------------- */

async function setEnabled(on, persist) {
  state.enabled = on;
  els.body.style.display = on ? '' : 'none';
  if (persist) await chrome.storage.sync.set({ [SETTING_KEY]: on });
  if (!on) return;

  await refreshFacets();
  await runQuery(false);

  const job = await getSyncJob();
  if (job && job.cursorPath && job.status !== 'done') {
    els.sync.textContent = 'Resume';
    els.status.textContent = 'Unfinished sync: ' + job.seen + ' items so far. Hit Resume.';
  }
}

async function init() {
  const anchor = document.getElementById('claim-history-section');
  if (!anchor || !anchor.parentNode) return;

  injectStyles();
  const section = buildSection();
  anchor.parentNode.insertBefore(section, anchor.nextSibling);

  els = {
    toggle: section.querySelector('#opt-library-index'),
    body: section.querySelector('#gaar-lib-body'),
    sync: section.querySelector('#gaar-lib-sync'),
    full: section.querySelector('#gaar-lib-full'),
    cancel: section.querySelector('#gaar-lib-cancel'),
    json: section.querySelector('#gaar-lib-json'),
    csv: section.querySelector('#gaar-lib-csv'),
    clear: section.querySelector('#gaar-lib-clear'),
    status: section.querySelector('#gaar-lib-status'),
    search: section.querySelector('#gaar-lib-search'),
    years: section.querySelector('#gaar-lib-years'),
    rows: section.querySelector('#gaar-lib-rows'),
    more: section.querySelector('#gaar-lib-more')
  };

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
  els.more.addEventListener('click', () => runQuery(true));

  els.clear.addEventListener('click', async () => {
    const ok = confirm('Delete the local FAB library index? Your FAB account is untouched.');
    if (!ok) return;
    await clearSource('fab');
    await chrome.storage.local.remove('fabLibrarySyncJob');
    els.sync.textContent = 'Sync new';
    await refreshFacets();
    await runQuery(false);
  });

  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.text = els.search.value.trim();
      runQuery(false);
    }, 150);
  });

  const cfg = await chrome.storage.sync.get({ [SETTING_KEY]: false });
  els.toggle.checked = !!cfg[SETTING_KEY];
  await setEnabled(!!cfg[SETTING_KEY], false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
