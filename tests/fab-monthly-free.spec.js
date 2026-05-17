const { test, expect } = require('@playwright/test');

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

function pickImage(images) {
  if (!images || !images.length) return '';
  for (var i = 0; i < images.length; i++) {
    if (images[i].width === 640) return images[i].url;
  }
  for (var j = 0; j < images.length; j++) {
    if (images[j].width === 320) return images[j].url;
  }
  return images[images.length - 1].url;
}

function parseBladeData(json) {
  if (!json || !json.tiles || !json.tiles.length) return null;

  var assets = [];
  for (var i = 0; i < json.tiles.length; i++) {
    var tile = json.tiles[i];
    var listing = tile.listing;
    if (!listing) continue;

    var thumb = '';
    if (listing.thumbnails && listing.thumbnails[0] && listing.thumbnails[0].images) {
      thumb = pickImage(listing.thumbnails[0].images);
    }

    var personalLicense = null;
    if (listing.licenses) {
      for (var j = 0; j < listing.licenses.length; j++) {
        if (listing.licenses[j].slug === 'personal') {
          personalLicense = listing.licenses[j];
          break;
        }
      }
    }

    var discountEnd = '';
    var originalPrice = 0;
    if (personalLicense && personalLicense.priceTier) {
      discountEnd = personalLicense.priceTier.discountEndDate || '';
      originalPrice = personalLicense.priceTier.price || 0;
    }

    assets.push({
      uid: listing.uid,
      title: listing.title || 'Unknown Asset',
      description: stripHtml(listing.description || '').substring(0, 200),
      image: thumb,
      url: 'https://www.fab.com/listings/' + listing.uid,
      sellerName: listing.user ? listing.user.sellerName : '',
      listingType: listing.listingType || '',
      averageRating: listing.ratings ? listing.ratings.averageRating : 0,
      totalRatings: listing.ratings ? listing.ratings.total : 0,
      originalPrice: originalPrice,
      discountEndDate: discountEnd,
      assetFormats: (listing.assetFormats || []).map(function(f) {
        return f.assetFormatType ? f.assetFormatType.name : '';
      })
    });
  }

  if (assets.length === 0) return null;

  return {
    title: json.title || 'FAB Limited-Time Free',
    isLimitedFreeContent: !!json.isLimitedFreeContent,
    assets: assets,
    fetchedAt: Date.now()
  };
}

function getCheckDates() {
  return [
    { day: 1, label: 'beginning' },
    { day: 14, label: 'middle' },
    { day: 25, label: 'end' }
  ];
}

