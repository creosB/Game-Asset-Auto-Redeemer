import { fetchWeeklyAsset } from './unity-weekly-asset.js';
import { fetchMonthlyFree, autoCheck, markAssetClaimed, isAssetClaimed, getUnclaimedAssets } from './fab-monthly-free.js';
import { STORAGE_KEY_PREFIX, MAX_ATTEMPTS, ATTEMPT_WINDOW_MS, isValidEmail, isValidCode, toSortedObject } from '../premium/premium-shared.js';

var activeTabs = new Map();
var claimTabs = new Map();

// ── Premium: HMAC secret & signing ─────────────────────────────
var PREMIUM_SECRET_STORAGE_KEY = 'premium_hmac_secret_v1';

async function getPremiumSecret() {
  var data = await chrome.storage.local.get(PREMIUM_SECRET_STORAGE_KEY);
  var secret = data[PREMIUM_SECRET_STORAGE_KEY];
  if (!secret) {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    secret = Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    await chrome.storage.local.set({ [PREMIUM_SECRET_STORAGE_KEY]: secret });
  }
  return secret;
}

var textEncoder = new TextEncoder();
async function premiumHmacSign(key, message) {
  var cryptoKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(message));
  return Array.from(new Uint8Array(signature)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ── Premium: Port-based broadcast ──────────────────────────────
var premiumPorts = [];

try {
  chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === 'premium-status') {
      premiumPorts.push(port);
      port.onDisconnect.addListener(function() {
        var idx = premiumPorts.indexOf(port);
        if (idx > -1) premiumPorts.splice(idx, 1);
      });
    }
  });
} catch (_) {}

function broadcastPremiumUpdate() {
  premiumPorts.forEach(function(p) {
    try { p.postMessage({ type: 'PREMIUM_STATUS_UPDATED' }); } catch (_) {}
  });
}

// ── Premium: Validate via LemonSqueezy API ─────────────────────
async function handlePremiumCheck(payload) {
  var email = payload.email;
  var code = payload.code;

  if (!email || !code) return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_missing') || 'Missing email or code' };
  if (!isValidEmail(email)) return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_invalid_email') || 'Invalid email' };
  if (!isValidCode(code)) return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_invalid_key') || 'Invalid license key format' };

  var key = '' + STORAGE_KEY_PREFIX + email;
  var storedData = await chrome.storage.local.get(key);
  var existing = storedData[key] || {};
  var attempts = Array.isArray(existing.attempts) ? existing.attempts : [];

  var now = Date.now();
  var recent = attempts.filter(function(t) { return now - t < ATTEMPT_WINDOW_MS; });
  if (recent.length >= MAX_ATTEMPTS) {
    return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_too_many') || 'Too many attempts' };
  }

  try {
    var resp = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ license_key: code })
    });

    if (!resp.ok) {
      return { success: false, isPremium: false, error: chrome.i18n.getMessage('error_network') || 'Network error' };
    }
    var data = await resp.json();
    if (!data || typeof data.valid !== 'boolean') {
      return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_api_response') || 'Unexpected API response' };
    }

    if (!data.valid) {
      var baseData = { isPremium: false, email: email, lastChecked: now, checkPeriodDays: existing.checkPeriodDays || 7, attempts: recent.concat([now]) };
      var sortedData = toSortedObject(baseData);
      var secret = await getPremiumSecret();
      var signature = await premiumHmacSign(secret, JSON.stringify(sortedData));
      await chrome.storage.local.set({ [key]: Object.assign({}, sortedData, { signature: signature }) });
      broadcastPremiumUpdate();
      return { success: true, isPremium: false };
    }

    if (data.meta && data.meta.customer_email && data.meta.customer_email.toLowerCase() !== email.toLowerCase()) {
      return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_mismatch') || 'Email and license key mismatch' };
    }

    var checkPeriodDays = 7;
    if (data.license_key && data.license_key.expires_at) {
      var exp = Date.parse(data.license_key.expires_at);
      if (!isNaN(exp) && exp > now) {
        checkPeriodDays = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
      }
    }

    var successBase = { isPremium: true, email: email, lastChecked: now, checkPeriodDays: checkPeriodDays, attempts: recent.concat([now]) };
    var successSorted = toSortedObject(successBase);
    var successSecret = await getPremiumSecret();
    var successSignature = await premiumHmacSign(successSecret, JSON.stringify(successSorted));
    await chrome.storage.local.set({ [key]: Object.assign({}, successSorted, { signature: successSignature }) });
    broadcastPremiumUpdate();
    return { success: true, isPremium: true, checkPeriodDays: checkPeriodDays };
  } catch (e) {
    return { success: false, isPremium: false, error: chrome.i18n.getMessage('premium_error_check_failed') || 'Failed to check premium status' };
  }
}

