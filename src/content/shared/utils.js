(function() {
  'use strict';
  const ns = (window.__fabGrabber ??= {});

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function log(msg, type) {
    const prefix = '[FAB Auto Redeem]';
    if (type === 'error') console.error(prefix, msg);
    else if (type === 'warn') console.warn(prefix, msg);
    else console.log(prefix, msg);
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

  function isCatalogPage() {
    var path = window.location.pathname;
    if (/^\/listings\/[a-f0-9-]+$/i.test(path)) return false;
    if (/^\/publishers?\//.test(path)) return false;
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
    safeClick: safeClick,
    waitForElement: waitForElement,
    waitForElements: waitForElements,
    retryWithBackoff: retryWithBackoff,
    waitForCondition: waitForCondition,
    isCatalogPage: isCatalogPage,
    debounce: debounce
  };
})();
