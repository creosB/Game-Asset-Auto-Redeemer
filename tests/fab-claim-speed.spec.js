const { test, expect } = require('@playwright/test');
const path = require('path');

const UTILS = path.join(__dirname, '..', 'src', 'content', 'shared', 'utils.js');
const LICENSE = path.join(__dirname, '..', 'src', 'content', 'fab', 'license-processor.js');
const PROCESSOR = path.join(__dirname, '..', 'src', 'content', 'fab', 'asset-processor.js');

const SELLER_URL = 'https://www.fab.com/sellers/Yi-X';

async function bootOnFabUrl(page, body, opts = {}) {
  const url = opts.url || SELLER_URL;
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body }));
  await page.goto(url);
  if (opts.csrfToken) {
    await page.evaluate((tok) => {
      document.cookie = 'fab_csrftoken=' + tok + '; path=/';
    }, opts.csrfToken);
  }
  await page.addScriptTag({ path: UTILS });
  await page.evaluate((cfg) => {
    window.__fabGrabber.state = {
      assetsFound: [], assetsClaimed: 0, assetsFailed: 0,
      assetsSkipped: 0, assetsTotal: 0, shouldStop: false, statusText: ''
    };
    window.__fabGrabber.config = Object.assign(
      { preferredLicense: 'professional', delayBetweenActions: 2000, maxRetries: 2 },
      cfg || {}
    );
  }, opts.config || {});
  if (opts.withLicenseProcessor) {
    await page.addScriptTag({ path: LICENSE });
  }
  await page.addScriptTag({ path: PROCESSOR });
}

// Card with a direct library button that self-confirms on click, mimicking
// Fab flipping the button to its "already in library" state after the add.
function libraryCard({ id, name, selfConfirm = true }) {
  const onclick = selfConfirm
    ? `onclick="this.setAttribute('aria-label','Remove from library'); this.disabled=true"`
    : '';
  return `<div class="fabkit-Stack-root">
    <div class="fabkit-Thumbnail-root"><img src="thumb.png" alt=""></div>
    <a href="/listings/${id}"><span class="fabkit-Typography-ellipsisWrapper">${name}</span></a>
    <div class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</div>
    <button aria-label="Add to library" ${onclick}>Add to library</button>
  </div>`;
}

// Compact card without any action button (seller-page logged-out layout).
function compactCard({ id, name }) {
  return `<div class="fabkit-Stack-root">
    <div class="fabkit-Thumbnail-root"><img src="thumb.png" alt=""></div>
    <a href="/listings/${id}"><span class="fabkit-Typography-ellipsisWrapper">${name}</span></a>
    <div class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</div>
  </div>`;
}

test.describe('batched library claiming', () => {
  test('processAllAssets batch-clicks library buttons instead of one-at-a-time', async ({ page }) => {
    await bootOnFabUrl(page, `<html><body><main>
      ${libraryCard({ id: 'a1111111-1111-1111-1111-111111111111', name: 'Pack A' })}
      ${libraryCard({ id: 'a2222222-2222-2222-2222-222222222222', name: 'Pack B' })}
      ${libraryCard({ id: 'a3333333-3333-3333-3333-333333333333', name: 'Pack C' })}
      ${libraryCard({ id: 'a44444444-4444-4444-4444-444444444444', name: 'Pack D' })}
      ${libraryCard({ id: 'a55555555-5555-5555-5555-555555555555', name: 'Pack E' })}
    </main></body></html>`);

    const result = await page.evaluate(async () => {
      const start = Date.now();
      await window.__fabGrabber.assetProcessor.processAllAssets();
      return {
        elapsedMs: Date.now() - start,
        statuses: window.__fabGrabber.state.assetsFound.map(a => a.status),
        claimed: window.__fabGrabber.state.assetsClaimed,
        failed: window.__fabGrabber.state.assetsFailed
      };
    });

    expect(result.statuses).toEqual(['claimed', 'claimed', 'claimed', 'claimed', 'claimed']);
    expect(result.claimed).toBe(5);
    expect(result.failed).toBe(0);
    // Old sequential path had a hard floor of ~11s here (250ms reveal +
    // confirmation poll + 2000ms configured delay per asset). Batch path
    // finishes in a couple of seconds.
    expect(result.elapsedMs).toBeLessThan(8000);
  });

  test('button-less cards are reclassified into the sequential queue', async ({ page }) => {
    await bootOnFabUrl(page, `<html><body><main>
      ${libraryCard({ id: 'b1111111-1111-1111-1111-111111111111', name: 'Has Button' })}
      ${compactCard({ id: 'b2222222-2222-2222-2222-222222222222', name: 'No Button' })}
    </main></body></html>`);

    const result = await page.evaluate(async () => {
      const ap = window.__fabGrabber.assetProcessor;
      const all = ap.getFreeAssetCards();
      const batch = [all[0], all[1]];
      const sequential = [];
      await ap.processLibraryBatch(batch, sequential);
      return {
        sequentialNames: sequential.map(a => a.name),
        statuses: batch.map(a => a.status)
      };
    });

    expect(result.sequentialNames).toEqual(['No Button']);
    expect(result.statuses).toEqual(['claimed', 'processing']);
  });

  test('verifyLibraryAdds marks unconfirmed adds as failed after the budget', async ({ page }) => {
    await bootOnFabUrl(page, `<html><body><main>
      ${libraryCard({ id: 'c1111111-1111-1111-1111-111111111111', name: 'Stuck Button', selfConfirm: false })}
    </main></body></html>`);

    const result = await page.evaluate(async () => {
      const ap = window.__fabGrabber.assetProcessor;
      const asset = ap.getFreeAssetCards()[0];
      asset.status = 'processing';
      await ap.verifyLibraryAdds([asset], 600);
      return {
        status: asset.status,
        failed: window.__fabGrabber.state.assetsFailed,
        claimed: window.__fabGrabber.state.assetsClaimed
      };
    });

    expect(result.status).toBe('failed');
    expect(result.failed).toBe(1);
    expect(result.claimed).toBe(0);
  });
});

