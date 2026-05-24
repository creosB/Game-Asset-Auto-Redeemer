(function() {
  'use strict';
  var ns = (window.__fabGrabber ??= {});
  var _messages = null;

  function getMessage(key, subs) {
    if (_messages && _messages[key]) {
      var msg = _messages[key].message || '';
      if (subs && subs.length) {
        for (var i = 0; i < subs.length; i++) {
          msg = msg.replace('$' + (i + 1), subs[i] || '');
        }
      }
      return msg;
    }
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        return chrome.i18n.getMessage(key, subs);
      }
    } catch (e) {
      console.warn('[i18n] Extension context invalidated, using fallback key:', key);
    }
    return key;
  }

  function t(key) {
    if (!key) return '';
    var subs = [];
    for (var i = 1; i < arguments.length; i++) subs.push(arguments[i]);
    var msg = getMessage(key, subs);
    return msg || key;
  }

  function localizeDocument() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-i18n');
      var msg = getMessage(key);
      if (msg) {
        if (el.hasAttribute('data-i18n-html')) {
          el.innerHTML = msg;
        } else {
          el.textContent = msg;
        }
      }
    }

    var phNodes = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < phNodes.length; j++) {
      var phEl = phNodes[j];
      var phKey = phEl.getAttribute('data-i18n-placeholder');
      var phMsg = getMessage(phKey);
      if (phMsg) phEl.placeholder = phMsg;
    }

    var titleNodes = document.querySelectorAll('[data-i18n-title]');
    for (var k = 0; k < titleNodes.length; k++) {
      var tEl = titleNodes[k];
      var tKey = tEl.getAttribute('data-i18n-title');
      var tMsg = getMessage(tKey);
      if (tMsg) tEl.title = tMsg;
    }
  }

  function _tryLoadFirstAvailable(candidates, callback) {
    if (!candidates || !candidates.length) {
      _messages = null;
      console.log('[i18n] No locale candidates matched — using chrome.i18n fallback');
      if (callback) callback();
      return;
    }
    var lang = candidates[0];
    var url = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        url = chrome.runtime.getURL('_locales/' + lang + '/messages.json');
      }
    } catch (e) {
      console.warn('[i18n] Failed to get URL for locale candidate due to context invalidation:', e);
    }

    if (!url) {
      _messages = null;
      if (callback) callback();
      return;
    }

    fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        _messages = data;
        console.log('[i18n] Auto mode loaded locale "' + lang + '":', Object.keys(_messages).length, 'keys');
        if (callback) callback();
      })
      .catch(function() {
        // Try next candidate
        _tryLoadFirstAvailable(candidates.slice(1), callback);
      });
  }

  function loadLocale(lang, callback) {
    if (!lang || lang === 'auto') {
      var uiLang = 'en';
      try {
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
          uiLang = chrome.i18n.getUILanguage() || 'en';
        }
      } catch (e) {
        console.warn('[i18n] Failed to get UI language due to context invalidation:', e);
      }
      var normalized = uiLang.replace('-', '_');
      var candidates = [normalized];
      if (normalized.indexOf('_') !== -1) {
        candidates.push(normalized.split('_')[0]);
      }
      console.log('[i18n] Auto mode — browser language:', uiLang, '→ candidates:', candidates);
      _tryLoadFirstAvailable(candidates, callback);
      return;
    }
    var url = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        url = chrome.runtime.getURL('_locales/' + lang + '/messages.json');
      }
    } catch (e) {
      console.warn('[i18n] Failed to get URL for locale due to context invalidation:', e);
    }

    if (!url) {
      _messages = null;
      if (callback) callback();
      return;
    }

    fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' loading locale ' + lang);
        return res.json();
      })
      .then(function(data) {
        _messages = data;
        if (callback) callback();
      })
      .catch(function(err) {
        console.error('[i18n] loadLocale failed for "' + lang + '":', err);
        _messages = null;
        if (callback) callback();
      });
  }

  ns.i18n = { t: t, localizeDocument: localizeDocument, loadLocale: loadLocale, getMessage: getMessage, _ready: false };

  // Listen for language changes from options page
  try {
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area === 'sync' && changes.selectedLanguage) {
        var newLang = changes.selectedLanguage.newValue || 'auto';
        console.log('[i18n] Language changed to:', newLang);
        loadLocale(newLang, function() {
          localizeDocument();
          document.dispatchEvent(new CustomEvent('i18n-locale-changed'));
        });
      }
    });
  } catch (e) {
    console.error('[i18n] storage.onChanged listener failed:', e);
  }

  function init() {
    try {
      chrome.storage.sync.get({ selectedLanguage: 'auto' }, function(stored) {
        var lang = stored.selectedLanguage || 'auto';
        console.log('[i18n] init — selectedLanguage:', lang);
        loadLocale(lang, function() {
          console.log('[i18n] loadLocale done — _messages:', _messages ? Object.keys(_messages).length + ' keys' : 'null (using chrome.i18n fallback)');
          localizeDocument();
          ns.i18n._ready = true;
          document.dispatchEvent(new CustomEvent('i18n-ready'));
        });
      });
    } catch (e) {
      console.error('[i18n] init failed:', e);
      localizeDocument();
      ns.i18n._ready = true;
      document.dispatchEvent(new CustomEvent('i18n-ready'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
