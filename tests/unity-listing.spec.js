const { test, expect } = require('@playwright/test');
const path = require('path');

const PROCESSOR = path.join(__dirname, '..', 'src', 'content', 'unity', 'asset-processor.js');

async function bootProcessor(page, body) {
  await page.setContent(body);
  await page.evaluate(() => {
    window.__fabGrabber = {
      utils: {
        log: () => {},
        wait: () => Promise.resolve(),
        retryWithBackoff: (fn) => fn()
      },
      state: { assetsFound: [], assetsClaimed: 0, assetsFailed: 0 },
      config: {},
      i18n: { t: (key) => key }
    };
  });
  await page.addScriptTag({ path: PROCESSOR });
}

function card({ id, title, price = 'Free', owned = false }) {
  return `<li>
    <span>Tools</span>
    <a data-test="product-card-name" href="/packages/package/${id}">${title}</a>
    <a data-test="product-card-publisher" href="/publishers/1">Publisher</a>
    <span>${owned ? 'You own this asset' : price}</span>
  </li>`;
}

test.describe('Unity current listing DOM detection', () => {
  test('detects only free unowned product cards and extracts package IDs', async ({ page }) => {
    await bootProcessor(page, `<ul>
      ${card({ id: '305970', title: 'One Click Add Water' })}
      ${card({ id: '180904', title: 'Owned Demo', owned: true })}
      ${card({ id: '999999', title: 'Paid Product', price: '$9.99' })}
    </ul>`);

    const assets = await page.evaluate(() => window.__fabGrabber.assetProcessor.getFreeAssetCards()
      .map(({ id, name }) => ({ id, name })));
    expect(assets).toEqual([{ id: '305970', name: 'One Click Add Water' }]);
  });

  test('does not mistake Free in a paid product title for the price', async ({ page }) => {
    await bootProcessor(page, `<ul>${card({
      id: '288103', title: 'FREE Video Player with Hosting', price: '$19.99'
    })}</ul>`);
    const count = await page.evaluate(() => window.__fabGrabber.assetProcessor.getFreeAssetCards().length);
    expect(count).toBe(0);
  });

  test('keeps legacy slug ID extraction working', async ({ page }) => {
    await bootProcessor(page, `<div class="_3YDeD">
      <a href="/packages/tools/runtime-file-browser-113006">Runtime File Browser</a>
      <span>FREE</span><button>Add to My Assets</button>
    </div>`);
    const assets = await page.evaluate(() => window.__fabGrabber.assetProcessor.getFreeAssetCards()
      .map(({ id, name }) => ({ id, name })));
    expect(assets).toEqual([{ id: '113006', name: 'Runtime File Browser' }]);
  });
});
