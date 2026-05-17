(function() {
  'use strict';

  var statusBox = document.getElementById('status-box');
  var statusIndicator = document.getElementById('status-indicator');
  var statusText = document.getElementById('status-text');
  var btnOpenFab = document.getElementById('btn-open-fab');
  var btnOpenUnity = document.getElementById('btn-open-unity');
  var btnOptions = document.getElementById('btn-options');
  var btnPremium = document.getElementById('btn-premium');

  async function checkStatus() {
    try {
      var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setStatus('inactive', 'No active tab');
        return;
      }

      var url = tab.url;
      if (url.indexOf('fab.com') !== -1) {
        setStatus('active', 'Active on FAB');
      } else if (url.indexOf('assetstore.unity.com') !== -1) {
        setStatus('active', 'Active on Unity');
      } else {
        setStatus('inactive', 'Not on a supported site');
      }
    } catch (err) {
      setStatus('inactive', 'Could not check tab');
    }
  }

  function setStatus(type, text) {
    statusIndicator.className = 'status-indicator ' + type;
    statusText.textContent = text;
  }

  async function checkPremium() {
    try {
      var result = await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
      if (result && result.isPremium) {
        btnPremium.classList.add('is-premium');
        btnPremium.querySelector('span').textContent = 'Premium Active';
      }
    } catch (_) {}
  }

  btnOpenFab.addEventListener('click', function() {
    chrome.tabs.create({ url: 'https://www.fab.com/channels/unreal-engine?is_free=1&sort_by=-firstPublishedAt' });
  });

  btnOpenUnity.addEventListener('click', function() {
    chrome.tabs.create({ url: 'https://assetstore.unity.com/?free=true&exclude=true&orderBy=1&rows=96' });
  });

  btnOptions.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  btnPremium.addEventListener('click', function() {
    chrome.storage.local.set({ pendingPremiumOpen: true }, function() {
      chrome.runtime.openOptionsPage();
    });
  });

  checkStatus();
  checkPremium();
})();