function getCurrentMonthKey() {
  var now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function getPeriodForDay(day) {
  if (day <= 10) return 'beginning';
  if (day <= 20) return 'middle';
  return 'end';
}

function getClaimedMap(storage) {
  return storage['fabMonthlyFreeClaimed'] || {};
}

function markAssetClaimedSync(storage, uid) {
  if (!storage['fabMonthlyFreeClaimed']) storage['fabMonthlyFreeClaimed'] = {};
  storage['fabMonthlyFreeClaimed'][uid] = Date.now();
}

function isAssetClaimedSync(storage, uid) {
  if (storage['fabMonthlyFreeClaimed'] && storage['fabMonthlyFreeClaimed'][uid]) return true;
  var history = storage['fabGrabClaimHistory'] || [];
  for (var i = 0; i < history.length; i++) {
    if (history[i].id === uid) return true;
  }
  return false;
}

function getUnclaimedAssetsSync(storage, assets) {
  var map = storage['fabMonthlyFreeClaimed'] || {};
  var historyIds = {};
  var history = storage['fabGrabClaimHistory'] || [];
  for (var h = 0; h < history.length; h++) {
    if (history[h].id) historyIds[history[h].id] = true;
  }
  return assets.filter(function(a) { return !map[a.uid] && !historyIds[a.uid]; });
}

// ── Unit Tests ──────────────────────────────────────

test.describe('isCatalogPage', () => {
  function isCatalogPage(pathname) {
    if (/^\/listings\/[a-f0-9-]+$/i.test(pathname)) return false;
    if (/^\/publishers?\//.test(pathname)) return false;
    return true;
  }

  test('returns false for individual listing pages', () => {
    expect(isCatalogPage('/listings/0e920fbc-fb78-4331-a4e1-878dc3504bad')).toBe(false);
    expect(isCatalogPage('/listings/3413113f-147a-4fc9-bd9f-7c543934969a')).toBe(false);
    expect(isCatalogPage('/listings/b6a85679-47f0-4f59-aa6d-da9d5f59aee5')).toBe(false);
  });

  test('returns false for publisher pages', () => {
    expect(isCatalogPage('/publishers/epic-games')).toBe(false);
    expect(isCatalogPage('/publisher/some-seller')).toBe(false);
  });

  test('returns true for catalog-like pages', () => {
    expect(isCatalogPage('/')).toBe(true);
    expect(isCatalogPage('/free')).toBe(true);
    expect(isCatalogPage('/limited-time-free')).toBe(true);
    expect(isCatalogPage('/category/3d-models')).toBe(true);
    expect(isCatalogPage('/search')).toBe(true);
    expect(isCatalogPage('/browse')).toBe(true);
  });

  test('returns true for query string pages', () => {
    expect(isCatalogPage('/search?q=tree')).toBe(true);
    expect(isCatalogPage('/free?sort=popular')).toBe(true);
  });
});

test.describe('fab-monthly-free module', () => {

  test.describe('stripHtml', () => {
    test('removes HTML tags', () => {
      expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
    });

    test('decodes HTML entities', () => {
      expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry');
      expect(stripHtml('&lt;div&gt;')).toBe('<div>');
      expect(stripHtml('&quot;hello&quot;')).toBe('"hello"');
      expect(stripHtml('it&#39;s')).toBe("it's");
      expect(stripHtml('a&nbsp;b')).toBe('a b');
    });

    test('handles null/empty input', () => {
      expect(stripHtml(null)).toBe('');
      expect(stripHtml('')).toBe('');
      expect(stripHtml(undefined)).toBe('');
    });

    test('trims whitespace', () => {
      expect(stripHtml('  <p>hello</p>  ')).toBe('hello');
    });
  });

  test.describe('pickImage', () => {
    test('prefers 640px image', () => {
      const images = [
        { width: 144, url: 'small.jpg' },
        { width: 320, url: 'medium.jpg' },
        { width: 640, url: 'large.jpg' },
        { width: 1280, url: 'xlarge.jpg' },
      ];
      expect(pickImage(images)).toBe('large.jpg');
    });

    test('falls back to 320px image', () => {
      const images = [
        { width: 144, url: 'small.jpg' },
        { width: 320, url: 'medium.jpg' },
        { width: 1280, url: 'xlarge.jpg' },
      ];
      expect(pickImage(images)).toBe('medium.jpg');
    });

    test('falls back to last image', () => {
      const images = [
        { width: 144, url: 'small.jpg' },
        { width: 160, url: 'medium2.jpg' },
      ];
      expect(pickImage(images)).toBe('medium2.jpg');
    });

    test('returns empty for null/empty', () => {
      expect(pickImage(null)).toBe('');
      expect(pickImage([])).toBe('');
    });
  });

  test.describe('parseBladeData', () => {
    const validBlade = {
      title: 'Limited-Time Free (Until May 19)',
      isLimitedFreeContent: true,
      tiles: [
        {
          listing: {
            uid: 'abc-123',
            title: 'Test Asset',
            description: '<p>A great <strong>asset</strong></p>',
            listingType: '3d-model',
            thumbnails: [
              {
                images: [
                  { width: 144, url: 'https://media.fab.com/small.jpg' },
                  { width: 320, url: 'https://media.fab.com/medium.jpg' },
                  { width: 640, url: 'https://media.fab.com/large.jpg' },
                ]
              }
            ],
            licenses: [
              {
                slug: 'personal',
                priceTier: {
                  price: 49.99,
                  discountedPrice: 0,
                  discountEndDate: '2026-05-19T13:59:00Z',
                  discountPercentage: 100
                }
              },
              {
                slug: 'professional',
                priceTier: {
                  price: 99.99,
                  discountedPrice: 0,
                  discountEndDate: '2026-05-19T13:59:00Z'
                }
              }
            ],
            ratings: { averageRating: 4.5, total: 10 },
            user: { sellerName: 'Test Seller' },
            assetFormats: [
              { assetFormatType: { name: 'Unreal Engine' } },
              { assetFormatType: { name: 'Unity' } }
            ]
          }
        }
      ]
    };

    test('parses valid blade data correctly', () => {
      const result = parseBladeData(validBlade);
      expect(result).not.toBeNull();
      expect(result.title).toBe('Limited-Time Free (Until May 19)');
      expect(result.isLimitedFreeContent).toBe(true);
      expect(result.assets).toHaveLength(1);

      const asset = result.assets[0];
      expect(asset.uid).toBe('abc-123');
      expect(asset.title).toBe('Test Asset');
      expect(asset.url).toBe('https://www.fab.com/listings/abc-123');
      expect(asset.sellerName).toBe('Test Seller');
      expect(asset.listingType).toBe('3d-model');
      expect(asset.image).toBe('https://media.fab.com/large.jpg');
      expect(asset.originalPrice).toBe(49.99);
      expect(asset.discountEndDate).toBe('2026-05-19T13:59:00Z');
      expect(asset.averageRating).toBe(4.5);
      expect(asset.totalRatings).toBe(10);
      expect(asset.assetFormats).toEqual(['Unreal Engine', 'Unity']);
      expect(asset.description).toBe('A great asset');
    });

    test('returns null for empty tiles', () => {
      expect(parseBladeData({ tiles: [] })).toBeNull();
      expect(parseBladeData(null)).toBeNull();
      expect(parseBladeData({})).toBeNull();
    });

    test('skips tiles with null listing', () => {
      const data = {
        title: 'Test',
        isLimitedFreeContent: true,
        tiles: [
          { listing: null },
          {
            listing: {
              uid: 'valid-1',
              title: 'Valid',
              licenses: [{ slug: 'personal', priceTier: { price: 10, discountEndDate: '2026-06-01' } }],
              thumbnails: [{ images: [{ width: 320, url: 'img.jpg' }] }],
              assetFormats: [],
            }
          }
        ]
      };
      const result = parseBladeData(data);
      expect(result).not.toBeNull();
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0].uid).toBe('valid-1');
    });

    test('handles missing optional fields', () => {
      const data = {
        tiles: [{
          listing: {
            uid: 'minimal',
            title: 'Minimal Asset',
            licenses: [],
            assetFormats: [],
          }
        }]
      };
      const result = parseBladeData(data);
      expect(result).not.toBeNull();
      expect(result.assets[0].image).toBe('');
      expect(result.assets[0].sellerName).toBe('');
      expect(result.assets[0].originalPrice).toBe(0);
      expect(result.assets[0].discountEndDate).toBe('');
      expect(result.assets[0].description).toBe('');
    });

    test('handles multiple assets', () => {
      const data = {
        title: 'Multi',
        isLimitedFreeContent: true,
        tiles: [
          { listing: { uid: 'a1', title: 'Asset 1', licenses: [], assetFormats: [] } },
          { listing: { uid: 'a2', title: 'Asset 2', licenses: [], assetFormats: [] } },
          { listing: { uid: 'a3', title: 'Asset 3', licenses: [], assetFormats: [] } },
        ]
      };
      const result = parseBladeData(data);
      expect(result.assets).toHaveLength(3);
      expect(result.assets[0].uid).toBe('a1');
      expect(result.assets[1].uid).toBe('a2');
      expect(result.assets[2].uid).toBe('a3');
    });
  });

  test.describe('scheduling logic', () => {
    test('getCheckDates returns 3 periods', () => {
      const dates = getCheckDates();
      expect(dates).toHaveLength(3);
      expect(dates[0].label).toBe('beginning');
      expect(dates[1].label).toBe('middle');
      expect(dates[2].label).toBe('end');
    });

    test('getCurrentMonthKey returns YYYY-MM format', () => {
      const key = getCurrentMonthKey();
      expect(key).toMatch(/^\d{4}-\d{2}$/);
    });

    test('getPeriodForDay maps correctly', () => {
      expect(getPeriodForDay(1)).toBe('beginning');
      expect(getPeriodForDay(5)).toBe('beginning');
      expect(getPeriodForDay(10)).toBe('beginning');
      expect(getPeriodForDay(11)).toBe('middle');
      expect(getPeriodForDay(14)).toBe('middle');
      expect(getPeriodForDay(20)).toBe('middle');
      expect(getPeriodForDay(21)).toBe('end');
      expect(getPeriodForDay(25)).toBe('end');
      expect(getPeriodForDay(31)).toBe('end');
    });
  });

  test.describe('claim tracking', () => {
    test('markAssetClaimed and isAssetClaimed work', () => {
      const storage = {};
      expect(isAssetClaimedSync(storage, 'abc')).toBe(false);
      markAssetClaimedSync(storage, 'abc');
      expect(isAssetClaimedSync(storage, 'abc')).toBe(true);
      expect(isAssetClaimedSync(storage, 'xyz')).toBe(false);
    });

    test('getUnclaimedAssets filters correctly', () => {
      const storage = {};
      markAssetClaimedSync(storage, 'a1');
      markAssetClaimedSync(storage, 'a3');

      const assets = [
        { uid: 'a1', title: 'One' },
        { uid: 'a2', title: 'Two' },
        { uid: 'a3', title: 'Three' },
        { uid: 'a4', title: 'Four' },
      ];
      const unclaimed = getUnclaimedAssetsSync(storage, assets);
      expect(unclaimed).toHaveLength(2);
      expect(unclaimed[0].uid).toBe('a2');
      expect(unclaimed[1].uid).toBe('a4');
    });

    test('getUnclaimedAssets returns all when nothing claimed', () => {
      const storage = {};
      const assets = [
        { uid: 'x1' },
        { uid: 'x2' },
      ];
      expect(getUnclaimedAssetsSync(storage, assets)).toHaveLength(2);
    });

    test('getUnclaimedAssets returns empty when all claimed', () => {
      const storage = {};
      markAssetClaimedSync(storage, 'y1');
      markAssetClaimedSync(storage, 'y2');
      const assets = [{ uid: 'y1' }, { uid: 'y2' }];
      expect(getUnclaimedAssetsSync(storage, assets)).toHaveLength(0);
    });

    test('multiple claims tracked independently', () => {
      const storage = {};
      markAssetClaimedSync(storage, 'id1');
      markAssetClaimedSync(storage, 'id2');
      markAssetClaimedSync(storage, 'id3');
      expect(isAssetClaimedSync(storage, 'id1')).toBe(true);
      expect(isAssetClaimedSync(storage, 'id2')).toBe(true);
      expect(isAssetClaimedSync(storage, 'id3')).toBe(true);
      expect(isAssetClaimedSync(storage, 'id4')).toBe(false);
    });

    test('isAssetClaimed checks claim history store too', () => {
      const storage = {
        fabMonthlyFreeClaimed: {},
        fabGrabClaimHistory: [
          { id: 'history-uid-1', name: 'Old Claim', source: 'fab' },
          { id: 'history-uid-2', name: 'Another', source: 'fab' },
        ]
      };
      expect(isAssetClaimedSync(storage, 'history-uid-1')).toBe(true);
      expect(isAssetClaimedSync(storage, 'history-uid-2')).toBe(true);
      expect(isAssetClaimedSync(storage, 'unknown-uid')).toBe(false);
    });

    test('getUnclaimedAssets excludes history-claimed assets', () => {
      const storage = {
        fabMonthlyFreeClaimed: { 'direct-claim': Date.now() },
        fabGrabClaimHistory: [
          { id: 'history-claim', name: 'Claimed via content script', source: 'fab' }
        ]
      };
      const assets = [
        { uid: 'direct-claim', title: 'Direct' },
        { uid: 'history-claim', title: 'Via History' },
        { uid: 'unclaimed', title: 'New' },
      ];
      const unclaimed = getUnclaimedAssetsSync(storage, assets);
      expect(unclaimed).toHaveLength(1);
      expect(unclaimed[0].uid).toBe('unclaimed');
    });
  });
});

