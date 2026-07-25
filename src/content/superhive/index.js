(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) {
    console.error('[Superhive] Namespace not initialized.');
    return;
  }

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

  var islandCreated = false;
  var rescanTimer = null;
  var i18nReady = false;

  document.addEventListener('i18n-ready', function() {
    i18nReady = true;
  });

  function isEnabled() {
    // Default to enabled if unset; turning it off in options fully disables the
    // content script's UI injection.
    return config.superhiveEnabled !== false;
  }

  function isListingPage() {
    // Presence of at least one listing card is the strongest signal; fall back
    // to a /products catalog path match so we still initialize on empty pages.
    if (document.querySelector('.js-card-wrapper')) return true;
    return /\/(products|search|catalog|categories|collections)\b/i.test(location.pathname);
  }

  async function init() {
    await ns.loadConfig();
    if (!isEnabled()) {
      utils.log('[Superhive] Support disabled in options.');
      return;
    }

    state.currentSite = 'superhive';

    var checkInterval = setInterval(function() {
      if (!isListingPage()) return;
      var cards = ns.assetProcessor.getFreeAssetCards();
      if (cards.length > 0) {
        clearInterval(checkInterval);
        state.assetsFound = cards;
        state.assetsTotal = cards.length;
        ns.assetProcessor.applyHideNonFree();
        createIslandOnce();
        utils.log('[Superhive] Found ' + cards.length + ' listing card(s).');
      }
    }, 1000);

    setTimeout(function() {
      clearInterval(checkInterval);
      if (!isListingPage()) return;
      createIslandOnce();
      if (state.assetsFound.length === 0) {
        utils.log('[Superhive] No listing cards detected on initial scan.');
      }
    }, 60000);
  }

  function createIslandOnce() {
    if (islandCreated) return;
    islandCreated = true;
    if (i18nReady || (ns.i18n && ns.i18n._ready)) {
      ns.ui.dynamicIsland.create();
      setupNavigationHandling();
      // Kick off endless pagination if the user has it on.
      if (config.superhiveEndlessPagination) {
        ns.assetProcessor.loadAllPages();
      }
    } else {
      document.addEventListener('i18n-ready', function() {
        ns.ui.dynamicIsland.create();
        setupNavigationHandling();
        if (config.superhiveEndlessPagination) {
          ns.assetProcessor.loadAllPages();
        }
      }, { once: true });
    }
  }

  // Superhive is a server-rendered paginated site, but search/category views
  // can use history navigation. Treat any URL change as a rescan trigger.
  function setupNavigationHandling() {
    var origPushState = history.pushState;
    var origReplaceState = history.replaceState;

    history.pushState = function() {
      origPushState.apply(this, arguments);
      window.dispatchEvent(new Event('superhive:navigation'));
    };
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      window.dispatchEvent(new Event('superhive:navigation'));
    };
    window.addEventListener('popstate', function() {
      window.dispatchEvent(new Event('superhive:navigation'));
    });

    var debouncedRescan = utils.debounce(function() { rescanAssets(); }, 800);

    window.addEventListener('superhive:navigation', function() {
      utils.log('[Superhive] Navigation detected.');
      debouncedRescan();
    });

    var mainContent = document.querySelector(
      'main, [role="main"], #root, #__next, [id*="app"], [id*="App"]'
    );
    if (mainContent) {
      var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes.length > 0) {
            debouncedRescan();
            return;
          }
        }
      });
      observer.observe(mainContent, { childList: true, subtree: true });
      utils.log('[Superhive] MutationObserver attached.');
    }
  }

  function rescanAssets() {
    if (state.isRunning) return;
    if (!isListingPage()) return;

    var cards = ns.assetProcessor.getFreeAssetCards();
    state.assetsFound = cards;
    state.assetsTotal = cards.length;
    state.assetsClaimed = 0;
    state.assetsFailed = 0;
    ns.assetProcessor.applyHideNonFree();

    utils.log('[Superhive] Re-scan: ' + cards.length + ' listing card(s).');
    state.statusText = cards.length > 0
      ? t('controller_assets_found', String(cards.length))
      : t('controller_no_assets_page');
  }

  // React to live config changes (e.g. toggling free-only / hide-non-free from
  // the panel or options page in another tab).
  ns.onConfigChangePrev = ns.onConfigChange;
  if (ns.config) {
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== 'sync') return;
      if ('superhiveFreeOnly' in changes || 'superhiveHideNonFree' in changes) {
        ns.assetProcessor.applyHideNonFree();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
