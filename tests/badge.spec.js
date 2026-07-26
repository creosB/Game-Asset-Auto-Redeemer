const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OPTIONS_URL = 'file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html';
const EN_MESSAGES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '_locales', 'en', 'messages.json'), 'utf8')
);

async function installChromeMockForBadge(page, initialLocalStorage) {
  await page.addInitScript((opts) => {
    window.__actionLog = {
      text: null,
      backgroundColor: null,
      textColor: null,
      title: null
    };

    let localStore = opts.localStorage || {};
    let storageListeners = [];

    window.chrome = window.chrome || {};
    window.chrome.storage = window.chrome.storage || {};
    window.chrome.storage.sync = {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve()
    };

    window.chrome.storage.local = {
      get: (keys) => {
        if (!keys) return Promise.resolve(localStore);
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: localStore[keys] });
        }
        if (Array.isArray(keys)) {
          const res = {};
          for (const k of keys) {
            if (k in localStore) res[k] = localStore[k];
          }
          return Promise.resolve(res);
        }
        if (typeof keys === 'object' && keys !== null) {
          const res = {};
          for (const k of Object.keys(keys)) {
            res[k] = (k in localStore) ? localStore[k] : keys[k];
          }
          return Promise.resolve(res);
        }
        return Promise.resolve(localStore);
      },
      set: (patch) => {
        const changes = {};
        for (const k in patch) {
          changes[k] = { oldValue: localStore[k], newValue: patch[k] };
        }
        Object.assign(localStore, patch);
        for (const fn of storageListeners) {
          try { fn(changes, 'local'); } catch (_) {}
        }
        return Promise.resolve();
      }
    };

    window.chrome.storage.onChanged = {
      addListener: (fn) => { storageListeners.push(fn); }
    };

    window.chrome.action = {
      setBadgeText: (arg) => {
        window.__actionLog.text = arg ? arg.text : null;
        return Promise.resolve();
      },
      setBadgeBackgroundColor: (arg) => {
        window.__actionLog.backgroundColor = arg ? arg.color : null;
        return Promise.resolve();
      },
      setBadgeTextColor: (arg) => {
        window.__actionLog.textColor = arg ? arg.color : null;
        return Promise.resolve();
      },
      setTitle: (arg) => {
        window.__actionLog.title = arg ? arg.title : null;
        return Promise.resolve();
      }
    };

    window.chrome.runtime = {
      id: 'test-extension-id',
      sendMessage: (msg, cb) => {
        const res = { ok: true };
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      connect: () => ({ onMessage: { addListener: () => {} }, disconnect: () => {}, postMessage: () => {} }),
      openOptionsPage: () => {},
      lastError: null,
      getURL: (p) => 'chrome-extension://test-extension-id/' + (p || '')
    };

    window.chrome.i18n = {
      getUILanguage: () => 'en',
      getMessage: (key, subs) => {
        const entry = opts.messages[key];
        if (!entry || !entry.message) return '';
        let msg = entry.message;
        if (subs) {
          const arr = Array.isArray(subs) ? subs : [subs];
          for (let i = 0; i < arr.length; i++) {
            msg = msg.split('$' + (i + 1)).join(String(arr[i] != null ? arr[i] : ''));
          }
        }
        return msg;
      }
    };
  }, { messages: EN_MESSAGES, localStorage: initialLocalStorage || {} });
}

/**
 * IMPORTANT LOCKSTEP NOTICE:
 * The function definitions inside runUpdateBadgeInPage (getUnityAssetId, getUnclaimedAssets, updateBadge)
 * execute within page.evaluate as a direct mirror of the background service worker implementation in
 * src/background/service-worker.js (lines 538-630).
 *
 * Any updates or modifications to updateBadge() or getUnityAssetId() in service-worker.js
 * MUST be updated in lockstep here to keep specs synchronized.
 */
