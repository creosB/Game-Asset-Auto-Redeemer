(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

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
    state.hasError = false;
    state.currentSite = site;
    state.statusText = t('controller_scanning');
    state.assetsClaimed = 0;
    state.assetsFailed = 0;
    utils.log('Starting auto-grab on ' + site + '...');

    notifyServiceWorker('PROCESSING_STARTED', { site: site });
    startKeepAlive();

    try {
      await processAssetsFn();

      if (!state.shouldStop) {
        var summary = t('controller_summary', String(state.assetsClaimed), String(state.assetsFailed), String(state.assetsTotal));
        state.statusText = t('controller_done_summary', summary);
        notifyServiceWorker('PROCESSING_COMPLETE', {
          site: site,
          summary: summary
        });
      } else {
        notifyServiceWorker('PROCESSING_STOPPED', { site: site });
      }
    } catch (err) {
      utils.log('Auto-grab error: ' + err.message, 'error');
      state.statusText = t('controller_error');
      state.hasError = true;
      state.addLog('Error: ' + err.message, 'error');
      notifyServiceWorker('PROCESSING_ERROR', {
        site: site,
        error: err.message
      });
    } finally {
      state.isRunning = false;
      stopKeepAlive();
      if (state.statusText === t('controller_scanning')) {
        state.statusText = t('controller_done');
      }
    }
  }

  function stop() {
    if (!state.isRunning) return;
    state.shouldStop = true;
    state.statusText = t('controller_stopping');
    utils.log('Stopping auto-grab...');
  }

  ns.controller = {
    start: start,
    stop: stop
  };
})();
