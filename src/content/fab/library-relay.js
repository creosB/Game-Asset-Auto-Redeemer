/**
 * Library sync relay.
 *
 * The options page can normally call the FAB API directly, but if the session
 * cookie is not attached to an extension-origin request we need a genuinely
 * same-origin caller. This content script is that caller, and nothing more.
 *
 * Hard-scoped to /i/library/ so it can never be used as a general-purpose
 * authenticated request proxy.
 */
(function () {
  'use strict';

  if (window.__gaarLibraryRelay) return;
  window.__gaarLibraryRelay = true;

  var ALLOWED_PATH = /^\/i\/library\//;

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'FAB_LIBRARY_RELAY_FETCH') return false;

    var path = String(msg.path || '');
    if (!ALLOWED_PATH.test(path)) {
      sendResponse({ ok: false, error: 'blocked_path' });
      return false;
    }

    fetch(path, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) {
          sendResponse({
            ok: false,
            status: res.status,
            retryAfter: res.headers.get('Retry-After')
          });
          return null;
        }
        return res.json().then(function (json) {
          sendResponse({ ok: true, json: json });
        });
      })
      .catch(function (e) {
        sendResponse({ ok: false, error: e.message || 'relay_error' });
      });

    return true; // async response
  });
})();