// Cart-button card (opens license modal in DOM mode, like Yi-X listings).
function cartCard({ id, name }) {
  return `<div class="fabkit-Stack-root">
    <div class="fabkit-Thumbnail-root"><img src="thumb.png" alt=""></div>
    <a href="/listings/${id}"><span class="fabkit-Typography-ellipsisWrapper">${name}</span></a>
    <div class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</div>
    <button aria-label="Add listing to cart">Add to cart</button>
  </div>`;
}

test.describe('direct API fast-path claiming', () => {
  test('claims 75 mixed cart/library/compact seller assets concurrently in seconds with zero modals', async ({ page }) => {
    const COUNT = 75;
    const cardsHtml = [];
    for (let i = 0; i < COUNT; i++) {
      const id = `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`;
      const name = `Asset ${i + 1}`;
      if (i % 3 === 0) cardsHtml.push(cartCard({ id, name }));
      else if (i % 3 === 1) cardsHtml.push(libraryCard({ id, name, selfConfirm: false }));
      else cardsHtml.push(compactCard({ id, name }));
    }

    const posted = [];
    let stateBatches = 0;

    await page.route('https://www.fab.com/i/users/me/listings-states*', route => {
      stateBatches++;
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.route('https://www.fab.com/i/listings/*/add-to-library', async route => {
      const req = route.request();
      const headers = req.headers();
      const bodyText = req.postData() || '';
      const uid = req.url().split('/i/listings/')[1].split('/')[0];
      posted.push({ uid, csrf: headers['x-csrftoken'], body: bodyText });
      await new Promise(r => setTimeout(r, 15));
      await route.fulfill({ status: 204, body: '' });
    });

    await page.route(/https:\/\/www\.fab\.com\/i\/listings\/[^/]+$/, async route => {
      const uid = route.request().url().split('/i/listings/')[1];
      await new Promise(r => setTimeout(r, 15));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid,
          licenses: [
            { slug: 'personal', offerId: `offer-personal-${uid}`, priceTier: { price: 0 } },
            { slug: 'professional', offerId: `offer-pro-${uid}`, priceTier: { price: 0 } }
          ]
        })
      });
    });

    await bootOnFabUrl(page, `<html><body><main>${cardsHtml.join('')}</main></body></html>`, {
      csrfToken: 'test-csrf-token-123',
      config: { apiClaimDelayMs: 10, apiConcurrency: 4 }
    });

    const result = await page.evaluate(async () => {
      const start = Date.now();
      await window.__fabGrabber.assetProcessor.processAllAssets();
      const remainingAfterRescan = window.__fabGrabber.assetProcessor.getFreeAssetCards().length;
      return {
        elapsedMs: Date.now() - start,
        claimed: window.__fabGrabber.state.assetsClaimed,
        failed: window.__fabGrabber.state.assetsFailed,
        skipped: window.__fabGrabber.state.assetsSkipped,
        licenses: window.__fabGrabber.state.assetsFound.map(a => a.license),
        remainingAfterRescan
      };
    });

    expect(result.claimed).toBe(COUNT);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(posted).toHaveLength(COUNT);
    expect(posted.every(p => p.csrf === 'test-csrf-token-123')).toBe(true);
    expect(posted.every(p => p.body.includes(`offer-pro-${p.uid}`))).toBe(true);
    expect(result.licenses.every(l => l === 'professional')).toBe(true);
    // 75 items in chunks of 24 = 4 listing-states pre-check calls.
    expect(stateBatches).toBe(4);
    // Infinite-scroll rescans must not re-detect already session-claimed cards.
    expect(result.remainingAfterRescan).toBe(0);
    // Old modal flow took ~4-6 minutes for 75 assets; concurrent API finishes in <5s.
    expect(result.elapsedMs).toBeLessThan(8000);
  });

  test('pickFreeLicense enforces free-only safety and license preferences', async ({ page }) => {
    await bootOnFabUrl(page, '<html><body><main></main></body></html>');

    const res = await page.evaluate(() => {
      const ap = window.__fabGrabber.assetProcessor;
      return {
        // Prefers professional when both free (including 100% limited-time discount).
        bothFree: ap.pickFreeLicense({
          licenses: [
            { slug: 'personal', offerId: 'o-pers', priceTier: { price: 29.99, discountedPrice: 0 } },
            { slug: 'professional', offerId: 'o-pro', priceTier: { price: 79.99, discountedPrice: 0 } }
          ]
        }, 'professional'),
        // Falls back to personal when professional is paid.
        proPaid: ap.pickFreeLicense({
          licenses: [
            { slug: 'personal', offerId: 'o-pers', priceTier: { price: 0 } },
            { slug: 'professional', offerId: 'o-pro', priceTier: { price: 49.99 } }
          ]
        }, 'professional'),
        // Handles Quixel Megascans / single standard free license.
        quixelStandard: ap.pickFreeLicense({
          licenses: [
            { slug: 'standard', offerId: 'o-mega', priceTier: { price: 0 } }
          ]
        }, 'professional'),
        // NEVER returns an offerId for a paid-only listing.
        paidOnly: ap.pickFreeLicense({
          licenses: [
            { slug: 'personal', offerId: 'o-pers', priceTier: { price: 9.99, discountedPrice: 4.99 } },
            { slug: 'professional', offerId: 'o-pro', priceTier: { price: 19.99 } }
          ]
        }, 'professional'),
        // Missing offerId signals DOM fallback instead of failing silently.
        missingOffer: ap.pickFreeLicense({
          licenses: [
            { slug: 'personal', priceTier: { price: 0 } }
          ]
        }, 'professional')
      };
    });

    expect(res.bothFree).toEqual({ offerId: 'o-pro', slug: 'professional' });
    expect(res.proPaid).toEqual({ offerId: 'o-pers', slug: 'personal' });
    expect(res.quixelStandard).toEqual({ offerId: 'o-mega', slug: 'standard' });
    expect(res.paidOnly).toEqual({ paidOnly: true });
    expect(res.missingOffer.fallback).toBe(true);
  });

  test('pre-check skips already-owned items and paid-only items are never POSTed', async ({ page }) => {
    const ownedId = '22222222-2222-2222-2222-000000000001';
    const paidId = '22222222-2222-2222-2222-000000000002';
    const freeId = '22222222-2222-2222-2222-000000000003';
    const fetchedDetails = [];
    const postedIds = [];

    await page.route('https://www.fab.com/i/users/me/listings-states*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { uid: ownedId, acquired: true },
          { uid: paidId, acquired: false },
          { uid: freeId, acquired: false }
        ])
      });
    });

    await page.route('https://www.fab.com/i/listings/*/add-to-library', route => {
      postedIds.push(route.request().url().split('/i/listings/')[1].split('/')[0]);
      route.fulfill({ status: 204, body: '' });
    });

    await page.route(/https:\/\/www\.fab\.com\/i\/listings\/[^/]+$/, route => {
      const uid = route.request().url().split('/i/listings/')[1];
      fetchedDetails.push(uid);
      const price = uid === paidId ? 14.99 : 0;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid,
          licenses: [{ slug: 'standard', offerId: 'off-' + uid, priceTier: { price } }]
        })
      });
    });

    await bootOnFabUrl(page, `<html><body><main>
      ${cartCard({ id: ownedId, name: 'Already Owned' })}
      ${cartCard({ id: paidId, name: 'Actually Paid' })}
      ${cartCard({ id: freeId, name: 'Genuinely Free' })}
    </main></body></html>`, {
      url: 'https://www.fab.com/sellers/Quixel%20Megascans',
      csrfToken: 'csrf-ok'
    });

    const result = await page.evaluate(async () => {
      await window.__fabGrabber.assetProcessor.processAllAssets();
      return {
        claimed: window.__fabGrabber.state.assetsClaimed,
        skipped: window.__fabGrabber.state.assetsSkipped,
        failed: window.__fabGrabber.state.assetsFailed,
        statuses: window.__fabGrabber.state.assetsFound.map(a => a.status)
      };
    });

    expect(fetchedDetails).not.toContain(ownedId);
    expect(postedIds).toEqual([freeId]);
    expect(result).toEqual({
      claimed: 1,
      skipped: 2,
      failed: 0,
      statuses: ['skipped', 'skipped', 'claimed']
    });
  });

  test('retries on 429 rate limit with Retry-After and succeeds', async ({ page }) => {
    const id = '33333333-3333-3333-3333-000000000001';
    let postAttempts = 0;

    await page.route('https://www.fab.com/i/users/me/listings-states*', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(/https:\/\/www\.fab\.com\/i\/listings\/[^/]+$/, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid: id,
          licenses: [{ slug: 'standard', offerId: 'off-1', priceTier: { price: 0 } }]
        })
      });
    });
    await page.route('https://www.fab.com/i/listings/*/add-to-library', route => {
      postAttempts++;
      if (postAttempts === 1) {
        route.fulfill({ status: 429, headers: { 'Retry-After': '0.2' }, body: 'Too Many Requests' });
      } else {
        route.fulfill({ status: 204, body: '' });
      }
    });

    await bootOnFabUrl(page, `<html><body><main>${cartCard({ id, name: 'Rate Limited Pack' })}</main></body></html>`, {
      csrfToken: 'csrf-ok'
    });

    const result = await page.evaluate(async () => {
      await window.__fabGrabber.assetProcessor.processAllAssets();
      return {
        claimed: window.__fabGrabber.state.assetsClaimed,
        failed: window.__fabGrabber.state.assetsFailed
      };
    });

    expect(postAttempts).toBe(2);
    expect(result).toEqual({ claimed: 1, failed: 0 });
  });

  test('429 slows pace to >=1000ms and does not dump rate-limited items into DOM modals', async ({ page }) => {
    const id1 = '33333333-3333-3333-3333-000000000011';
    const id2 = '33333333-3333-3333-3333-000000000012';
    const postTimestamps = [];
    let firstHits = 0;

    await page.route('https://www.fab.com/i/users/me/listings-states*', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(/https:\/\/www\.fab\.com\/i\/listings\/[^/]+$/, route => {
      const uid = route.request().url().split('/i/listings/')[1];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid,
          licenses: [{ slug: 'standard', offerId: 'off-' + uid, priceTier: { price: 0 } }]
        })
      });
    });
    await page.route('https://www.fab.com/i/listings/*/add-to-library', route => {
      const uid = route.request().url().split('/i/listings/')[1].split('/')[0];
      postTimestamps.push({ uid, t: Date.now() });
      if (uid === id1 && firstHits === 0) {
        firstHits++;
        route.fulfill({ status: 429, headers: { 'Retry-After': '0.2' }, body: 'Too Many Requests' });
      } else {
        route.fulfill({ status: 204, body: '' });
      }
    });

    await bootOnFabUrl(page, `<html><body><main>
      ${cartCard({ id: id1, name: 'First Pack' })}
      ${cartCard({ id: id2, name: 'Second Pack' })}
    </main></body></html>`, {
      csrfToken: 'csrf-ok',
      config: { apiConcurrency: 1, apiClaimDelayMs: 50 }
    });

    const result = await page.evaluate(async () => {
      await window.__fabGrabber.assetProcessor.processAllAssets();
      return {
        claimed: window.__fabGrabber.state.assetsClaimed,
        failed: window.__fabGrabber.state.assetsFailed
      };
    });

    expect(result).toEqual({ claimed: 2, failed: 0 });
    expect(postTimestamps).toHaveLength(3);
    // After the 429 on id1, the gap before id2 must reflect the elevated >=1000ms pace.
    const gapAfterRecovery = postTimestamps[2].t - postTimestamps[1].t;
    expect(gapAfterRecovery).toBeGreaterThanOrEqual(900);
  });

  test('falls back cleanly to DOM claimer on 403 auth/CSRF rejection', async ({ page }) => {
    let apiCalls = 0;

    await page.route('https://www.fab.com/i/users/me/listings-states*', route => {
      route.fulfill({ status: 403, body: 'Forbidden' });
    });
    await page.route(/https:\/\/www\.fab\.com\/i\/listings\//, route => {
      apiCalls++;
      route.fulfill({ status: 403, body: 'CSRF failed' });
    });

    await bootOnFabUrl(page, `<html><body><main>
      ${libraryCard({ id: '44444444-4444-4444-4444-000000000001', name: 'Fallback A' })}
      ${libraryCard({ id: '44444444-4444-4444-4444-000000000002', name: 'Fallback B' })}
      ${libraryCard({ id: '44444444-4444-4444-4444-000000000003', name: 'Fallback C' })}
    </main></body></html>`, {
      csrfToken: 'expired-csrf'
    });

    const result = await page.evaluate(async () => {
      await window.__fabGrabber.assetProcessor.processAllAssets();
      return {
        claimed: window.__fabGrabber.state.assetsClaimed,
        failed: window.__fabGrabber.state.assetsFailed,
        statuses: window.__fabGrabber.state.assetsFound.map(a => a.status)
      };
    });

    // Circuit breaker stops hammering API after 403 and DOM batch claims all 3.
    expect(apiCalls).toBeLessThanOrEqual(3);
    expect(result).toEqual({
      claimed: 3,
      failed: 0,
      statuses: ['claimed', 'claimed', 'claimed']
    });
  });

  test('falls back to DOM license modal when a single listing returns 400 from API', async ({ page }) => {
    const id = '55555555-5555-5555-5555-000000000001';

    await page.route('https://www.fab.com/i/users/me/listings-states*', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(/https:\/\/www\.fab\.com\/i\/listings\/[^/]+$/, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid: id,
          licenses: [{ slug: 'professional', offerId: 'off-x', priceTier: { price: 0 } }]
        })
      });
    });
    await page.route('https://www.fab.com/i/listings/*/add-to-library', route => {
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"detail":"Must add via cart"}' });
    });

    const html = `<html><body><main>
      <div class="fabkit-Stack-root">
        <div class="fabkit-Thumbnail-root"><img src="thumb.png" alt=""></div>
        <a href="/listings/${id}"><span class="fabkit-Typography-ellipsisWrapper">Modal Fallback Pack</span></a>
        <div class="fabkit-Typography-root fabkit-Typography--intent-primary">Free</div>
        <button aria-label="Add listing to cart" onclick="openModal()">Add to cart</button>
      </div>
      <script>
        function openModal() {
          const d = document.createElement('div');
          d.setAttribute('role', 'dialog');
          d.setAttribute('aria-modal', 'true');
          d.innerHTML = \`
            <div role="radiogroup">
              <div class="fabkit-FormField-root">
                <label class="fabkit-FormField-label"><input type="radio" name="lic"> Professional</label>
                <div class="fabkit-FormField-hint"><span class="fabkit-Typography--intent-primary fabkit-Text--bold">Free</span></div>
              </div>
            </div>
            <button class="fabkit-Button--primary" onclick="this.closest('[role=dialog]').remove()">Add to My Library</button>
          \`;
          document.body.appendChild(d);
        }
      </script>
    </main></body></html>`;

    await bootOnFabUrl(page, html, {
      csrfToken: 'csrf-ok',
      withLicenseProcessor: true,
      config: { delayBetweenActions: 500 }
    });

    const result = await page.evaluate(async () => {
      await window.__fabGrabber.assetProcessor.processAllAssets();
      return {
        claimed: window.__fabGrabber.state.assetsClaimed,
        failed: window.__fabGrabber.state.assetsFailed,
        status: window.__fabGrabber.state.assetsFound[0].status
      };
    });

    expect(result).toEqual({ claimed: 1, failed: 0, status: 'claimed' });
  });
});

