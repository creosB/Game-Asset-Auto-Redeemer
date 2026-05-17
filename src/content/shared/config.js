(function() {
  'use strict';
  var ns = (window.__fabGrabber ??= {});

  var DEFAULTS = {
    preferredLicense: 'professional',
    delayBetweenActions: 2000,
    maxRetries: 2,
    dialogTimeout: 10000,
    autoStart: false,
    hideOwnedAssets: true,
    claimHistoryEnabled: true,
    unityDelayBetweenProducts: 500,
    unityAutoPaginate: true,
    unityDelayBeforeNextPage: 10000
  };

  ns.config = Object.assign({}, DEFAULTS);

  ns.loadConfig = async function() {
    try {
      var stored = await chrome.storage.sync.get(DEFAULTS);
      Object.assign(ns.config, stored);
    } catch (e) {
      console.warn('[FAB Auto Redeem] Could not load config from storage:', e.message);
    }
  };

  ns.saveConfig = async function(patch) {
    Object.assign(ns.config, patch);
    try {
      await chrome.storage.sync.set(patch);
    } catch (e) {
      console.warn('[FAB Auto Redeem] Could not save config:', e.message);
    }
  };

  ns.onConfigChange = null;

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'sync') return;
    var changed = false;
    for (var key in changes) {
      if (key in DEFAULTS) {
        ns.config[key] = changes[key].newValue;
        changed = true;
      }
    }
    if (changed && ns.onConfigChange) {
      ns.onConfigChange(ns.config);
    }
  });

  ns.DEFAULTS = DEFAULTS;
})();
