(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var config = ns.config;
  var state = ns.state;

  var _startBtn = null;
  var _stopBtn = null;

  function createExpandedContent() {
    var panel = document.createElement('div');
    panel.id = 'fab-grab-panel';

    panel.innerHTML =
      '<div class="fab-grab-panel-header">' +
        '<div class="fab-grab-panel-title">' +
          '<span class="fab-grab-dot-icon">●</span> <span id="fab-grab-site-label">Auto Redeem</span>' +
        '</div>' +
        '<button class="fab-grab-panel-close" id="fab-grab-panel-close">✕</button>' +
      '</div>' +

      '<div class="fab-grab-panel-body">' +

        '<div class="fab-grab-controls">' +
          '<button class="fab-grab-btn fab-grab-btn-primary" id="fab-grab-start">▶ Start</button>' +
          '<button class="fab-grab-btn fab-grab-btn-danger" id="fab-grab-stop" disabled>⏹ Stop</button>' +
          '<button class="fab-grab-btn fab-grab-btn-secondary" id="fab-grab-refresh">↻ Refresh</button>' +
        '</div>' +

        '<div class="fab-grab-config">' +
          '<div class="fab-grab-config-row">' +
            '<span class="fab-grab-config-label">Auto-Start</span>' +
            '<div class="fab-grab-config-value">' +
              '<label class="fab-grab-toggle">' +
                '<input type="checkbox" id="fab-grab-auto-start">' +
                '<span class="fab-grab-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row">' +
            '<span class="fab-grab-config-label">Max Retries</span>' +
            '<div class="fab-grab-config-value">' +
              '<input type="number" class="fab-grab-input" id="fab-grab-max-retries" min="0" max="5" step="1" value="2">' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row">' +
            '<span class="fab-grab-config-label">Dialog Timeout (ms)</span>' +
            '<div class="fab-grab-config-value">' +
              '<input type="number" class="fab-grab-input" id="fab-grab-dialog-timeout" min="3000" max="30000" step="1000" value="10000">' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row fab-grab-fab-only">' +
            '<span class="fab-grab-config-label">License Preference</span>' +
            '<div class="fab-grab-config-value">' +
              '<select class="fab-grab-select" id="fab-grab-license">' +
                '<option value="personal">Personal</option>' +
                '<option value="professional" selected>Professional</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row">' +
            '<span class="fab-grab-config-label">Delay (ms)</span>' +
            '<div class="fab-grab-config-value">' +
              '<input type="number" class="fab-grab-input" id="fab-grab-delay" min="500" max="10000" step="500" value="2000">' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row fab-grab-fab-only">' +
            '<span class="fab-grab-config-label">Hide Owned</span>' +
            '<div class="fab-grab-config-value">' +
              '<label class="fab-grab-toggle">' +
                '<input type="checkbox" id="fab-grab-hide-owned" checked>' +
                '<span class="fab-grab-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row">' +
            '<span class="fab-grab-config-label">Claim History</span>' +
            '<div class="fab-grab-config-value">' +
              '<label class="fab-grab-toggle">' +
                '<input type="checkbox" id="fab-grab-claim-history" checked>' +
                '<span class="fab-grab-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row fab-grab-unity-only" style="display:none">' +
            '<span class="fab-grab-config-label">Product Delay (ms)</span>' +
            '<div class="fab-grab-config-value">' +
              '<input type="number" class="fab-grab-input" id="fab-grab-unity-delay" min="200" max="10000" step="100" value="500">' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row fab-grab-unity-only" style="display:none">' +
            '<span class="fab-grab-config-label">Auto-Paginate</span>' +
            '<div class="fab-grab-config-value">' +
              '<label class="fab-grab-toggle">' +
                '<input type="checkbox" id="fab-grab-auto-paginate" checked>' +
                '<span class="fab-grab-toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="fab-grab-config-row fab-grab-unity-only" style="display:none">' +
            '<span class="fab-grab-config-label">Page Delay (ms)</span>' +
            '<div class="fab-grab-config-value">' +
              '<input type="number" class="fab-grab-input" id="fab-grab-page-delay" min="3000" max="60000" step="1000" value="10000">' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="fab-grab-search">' +
          '<span class="fab-grab-search-icon">🔍</span>' +
          '<input type="text" placeholder="Search assets..." id="fab-grab-search-input">' +
        '</div>' +

        '<div class="fab-grab-assets-header">' +
          '<span class="fab-grab-assets-title">Free Assets</span>' +
          '<span class="fab-grab-assets-count" id="fab-grab-assets-count">0/0</span>' +
        '</div>' +
        '<div class="fab-grab-assets-list" id="fab-grab-assets-list">' +
          '<div class="fab-grab-empty">Scanning for free assets...</div>' +
        '</div>' +

        '<div class="fab-grab-tip">Tip: Drag anywhere on this panel to move it</div>' +

      '</div>' +

      '<div class="fab-grab-panel-footer">' +
        '<span class="fab-grab-version" id="fab-grab-footer-version">Auto Redeem v1.0.0</span>' +
        '<div class="fab-grab-footer-social">' +
          '<a class="fab-grab-social-btn" href="https://buymeacoffee.com/creos" target="_blank" rel="noopener" title="Buy me a coffee">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 64 64"><style><![CDATA[.C{clip-rule:evenodd}.D{fill:#100f0d}]]></style><defs><clipPath id="A"><path d="M2332.45 5723.53v37c0 20.44-16.57 37-37 37h-12.33c-20.44 0-37-16.57-37-37v-37h-37c-20.44 0-37-16.57-37-37v-12.33c0-20.44 16.57-37 37-37h37v-37c0-20.44 16.57-37 37-37h12.33c20.44 0 37 16.57 37 37v37h37c20.44 0 37 16.57 37 37v12.33c0 20.44-16.57 37-37 37z" class="C"/></clipPath><clipPath id="B"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="C"><path d="M1534.22 5533.96l-387.92 2.36 190.5-1210.2h464.12l190.5 1210.2z" class="C"/></clipPath><clipPath id="D"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="E"><path d="M1534.22 5533.96l-387.92 2.36 190.5-1210.2h367.14l190.5 1210.2z" class="C"/></clipPath><clipPath id="F"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="G"><path d="M1035.47 5536.32h1000.97v111.602H1035.47z"/></clipPath><clipPath id="H"><path d="M1842.48 5829.28H1222.5l-72.73-167.4h765.44z" class="C"/></clipPath><clipPath id="I"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="J"><path d="M2005.26 5194.53H1059.7l85.37-481.3 387.4 4.2 387.4-4.2z" class="C"/></clipPath><clipPath id="K"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="L"><path d="M707.297 5228.36c78.582 0 142.293 63.7 142.293 142.3s-63.7 142.3-142.293 142.3S565 5449.24 565 5370.65c0-78.58 63.7-142.3 142.297-142.3z" class="C"/></clipPath><clipPath id="M"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="N"><path d="M2188.83 4876.8c36.98 0 66.96 29.98 66.96 66.96s-29.98 66.96-66.96 66.96-66.95-29.98-66.95-66.96 29.97-66.96 66.95-66.96z" class="C"/></clipPath><clipPath id="O"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath><clipPath id="P"><path d="M933.293 4491.78c36.98 0 66.957 29.98 66.957 66.96s-29.977 66.96-66.957 66.96-66.965-29.98-66.965-66.96 29.98-66.96 66.965-66.96z" class="C"/></clipPath><clipPath id="Q"><path d="M-2297.97 261.46H12137.2v9623.42H-2297.97z"/></clipPath></defs><g transform="matrix(2.704792 0 0 2.704792 -90.948353 -1833.1808)"><g transform="matrix(.012849 0 0 -.012849 26.365039 755.74948)"><g clip-path="url(#A)"><g clip-path="url(#B)"><path d="M2111.94 5503.03h354.66v354.66h-354.66z" fill="#f9dd05"/></g></g><g clip-path="url(#C)"><g clip-path="url(#D)"><path d="M1086.15 4265.97h965.402v1330.5H1086.15z" fill="#f68313"/></g></g><g clip-path="url(#E)"><g clip-path="url(#F)"><path d="M1086.15 4265.97h868.43v1330.5h-868.43z" fill="#f9dd05"/></g></g><g clip-path="url(#G)"><path d="M975.32 5476.17h1121.26v231.898H975.32z" fill="#fff"/></g></g><path d="M40.004 684.277h12.194v-.766H40.004zm12.862.668h-13.53v-2.102h13.53v2.102" class="D"/><g transform="matrix(.012849 0 0 -.012849 26.365039 755.74948)" clip-path="url(#H)"><g clip-path="url(#I)"><path d="M1089.62 5601.72h885.738v287.703H1089.62z" fill="#fff"/></g></g><path d="M41.648 682.664h8.818l-.645-1.484h-7.53zm9.835.667H40.63l1.225-2.82h8.404l1.225 2.82" fill="#12110f"/><path d="M42.937 699.828h6.283l2.342-14.88-5.486.028-5.482-.028zm6.854.667h-7.424l-2.553-16.22 6.265.032 6.266-.032-2.553 16.22" class="D"/><g transform="matrix(.012849 0 0 -.012849 26.365039 755.74948)" clip-path="url(#J)"><g clip-path="url(#K)"><path d="M999.563 4653.1h1065.85v601.578H999.563z" fill="#fff"/></g></g><path d="M46.053 694.8l4.702.05.978-5.514H40.38l.978 5.514zm5.26.724l-5.26-.057-5.254.057-1.216-6.855H52.53l-1.216 6.855" class="D"/><g transform="matrix(.012849 0 0 -.012849 26.365039 755.74948)"><g clip-path="url(#L)"><g clip-path="url(#M)"><path d="M707.297 5429.25c-32.3 0-58.598-26.3-58.598-58.6s26.3-58.6 58.598-58.6 58.594 26.3 58.594 58.6-26.3 58.6-58.594 58.6zm0-284.6c-124.62 0-225.996 101.38-225.996 226s101.375 226 225.996 226 225.996-101.38 225.996-226c0-124.6-101.38-226-225.996-226" fill="#f1f1f1"/></g></g><g clip-path="url(#N)"><g clip-path="url(#O)"><path d="M2061.73 4816.66h254.2v254.22h-254.2z" fill="#f1f1f1"/></g></g><g clip-path="url(#P)"><g clip-path="url(#Q)"><path d="M806.184 4431.63H1060.4v254.223H806.184z" fill="#f46c35"/></g></g></g></g></svg>' +
          '</a>' +
          '<a class="fab-grab-social-btn" href="https://github.com/creosb" target="_blank" rel="noopener" title="GitHub">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>' +
          '</a>' +
          '<a class="fab-grab-social-btn" href="https://x.com/CreosB" target="_blank" rel="noopener" title="X (Twitter)">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>' +
          '</a>' +
          '<a class="fab-grab-social-btn" href="https://www.youtube.com/@CreosB" target="_blank" rel="noopener" title="YouTube">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' +
          '</a>' +
        '</div>' +
      '</div>';

    return panel;
  }

  function wirePanelEvents(panel) {
    var closeBtn = panel.querySelector('#fab-grab-panel-close');
    _startBtn = panel.querySelector('#fab-grab-start');
    _stopBtn = panel.querySelector('#fab-grab-stop');
    var refreshBtn = panel.querySelector('#fab-grab-refresh');
    var licenseSelect = panel.querySelector('#fab-grab-license');
    var delayInput = panel.querySelector('#fab-grab-delay');
    var autoStartCheckbox = panel.querySelector('#fab-grab-auto-start');
    var maxRetriesInput = panel.querySelector('#fab-grab-max-retries');
    var dialogTimeoutInput = panel.querySelector('#fab-grab-dialog-timeout');
    var hideOwnedCheckbox = panel.querySelector('#fab-grab-hide-owned');
    var unityDelayInput = panel.querySelector('#fab-grab-unity-delay');
    var autoPaginateCheckbox = panel.querySelector('#fab-grab-auto-paginate');
    var pageDelayInput = panel.querySelector('#fab-grab-page-delay');
    var claimHistoryCheckbox = panel.querySelector('#fab-grab-claim-history');

    var site = state.currentSite || 'fab';
    var siteLabel = panel.querySelector('#fab-grab-site-label');
    if (siteLabel) {
      siteLabel.textContent = site === 'unity' ? 'Unity Auto Redeem' : 'FAB Auto Redeem';
    }
    var footerVersion = panel.querySelector('#fab-grab-footer-version');
    if (footerVersion) {
      footerVersion.textContent = (site === 'unity' ? 'Unity' : 'FAB') + ' Auto Redeem v1.0.0';
    }

    var fabOnlyEls = panel.querySelectorAll('.fab-grab-fab-only');
    var unityOnlyEls = panel.querySelectorAll('.fab-grab-unity-only');
    for (var i = 0; i < fabOnlyEls.length; i++) {
      fabOnlyEls[i].style.display = site === 'fab' ? '' : 'none';
    }
    for (var j = 0; j < unityOnlyEls.length; j++) {
      unityOnlyEls[j].style.display = site === 'unity' ? '' : 'none';
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        ns.ui.dynamicIsland.collapse();
      });
    }

    if (_startBtn) {
      _startBtn.addEventListener('click', function() {
        if (ns.controller && ns.assetProcessor) {
          ns.controller.start(state.currentSite, ns.assetProcessor.processAllAssets);
        }
        updateButtonStates();
      });
    }

    if (_stopBtn) {
      _stopBtn.addEventListener('click', function() {
        if (ns.controller) ns.controller.stop();
        updateButtonStates();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        if (ns.assetProcessor) {
          state.assetsFound = ns.assetProcessor.getFreeAssetCards();
          state.assetsTotal = state.assetsFound.length;
          var listEl = panel.querySelector('#fab-grab-assets-list');
          if (ns.ui.assetsList) ns.ui.assetsList.update(listEl);
          var countEl = panel.querySelector('#fab-grab-assets-count');
          if (ns.ui.assetsList) ns.ui.assetsList.updateCount(countEl);
        }
        if (ns.hideOwned && ns.hideOwned.isActive()) {
          ns.hideOwned.scanAll();
        }
      });
    }

    if (autoStartCheckbox) {
      autoStartCheckbox.checked = !!config.autoStart;
      autoStartCheckbox.addEventListener('change', function() {
        ns.saveConfig({ autoStart: autoStartCheckbox.checked });
      });
    }

    if (maxRetriesInput) {
      maxRetriesInput.value = config.maxRetries != null ? config.maxRetries : 2;
      maxRetriesInput.addEventListener('change', function() {
        var val = parseInt(maxRetriesInput.value, 10);
        if (val >= 0 && val <= 5) {
          ns.saveConfig({ maxRetries: val });
        }
      });
    }

    if (dialogTimeoutInput) {
      dialogTimeoutInput.value = config.dialogTimeout || 10000;
      dialogTimeoutInput.addEventListener('change', function() {
        var val = parseInt(dialogTimeoutInput.value, 10);
        if (val >= 3000 && val <= 30000) {
          ns.saveConfig({ dialogTimeout: val });
        }
      });
    }

    if (licenseSelect) {
      licenseSelect.value = config.preferredLicense || 'professional';
      licenseSelect.addEventListener('change', function() {
        ns.saveConfig({ preferredLicense: licenseSelect.value });
      });
    }

    if (delayInput) {
      delayInput.value = site === 'unity'
        ? (config.unityDelayBetweenProducts || 500)
        : (config.delayBetweenActions || 2000);
      delayInput.addEventListener('change', function() {
        var val = parseInt(delayInput.value, 10);
        if (site === 'unity') {
          if (val >= 200 && val <= 10000) {
            ns.saveConfig({ unityDelayBetweenProducts: val });
          }
        } else {
          if (val >= 500 && val <= 10000) {
            ns.saveConfig({ delayBetweenActions: val });
          }
        }
      });
    }

    if (hideOwnedCheckbox) {
      hideOwnedCheckbox.checked = config.hideOwnedAssets !== false;
      hideOwnedCheckbox.addEventListener('change', function() {
        var enabled = hideOwnedCheckbox.checked;
        ns.saveConfig({ hideOwnedAssets: enabled });
        if (ns.hideOwned) {
          if (enabled) ns.hideOwned.start();
          else ns.hideOwned.stop();
        }
      });
    }

    if (unityDelayInput) {
      unityDelayInput.value = config.unityDelayBetweenProducts || 500;
      unityDelayInput.addEventListener('change', function() {
        var val = parseInt(unityDelayInput.value, 10);
        if (val >= 200 && val <= 10000) {
          ns.saveConfig({ unityDelayBetweenProducts: val });
        }
      });
    }

    if (autoPaginateCheckbox) {
      autoPaginateCheckbox.checked = config.unityAutoPaginate !== false;
      autoPaginateCheckbox.addEventListener('change', function() {
        ns.saveConfig({ unityAutoPaginate: autoPaginateCheckbox.checked });
      });
    }

    if (pageDelayInput) {
      pageDelayInput.value = config.unityDelayBeforeNextPage || 10000;
      pageDelayInput.addEventListener('change', function() {
        var val = parseInt(pageDelayInput.value, 10);
        if (val >= 3000 && val <= 60000) {
          ns.saveConfig({ unityDelayBeforeNextPage: val });
        }
      });
    }

    var searchInput = panel.querySelector('#fab-grab-search-input');
    var assetsList = panel.querySelector('#fab-grab-assets-list');
    if (ns.ui.search && searchInput && assetsList) {
      ns.ui.search.setup(searchInput, assetsList);
    }

    if (claimHistoryCheckbox) {
      claimHistoryCheckbox.checked = config.claimHistoryEnabled !== false;
      claimHistoryCheckbox.addEventListener('change', function() {
        ns.saveConfig({ claimHistoryEnabled: claimHistoryCheckbox.checked });
      });
    }

    ns.onConfigChange = function(cfg) {
      if (autoStartCheckbox) autoStartCheckbox.checked = !!cfg.autoStart;
      if (maxRetriesInput) maxRetriesInput.value = cfg.maxRetries != null ? cfg.maxRetries : 2;
      if (dialogTimeoutInput) dialogTimeoutInput.value = cfg.dialogTimeout || 10000;
      if (licenseSelect) licenseSelect.value = cfg.preferredLicense || 'professional';
      if (hideOwnedCheckbox) hideOwnedCheckbox.checked = cfg.hideOwnedAssets !== false;
      if (claimHistoryCheckbox) claimHistoryCheckbox.checked = cfg.claimHistoryEnabled !== false;
      if (unityDelayInput) unityDelayInput.value = cfg.unityDelayBetweenProducts || 500;
      if (autoPaginateCheckbox) autoPaginateCheckbox.checked = cfg.unityAutoPaginate !== false;
      if (pageDelayInput) pageDelayInput.value = cfg.unityDelayBeforeNextPage || 10000;
      if (delayInput) {
        delayInput.value = (site === 'unity')
          ? (cfg.unityDelayBetweenProducts || 500)
          : (cfg.delayBetweenActions || 2000);
      }
    };
  }

  function updateButtonStates() {
    if (_startBtn) _startBtn.disabled = state.isRunning;
    if (_stopBtn) _stopBtn.disabled = !state.isRunning;
  }

  ns.ui = ns.ui || {};
  ns.ui.expandedPanel = {
    create: createExpandedContent,
    wireEvents: wirePanelEvents,
    updateButtons: updateButtonStates
  };
})();