async function runUpdateBadgeInPage(page) {
  return page.evaluate(async () => {
    function getUnityAssetId(asset) {
      if (!asset) return null;
      var url = asset.url || '';
      if (url) {
        var cleanUrl = url.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
        if (cleanUrl) return cleanUrl;
      }
      return asset.name ? asset.name.trim().toLowerCase() : null;
    }

    async function getUnclaimedAssets(assets) {
      var storage = await chrome.storage.local.get(['fabMonthlyFreeClaimed', 'fabGrabClaimHistory']);
      var map = storage.fabMonthlyFreeClaimed || {};
      var historyIds = {};
      var history = storage.fabGrabClaimHistory || [];
      for (var h = 0; h < history.length; h++) {
        if (history[h].id) historyIds[history[h].id] = true;
      }
      var unclaimed = [];
      for (var i = 0; i < assets.length; i++) {
        if (!map[assets[i].uid] && !historyIds[assets[i].uid]) {
          unclaimed.push(assets[i]);
        }
      }
      return unclaimed;
    }

    async function updateBadge() {
      try {
        var storage = await chrome.storage.local.get([
          'fabMonthlyFreeCache',
          'unityWeeklyAssetCache',
          'lastSeenUnityAssetId',
          'lastSeenFabAssetIds'
        ]);

        var fabCache = storage.fabMonthlyFreeCache;
        var fabCount = 0;
        if (fabCache && Array.isArray(fabCache.assets)) {
          var unclaimed = await getUnclaimedAssets(fabCache.assets);
          var lastSeenFab = Array.isArray(storage.lastSeenFabAssetIds) ? storage.lastSeenFabAssetIds : [];
          var lastSeenFabMap = {};
          for (var s = 0; s < lastSeenFab.length; s++) {
            lastSeenFabMap[lastSeenFab[s]] = true;
          }
          var newUnclaimed = [];
          for (var f = 0; f < unclaimed.length; f++) {
            if (!lastSeenFabMap[unclaimed[f].uid]) {
              newUnclaimed.push(unclaimed[f]);
            }
          }
          fabCount = newUnclaimed.length;
        }

        var unityCache = storage.unityWeeklyAssetCache;
        var unityCount = 0;
        if (unityCache) {
          var currentUnityId = getUnityAssetId(unityCache);
          var lastSeenId = storage.lastSeenUnityAssetId;
          if (currentUnityId && currentUnityId !== lastSeenId) {
            unityCount = 1;
          }
        }

        var total = fabCount + unityCount;
        var text = '';
        if (total > 9) {
          text = '9+';
        } else if (total > 0) {
          text = String(total);
        }

        await chrome.action.setBadgeText({ text: text });
        await chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
        try {
          await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
        } catch (_) {}

        if (total === 0) {
          var defaultTitle = chrome.i18n.getMessage('manifest_name') || 'Game Asset Auto Redeemer';
          await chrome.action.setTitle({ title: defaultTitle });
        } else {
          var title = '';
          if (fabCount > 0 && unityCount > 0) {
            title = chrome.i18n.getMessage('badge_title_both', [String(fabCount)]) || (fabCount + ' unclaimed FAB free asset(s), 1 new Unity weekly asset');
          } else if (fabCount > 0) {
            title = chrome.i18n.getMessage('badge_title_fab', [String(fabCount)]) || (fabCount + ' unclaimed FAB free asset(s)');
          } else if (unityCount > 0) {
            title = chrome.i18n.getMessage('badge_title_unity') || '1 new Unity weekly asset';
          }
          await chrome.action.setTitle({ title: title });
        }
      } catch (e) {
        console.warn('[Service Worker] Badge update error:', e);
      }
    }

    window.__updateBadge = updateBadge;
    await updateBadge();
    return window.__actionLog;
  });
}

