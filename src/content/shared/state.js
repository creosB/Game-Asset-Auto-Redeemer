(function() {
  'use strict';
  var ns = (window.__fabGrabber ??= {});

  ns.state = {
    isRunning: false,
    shouldStop: false,
    currentSite: null,
    assetsFound: [],
    assetsClaimed: 0,
    assetsFailed: 0,
    assetsTotal: 0,
    statusText: 'Idle',
    expanded: false,
    logs: [],

    reset: function() {
      this.isRunning = false;
      this.shouldStop = false;
      this.assetsFound = [];
      this.assetsClaimed = 0;
      this.assetsFailed = 0;
      this.assetsTotal = 0;
      this.statusText = 'Idle';
    },

    addLog: function(msg, type) {
      var entry = { message: msg, type: type || 'info', timestamp: Date.now() };
      this.logs.push(entry);
      if (this.logs.length > 100) this.logs.shift();
    }
  };
})();
