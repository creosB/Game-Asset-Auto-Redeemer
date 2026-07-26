(function() {
  'use strict';
  const ns = (window.__fabGrabber ??= {});

  const DEBUG_KEY = 'fabGrabVerboseLogs';

  let _debug = false;
  try {
    _debug = localStorage.getItem(DEBUG_KEY) === '1';
  } catch (_) {}

  function isVerbose() { return _debug; }

  function setVerbose(on) {
    _debug = !!on;
    try {
      if (_debug) localStorage.setItem(DEBUG_KEY, '1');
      else localStorage.removeItem(DEBUG_KEY);
    } catch (_) {}
    return _debug;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Collapse consecutive identical messages. A scan loop that fires the same
  // line 200 times should cost one line, not 200.
  var _lastMsg = null;
  var _lastType = null;
  var _repeats = 0;

  function emit(type, msg) {
    const prefix = '[FAB Auto Redeem]';
    if (type === 'error') console.error(prefix, msg);
    else if (type === 'warn') console.warn(prefix, msg);
    else console.log(prefix, msg);
  }

  function flushRepeats() {
    if (_repeats > 0 && _lastMsg !== null) {
      emit(_lastType, _lastMsg + ' (x' + (_repeats + 1) + ')');
    }
    _lastMsg = null;
    _lastType = null;
    _repeats = 0;
  }

  function log(msg, type) {
    var text = String(msg);
    if (text === _lastMsg && type === _lastType) {
      _repeats++;
      return;
    }
    flushRepeats();
    _lastMsg = text;
    _lastType = type || 'log';
    emit(_lastType, text);
  }

  /** Diagnostic output. Silent unless verbose logging is switched on. */
  function debug(msg, type) {
    if (!_debug) return;
    log(msg, type);
  }

  function safeClick(el, label) {
    if (!el) {
      log('[safeClick] No element provided' + (label ? ' for ' + label : ''), 'warn');
      return false;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.click();
    return true;
  }

  function waitForElement(selector, timeout, root) {
    timeout = timeout || 10000;
    root = root || document;
    return new Promise(function(resolve, reject) {
      var el = root.querySelector(selector);
      if (el) return resolve(el);

      var observer = new MutationObserver(function() {
        var el = root.querySelector(selector);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });

      observer.observe(root.body || root, { childList: true, subtree: true });
      var timer = setTimeout(function() {
        observer.disconnect();
        reject(new Error('Element "' + selector + '" not found within ' + timeout + 'ms'));
      }, timeout);
    });
  }

  function waitForElements(selector, timeout, root) {
    timeout = timeout || 10000;
    root = root || document;
    return new Promise(function(resolve, reject) {
      var els = root.querySelectorAll(selector);
      if (els.length > 0) return resolve(Array.from(els));

      var observer = new MutationObserver(function() {
        var els = root.querySelectorAll(selector);
        if (els.length > 0) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(Array.from(els));
        }
      });

      observer.observe(root.body || root, { childList: true, subtree: true });
      var timer = setTimeout(function() {
        observer.disconnect();
        resolve([]);
      }, timeout);
    });
  }

  async function retryWithBackoff(fn, maxRetries, baseDelay) {
    maxRetries = maxRetries || 2;
    baseDelay = baseDelay || 2000;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries) throw err;
        var delay = baseDelay * Math.pow(2, attempt);
        log('Retry ' + (attempt + 1) + '/' + maxRetries + ' after ' + delay + 'ms: ' + err.message, 'warn');
        await wait(delay);
      }
    }
  }

  function waitForCondition(fn, timeoutMs, intervalMs) {
    intervalMs = intervalMs || 100;
    return new Promise(function(resolve, reject) {
      var result = fn();
      if (result) return resolve(result);

      var elapsed = 0;
      var timer = setInterval(function() {
        elapsed += intervalMs;
        var result = fn();
        if (result) {
          clearInterval(timer);
          resolve(result);
        } else if (elapsed >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('waitForCondition timed out after ' + timeoutMs + 'ms'));
        }
      }, intervalMs);
    });
  }

  // FAB serves localized paths (/de/library, /tr/search). Strip a known locale
  // prefix before matching so the checks below are not silently bypassed.
  var LOCALES = [
    'en', 'de', 'es', 'fr', 'it', 'ru', 'tr', 'ja', 'ko', 'pl', 'pt', 'nl',
    'ar', 'th', 'zh-CN', 'zh-Hans', 'zh-Hant', 'pt-BR', 'es-MX'
  ];

  // Pages that exist on fab.com but never contain claimable catalog cards.
  var NON_CATALOG = /^\/(library|cart|checkout|orders?|downloads?|purchases?|account|settings|profile|messages|notifications|sellers?|publishers?|studio|dashboard|legal|help|support|about|careers|blog)(\/|$)/i;

  function catalogPath() {
    var path = window.location.pathname || '/';
    for (var i = 0; i < LOCALES.length; i++) {
      var prefix = '/' + LOCALES[i];
      if (path === prefix) return '/';
      if (path.indexOf(prefix + '/') === 0) {
        return path.slice(prefix.length) || '/';
      }
    }
    return path;
  }

  function isCatalogPage() {
    var path = catalogPath();
    if (/^\/listings\/[a-f0-9-]+$/i.test(path)) return false;
    if (NON_CATALOG.test(path)) return false;
    return true;
  }

  function debounce(fn, ms) {
    var timer;
    return function() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, ms);
    };
  }

  ns.utils = {
    wait: wait,
    log: log,
    debug: debug,
    isVerbose: isVerbose,
    setVerbose: setVerbose,
    safeClick: safeClick,
    waitForElement: waitForElement,
    waitForElements: waitForElements,
    retryWithBackoff: retryWithBackoff,
    waitForCondition: waitForCondition,
    isCatalogPage: isCatalogPage,
    catalogPath: catalogPath,
    debounce: debounce
  };
})();
