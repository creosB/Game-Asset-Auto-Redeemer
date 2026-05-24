(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var state = ns.state;
  var utils = ns.utils;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

  var shadowHost = null;
  var shadowRoot = null;
  var islandEl = null;
  var panelEl = null;
  var statusEl = null;
  var dotEl = null;
  var countEl = null;
  var updateInterval = null;

  var GRIP_SVG = '<svg viewBox="0 0 12 12"><circle cx="3" cy="2" r="1.2"/><circle cx="9" cy="2" r="1.2"/>' +
    '<circle cx="3" cy="6" r="1.2"/><circle cx="9" cy="6" r="1.2"/>' +
    '<circle cx="3" cy="10" r="1.2"/><circle cx="9" cy="10" r="1.2"/></svg>';

  var CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function createShadowHost() {
    if (shadowHost) return shadowRoot;

    shadowHost = document.createElement('div');
    shadowHost.id = 'fab-grab-host';
    var s = shadowHost.style;
    s.setProperty('all', 'initial', 'important');
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('top', '0', 'important');
    s.setProperty('left', '0', 'important');
    s.setProperty('width', '0', 'important');
    s.setProperty('height', '0', 'important');
    s.setProperty('z-index', '2147483647', 'important');
    s.setProperty('pointer-events', 'none', 'important');
    s.setProperty('border', 'none', 'important');
    s.setProperty('margin', '0', 'important');
    s.setProperty('padding', '0', 'important');
    s.setProperty('overflow', 'visible', 'important');

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    document.body.appendChild(shadowHost);

    ns.shadowRoot = shadowRoot;
    return shadowRoot;
  }

  function createDynamicIsland() {
    if (islandEl) return;

    var root = createShadowHost();

    if (ns.ui && ns.ui.styles) {
      ns.ui.styles.inject(root);
    }

    islandEl = document.createElement('div');
    islandEl.id = 'fab-grab-island';
    islandEl.innerHTML =
      '<div id="fab-grab-drag-handle">' + GRIP_SVG + '</div>' +
      '<div id="fab-grab-dot"></div>' +
      '<span id="fab-grab-status">' + t('panel_auto_redeem') + '</span>' +
      '<span id="fab-grab-count">0/0</span>' +
      '<button id="fab-grab-expand">' + CHEVRON_SVG + '</button>';

    root.appendChild(islandEl);

    statusEl = islandEl.querySelector('#fab-grab-status');
    dotEl = islandEl.querySelector('#fab-grab-dot');
    countEl = islandEl.querySelector('#fab-grab-count');

    panelEl = ns.ui.expandedPanel.create();
    root.appendChild(panelEl);
    ns.ui.expandedPanel.wireEvents(panelEl);

    var dragHandle = islandEl.querySelector('#fab-grab-drag-handle');
    if (ns.ui.drag) {
      ns.ui.drag.makeDraggable(islandEl, dragHandle);
      ns.ui.drag.makeDraggable(panelEl, panelEl);
    }

    var expandBtn = islandEl.querySelector('#fab-grab-expand');
    expandBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      expand();
    });

    islandEl.addEventListener('click', function(e) {
      if (e.target === dragHandle || dragHandle.contains(e.target)) return;
      if (e.target === expandBtn || expandBtn.contains(e.target)) return;
      expand();
    });

    updateInterval = setInterval(updateUI, 500);

    utils.log('Dynamic Island UI created (Shadow DOM isolated).');
  }

  function expand() {
    if (state.expanded) return;
    state.expanded = true;
    islandEl.style.display = 'none';
    panelEl.classList.add('visible');

    var listEl = panelEl.querySelector('#fab-grab-assets-list');
    if (ns.ui.assetsList && listEl) {
      ns.ui.assetsList.update(listEl);
    }
    var countBadge = panelEl.querySelector('#fab-grab-assets-count');
    if (ns.ui.assetsList && countBadge) {
      ns.ui.assetsList.updateCount(countBadge);
    }
    ns.ui.expandedPanel.updateButtons();
  }

  function collapse() {
    if (!state.expanded) return;
    state.expanded = false;
    panelEl.classList.remove('visible');
    islandEl.style.display = '';
  }

  function updateUI() {
    if (statusEl) {
      var sitePrefix = state.currentSite === 'unity' ? t('panel_unity_auto_redeem') : t('panel_fab_auto_redeem');
      statusEl.textContent = state.statusText || sitePrefix;
    }

    if (dotEl) {
      dotEl.className = '';
      if (state.isRunning) dotEl.classList.add('running');
      else if (state.hasError) dotEl.classList.add('error');
    }

    if (countEl) {
      var total = state.assetsTotal || state.assetsFound.length;
      countEl.textContent = state.assetsClaimed + '/' + total;
    }

    if (state.expanded) {
      ns.ui.expandedPanel.updateButtons();
    }
  }

  function setStatus(text) {
    state.statusText = text;
    if (statusEl) statusEl.textContent = text;
  }

  // Re-render when locale changes at runtime
  document.addEventListener('i18n-locale-changed', function() {
    if (!islandEl) return;
    // Clear stale translated statusText so updateUI uses fresh locale
    if (!state.isRunning) {
      state.statusText = '';
    }
    if (statusEl) {
      var sitePrefix = state.currentSite === 'unity' ? t('panel_unity_auto_redeem') : t('panel_fab_auto_redeem');
      statusEl.textContent = state.statusText || sitePrefix;
    }
    updateUI();
  });

  // Re-render when i18n first becomes ready (handles late async init)
  document.addEventListener('i18n-ready', function() {
    if (!islandEl) return;
    if (!state.isRunning) {
      state.statusText = '';
    }
    updateUI();
  });

  ns.ui = ns.ui || {};
  ns.ui.dynamicIsland = {
    create: createDynamicIsland,
    expand: expand,
    collapse: collapse,
    setStatus: setStatus,
    updateUI: updateUI
  };
})();
