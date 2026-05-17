var UNITY_PUBLISHER_SALE_URL = 'https://assetstore.unity.com/publisher-sale';
var CACHE_KEY = 'unityWeeklyAssetCache';
var CACHE_TTL = 60 * 60 * 1000;

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function extractCouponCode(text) {
  if (!text) return null;
  var patterns = [
    /coupon\s+code\s+([A-Z0-9]+)/i,
    /code\s+([A-Z0-9]+)\s+at\s+checkout/i,
    /enter\s+([A-Z0-9]+)\s+at\s+checkout/i,
    /use\s+code\s+([A-Z0-9]+)/i
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match) return match[1];
  }
  return null;
}

function parseHtml(htmlText) {
  var sectionMatch = htmlText.match(/<section[^>]*data-type="CalloutSlim"[^>]*>([\s\S]*?)<\/section>/i);
  if (!sectionMatch) return null;

  var section = sectionMatch[1];

  var nameMatch = section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  var name = nameMatch ? stripTags(nameMatch[1]) : 'Unknown Asset';

  var captionMatch = section.match(/<span[^>]*class="[^"]*caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  var subheading = captionMatch ? stripTags(captionMatch[1]) : '';

  var bodyMatch = section.match(/<span[^>]*class="[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  var description = bodyMatch ? stripTags(bodyMatch[1]) : '';

  var imgMatch = section.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
  var image = imgMatch ? imgMatch[1] : '';

  var linkMatch = section.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
  var href = linkMatch ? linkMatch[1] : '';
  if (href && !href.startsWith('http')) {
    href = 'https://assetstore.unity.com' + href;
  }

  var pMatch = section.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  var disclaimer = pMatch ? stripTags(pMatch[1]) : '';

  var couponCode = extractCouponCode(description);

  return {
    name: name,
    image: image,
    url: href,
    description: description,
    couponCode: couponCode,
    subheading: subheading,
    disclaimer: disclaimer,
    fetchedAt: Date.now()
  };
}

async function getCachedAsset() {
  try {
    var result = await chrome.storage.local.get(CACHE_KEY);
    var cached = result[CACHE_KEY];
    if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
      return cached;
    }
  } catch (e) {}
  return null;
}

async function setCachedAsset(data) {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: data });
  } catch (e) {}
}

async function fetchWeeklyAsset(forceRefresh) {
  if (!forceRefresh) {
    var cached = await getCachedAsset();
    if (cached) return { success: true, data: cached, cached: true };
  }

  try {
    var response = await fetch(UNITY_PUBLISHER_SALE_URL, {
      headers: { 'Accept': 'text/html' }
    });

    if (!response.ok) {
      return { success: false, error: 'HTTP ' + response.status };
    }

    var htmlText = await response.text();
    var data = parseHtml(htmlText);

    if (!data) {
      return { success: false, error: 'Could not find free asset section on page.' };
    }

    await setCachedAsset(data);
    return { success: true, data: data, cached: false };
  } catch (error) {
    return { success: false, error: error.message || 'Network error' };
  }
}

export { fetchWeeklyAsset, parseHtml, extractCouponCode, CACHE_KEY };
