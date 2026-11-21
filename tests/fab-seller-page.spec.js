const { test, expect } = require('@playwright/test');
const path = require('path');

const UTILS = path.join(__dirname, '..', 'src', 'content', 'shared', 'utils.js');
const PROCESSOR = path.join(__dirname, '..', 'src', 'content', 'fab', 'asset-processor.js');

// Route a fake fab.com URL and boot the real content scripts (utils.js then
// asset-processor.js) against it, so isCatalogPage()/catalogPath() see the
// same location a live tab would.
async function bootOnFabUrl(page, url, body) {
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body }));
  await page.goto(url);
  await page.addScriptTag({ path: UTILS });
  await page.evaluate(() => {
    window.__fabGrabber.state = { assetsFound: [], assetsClaimed: 0, assetsFailed: 0 };
    window.__fabGrabber.config = {};
  });
  await page.addScriptTag({ path: PROCESSOR });
}

// Compact seller-profile card: thumbnail + link + price, no quick-action
// buttons in the DOM (matches the live /sellers/<slug> grid layout).
function sellerCard({ id, name, price = 'Free', owned = false, button = '' }) {
  const badge = owned
    ? '<div class="fabkit-Typography-root fabkit-Typography--intent-success">Saved in My Library</div>'
    : `<div class="fabkit-Typography-root fabkit-Typography--intent-primary">${price}</div>`;
  return `<div class="fabkit-Stack-root">
    <div class="fabkit-Thumbnail-root"><img src="thumb.png" alt=""></div>
    <a class="fabkit-Typography-root" href="/listings/${id}">
      <span class="fabkit-Typography-ellipsisWrapper">${name}</span>
    </a>
    ${badge}
    ${button}
  </div>`;
}

test.describe('seller/publisher profile pages are scannable', () => {
  test('isCatalogPage() is true on seller, publisher and localized seller URLs', async ({ page }) => {
    for (const url of [
      'https://www.fab.com/sellers/Yi-X',
      'https://www.fab.com/sellers/Quixel%20Megascans',
      'https://www.fab.com/publishers/some-publisher',
      'https://www.fab.com/de/sellers/Yi-X'
    ]) {
      await bootOnFabUrl(page, url, '<html><body><main></main></body></html>');
      const result = await page.evaluate(() => window.__fabGrabber.utils.isCatalogPage());
      expect(result, url).toBe(true);
    }
  });

  test('isCatalogPage() stays false on account pages', async ({ page }) => {
    for (const url of [
      'https://www.fab.com/library',
      'https://www.fab.com/cart',
      'https://www.fab.com/de/library'
    ]) {
      await bootOnFabUrl(page, url, '<html><body><main></main></body></html>');
      const result = await page.evaluate(() => window.__fabGrabber.utils.isCatalogPage());
      expect(result, url).toBe(false);
    }
  });

  test('detects free cards in the compact seller grid (no card buttons)', async ({ page }) => {
    await bootOnFabUrl(page, 'https://www.fab.com/sellers/Yi-X', `<html><body><main>
      ${sellerCard({ id: '11111111-1111-1111-1111-111111111111', name: 'Ceiling Voronoi Tiles 3' })}
      ${sellerCard({ id: '22222222-2222-2222-2222-222222222222', name: 'Owned Pack', owned: true })}
      ${sellerCard({ id: '33333333-3333-3333-3333-333333333333', name: 'Paid Pack', price: '$9.99' })}
    </main></body></html>`);

    const assets = await page.evaluate(() =>
      window.__fabGrabber.assetProcessor.getFreeAssetCards()
        .map(({ id, name, claimButton, actionType }) => ({ id, name, claimButton, actionType }))
    );
    expect(assets).toEqual([{
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Ceiling Voronoi Tiles 3',
      claimButton: null,
      actionType: null
    }]);
  });

  test('detects quick-action buttons on seller cards when present (logged-in layout)', async ({ page }) => {
    await bootOnFabUrl(page, 'https://www.fab.com/sellers/Yi-X', `<html><body><main>
      ${sellerCard({
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Hover Me Pack',
        button: '<button aria-label="Add to library">Add to library</button>'
      })}
    </main></body></html>`);

    const assets = await page.evaluate(() =>
      window.__fabGrabber.assetProcessor.getFreeAssetCards()
        .map(({ id, actionType }) => ({ id, actionType }))
    );
    expect(assets).toEqual([{ id: '44444444-4444-4444-4444-444444444444', actionType: 'library' }]);
  });
});

test.describe('aria-less CTA buttons (listing detail fallback)', () => {
  test('matches a plain "Add to cart" button without aria-label', async ({ page }) => {
    await bootOnFabUrl(page, 'https://www.fab.com/sellers/Yi-X', `<html><body><main>
      <button aria-label="Add to wishlist"></button>
      <button class="fabkit-Button-root">Add to cart</button>
    </main></body></html>`);

    const result = await page.evaluate(() => {
      const action = window.__fabGrabber.assetProcessor.findCardActionButton(document);
      return action ? { type: action.type, text: action.button.textContent.trim() } : null;
    });
    expect(result).toEqual({ type: 'cart', text: 'Add to cart' });
  });

  test('matches an "Add to My Library" text button as library type', async ({ page }) => {
    await bootOnFabUrl(page, 'https://www.fab.com/sellers/Yi-X', `<html><body><main>
      <button class="fabkit-Button-root">Add to My Library</button>
    </main></body></html>`);

    const result = await page.evaluate(() => {
      const action = window.__fabGrabber.assetProcessor.findCardActionButton(document);
      return action ? { type: action.type, text: action.button.textContent.trim() } : null;
    });
    expect(result).toEqual({ type: 'library', text: 'Add to My Library' });
  });

  test('never matches wishlist buttons', async ({ page }) => {
    await bootOnFabUrl(page, 'https://www.fab.com/sellers/Yi-X', `<html><body><main>
      <button aria-label="Add to wishlist"></button>
      <button>Add to wishlist</button>
    </main></body></html>`);

    const result = await page.evaluate(() =>
      window.__fabGrabber.assetProcessor.findCardActionButton(document)
    );
    expect(result).toBe(null);
  });
});

test.describe('element rehydration after SPA re-render', () => {
  test('rehydrateAsset() re-resolves a detached card by listing id', async ({ page }) => {
    await bootOnFabUrl(page, 'https://www.fab.com/sellers/Yi-X', `<html><body><main id="grid">
      ${sellerCard({ id: '55555555-5555-5555-5555-555555555555', name: 'Rehydrate Me' })}
    </main></body></html>`);

    const result = await page.evaluate(() => {
      const ap = window.__fabGrabber.assetProcessor;
      const asset = ap.getFreeAssetCards()[0];
      const oldElement = asset.element;

      // Simulate the SPA rebuilding the grid (e.g. after returning from a
      // listing detail page): same markup, fresh nodes.
      const grid = document.getElementById('grid');
      grid.innerHTML = grid.innerHTML;

      const wasConnected = oldElement.isConnected;
      ap.rehydrateAsset(asset);
      return {
        wasConnected,
        reconnected: asset.element.isConnected,
        sameNode: asset.element === oldElement,
        hasLink: !!asset.element.querySelector('a[href*="/listings/"]')
      };
    });
    expect(result.wasConnected).toBe(false);
    expect(result.reconnected).toBe(true);
    expect(result.sameNode).toBe(false);
    expect(result.hasLink).toBe(true);
  });
});
