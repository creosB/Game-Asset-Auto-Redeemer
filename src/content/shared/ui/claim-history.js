(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var STORAGE_KEY = 'fabGrabClaimHistory';
  var MAX_HISTORY = 500;

  var _history = [];
  var _loaded = false;

  async function loadHistory() {
    if (_loaded) return _history;
    try {
      var result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
      _history = result[STORAGE_KEY] || [];
    } catch (e) {
      console.warn('[FAB Auto Redeem] Could not load claim history:', e.message);
      _history = [];
    }
    _loaded = true;
    return _history;
  }

  async function saveHistory() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: _history });
    } catch (e) {
      console.warn('[FAB Auto Redeem] Could not save claim history:', e.message);
    }
  }

  async function addClaim(entry) {
    if (!ns.config.claimHistoryEnabled) return;

    await loadHistory();

    var record = {
      id: entry.id || null,
      name: entry.name || 'Unknown Asset',
      source: entry.source || (ns.state.currentSite || 'unknown'),
      url: entry.url || null,
      claimedAt: Date.now(),
      license: entry.license || null
    };

    _history.unshift(record);
    if (_history.length > MAX_HISTORY) {
      _history = _history.slice(0, MAX_HISTORY);
    }

    await saveHistory();
    return record;
  }

  async function clearHistory() {
    _history = [];
    await saveHistory();
  }

  async function getHistory() {
    await loadHistory();
    return _history;
  }

  function getStats(history) {
    var stats = { total: 0, fab: 0, unity: 0 };
    for (var i = 0; i < history.length; i++) {
      stats.total++;
      if (history[i].source === 'fab') stats.fab++;
      else if (history[i].source === 'unity') stats.unity++;
    }
    return stats;
  }

  ns.claimHistory = {
    addClaim: addClaim,
    clearHistory: clearHistory,
    getHistory: getHistory,
    getStats: getStats
  };
})();
