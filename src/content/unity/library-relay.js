/**
 * Unity library sync relay.
 *
 * The options page cannot reach the Unity GraphQL endpoint directly: it is gated
 * by a _csrf cookie that is domain-locked to assetstore.unity.com. This content
 * script is the only caller in the extension that can mint a same-origin,
 * cookie'd request, so the sync engine routes every page through it.
 *
 * It accepts a pre-built GraphQL document (never a free-form URL) and POSTs it
 * to /api/graphql/batch. Nothing else.
 */
(function () {
  'use strict';

  if (window.__gaarUnityLibraryRelay) return;
  window.__gaarUnityLibraryRelay = true;

  var ENDPOINT = '/api/graphql/batch';

  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'UNITY_LIBRARY_RELAY_FETCH') return false;

    var query = String(msg.query || '');
    if (!query) {
      sendResponse({ ok: false, error: 'empty_query' });
      return false;
    }

    fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Csrf-Token': cookie('_csrf')
      },
      body: JSON.stringify([{ query: query }])
    })
      .then(function (res) {
        if (!res.ok) {
          // A 400 here usually means the server rejected the page size.
          sendResponse({
            ok: false,
            status: res.status,
            badPageSize: res.status === 400,
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