// ── API Integration Test ────────────────────────────

test.describe('FAB API integration', () => {
  test('fetches limited-time-free data from FAB API', async ({ request }) => {
    const response = await request.get('https://www.fab.com/i/blades/free_content_blade');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('isLimitedFreeContent', true);
    expect(data).toHaveProperty('tiles');
    expect(data.tiles.length).toBeGreaterThan(0);
    expect(data).toHaveProperty('title');

    const firstTile = data.tiles[0];
    expect(firstTile).toHaveProperty('listing');
    expect(firstTile.listing).toHaveProperty('uid');
    expect(firstTile.listing).toHaveProperty('title');
    expect(firstTile.listing).toHaveProperty('licenses');

    const personalLicense = firstTile.listing.licenses.find(l => l.slug === 'personal');
    expect(personalLicense).toBeDefined();
    expect(personalLicense.priceTier).toHaveProperty('discountedPrice', 0);
    expect(personalLicense.priceTier).toHaveProperty('discountEndDate');
  });

  test('parseBladeData works with real API response', async ({ request }) => {
    const response = await request.get('https://www.fab.com/i/blades/free_content_blade');
    const data = await response.json();
    const parsed = parseBladeData(data);

    expect(parsed).not.toBeNull();
    expect(parsed.isLimitedFreeContent).toBe(true);
    expect(parsed.assets.length).toBeGreaterThan(0);
    expect(parsed.fetchedAt).toBeGreaterThan(0);

    for (const asset of parsed.assets) {
      expect(asset.uid).toBeTruthy();
      expect(asset.title).toBeTruthy();
      expect(asset.url).toContain('https://www.fab.com/listings/');
    }
  });
});

