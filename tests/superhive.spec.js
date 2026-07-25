const { test, expect } = require('@playwright/test');

const OPTIONS_URL = 'file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html';

// Minimal chrome.* mock sufficient for options.js + popup.js to boot without
// a real extension runtime. Modeled on the mock used in fab-monthly-free.spec.js.
function installChromeMock(page, overrides) {
  return page.addInitScript((o) => {
    window.chrome = window.chrome || {};
    window.chrome.storage = window.chrome.storage || {};
    const syncStore = {};
    window.chrome.storage.sync = {
      get: (keys) => {
        const out = {};
        const want = (typeof keys === 'object' && keys !== null) ? Object.keys(keys) : null;
        if (want) {
          for (const k of want) out[k] = (k in syncStore) ? syncStore[k] : keys[k];
        } else if (keys) {
          out[keys] = syncStore[keys];
        }
        return Promise.resolve(out);
      },
      set: (patch) => {
        Object.assign(syncStore, patch);
        return Promise.resolve();
      }
    };
    window.chrome.storage.local = {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve()
    };
    window.chrome.storage.onChanged = { addListener: () => {} };
    window.chrome.permissions = {
      contains: (opts, cb) => {
        const res = true;
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      request: (opts, cb) => {
        const res = true;
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      remove: (opts, cb) => {
        const res = true;
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      onRemoved: { addListener: () => {} }
    };
    window.chrome.runtime = {
      id: 'test-extension-id',
      sendMessage: (msg, cb) => {
        if (msg && msg.type === 'FETCH_MONTHLY_FREE') {
          (cb || (() => {}))({ success: false, error: 'skip' });
        } else if (msg && msg.type === 'FETCH_WEEKLY_ASSET') {
          (cb || (() => {}))({ success: false, error: 'skip' });
        } else if (msg && msg.type === 'GET_CLAIMED_STATUS') {
          (cb || (() => {}))({});
        } else if (msg && msg.type === 'GET_PREMIUM_STATUS') {
          (cb || (() => {}))({ isPremium: false });
        } else if (msg && msg.type === 'SUPERHIVE_PERMISSION_STATUS') {
          (cb || (() => {}))({ granted: true });
        } else if (msg && msg.type === 'SUPERHIVE_REQUEST_PERMISSION') {
          (cb || (() => {}))({ granted: true });
        } else {
          (cb || (() => {}))({ ok: true });
        }
      },
      connect: () => ({ onMessage: { addListener: () => {} }, disconnect: () => {}, postMessage: () => {} }),
      openOptionsPage: () => {},
      lastError: null,
      getURL: (p) => 'chrome-extension://test-extension-id/' + (p || ''),
      getMessage: (k) => (o && o.fallbackMessages && o.fallbackMessages[k]) || null
    };
    window.chrome.i18n = {
      getUILanguage: () => 'en',
      getMessage: window.chrome.runtime.getMessage
    };
  }, overrides || {});
}

test.describe('Superhive — options page section', () => {
  test.beforeEach(async ({ page }) => {
    await installChromeMock(page);
  });

  test('Superhive section exists with all expected fields', async ({ page }) => {
    await page.goto(OPTIONS_URL);

    const title = page.locator('.section-title', { hasText: 'Superhive (Blender Market)' });
    await expect(title).toBeVisible();

    for (const id of [
      '#opt-superhive-enable', '#opt-superhive-free-only', '#opt-superhive-endless',
      '#opt-superhive-hide-non-free', '#opt-superhive-delay',
      '#opt-superhive-page-delay', '#opt-superhive-retries'
    ]) {
      await expect(page.locator(id)).toBeAttached();
    }
  });

  test('Superhive defaults load into the form', async ({ page }) => {
    await page.goto(OPTIONS_URL);
    await expect(page.locator('#opt-superhive-enable')).toBeChecked();
    await expect(page.locator('#opt-superhive-free-only')).toBeChecked();
    await expect(page.locator('#opt-superhive-endless')).not.toBeChecked();
    await expect(page.locator('#opt-superhive-hide-non-free')).not.toBeChecked();
    await expect(page.locator('#opt-superhive-delay')).toHaveValue('1200');
    await expect(page.locator('#opt-superhive-page-delay')).toHaveValue('700');
    await expect(page.locator('#opt-superhive-retries')).toHaveValue('4');
  });

  test('save persists Superhive config into chrome.storage.sync', async ({ page }) => {
    await page.goto(OPTIONS_URL);

    await page.locator('#opt-superhive-delay').fill('2500');
    await page.locator('#opt-superhive-retries').fill('3');
    await page.locator('#btn-save').click();

    await expect(page.locator('#save-status')).toBeVisible();
  });

  test('claim-history section includes a Superhive counter', async ({ page }) => {
    await page.goto(OPTIONS_URL);
    await expect(page.locator('#ch-superhive')).toBeAttached();
    const label = page.locator('.claim-history-counter-label', { hasText: 'Superhive' });
    await expect(label).toBeVisible();
  });
});

test.describe('Superhive — manifest wiring', () => {
  test('optional_host_permissions and web_accessible_resources cover Superhive without static content_scripts', async () => {
    const fs = require('fs');
    const path = require('path');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8')
    );

    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining([
      'https://superhivemarket.com/*',
      'https://*.superhivemarket.com/*'
    ]));
    const war = manifest.web_accessible_resources[0];
    expect(war.matches).toEqual(expect.arrayContaining([
      'https://superhivemarket.com/*',
      'https://*.superhivemarket.com/*'
    ]));

    // Static content_scripts MUST NOT match Superhive to prevent update permission warnings
    const contentScriptMatches = manifest.content_scripts.flatMap(cs => cs.matches || []);
    expect(contentScriptMatches).not.toEqual(expect.arrayContaining(['https://superhivemarket.com/*']));
    expect(contentScriptMatches).not.toEqual(expect.arrayContaining(['https://*.superhivemarket.com/*']));
  });
});

test.describe('Superhive — i18n key coverage', () => {
  const REQUIRED_KEYS = [
    'popup_status_active_superhive', 'popup_open_superhive',
    'options_section_superhive', 'options_superhive_enable', 'options_superhive_enable_desc',
    'options_superhive_free_only', 'options_superhive_free_only_desc',
    'options_superhive_endless', 'options_superhive_endless_desc',
    'options_superhive_hide_non_free', 'options_superhive_hide_non_free_desc',
    'options_superhive_delay', 'options_superhive_delay_desc',
    'options_superhive_page_delay', 'options_superhive_page_delay_desc',
    'options_superhive_retries', 'options_superhive_retries_desc',
    'options_history_superhive',
    'panel_superhive_auto_redeem', 'panel_superhive_start', 'panel_superhive_free_only',
    'panel_superhive_endless', 'panel_superhive_hide_non_free',
    'panel_superhive_asset_delay', 'panel_superhive_page_delay',
    'controller_superhive_summary',
    'superhive_status_rate_limited', 'superhive_status_loading_page',
    'superhive_status_page_failed', 'superhive_status_pages_done',
    'superhive_status_waiting_pages', 'superhive_status_pages_incomplete',
    'superhive_status_carting', 'status_skipped'
  ];
  const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'ru', 'tr', 'zh_CN'];

  for (const loc of LOCALES) {
    test('locale ' + loc + ' has all Superhive keys', async () => {
      const fs = require('fs');
      const path = require('path');
      const data = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '_locales', loc, 'messages.json'), 'utf8')
      );
      for (const k of REQUIRED_KEYS) {
        expect(data[k], loc + ' missing ' + k).toBeTruthy();
        expect(typeof data[k].message, loc + ' ' + k + ' message not a string').toBe('string');
      }
    });
  }
});

test.describe('Superhive — popup wiring', () => {
  test('popup has an Open Superhive button', async ({ page }) => {
    await installChromeMock(page);
    const popupUrl = 'file://' + __dirname.replace(/\\/g, '/') + '/../src/popup/popup.html';
    await page.goto(popupUrl);
    await expect(page.locator('#btn-open-superhive')).toBeVisible();
  });
});
