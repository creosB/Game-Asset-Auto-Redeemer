(function() {
  'use strict';

  var DEFAULTS = {
    preferredLicense: 'professional',
    delayBetweenActions: 2000,
    maxRetries: 2,
    dialogTimeout: 10000,
    autoStart: false,
    hideOwnedAssets: true,
    claimHistoryEnabled: true,
    fabAutoClaim: false,
    unityDelayBetweenProducts: 500,
    unityAutoPaginate: true,
    unityDelayBeforeNextPage: 10000
  };

  var radios = document.querySelectorAll('input[name="license"]');
  var delayInput = document.getElementById('opt-delay');
  var retriesInput = document.getElementById('opt-retries');
  var timeoutInput = document.getElementById('opt-timeout');
  var autostartToggle = document.getElementById('opt-autostart');
  var hideOwnedToggle = document.getElementById('opt-hide-owned');
  var claimHistoryToggle = document.getElementById('opt-claim-history');
  var fabAutoClaimToggle = document.getElementById('opt-fab-auto-claim');
  var unityDelayInput = document.getElementById('opt-unity-delay');
  var unityAutoPaginateToggle = document.getElementById('opt-unity-auto-paginate');
  var unityPageDelayInput = document.getElementById('opt-unity-page-delay');
  var saveBtn = document.getElementById('btn-save');
  var saveStatus = document.getElementById('save-status');

  async function loadConfig() {
    try {
      var stored = await chrome.storage.sync.get(DEFAULTS);

      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === (stored.preferredLicense || DEFAULTS.preferredLicense);
      }

      delayInput.value = stored.delayBetweenActions || DEFAULTS.delayBetweenActions;
      retriesInput.value = stored.maxRetries != null ? stored.maxRetries : DEFAULTS.maxRetries;
      timeoutInput.value = stored.dialogTimeout || DEFAULTS.dialogTimeout;
      autostartToggle.checked = !!stored.autoStart;
      hideOwnedToggle.checked = stored.hideOwnedAssets !== false;
      claimHistoryToggle.checked = stored.claimHistoryEnabled !== false;
      if (fabAutoClaimToggle) fabAutoClaimToggle.checked = !!stored.fabAutoClaim;

      unityDelayInput.value = stored.unityDelayBetweenProducts || DEFAULTS.unityDelayBetweenProducts;
      unityAutoPaginateToggle.checked = stored.unityAutoPaginate !== false;
      unityPageDelayInput.value = stored.unityDelayBeforeNextPage || DEFAULTS.unityDelayBeforeNextPage;
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  }

  async function saveConfig() {
    var licenseValue = DEFAULTS.preferredLicense;
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) {
        licenseValue = radios[i].value;
        break;
      }
    }

    var cfg = {
      preferredLicense: licenseValue,
      delayBetweenActions: clamp(parseInt(delayInput.value, 10) || DEFAULTS.delayBetweenActions, 500, 10000),
      maxRetries: clamp(parseInt(retriesInput.value, 10) || DEFAULTS.maxRetries, 0, 5),
      dialogTimeout: clamp(parseInt(timeoutInput.value, 10) || DEFAULTS.dialogTimeout, 3000, 30000),
      autoStart: autostartToggle.checked,
      hideOwnedAssets: hideOwnedToggle.checked,
      claimHistoryEnabled: claimHistoryToggle.checked,
      fabAutoClaim: fabAutoClaimToggle ? fabAutoClaimToggle.checked : false,
      unityDelayBetweenProducts: clamp(parseInt(unityDelayInput.value, 10) || DEFAULTS.unityDelayBetweenProducts, 200, 10000),
      unityAutoPaginate: unityAutoPaginateToggle.checked,
      unityDelayBeforeNextPage: clamp(parseInt(unityPageDelayInput.value, 10) || DEFAULTS.unityDelayBeforeNextPage, 3000, 60000)
    };

    try {
      await chrome.storage.sync.set(cfg);
      showSaved();
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function showSaved() {
    saveStatus.classList.add('visible');
    setTimeout(function() {
      saveStatus.classList.remove('visible');
    }, 2000);
  }

  saveBtn.addEventListener('click', saveConfig);

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'sync') return;
    if ('preferredLicense' in changes) {
      var val = changes.preferredLicense.newValue || DEFAULTS.preferredLicense;
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === val;
      }
    }
    if ('delayBetweenActions' in changes) {
      delayInput.value = changes.delayBetweenActions.newValue || DEFAULTS.delayBetweenActions;
    }
    if ('maxRetries' in changes) {
      retriesInput.value = changes.maxRetries.newValue != null ? changes.maxRetries.newValue : DEFAULTS.maxRetries;
    }
    if ('dialogTimeout' in changes) {
      timeoutInput.value = changes.dialogTimeout.newValue || DEFAULTS.dialogTimeout;
    }
    if ('autoStart' in changes) {
      autostartToggle.checked = !!changes.autoStart.newValue;
    }
    if ('hideOwnedAssets' in changes) {
      hideOwnedToggle.checked = changes.hideOwnedAssets.newValue !== false;
    }
    if ('claimHistoryEnabled' in changes) {
      claimHistoryToggle.checked = changes.claimHistoryEnabled.newValue !== false;
    }
    if ('fabAutoClaim' in changes && fabAutoClaimToggle) {
      fabAutoClaimToggle.checked = !!changes.fabAutoClaim.newValue;
    }
    if ('unityDelayBetweenProducts' in changes) {
      unityDelayInput.value = changes.unityDelayBetweenProducts.newValue || DEFAULTS.unityDelayBetweenProducts;
    }
    if ('unityAutoPaginate' in changes) {
      unityAutoPaginateToggle.checked = changes.unityAutoPaginate.newValue !== false;
    }
    if ('unityDelayBeforeNextPage' in changes) {
      unityPageDelayInput.value = changes.unityDelayBeforeNextPage.newValue || DEFAULTS.unityDelayBeforeNextPage;
    }
  });

  loadConfig();

  // ── Premium gating ──────────────────────────────────────────
  if (window.PremiumGate) {
    window.PremiumGate.check();
  }

  var headerPremiumBtn = document.getElementById('header-premium-btn');
  if (headerPremiumBtn) {
    headerPremiumBtn.addEventListener('click', function() {
      if (window.PremiumGate) window.PremiumGate.open();
    });
  }

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg && msg.type === 'PREMIUM_STATUS_UPDATED') {
      if (window.PremiumGate) window.PremiumGate.check();
    }
    if (msg && msg.type === 'OPEN_PREMIUM_MODAL') {
      if (window.PremiumGate) window.PremiumGate.open();
    }
  });

  try {
    var premiumPort = chrome.runtime.connect({ name: 'premium-status' });
    premiumPort.onMessage.addListener(function(msg) {
      if (msg && msg.type === 'PREMIUM_STATUS_UPDATED') {
        if (window.PremiumGate) window.PremiumGate.check();
      }
    });
  } catch (_) {}

  // ── Onboarding ─────────────────────────────────────────────
  var onboardingOverlay = document.getElementById('onboarding-overlay');

  function showOnboarding() {
    if (!onboardingOverlay) return;
    onboardingOverlay.style.display = 'flex';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        onboardingOverlay.classList.add('visible');
      });
    });
  }

  function hideOnboarding() {
    if (!onboardingOverlay) return;
    onboardingOverlay.classList.remove('visible');
    setTimeout(function() {
      onboardingOverlay.style.display = 'none';
    }, 320);
    try {
      chrome.storage.local.set({ onboardingShown: true });
    } catch (_) {}
  }

  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'ONBOARDING_COMPLETE' || e.data.type === 'ONBOARDING_SKIP') {
      hideOnboarding();
    }
    if (e.data.type === 'OPEN_PREMIUM') {
      hideOnboarding();
      setTimeout(function() {
        if (window.PremiumGate) window.PremiumGate.open();
      }, 350);
    }
  });

  try {
    chrome.storage.local.get(['onboardingShown', 'pendingPremiumOpen'], function(result) {
      if (result.pendingPremiumOpen) {
        chrome.storage.local.remove('pendingPremiumOpen');
        if (window.PremiumGate) window.PremiumGate.open();
        return;
      }
      if (!result.onboardingShown) {
        showOnboarding();
      }
    });
  } catch (_) {
    showOnboarding();
  }

  var showOnboardingBtn = document.getElementById('show-onboarding-btn');
  if (showOnboardingBtn) {
    showOnboardingBtn.addEventListener('click', function() {
      showOnboarding();
    });
  }

  window.showOnboarding = showOnboarding;

  // ── Claim History ──────────────────────────────────────
  var HISTORY_KEY = 'fabGrabClaimHistory';
  var _history = [];

  var historySection = document.getElementById('claim-history-section');
  var chTotal = document.getElementById('ch-total');
  var chFab = document.getElementById('ch-fab');
  var chUnity = document.getElementById('ch-unity');
  var chSearch = document.getElementById('ch-search');
  var chList = document.getElementById('ch-list');
  var chClear = document.getElementById('ch-clear');
  var chExport = document.getElementById('ch-export');

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    var d = new Date(timestamp);
    var month = (d.getMonth() + 1).toString();
    var day = d.getDate().toString();
    var h = d.getHours().toString();
    var m = d.getMinutes().toString();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    if (h.length < 2) h = '0' + h;
    if (m.length < 2) m = '0' + m;
    return month + '/' + day + ' ' + h + ':' + m;
  }

  function buildAssetUrl(entry) {
    if (entry.url) return entry.url;
    if (entry.source === 'fab' && entry.id) return 'https://www.fab.com/listings/' + entry.id;
    if (entry.source === 'unity' && entry.id) return 'https://assetstore.unity.com/packages/' + entry.id;
    return null;
  }

  async function loadHistory() {
    try {
      var result = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
      _history = result[HISTORY_KEY] || [];
    } catch (e) {
      _history = [];
    }
    return _history;
  }

  function updateCounters() {
    var stats = { total: _history.length, fab: 0, unity: 0 };
    for (var i = 0; i < _history.length; i++) {
      if (_history[i].source === 'fab') stats.fab++;
      else if (_history[i].source === 'unity') stats.unity++;
    }
    if (chTotal) chTotal.textContent = stats.total;
    if (chFab) chFab.textContent = stats.fab;
    if (chUnity) chUnity.textContent = stats.unity;
  }

  function renderList(searchQuery) {
    if (!chList) return;
    chList.innerHTML = '';

    var query = (searchQuery || '').toLowerCase().trim();
    var filtered = _history;

    if (query) {
      filtered = [];
      for (var i = 0; i < _history.length; i++) {
        if (_history[i].name.toLowerCase().indexOf(query) !== -1) {
          filtered.push(_history[i]);
        }
      }
    }

    if (filtered.length === 0) {
      chList.innerHTML = '<div class="claim-history-empty">' +
        (query ? 'No results for "' + escapeHtml(searchQuery) + '"' : 'No claimed assets yet. Start claiming to build your history.') +
        '</div>';
      return;
    }

    for (var j = 0; j < filtered.length; j++) {
      var entry = filtered[j];
      var url = buildAssetUrl(entry);
      var item = document.createElement(url ? 'a' : 'div');
      item.className = 'claim-history-item';
      if (url) {
        item.href = url;
        item.target = '_blank';
        item.rel = 'noopener';
      }

      var sourceClass = entry.source === 'unity' ? 'unity' : 'fab';
      var sourceLabel = entry.source === 'unity' ? 'Unity' : 'FAB';

      item.innerHTML =
        '<span class="claim-history-item-badge ' + sourceClass + '">' + sourceLabel + '</span>' +
        '<span class="claim-history-item-name">' + escapeHtml(entry.name) + '</span>' +
        '<span class="claim-history-item-date">' + formatDate(entry.claimedAt) + '</span>';

      chList.appendChild(item);
    }
  }

  function setHistoryVisible(enabled) {
    if (historySection) {
      historySection.style.display = enabled ? '' : 'none';
    }
  }

  if (chSearch) {
    var searchTimer;
    chSearch.addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        renderList(chSearch.value);
      }, 200);
    });
    chSearch.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        chSearch.value = '';
        renderList('');
      }
    });
  }

  if (chClear) {
    chClear.addEventListener('click', async function() {
      _history = [];
      try {
        await chrome.storage.local.set({ [HISTORY_KEY]: [] });
      } catch (e) {}
      renderList(chSearch ? chSearch.value : '');
      updateCounters();
    });
  }

  if (chExport) {
    chExport.addEventListener('click', function() {
      var data = JSON.stringify(_history, null, 2);
      var blob = new Blob([data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'fab-grab-claim-history.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area === 'local' && HISTORY_KEY in changes) {
      _history = changes[HISTORY_KEY].newValue || [];
      renderList(chSearch ? chSearch.value : '');
      updateCounters();
    }
    if (area === 'sync' && 'claimHistoryEnabled' in changes) {
      setHistoryVisible(changes.claimHistoryEnabled.newValue !== false);
    }
  });

  loadHistory().then(function() {
    renderList('');
    updateCounters();
    chrome.storage.sync.get({ claimHistoryEnabled: true }).then(function(stored) {
      setHistoryVisible(stored.claimHistoryEnabled !== false);
    });
  });

  // ── Unity Weekly Free Asset ────────────────────────────
  var waLoading = document.getElementById('weekly-asset-loading');
  var waContent = document.getElementById('weekly-asset-content');
  var waError = document.getElementById('weekly-asset-error');
  var waErrorMsg = document.getElementById('weekly-asset-error-msg');
  var waImage = document.getElementById('weekly-asset-image');
  var waSubheading = document.getElementById('weekly-asset-subheading');
  var waName = document.getElementById('weekly-asset-name');
  var waDesc = document.getElementById('weekly-asset-desc');
  var waCodeRow = document.getElementById('weekly-asset-code-row');
  var waCode = document.getElementById('weekly-asset-code');
  var waCopyBtn = document.getElementById('weekly-asset-copy-btn');
  var waDisclaimer = document.getElementById('weekly-asset-disclaimer');
  var waLink = document.getElementById('weekly-asset-link');
  var waRefresh = document.getElementById('weekly-asset-refresh');
  var waRetry = document.getElementById('weekly-asset-retry');

  function showWeeklyState(state) {
    if (waLoading) waLoading.style.display = state === 'loading' ? '' : 'none';
    if (waContent) waContent.style.display = state === 'content' ? '' : 'none';
    if (waError) waError.style.display = state === 'error' ? '' : 'none';
  }

  function renderWeeklyAsset(data) {
    if (waImage && data.image) waImage.src = data.image;
    if (waSubheading) waSubheading.textContent = data.subheading || '';
    if (waName) waName.textContent = data.name || 'Unknown Asset';
    if (waDesc) waDesc.textContent = data.description || '';
    if (waDisclaimer) waDisclaimer.textContent = data.disclaimer || '';

    if (data.couponCode && waCodeRow && waCode) {
      waCodeRow.style.display = '';
      waCode.textContent = data.couponCode;
    } else if (waCodeRow) {
      waCodeRow.style.display = 'none';
    }

    if (waLink && data.url) {
      waLink.href = data.url;
    }

    showWeeklyState('content');
  }

  function fetchAndRender(forceRefresh) {
    showWeeklyState('loading');
    chrome.runtime.sendMessage({ type: 'FETCH_WEEKLY_ASSET', forceRefresh: !!forceRefresh }, function(result) {
      if (chrome.runtime.lastError) {
        if (waErrorMsg) waErrorMsg.textContent = 'Extension communication error.';
        showWeeklyState('error');
        return;
      }
      if (!result) {
        if (waErrorMsg) waErrorMsg.textContent = 'No response from background.';
        showWeeklyState('error');
        return;
      }
      if (result.success && result.data) {
        renderWeeklyAsset(result.data);
      } else {
        if (waErrorMsg) waErrorMsg.textContent = result.error || 'Failed to fetch weekly asset.';
        showWeeklyState('error');
      }
    });
  }

  if (waCopyBtn) {
    waCopyBtn.addEventListener('click', function() {
      var code = waCode ? waCode.textContent : '';
      if (!code) return;
      navigator.clipboard.writeText(code).then(function() {
        waCopyBtn.textContent = 'Copied!';
        waCopyBtn.classList.add('copied');
        setTimeout(function() {
          waCopyBtn.textContent = 'Copy';
          waCopyBtn.classList.remove('copied');
        }, 1500);
      });
    });
  }

  if (waRefresh) {
    waRefresh.addEventListener('click', function() {
      fetchAndRender(true);
    });
  }

  if (waRetry) {
    waRetry.addEventListener('click', function() {
      fetchAndRender(true);
    });
  }

  fetchAndRender(false);

  // ── FAB Monthly Free Assets ──────────────────────────
  var mfLoading = document.getElementById('monthly-free-loading');
  var mfContent = document.getElementById('monthly-free-content');
  var mfError = document.getElementById('monthly-free-error');
  var mfErrorMsg = document.getElementById('monthly-free-error-msg');
  var mfTitle = document.getElementById('monthly-free-title');
  var mfBadge = document.getElementById('monthly-free-badge');
  var mfGrid = document.getElementById('monthly-free-grid');
  var mfRefresh = document.getElementById('monthly-free-refresh');
  var mfRetry = document.getElementById('monthly-free-retry');

  function showMonthlyState(state) {
    if (mfLoading) mfLoading.style.display = state === 'loading' ? '' : 'none';
    if (mfContent) mfContent.style.display = state === 'content' ? '' : 'none';
    if (mfError) mfError.style.display = state === 'error' ? '' : 'none';
  }

  function formatExpiry(dateStr) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      var now = new Date();
      var diff = d.getTime() - now.getTime();
      if (diff <= 0) return 'Expired';
      var days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days > 0) return days + 'd left';
      var hours = Math.floor(diff / (1000 * 60 * 60));
      return hours + 'h left';
    } catch (e) {
      return '';
    }
  }

  function renderMonthlyAssets(data) {
    if (mfTitle) mfTitle.textContent = data.title || 'FAB Limited-Time Free';
    if (mfBadge) mfBadge.textContent = data.assets.length + ' asset' + (data.assets.length !== 1 ? 's' : '');

    if (mfGrid) {
      mfGrid.innerHTML = '';
      var uids = data.assets.map(function(a) { return a.uid; });
      chrome.runtime.sendMessage({ type: 'GET_CLAIMED_STATUS', assetUids: uids }, function(claimedMap) {
        if (chrome.runtime.lastError) claimedMap = {};
        if (!claimedMap) claimedMap = {};

        for (var i = 0; i < data.assets.length; i++) {
          var asset = data.assets[i];
          var isClaimed = !!claimedMap[asset.uid];
          renderAssetCard(asset, isClaimed);
        }
      });
    }

    showMonthlyState('content');
  }

  function renderAssetCard(asset, isClaimed) {
    var item = document.createElement('div');
    item.className = 'monthly-free-item' + (isClaimed ? ' monthly-free-item--claimed' : '');
    item.setAttribute('data-uid', asset.uid);

    var formatsHtml = '';
    if (asset.assetFormats && asset.assetFormats.length) {
      formatsHtml = '<div class="monthly-free-item-formats">';
      for (var j = 0; j < asset.assetFormats.length; j++) {
        formatsHtml += '<span class="monthly-free-item-format">' + escapeHtml(asset.assetFormats[j]) + '</span>';
      }
      formatsHtml += '</div>';
    }

    var expiryText = formatExpiry(asset.discountEndDate);
    var expiryHtml = expiryText
      ? '<span class="monthly-free-item-expiry">' + escapeHtml(expiryText) + '</span>'
      : '';

    var statusHtml = isClaimed
      ? '<span class="monthly-free-item-owned">Saved in My Library</span>'
      : '';

    var claimBtnHtml = isClaimed
      ? '<button class="monthly-free-claim-btn claimed" disabled>Claimed</button>'
      : '<button class="monthly-free-claim-btn" data-uid="' + escapeHtml(asset.uid) + '" data-url="' + escapeHtml(asset.url) + '" data-name="' + escapeHtml(asset.title) + '">Claim Free</button>';

    item.innerHTML =
      '<a class="monthly-free-item-link" href="' + escapeHtml(asset.url) + '" target="_blank" rel="noopener">' +
        '<div class="monthly-free-item-image-wrap">' +
          (asset.image ? '<img src="' + escapeHtml(asset.image) + '" alt="' + escapeHtml(asset.title) + '" loading="lazy">' : '') +
        '</div>' +
        '<div class="monthly-free-item-info">' +
          (asset.sellerName ? '<span class="monthly-free-item-seller">' + escapeHtml(asset.sellerName) + '</span>' : '') +
          '<span class="monthly-free-item-name">' + escapeHtml(asset.title) + '</span>' +
          '<span class="monthly-free-item-desc">' + escapeHtml(asset.description) + '</span>' +
          '<div class="monthly-free-item-meta">' +
            (asset.listingType ? '<span class="monthly-free-item-tag">' + escapeHtml(asset.listingType) + '</span>' : '') +
            formatsHtml +
            expiryHtml +
            statusHtml +
          '</div>' +
        '</div>' +
      '</a>' +
      '<div class="monthly-free-item-actions">' +
        claimBtnHtml +
      '</div>';

    mfGrid.appendChild(item);

    if (!isClaimed) {
      var btn = item.querySelector('.monthly-free-claim-btn');
      if (btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          claimAsset(btn);
        });
      }
    }
  }

  function markButtonClaimed(btn) {
    btn.textContent = 'Claimed';
    btn.disabled = true;
    btn.classList.remove('claiming');
    btn.classList.add('claimed');
    var card = btn.closest('.monthly-free-item');
    if (card) {
      card.classList.add('monthly-free-item--claimed');
      var meta = card.querySelector('.monthly-free-item-meta');
      if (meta && !meta.querySelector('.monthly-free-item-owned')) {
        var owned = document.createElement('span');
        owned.className = 'monthly-free-item-owned';
        owned.textContent = 'Saved in My Library';
        meta.appendChild(owned);
      }
    }
  }

  function claimAsset(btn) {
    var uid = btn.getAttribute('data-uid');
    var url = btn.getAttribute('data-url');
    var name = btn.getAttribute('data-name');
    btn.disabled = true;
    btn.textContent = 'Claiming...';
    btn.classList.add('claiming');

    chrome.runtime.sendMessage({
      type: 'CLAIM_MONTHLY_FREE',
      assetUid: uid,
      assetUrl: url,
      assetName: name
    }, function(result) {
      if (chrome.runtime.lastError || !result || !result.success) {
        btn.disabled = false;
        btn.textContent = 'Claim Free';
        btn.classList.remove('claiming');
        return;
      }
      var checkInterval = setInterval(function() {
        chrome.runtime.sendMessage({ type: 'GET_CLAIMED_STATUS', assetUids: [uid] }, function(map) {
          if (chrome.runtime.lastError) return;
          if (map && map[uid]) {
            clearInterval(checkInterval);
            markButtonClaimed(btn);
          }
        });
      }, 2000);
      setTimeout(function() {
        clearInterval(checkInterval);
        if (!btn.classList.contains('claimed')) {
          markButtonClaimed(btn);
        }
      }, 30000);
    });
  }

  function fetchAndRenderMonthly(forceRefresh) {
    showMonthlyState('loading');
    chrome.runtime.sendMessage({ type: 'FETCH_MONTHLY_FREE', forceRefresh: !!forceRefresh }, function(result) {
      if (chrome.runtime.lastError) {
        if (mfErrorMsg) mfErrorMsg.textContent = 'Extension communication error.';
        showMonthlyState('error');
        return;
      }
      if (!result) {
        if (mfErrorMsg) mfErrorMsg.textContent = 'No response from background.';
        showMonthlyState('error');
        return;
      }
      if (result.success && result.data) {
        renderMonthlyAssets(result.data);
      } else {
        if (mfErrorMsg) mfErrorMsg.textContent = result.error || 'Failed to fetch monthly free assets.';
        showMonthlyState('error');
      }
    });
  }

  if (mfRefresh) {
    mfRefresh.addEventListener('click', function() {
      fetchAndRenderMonthly(true);
    });
  }

  if (mfRetry) {
    mfRetry.addEventListener('click', function() {
      fetchAndRenderMonthly(true);
    });
  }

  fetchAndRenderMonthly(false);
})();
