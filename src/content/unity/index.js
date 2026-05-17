(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) {
    console.error('[Unity Auto Redeem] Namespace not initialized.');
    return;
  }

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;

  var islandCreated = false;

  async function init() {
    await ns.loadConfig();

    state.currentSite = 'unity';

    var checkInterval = setInterval(function() {
      var cards = ns.assetProcessor.getFreeAssetCards();
      if (cards.length > 0) {
        clearInterval(checkInterval);
        state.assetsFound = cards;
        state.assetsTotal = cards.length;
        createIslandOnce();
        utils.log('[Unity] Found ' + cards.length + ' free asset(s).');
      }
    }, 1000);

    setTimeout(function() {
      clearInterval(checkInterval);
      createIslandOnce();
      if (state.assetsFound.length === 0) {
        utils.log('[Unity] No free assets detected on initial scan.');
      }
    }, 60000);
  }

  function createIslandOnce() {
    if (islandCreated) return;
    islandCreated = true;
    ns.ui.dynamicIsland.create();
    utils.log('[Unity] Dynamic Island UI created.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