test.describe('updateBadge() functionality specs', () => {

  test('Case 1: No cache produces an empty badge and default title', async ({ page }) => {
    await installChromeMockForBadge(page, {});
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('');
    expect(result.title).toBe('Game Asset Auto Redeemer');
  });

  test('Case 2: Fab-only unclaimed assets produce badge count and Fab title', async ({ page }) => {
    const fabData = {
      fabMonthlyFreeCache: {
        assets: [
          { uid: 'fab-asset-1', title: 'Asset 1' },
          { uid: 'fab-asset-2', title: 'Asset 2' }
        ]
      }
    };
    await installChromeMockForBadge(page, fabData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('2');
    expect(result.title).toBe('2 unclaimed FAB free asset(s)');
  });

  test('Case 3: Unity-new-only asset produces badge count 1 and Unity title', async ({ page }) => {
    const unityData = {
      unityWeeklyAssetCache: {
        name: 'Unity Asset Pro',
        url: 'https://assetstore.unity.com/packages/3d/env/fantasy-village-12345?aid=1011'
      },
      lastSeenUnityAssetId: 'https://assetstore.unity.com/packages/3d/env/old-asset-99999'
    };
    await installChromeMockForBadge(page, unityData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('1');
    expect(result.title).toBe('1 new Unity weekly asset');
  });

  test('Case 4: Both Fab unclaimed and Unity new produce total count and combined title', async ({ page }) => {
    const combinedData = {
      fabMonthlyFreeCache: {
        assets: [
          { uid: 'fab-asset-1', title: 'Asset 1' },
          { uid: 'fab-asset-2', title: 'Asset 2' }
        ]
      },
      unityWeeklyAssetCache: {
        name: 'Unity Asset Pro',
        url: 'https://assetstore.unity.com/packages/3d/env/fantasy-village-12345'
      },
      lastSeenUnityAssetId: null
    };
    await installChromeMockForBadge(page, combinedData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('3');
    expect(result.title).toBe('2 unclaimed FAB free asset(s), 1 new Unity weekly asset');
  });

  test('Case 5: All-claimed assets produce empty badge (never "0") and default title', async ({ page }) => {
    const allClaimedData = {
      fabMonthlyFreeCache: {
        assets: [
          { uid: 'claimed-1', title: 'Asset 1' },
          { uid: 'claimed-2', title: 'Asset 2' }
        ]
      },
      fabMonthlyFreeClaimed: {
        'claimed-1': Date.now(),
        'claimed-2': Date.now()
      },
      unityWeeklyAssetCache: {
        name: 'Seen Unity Asset',
        url: 'https://assetstore.unity.com/packages/3d/env/fantasy-village-12345'
      },
      lastSeenUnityAssetId: 'https://assetstore.unity.com/packages/3d/env/fantasy-village-12345'
    };
    await installChromeMockForBadge(page, allClaimedData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('');
    expect(result.text).not.toBe('0');
    expect(result.title).toBe('Game Asset Auto Redeemer');
  });

  test('Assert 9+ cap with 12 fixture assets', async ({ page }) => {
    const twelveAssets = Array.from({ length: 12 }, (_, i) => ({
      uid: 'fab-asset-' + i,
      title: 'Asset ' + i
    }));
    const capData = {
      fabMonthlyFreeCache: {
        assets: twelveAssets
      }
    };
    await installChromeMockForBadge(page, capData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('9+');
    expect(result.title).toBe('12 unclaimed FAB free asset(s)');
  });

  test('Seen-marker suppresses the FAB count when all assets are marked seen', async ({ page }) => {
    const seenData = {
      fabMonthlyFreeCache: {
        assets: [
          { uid: 'fab-asset-1', title: 'Asset 1' },
          { uid: 'fab-asset-2', title: 'Asset 2' }
        ]
      },
      lastSeenFabAssetIds: ['fab-asset-1', 'fab-asset-2']
    };
    await installChromeMockForBadge(page, seenData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('');
    expect(result.title).toBe('Game Asset Auto Redeemer');
  });

  test('A new FAB UID re-triggers the badge even if older UIDs were seen', async ({ page }) => {
    const newUidData = {
      fabMonthlyFreeCache: {
        assets: [
          { uid: 'fab-asset-1', title: 'Asset 1' },
          { uid: 'fab-asset-2', title: 'Asset 2' },
          { uid: 'fab-asset-3', title: 'New Asset 3' }
        ]
      },
      lastSeenFabAssetIds: ['fab-asset-1', 'fab-asset-2']
    };
    await installChromeMockForBadge(page, newUidData);
    await page.goto(OPTIONS_URL);
    const result = await runUpdateBadgeInPage(page);

    expect(result.text).toBe('1');
    expect(result.title).toBe('1 unclaimed FAB free asset(s)');
  });

  test('Storage-change listener recomputes badge when watched keys change', async ({ page }) => {
    await installChromeMockForBadge(page, {});
    await page.goto(OPTIONS_URL);
    await runUpdateBadgeInPage(page);

    // Register debounced listener in page
    await page.evaluate(() => {
      let debounceTimer = null;
      const watched = [
        'fabMonthlyFreeClaimed',
        'fabGrabClaimHistory',
        'fabMonthlyFreeCache',
        'unityWeeklyAssetCache',
        'lastSeenFabAssetIds',
        'lastSeenUnityAssetId'
      ];
      window.chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (watched.some(k => k in changes)) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            window.__updateBadge();
          }, 50);
        }
      });
    });

    // Mutate storage
    await page.evaluate(() => {
      return window.chrome.storage.local.set({
        fabMonthlyFreeCache: {
          assets: [{ uid: 'new-fab-asset', title: 'Dynamic Asset' }]
        }
      });
    });

    // Wait for debounced listener to execute
    await page.waitForTimeout(150);

    const log = await page.evaluate(() => window.__actionLog);
    expect(log.text).toBe('1');
    expect(log.title).toBe('1 unclaimed FAB free asset(s)');
  });

});