async function handlePremiumGet() {
  var all = await chrome.storage.local.get(null);
  for (var k in all) {
    if (k.indexOf(STORAGE_KEY_PREFIX) === 0) {
      var stored = all[k];
      if (stored && stored.signature) {
        var signature = stored.signature;
        var toVerify = Object.assign({}, stored);
        delete toVerify.signature;
        var sorted = toSortedObject(toVerify);
        var secret = await getPremiumSecret();
        var expected = await premiumHmacSign(secret, JSON.stringify(sorted));
        if (expected === signature) {
          return { success: true, isPremium: !!stored.isPremium };
        } else {
          await chrome.storage.local.remove(k);
          return { success: false, error: chrome.i18n.getMessage('premium_error_integrity') || 'Data integrity check failed' };
        }
      } else if (stored) {
        await chrome.storage.local.remove(k);
        return { success: false, error: chrome.i18n.getMessage('premium_error_integrity') || 'Data integrity check failed' };
      }
    }
  }
  return { success: true, isPremium: undefined };
}

function handlePremiumClear(email) {
  var key = '' + STORAGE_KEY_PREFIX + email;
  chrome.storage.local.get(key, function(data) {
    if (data[key]) {
      var upd = Object.assign({}, data[key], { attempts: [] });
      chrome.storage.local.set({ [key]: upd });
    }
  });
}

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'src/options/options.html' });
    autoCheck().catch(function() {});
  }
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'FETCH_WEEKLY_ASSET') {
    fetchWeeklyAsset(!!message.forceRefresh).then(function(result) {
      sendResponse(result);
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }

  if (message.type === 'FETCH_MONTHLY_FREE') {
    fetchMonthlyFree(!!message.forceRefresh).then(function(result) {
      sendResponse(result);
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message || 'Unknown error' });
    });
    return true;
  }

  if (message.type === 'CLAIM_MONTHLY_FREE') {
    var assetUid = message.assetUid;
    var assetUrl = message.assetUrl;
    var assetName = message.assetName || 'Unknown';
    if (!assetUrl) {
      sendResponse({ success: false, error: chrome.i18n.getMessage('error_no_url') || 'No URL provided' });
      return false;
    }
    markAssetClaimed(assetUid).catch(function() {});
    chrome.tabs.create({ url: assetUrl, active: false }, function(tab) {
      claimTabs.set(tab.id, {
        assetUid: assetUid,
        assetName: assetName,
        startTime: Date.now()
      });
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  }

  if (message.type === 'MONTHLY_FREE_CLAIMED') {
    var claimUid = message.assetUid;
    if (claimUid) {
      markAssetClaimed(claimUid).catch(function() {});
      try {
        chrome.notifications.create('fab-claimed-' + Date.now(), {
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: chrome.i18n.getMessage('notif_claimed_title') || 'FAB Asset Claimed',
          message: chrome.i18n.getMessage('notif_claimed_message', [message.assetName || 'Asset']) || (message.assetName || 'Asset') + ' added to your library!',
          priority: 1
        });
      } catch (e) {}
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_CLAIMED_STATUS') {
    var uids = message.assetUids || [];
    var results = {};
    var pending = uids.length;
    if (pending === 0) {
      sendResponse(results);
      return false;
    }
    for (var ci = 0; ci < uids.length; ci++) {
      (function(uid) {
        isAssetClaimed(uid).then(function(claimed) {
          results[uid] = claimed;
          pending--;
          if (pending === 0) sendResponse(results);
        }).catch(function() {
          results[uid] = false;
          pending--;
          if (pending === 0) sendResponse(results);
        });
      })(uids[ci]);
    }
    return true;
  }

  var tabId = sender.tab && sender.tab.id;
  if (!tabId) return false;

  if (message.type === 'PROCESSING_STARTED') {
    activeTabs.set(tabId, {
      site: message.site || 'unknown',
      url: sender.tab.url,
      startTime: Date.now()
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'PROCESSING_COMPLETE') {
    var info = activeTabs.get(tabId);
    activeTabs.delete(tabId);

    if (claimTabs.has(tabId)) {
      var claimInfo = claimTabs.get(tabId);
      claimTabs.delete(tabId);
      if (claimInfo.assetUid) {
        markAssetClaimed(claimInfo.assetUid).catch(function() {});
        try {
          chrome.notifications.create('fab-claimed-' + Date.now(), {
            type: 'basic',
            iconUrl: 'icons/icon-128.png',
            title: chrome.i18n.getMessage('notif_claimed_title') || 'FAB Asset Claimed',
            message: chrome.i18n.getMessage('notif_claimed_message', [claimInfo.assetName || 'Asset']) || (claimInfo.assetName || 'Asset') + ' added to your library!',
            priority: 1
          });
        } catch (e) {}
      }
    }

    var siteName = (info && info.site === 'unity') ? 'Unity' : 'FAB';
    var summary = message.summary || 'Processing finished.';

    try {
      chrome.notifications.create('grab-complete-' + tabId, {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: chrome.i18n.getMessage('notif_complete_title', [siteName]) || siteName + ' Auto Redeem Complete',
        message: summary,
        priority: 2,
        requireInteraction: true
      });
    } catch (e) {
      console.error('[Service Worker] Notification error:', e);
    }

    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'PROCESSING_STOPPED') {
    activeTabs.delete(tabId);
    claimTabs.delete(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'PROCESSING_ERROR') {
    var errInfo = activeTabs.get(tabId);
    activeTabs.delete(tabId);
    claimTabs.delete(tabId);

    var errSiteName = (errInfo && errInfo.site === 'unity') ? 'Unity' : 'FAB';

    try {
      chrome.notifications.create('grab-error-' + tabId, {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: chrome.i18n.getMessage('notif_error_title', [errSiteName]) || errSiteName + ' Auto Redeem Error',
        message: message.error || chrome.i18n.getMessage('notif_error_default') || 'An error occurred during processing.',
        priority: 2,
        requireInteraction: true
      });
    } catch (e) {
      console.error('[Service Worker] Notification error:', e);
    }

    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'KEEP_ALIVE') {
    sendResponse({ ok: true, active: activeTabs.has(tabId) });
    return false;
  }

  return false;
});

// ── Premium message handling ────────────────────────────────────
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (!message || !message.type) return false;

  if (message.type === 'CHECK_PREMIUM_STATUS') {
    handlePremiumCheck(message.payload || {}).then(function(result) {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'GET_PREMIUM_STATUS') {
    handlePremiumGet().then(function(result) {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'CLEAR_ATTEMPTS') {
    handlePremiumClear((message.payload || {}).email);
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'OPEN_PREMIUM_MODAL') {
    chrome.runtime.sendMessage({ type: 'OPEN_PREMIUM_MODAL' }).catch(function() {});
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  if (activeTabs.has(tabId)) {
    activeTabs.delete(tabId);
  }
  if (claimTabs.has(tabId)) {
    claimTabs.delete(tabId);
  }
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (activeTabs.has(tabId) && changeInfo.url) {
    var info = activeTabs.get(tabId);
    var url = changeInfo.url;
    var isFab = url.indexOf('fab.com') !== -1;
    var isUnity = url.indexOf('assetstore.unity.com') !== -1;

    if (!isFab && !isUnity) {
      activeTabs.delete(tabId);
    }
  }
});

var FAB_MONTHLY_CHECK_ALARM = 'fab-monthly-free-check';

chrome.alarms.create(FAB_MONTHLY_CHECK_ALARM, {
  periodInMinutes: 6 * 60
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === FAB_MONTHLY_CHECK_ALARM) {
    chrome.storage.sync.get({ fabAutoClaim: false }, function(cfg) {
      autoCheck().then(function(result) {
        if (result && result.success && result.data) {
          try {
            chrome.notifications.create('fab-monthly-free-' + Date.now(), {
              type: 'basic',
              iconUrl: 'icons/icon-128.png',
              title: chrome.i18n.getMessage('notif_monthly_title') || 'FAB Free Assets Available',
              message: chrome.i18n.getMessage('notif_monthly_message', [result.data.title, String(result.data.assets.length)]) || result.data.title + ' — ' + result.data.assets.length + ' free asset(s) this month!',
              priority: 1
            });
          } catch (e) {}
          if (cfg.fabAutoClaim) {
            autoClaimAssets(result.data.assets);
          }
        }
      }).catch(function() {});
    });
  }
});

function autoClaimAssets(assets) {
  if (!assets || !assets.length) return;
  getUnclaimedAssets(assets).then(function(unclaimed) {
    for (var i = 0; i < unclaimed.length; i++) {
      (function(asset, delay) {
        setTimeout(function() {
          chrome.tabs.create({ url: asset.url, active: false }, function(tab) {
            claimTabs.set(tab.id, {
              assetUid: asset.uid,
              assetName: asset.title,
              startTime: Date.now()
            });
          });
        }, delay);
      })(unclaimed[i], i * 5000);
    }
  }).catch(function() {});
}
