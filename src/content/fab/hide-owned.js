(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var config = ns.config;

  var _observer = null;
  var _hiddenCount = 0;
  var _processed = new WeakSet();
  var _active = false;
  var _STYLE_ID = 'fab-grab-hide-owned-style';

  function injectStyle() {
    if (document.getElementById(_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = _STYLE_ID;
    style.textContent = '.fab-grab-hidden-owned { display: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    var s = document.getElementById(_STYLE_ID);
    if (s) s.parentNode.removeChild(s);
  }

  function isSavedInLibrary(card) {
    var ap = ns.assetProcessor;
    if (ap && ap.isAlreadyOwned) return ap.isAlreadyOwned(card);

    var successEls = card.querySelectorAll(
      '.fabkit-Typography-root[class*="intent-success"], [class*="intent-success"]'
    );
    for (var i = 0; i < successEls.length; i++) {
      if (successEls[i].textContent.indexOf('Saved in My Library') !== -1) return true;
    }

    var checkIcons = card.querySelectorAll('i.edsicon-check-circle-filled, i[class*="check-circle"]');
    for (var j = 0; j < checkIcons.length; j++) {
      var parent = checkIcons[j].closest('div');
      if (parent && parent.textContent.indexOf('Saved in My Library') !== -1) return true;
    }

    var leafEls = card.querySelectorAll('div, span, p');
    for (var k = 0; k < leafEls.length; k++) {
      var t = leafEls[k];
      if (t.children.length === 0 && t.textContent.indexOf('Saved in My Library') !== -1) return true;
    }

    return false;
  }

  function findCardContainers() {
    var links = document.querySelectorAll('a[href*="/listings/"]');
    var cards = [];
    var seen = new Set();

    for (var i = 0; i < links.length; i++) {
      var node = links[i].parentElement;
      while (node && node !== document.body) {
        if (node.querySelector('.fabkit-Thumbnail-root')) {
          if (!seen.has(node)) {
            seen.add(node);
            cards.push(node);
          }
          break;
        }
        node = node.parentElement;
      }
    }

    return cards;
  }

  function processCard(card) {
    if (_processed.has(card)) return;
    _processed.add(card);

    if (!utils.isCatalogPage()) return;

    if (isSavedInLibrary(card)) {
      card.classList.add('fab-grab-hidden-owned');
      _hiddenCount++;
    }
  }

  function processNewNodes(addedNodes) {
    if (!utils.isCatalogPage()) return;
    for (var i = 0; i < addedNodes.length; i++) {
      var node = addedNodes[i];
      if (node.nodeType !== 1) continue;

      if (node.querySelector && node.querySelector('a[href*="/listings/"]')) {
        var cards = findCardContainers();
        for (var j = 0; j < cards.length; j++) {
          processCard(cards[j]);
        }
      }
    }
  }

  function scanAll() {
    if (!utils.isCatalogPage()) return;
    _processed = new WeakSet();
    _hiddenCount = 0;
    var cards = findCardContainers();
    for (var i = 0; i < cards.length; i++) {
      processCard(cards[i]);
    }
  }

  function startObserver() {
    if (_observer) return;

    _observer = new MutationObserver(function(mutations) {
      if (!_active) return;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
          processNewNodes(mutations[i].addedNodes);
        }
      }
    });

    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
  }

  function showAll() {
    var hidden = document.querySelectorAll('.fab-grab-hidden-owned');
    for (var i = 0; i < hidden.length; i++) {
      hidden[i].classList.remove('fab-grab-hidden-owned');
    }
    _hiddenCount = 0;
  }

  function start() {
    if (_active) return;
    _active = true;
    injectStyle();
    scanAll();
    startObserver();
    window.addEventListener('fab:navigation', function() {
      if (_active && utils.isCatalogPage()) {
        scanAll();
      }
    });
    utils.log('[HideOwned] Active. Hidden ' + _hiddenCount + ' owned asset(s).');
  }

  function stop() {
    if (!_active) return;
    _active = false;
    stopObserver();
    showAll();
    removeStyle();
    utils.log('[HideOwned] Stopped. Restored all hidden assets.');
  }

  function toggle() {
    if (_active) stop(); else start();
    return _active;
  }

  function isActive() { return _active; }
  function getHiddenCount() { return _hiddenCount; }

  if (config.hideOwnedAssets) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(start, 500); });
    } else {
      setTimeout(start, 500);
    }
  }

  try {
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area !== 'sync' || !changes.hideOwnedAssets) return;
      var newValue = changes.hideOwnedAssets.newValue;
      if (newValue && !_active) start();
      else if (!newValue && _active) stop();
    });
  } catch (e) {}

  ns.hideOwned = {
    start: start,
    stop: stop,
    toggle: toggle,
    isActive: isActive,
    getHiddenCount: getHiddenCount,
    scanAll: scanAll
  };
})();
