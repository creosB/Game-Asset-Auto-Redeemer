var FAB_FREE_BLADE_URL = 'https://www.fab.com/i/blades/free_content_blade';
var CACHE_KEY = 'fabMonthlyFreeCache';
var SCHEDULE_KEY = 'fabMonthlyFreeSchedule';
var CLAIMED_KEY = 'fabMonthlyFreeClaimed';
var CLAIM_HISTORY_KEY = 'fabGrabClaimHistory';
var CACHE_TTL = 12 * 60 * 60 * 1000;

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
    var professionalLicense = null;
    if (listing.licenses) {
      for (var j = 0; j < listing.licenses.length; j++) {
        var lic = listing.licenses[j];
        if (lic.slug === 'personal') personalLicense = lic;
        if (lic.slug === 'professional') professionalLicense = lic;
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

async function getCachedData() {
  try {
    var result = await chrome.storage.local.get(CACHE_KEY);
    var cached = result[CACHE_KEY];
    if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
      return cached;
    }
  } catch (e) {}
  return null;
}

async function setCachedData(data) {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: data });
  } catch (e) {}
}

async function checkOwnershipFromPage(url) {
  try {
    var response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return false;
    var html = await response.text();
    return html.indexOf('Saved in My Library') !== -1 ||
           html.indexOf('saved-in-my-library') !== -1 ||
           html.indexOf('"isOwned":true') !== -1 ||
           html.indexOf('"isOwned": true') !== -1;
  } catch (e) {
    return false;
  }
}

async function syncOwnershipStatus(assets) {
  var checks = assets.map(function(asset) {
    return checkOwnershipFromPage(asset.url).then(function(owned) {
      return { uid: asset.uid, owned: owned };
    }).catch(function() {
      return { uid: asset.uid, owned: false };
    });
  });
  var results = await Promise.all(checks);
  var map = await getClaimedMap();
  var changed = false;
  for (var i = 0; i < results.length; i++) {
    if (results[i].owned && !map[results[i].uid]) {
      map[results[i].uid] = Date.now();
      changed = true;
    }
  }
  if (changed) await setClaimedMap(map);
}

async function fetchMonthlyFree(forceRefresh) {
  if (!forceRefresh) {
    var cached = await getCachedData();
    if (cached) {
      syncOwnershipStatus(cached.assets).catch(function() {});
      return { success: true, data: cached, cached: true };
    }
  }

  try {
    var response = await fetch(FAB_FREE_BLADE_URL, {
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      return { success: false, error: 'HTTP ' + response.status };
    }

    var json = await response.json();
    var data = parseBladeData(json);

    if (!data) {
      return { success: false, error: 'No limited-time free assets found.' };
    }

    await syncOwnershipStatus(data.assets);
    await setCachedData(data);
    return { success: true, data: data, cached: false };
  } catch (error) {
    return { success: false, error: error.message || 'Network error' };
  }
}

function getCheckDates(year, month) {
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

async function getSchedule() {
  try {
    var result = await chrome.storage.local.get(SCHEDULE_KEY);
    return result[SCHEDULE_KEY] || {};
  } catch (e) {
    return {};
  }
}

async function setSchedule(schedule) {
  try {
    await chrome.storage.local.set({ [SCHEDULE_KEY]: schedule });
  } catch (e) {}
}

async function shouldCheckThisPeriod() {
  var schedule = await getSchedule();
  var monthKey = getCurrentMonthKey();
  var now = new Date();
  var day = now.getDate();

  var period;
  if (day <= 10) period = 'beginning';
  else if (day <= 20) period = 'middle';
  else period = 'end';

  var lastCheck = schedule[monthKey];
  if (lastCheck && lastCheck[period]) return false;

  return true;
}

async function markPeriodChecked() {
  var schedule = await getSchedule();
  var monthKey = getCurrentMonthKey();
  var now = new Date();
  var day = now.getDate();

  var period;
  if (day <= 10) period = 'beginning';
  else if (day <= 20) period = 'middle';
  else period = 'end';

  if (!schedule[monthKey]) schedule[monthKey] = {};
  schedule[monthKey][period] = Date.now();

  var keys = Object.keys(schedule);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] < monthKey) delete schedule[keys[i]];
  }

  await setSchedule(schedule);
}

async function autoCheck() {
  var should = await shouldCheckThisPeriod();
  if (!should) return { skipped: true };

  var result = await fetchMonthlyFree(true);
  if (result.success) {
    await markPeriodChecked();
  }
  return result;
}

async function getClaimedMap() {
  try {
    var result = await chrome.storage.local.get(CLAIMED_KEY);
    return result[CLAIMED_KEY] || {};
  } catch (e) {
    return {};
  }
}

async function setClaimedMap(map) {
  try {
    await chrome.storage.local.set({ [CLAIMED_KEY]: map });
  } catch (e) {}
}

async function markAssetClaimed(assetUid) {
  var map = await getClaimedMap();
  map[assetUid] = Date.now();
  await setClaimedMap(map);
}

async function isAssetClaimed(assetUid) {
  var map = await getClaimedMap();
  if (map[assetUid]) return true;

  try {
    var result = await chrome.storage.local.get({ [CLAIM_HISTORY_KEY]: [] });
    var history = result[CLAIM_HISTORY_KEY] || [];
    for (var i = 0; i < history.length; i++) {
      if (history[i].id === assetUid) return true;
    }
  } catch (e) {}

  return false;
}

async function getUnclaimedAssets(assets) {
  var map = await getClaimedMap();
  var historyIds = {};
  try {
    var result = await chrome.storage.local.get({ [CLAIM_HISTORY_KEY]: [] });
    var history = result[CLAIM_HISTORY_KEY] || [];
    for (var h = 0; h < history.length; h++) {
      if (history[h].id) historyIds[history[h].id] = true;
    }
  } catch (e) {}

  var unclaimed = [];
  for (var i = 0; i < assets.length; i++) {
    if (!map[assets[i].uid] && !historyIds[assets[i].uid]) {
      unclaimed.push(assets[i]);
    }
  }
  return unclaimed;
}

export {
  fetchMonthlyFree,
  autoCheck,
  shouldCheckThisPeriod,
  markPeriodChecked,
  markAssetClaimed,
  isAssetClaimed,
  getUnclaimedAssets,
  parseBladeData,
  stripHtml,
  pickImage,
  CACHE_KEY,
  SCHEDULE_KEY,
  CLAIMED_KEY
};