// ── Options Page UI Test ────────────────────────────

test.describe('Options page - FAB Monthly Free section', () => {
  test('monthly free section exists in options HTML', async ({ page }) => {
    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const section = page.locator('#monthly-free-section');
    await expect(section).toBeVisible();

    const title = page.locator('.section-title', { hasText: 'FAB Monthly Free Assets' });
    await expect(title).toBeVisible();

    const fabLink = page.locator('a[href="https://www.fab.com/limited-time-free"]');
    await expect(fabLink).toBeVisible();
    await expect(fabLink).toHaveAttribute('target', '_blank');
  });

  test('monthly free section has loading state', async ({ page }) => {
    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const loading = page.locator('#monthly-free-loading');
    await expect(loading).toBeVisible();

    const spinner = page.locator('.monthly-free-spinner');
    await expect(spinner).toBeVisible();
  });

  test('monthly free section has refresh and retry buttons', async ({ page }) => {
    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const refreshBtn = page.locator('#monthly-free-refresh');
    await expect(refreshBtn).toBeVisible();

    const retryBtn = page.locator('#monthly-free-retry');
    await expect(retryBtn).toBeAttached();
  });

  test('renders assets when data is available', async ({ page }) => {
    await page.addInitScript(() => {
      window.chrome = window.chrome || {};
      window.chrome.storage = window.chrome.storage || {};
      window.chrome.storage.sync = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.local = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.onChanged = { addListener: () => {} };
      window.chrome.runtime = {
        sendMessage: (msg, callback) => {
          if (msg.type === 'FETCH_MONTHLY_FREE') {
            callback({
              success: true,
              data: {
                title: 'Limited-Time Free (Until May 19)',
                isLimitedFreeContent: true,
                assets: [
                  {
                    uid: 'test-uid-1',
                    title: 'Amazing 3D Asset',
                    description: 'A beautiful 3D model for your project',
                    image: 'https://media.fab.com/test-image.jpg',
                    url: 'https://www.fab.com/listings/test-uid-1',
                    sellerName: 'Test Creator',
                    listingType: '3d-model',
                    averageRating: 4.5,
                    totalRatings: 10,
                    originalPrice: 49.99,
                    discountEndDate: new Date(Date.now() + 86400000 * 3).toISOString(),
                    assetFormats: ['Unreal Engine', 'Unity']
                  },
                  {
                    uid: 'test-uid-2',
                    title: 'VFX Pack Pro',
                    description: 'Professional VFX particle system',
                    image: '',
                    url: 'https://www.fab.com/listings/test-uid-2',
                    sellerName: 'VFX Studio',
                    listingType: 'vfx',
                    averageRating: 5,
                    totalRatings: 20,
                    originalPrice: 29.99,
                    discountEndDate: new Date(Date.now() + 86400000 * 5).toISOString(),
                    assetFormats: ['Unreal Engine']
                  }
                ],
                fetchedAt: Date.now()
              }
            });
          } else if (msg.type === 'FETCH_WEEKLY_ASSET') {
            callback({ success: false, error: 'skip' });
          } else if (msg.type === 'GET_CLAIMED_STATUS') {
            callback({});
          }
        },
        lastError: null,
      };
    });

    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const content = page.locator('#monthly-free-content');
    await expect(content).toBeVisible({ timeout: 5000 });

    const titleEl = page.locator('#monthly-free-title');
    await expect(titleEl).toHaveText('Limited-Time Free (Until May 19)');

    const badge = page.locator('#monthly-free-badge');
    await expect(badge).toHaveText('2 assets');

    const items = page.locator('.monthly-free-item');
    await expect(items).toHaveCount(2);

    const firstItem = items.nth(0);
    const firstLink = firstItem.locator('.monthly-free-item-link');
    await expect(firstLink).toHaveAttribute('href', 'https://www.fab.com/listings/test-uid-1');
    await expect(firstItem.locator('.monthly-free-item-name')).toHaveText('Amazing 3D Asset');
    await expect(firstItem.locator('.monthly-free-item-seller')).toHaveText('Test Creator');
    await expect(firstItem.locator('.monthly-free-item-desc')).toHaveText('A beautiful 3D model for your project');

    const formats = firstItem.locator('.monthly-free-item-format');
    await expect(formats).toHaveCount(2);
    await expect(formats.nth(0)).toHaveText('Unreal Engine');
    await expect(formats.nth(1)).toHaveText('Unity');

    const expiry = firstItem.locator('.monthly-free-item-expiry');
    await expect(expiry).toBeVisible();
    await expect(expiry).toHaveText(/\d+d left/);

    const claimBtn = firstItem.locator('.monthly-free-claim-btn');
    await expect(claimBtn).toHaveText('Claim Free');

    const secondItem = items.nth(1);
    await expect(secondItem.locator('.monthly-free-item-name')).toHaveText('VFX Pack Pro');
  });

  test('shows error state when fetch fails', async ({ page }) => {
    await page.addInitScript(() => {
      window.chrome = window.chrome || {};
      window.chrome.storage = window.chrome.storage || {};
      window.chrome.storage.sync = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.local = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.onChanged = { addListener: () => {} };
      window.chrome.runtime = {
        sendMessage: (msg, callback) => {
          if (msg.type === 'FETCH_MONTHLY_FREE') {
            callback({ success: false, error: 'Network timeout' });
          } else if (msg.type === 'FETCH_WEEKLY_ASSET') {
            callback({ success: false, error: 'skip' });
          }
        },
        lastError: null,
      };
    });

    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const error = page.locator('#monthly-free-error');
    await expect(error).toBeVisible({ timeout: 5000 });

    const errorMsg = page.locator('#monthly-free-error-msg');
    await expect(errorMsg).toHaveText('Network timeout');
  });

  test('shows ownership badge for claimed assets', async ({ page }) => {
    await page.addInitScript(() => {
      window.chrome = window.chrome || {};
      window.chrome.storage = window.chrome.storage || {};
      window.chrome.storage.sync = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.local = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.onChanged = { addListener: () => {} };
      window.chrome.runtime = {
        sendMessage: (msg, callback) => {
          if (msg.type === 'FETCH_MONTHLY_FREE') {
            callback({
              success: true,
              data: {
                title: 'Limited-Time Free',
                isLimitedFreeContent: true,
                assets: [
                  {
                    uid: 'claimed-uid', title: 'Already Owned Asset', description: 'Done',
                    image: '', url: 'https://www.fab.com/listings/claimed-uid',
                    sellerName: 'Seller', listingType: '3d-model', averageRating: 5, totalRatings: 10,
                    originalPrice: 49.99, discountEndDate: new Date(Date.now() + 86400000).toISOString(),
                    assetFormats: ['Unreal Engine']
                  },
                  {
                    uid: 'unclaimed-uid', title: 'New Free Asset', description: 'Get it',
                    image: '', url: 'https://www.fab.com/listings/unclaimed-uid',
                    sellerName: 'Creator', listingType: 'vfx', averageRating: 4, totalRatings: 5,
                    originalPrice: 29.99, discountEndDate: new Date(Date.now() + 86400000 * 5).toISOString(),
                    assetFormats: ['Unity']
                  }
                ],
                fetchedAt: Date.now()
              }
            });
          } else if (msg.type === 'GET_CLAIMED_STATUS') {
            const map = {};
            for (const uid of msg.assetUids) {
              map[uid] = uid === 'claimed-uid';
            }
            callback(map);
          } else if (msg.type === 'FETCH_WEEKLY_ASSET') {
            callback({ success: false, error: 'skip' });
          }
        },
        lastError: null,
      };
    });

    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const content = page.locator('#monthly-free-content');
    await expect(content).toBeVisible({ timeout: 5000 });

    const claimedCard = page.locator('.monthly-free-item--claimed');
    await expect(claimedCard).toHaveCount(1);

    const ownedBadge = claimedCard.locator('.monthly-free-item-owned');
    await expect(ownedBadge).toHaveText('Saved in My Library');

    const claimedBtn = claimedCard.locator('.monthly-free-claim-btn');
    await expect(claimedBtn).toHaveText('Claimed');
    await expect(claimedBtn).toBeDisabled();

    const unclaimedCard = page.locator('.monthly-free-item:not(.monthly-free-item--claimed)');
    await expect(unclaimedCard).toHaveCount(1);

    const claimBtn = unclaimedCard.locator('.monthly-free-claim-btn');
    await expect(claimBtn).toHaveText('Claim Free');
    await expect(claimBtn).toBeEnabled();
  });

  test('claim button triggers claim flow', async ({ page }) => {
    let claimMsgSent = null;

    await page.addInitScript(() => {
      window.chrome = window.chrome || {};
      window.chrome.storage = window.chrome.storage || {};
      window.chrome.storage.sync = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.local = {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      };
      window.chrome.storage.onChanged = { addListener: () => {} };
      window.chrome.runtime = {
        sendMessage: (msg, callback) => {
          if (msg.type === 'FETCH_MONTHLY_FREE') {
            callback({
              success: true,
              data: {
                title: 'Free Assets',
                isLimitedFreeContent: true,
                assets: [{
                  uid: 'test-claim-uid', title: 'Claim Test Asset', description: 'Test',
                  image: '', url: 'https://www.fab.com/listings/test-claim-uid',
                  sellerName: 'Seller', listingType: '3d-model', averageRating: 5, totalRatings: 10,
                  originalPrice: 19.99, discountEndDate: new Date(Date.now() + 86400000).toISOString(),
                  assetFormats: []
                }],
                fetchedAt: Date.now()
              }
            });
          } else if (msg.type === 'GET_CLAIMED_STATUS') {
            callback({ 'test-claim-uid': false });
          } else if (msg.type === 'CLAIM_MONTHLY_FREE') {
            window.__claimMsg = msg;
            callback({ success: true, tabId: 123 });
          } else if (msg.type === 'FETCH_WEEKLY_ASSET') {
            callback({ success: false, error: 'skip' });
          }
        },
        lastError: null,
      };
    });

    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const claimBtn = page.locator('.monthly-free-claim-btn');
    await expect(claimBtn).toBeVisible({ timeout: 5000 });
    await expect(claimBtn).toHaveText('Claim Free');

    await claimBtn.click();

    const msg = await page.evaluate(() => window.__claimMsg);
    expect(msg).not.toBeNull();
    expect(msg.type).toBe('CLAIM_MONTHLY_FREE');
    expect(msg.assetUid).toBe('test-claim-uid');
    expect(msg.assetUrl).toBe('https://www.fab.com/listings/test-claim-uid');
    expect(msg.assetName).toBe('Claim Test Asset');

    await expect(claimBtn).toHaveText('Claiming...');
    await expect(claimBtn).toBeDisabled();
  });

  test('auto-claim toggle exists in FAB section', async ({ page }) => {
    await page.goto('file://' + __dirname.replace(/\\/g, '/') + '/../src/options/options.html');

    const toggle = page.locator('#opt-fab-auto-claim');
    await expect(toggle).toBeAttached();

    const label = page.locator('.option-label', { hasText: 'Auto-Claim Monthly Free' });
    await expect(label).toBeVisible();

    const desc = page.locator('.option-desc', { hasText: 'Automatically claim FAB limited-time free' });
    await expect(desc).toBeVisible();
  });
});