test.describe('claim speed presets & advanced custom mode', () => {
  test('resolveSpeedSettings maps fast/normal/casual presets and honors advanced custom values', async ({ page }) => {
    const CONFIG = path.join(__dirname, '..', 'src', 'content', 'shared', 'config.js');
    await page.route(SELLER_URL, route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
    await page.goto(SELLER_URL);
    await page.evaluate(() => {
      window.chrome = {
        runtime: { id: 'test-ext' },
        storage: {
          sync: { get: async (d) => d, set: async () => {} },
          onChanged: { addListener: () => {} }
        }
      };
    });
    await page.addScriptTag({ path: CONFIG });

    const res = await page.evaluate(() => {
      const get = window.__fabGrabber.getFabSpeedSettings;
      return {
        fast: get({ fabClaimSpeed: 'fast', apiConcurrency: 1, apiClaimDelayMs: 999 }),
        normal: get({ fabClaimSpeed: 'normal' }),
        casual: get({ fabClaimSpeed: 'casual' }),
        advanced: get({
          fabClaimSpeed: 'advanced',
          apiConcurrency: 3,
          apiClaimDelayMs: 650,
          delayBetweenActions: 1800,
          dialogTimeout: 15000
        })
      };
    });

    expect(res.fast).toEqual({
      mode: 'fast',
      apiConcurrency: 4,
      apiClaimDelayMs: 120,
      delayBetweenActions: 800,
      dialogTimeout: 6000
    });
    expect(res.normal).toEqual({
      mode: 'normal',
      apiConcurrency: 2,
      apiClaimDelayMs: 350,
      delayBetweenActions: 1500,
      dialogTimeout: 10000
    });
    expect(res.casual).toEqual({
      mode: 'casual',
      apiConcurrency: 1,
      apiClaimDelayMs: 1000,
      delayBetweenActions: 2500,
      dialogTimeout: 12000
    });
    expect(res.advanced).toEqual({
      mode: 'advanced',
      apiConcurrency: 3,
      apiClaimDelayMs: 650,
      delayBetweenActions: 1800,
      dialogTimeout: 15000
    });
  });

  test('options page toggles advanced drawer and saves claim speed settings', async ({ page }) => {
    const OPTIONS_HTML = 'file:///' + path.join(__dirname, '..', 'src', 'options', 'options.html').replace(/\\/g, '/');

    await page.addInitScript(() => {
      window.__savedSync = null;
      const syncStore = {};
      window.chrome = {
        runtime: {
          id: 'test-ext',
          sendMessage: (_msg, cb) => { if (cb) cb({}); },
          onMessage: { addListener: () => {} },
          connect: () => ({ onMessage: { addListener: () => {} } }),
          getURL: (p) => p
        },
        i18n: { getMessage: (k) => k },
        storage: {
          sync: {
            get: async (defaults) => Object.assign({}, defaults, syncStore),
            set: async (patch) => { Object.assign(syncStore, patch); window.__savedSync = Object.assign({}, syncStore); }
          },
          local: {
            get: (keys, cb) => {
              const out = typeof keys === 'object' && !Array.isArray(keys) ? Object.assign({}, keys) : { onboardingShown: true };
              out.onboardingShown = true;
              if (cb) cb(out);
              return Promise.resolve(out);
            },
            set: async () => {},
            remove: async () => {}
          },
          onChanged: { addListener: () => {} }
        }
      };
    });

    await page.goto(OPTIONS_HTML);

    // Default mode is normal and the advanced drawer is collapsed.
    await expect(page.locator('input[name="fab-speed"][value="normal"]')).toBeChecked();
    await expect(page.locator('#fab-advanced-wrap')).toBeHidden();

    // Fast shows risky hint and keeps advanced hidden.
    await page.locator('.speed-pill', { has: page.locator('input[value="fast"]') }).click();
    await expect(page.locator('#fab-speed-hint')).toHaveClass(/speed-hint--risky/);
    await expect(page.locator('#fab-advanced-wrap')).toBeHidden();

    // Advanced expands custom inputs and saves custom values.
    await page.locator('.speed-pill', { has: page.locator('input[value="advanced"]') }).click();
    await expect(page.locator('#fab-advanced-wrap')).toBeVisible();
    await page.fill('#opt-fab-concurrency', '3');
    await page.fill('#opt-fab-api-delay', '600');
    await page.fill('#opt-delay', '1500');
    await page.fill('#opt-timeout', '14000');
    await page.click('#btn-save');

    const saved = await page.evaluate(() => window.__savedSync);
    expect(saved.fabClaimSpeed).toBe('advanced');
    expect(saved.apiConcurrency).toBe(3);
    expect(saved.apiClaimDelayMs).toBe(600);
    expect(saved.delayBetweenActions).toBe(1500);
    expect(saved.dialogTimeout).toBe(14000);
  });
});
