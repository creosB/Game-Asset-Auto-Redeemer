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

function absoluteUnityUrl(href) {
  if (!href) return '';
  return /^https?:\/\//i.test(href) ? href : 'https://assetstore.unity.com' + (href.charAt(0) === '/' ? href : '/' + href);
}

function extractBalancedObject(text, start) {
  if (start < 0 || text.charAt(start) !== '{') return null;
  var depth = 0;
  var inString = false;
  var escaped = false;
  for (var i = start; i < text.length; i++) {
    var ch = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseNextFlightCallout(htmlText) {
  var scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  var scriptMatch;
  while ((scriptMatch = scriptRe.exec(htmlText))) {
    var script = scriptMatch[1];
    var pushAt = script.indexOf('self.__next_f.push(');
    if (pushAt === -1) continue;

    var argsStart = pushAt + 'self.__next_f.push('.length;
    var argsEnd = script.lastIndexOf(')');
    if (argsEnd <= argsStart) continue;

    var chunk;
    try {
      var args = JSON.parse(script.slice(argsStart, argsEnd));
      chunk = Array.isArray(args) && typeof args[1] === 'string' ? args[1] : '';
    } catch (_) {
      continue;
    }

    var marker = '"__typename":"CalloutSlim"';
    var markerAt = chunk.indexOf(marker);
    if (markerAt === -1) continue;

    var dataAt = chunk.lastIndexOf('"data":{', markerAt);
    if (dataAt === -1) continue;
    var objectText = extractBalancedObject(chunk, dataAt + '"data":'.length);
    if (!objectText) continue;

    var data;
    try {
      data = JSON.parse(objectText);
    } catch (_) {
      continue;
    }
    if (!data || data.__typename !== 'CalloutSlim' || !data.heading) continue;

    var description = stripTags(data.description || '');
    return {
      name: stripTags(data.heading),
      image: data.image && data.image.url ? data.image.url : '',
      url: absoluteUnityUrl(data.cta && data.cta.url),
      description: description,
      couponCode: extractCouponCode(description),
      subheading: stripTags(data.subheading || ''),
      disclaimer: stripTags(data.legalDisclaimer || ''),
      fetchedAt: Date.now()
    };
  }
  return null;
}

function parseRenderedCallout(htmlText) {
  var sectionMatch = htmlText.match(/<section[^>]*data-type="CalloutSlim"[^>]*>([\s\S]*?)<\/section>/i);
  if (!sectionMatch) return null;
  var section = sectionMatch[1];
  var nameMatch = section.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  var name = nameMatch ? stripTags(nameMatch[1]) : '';
  if (!name) return null;

  var captionMatch = section.match(/<span[^>]*class="[^"]*caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  var bodyMatch = section.match(/<span[^>]*class="[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  var imgMatch = section.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
  var linkMatch = section.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
  var pMatch = section.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  var description = bodyMatch ? stripTags(bodyMatch[1]) : '';

  return {
    name: name,
    image: imgMatch ? imgMatch[1] : '',
    url: absoluteUnityUrl(linkMatch ? linkMatch[1] : ''),
    description: description,
    couponCode: extractCouponCode(description),
    subheading: captionMatch ? stripTags(captionMatch[1]) : '',
    disclaimer: pMatch ? stripTags(pMatch[1]) : '',
    fetchedAt: Date.now()
  };
}

function parseHtml(htmlText) {
  // The current Next.js page server-renders an empty CalloutSlim shell and puts
  // its CMS data in a self.__next_f payload. Prefer visible legacy markup when
  // available, then read the structured RSC payload without scraping classes.
  return parseRenderedCallout(htmlText) || parseNextFlightCallout(htmlText);
}

async function getCachedAsset() {
  try {
    var result = await chrome.storage.local.get(CACHE_KEY);
    var cached = result[CACHE_KEY];
    if (cached && cached.name && cached.name !== 'Unknown Asset' && cached.fetchedAt && (Date.now() - cached.fetchedAt) < CACHE_TTL) {
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
      return { success: false, error: chrome.i18n.getMessage('error_http', [String(response.status)]) || 'HTTP ' + response.status };
    }

    var htmlText = await response.text();
    var data = parseHtml(htmlText);
    if (!data) {
      return { success: false, error: chrome.i18n.getMessage('weekly_not_found') || 'Could not find free asset section on page.' };
    }

    await setCachedAsset(data);
    return { success: true, data: data, cached: false };
  } catch (error) {
    return { success: false, error: error.message || chrome.i18n.getMessage('error_network') || 'Network error' };
  }
}

export { fetchWeeklyAsset, parseHtml, parseNextFlightCallout, extractCouponCode, CACHE_KEY };
