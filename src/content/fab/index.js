(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) {
    console.error('[FAB Auto Redeem] Namespace not initialized.');
    return;
  }

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;

  var islandCreated = false;
  var rescanTimer = null;

  async function init() {
    await ns.loadConfig();

    state.currentSite = 'fab';

    var checkInterval = setInterval(function() {
      var cards = ns.assetProcessor.getFreeAssetCards();
      if (cards.length > 0) {
        clearInterval(checkInterval);
        state.assetsFound = cards;
        state.assetsTotal = cards.length;
        createIslandOnce();
        utils.log('Found ' + cards.length + ' free asset(s).');
      }
    }, 1000);

    setTimeout(function() {
      clearInterval(checkInterval);
      createIslandOnce();
      if (state.assetsFound.length === 0) {
        utils.log('No free assets detected on initial scan.');
      }
    }, 60000);
  }

  function createIslandOnce() {
    if (islandCreated) return;
    islandCreated = true;
    ns.ui.dynamicIsland.create();
    setupNavigationHandling();
  }

  function setupNavigationHandling() {
    var origPushState = history.pushState;
    var origReplaceState = history.replaceState;

    history.pushState = function() {
      origPushState.apply(this, arguments);
      window.dispatchEvent(new Event('fab:navigation'));
    };

    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      window.dispatchEvent(new Event('fab:navigation'));
    };

    window.addEventListener('popstate', function() {
      window.dispatchEvent(new Event('fab:navigation'));
    });

    var debouncedRescan = utils.debounce(function() {
      rescanAssets();
    }, 800);

    window.addEventListener('fab:navigation', function() {
      utils.log('SPA navigation detected.');
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
      utils.log('MutationObserver attached to main content area.');
    }
  }

  function rescanAssets() {
    if (state.isRunning) return;

    var cards = ns.assetProcessor.getFreeAssetCards();
    state.assetsFound = cards;
    state.assetsTotal = cards.length;
    state.assetsClaimed = 0;
    state.assetsFailed = 0;

    utils.log('Re-scan complete. Found ' + cards.length + ' free asset(s) on current view.');
    state.statusText = cards.length > 0
      ? cards.length + ' free asset(s) found'
      : 'No free assets on this page';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
