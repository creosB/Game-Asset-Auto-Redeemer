(function() {
  'use strict';
  var ns = (window.__fabGrabber ??= {});

  var FAB_SPEED_PRESETS = {
    fast: {
      apiConcurrency: 4,
      apiClaimDelayMs: 120,
      delayBetweenActions: 800,
      dialogTimeout: 6000
    },
    normal: {
      apiConcurrency: 2,
      apiClaimDelayMs: 350,
      delayBetweenActions: 1500,
      dialogTimeout: 10000
    },
    casual: {
      apiConcurrency: 1,
      apiClaimDelayMs: 1000,
      delayBetweenActions: 2500,
      dialogTimeout: 12000
    }
  };

  var DEFAULTS = {
    preferredLicense: 'professional',
    fabClaimSpeed: 'normal',
    apiConcurrency: 2,
    apiClaimDelayMs: 350,
    delayBetweenActions: 2000,
    maxRetries: 2,
    dialogTimeout: 10000,
    autoStart: false,
    hideOwnedAssets: true,
    claimHistoryEnabled: true,
    unityDelayBetweenProducts: 500,
    unityAutoPaginate: true,
    unityDelayBeforeNextPage: 10000,
    // Superhive (Blender Market) — add-to-cart only, no purchase.
    superhiveEnabled: true,
    superhiveFreeOnly: true,
    superhiveEndlessPagination: false,
    superhiveHideNonFree: false,
    superhiveDelayBetweenAssets: 1200,
    superhivePageDelay: 700,
    superhiveMaxRetries: 4,
    superhivePageBudget: 5,
    superhiveMaxRateLimitStreak: 3
  };

  ns.FAB_SPEED_PRESETS = FAB_SPEED_PRESETS;
  ns.getFabSpeedSettings = function(cfg) {
    var c = cfg || ns.config || DEFAULTS;
    var mode = c.fabClaimSpeed;
    if (mode && FAB_SPEED_PRESETS[mode]) {
      return Object.assign({ mode: mode }, FAB_SPEED_PRESETS[mode]);
    }
    var base = FAB_SPEED_PRESETS.normal;
    return {
      mode: mode || 'advanced',
      apiConcurrency: typeof c.apiConcurrency === 'number' && c.apiConcurrency >= 1
        ? Math.min(4, Math.floor(c.apiConcurrency))
        : base.apiConcurrency,
      apiClaimDelayMs: typeof c.apiClaimDelayMs === 'number' && c.apiClaimDelayMs >= 0
        ? Math.min(5000, c.apiClaimDelayMs)
        : base.apiClaimDelayMs,
      delayBetweenActions: typeof c.delayBetweenActions === 'number' && c.delayBetweenActions >= 500
        ? c.delayBetweenActions
        : 2000,
      dialogTimeout: typeof c.dialogTimeout === 'number' && c.dialogTimeout >= 3000
        ? c.dialogTimeout
        : 10000
    };
  };

  ns.config = Object.assign({}, DEFAULTS);

  ns.loadConfig = async function() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      var stored = await chrome.storage.sync.get(DEFAULTS);
      Object.assign(ns.config, stored);
    } catch (e) {
      if (e.message && e.message.indexOf('Extension context invalidated') !== -1) return;
      console.warn('[FAB Auto Redeem] Could not load config from storage:', e.message);
    }
  };

  ns.saveConfig = async function(patch) {
    Object.assign(ns.config, patch);
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      await chrome.storage.sync.set(patch);
    } catch (e) {
      if (e.message && e.message.indexOf('Extension context invalidated') !== -1) return;
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
