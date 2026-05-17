(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;

  var _keepAliveInterval = null;

  function notifyServiceWorker(type, data) {
    try {
      var message = Object.assign({ type: type }, data || {});
      chrome.runtime.sendMessage(message, function() {
        if (chrome.runtime.lastError) {}
      });
    } catch (e) {}
  }

  function startKeepAlive() {
    stopKeepAlive();
    _keepAliveInterval = setInterval(function() {
      notifyServiceWorker('KEEP_ALIVE');
    }, 25000);
  }

  function stopKeepAlive() {
    if (_keepAliveInterval) {
      clearInterval(_keepAliveInterval);
      _keepAliveInterval = null;
    }
  }

  async function start(site, processAssetsFn) {
    if (state.isRunning) {
      utils.log('Already running.', 'warn');
      return;
    }

    state.isRunning = true;
    state.shouldStop = false;
    state.currentSite = site;
    state.statusText = 'Scanning...';
    state.assetsClaimed = 0;
    state.assetsFailed = 0;
    utils.log('Starting auto-grab on ' + site + '...');

    notifyServiceWorker('PROCESSING_STARTED', { site: site });
    startKeepAlive();

    try {
      await processAssetsFn();

      if (!state.shouldStop) {
        var summary = state.assetsClaimed + ' claimed, ' + state.assetsFailed + ' failed out of ' + state.assetsTotal;
        state.statusText = 'Done: ' + summary;
        notifyServiceWorker('PROCESSING_COMPLETE', {
          site: site,
          summary: summary
        });
      } else {
        notifyServiceWorker('PROCESSING_STOPPED', { site: site });
      }
    } catch (err) {
      utils.log('Auto-grab error: ' + err.message, 'error');
      state.statusText = 'Error — check console';
      state.addLog('Error: ' + err.message, 'error');
      notifyServiceWorker('PROCESSING_ERROR', {
        site: site,
        error: err.message
      });
    } finally {
      state.isRunning = false;
      stopKeepAlive();
      if (state.statusText === 'Scanning...') {
        state.statusText = 'Done';
      }
    }
  }

  function stop() {
    if (!state.isRunning) return;
    state.shouldStop = true;
    state.statusText = 'Stopping...';
    utils.log('Stopping auto-grab...');
  }

  ns.controller = {
    start: start,
    stop: stop
  };
})();
