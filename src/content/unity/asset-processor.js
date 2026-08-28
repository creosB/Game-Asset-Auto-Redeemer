(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

  function recordClaim(id, name) {
    if (!ns.claimHistory) return;
    ns.claimHistory.addClaim({
      id: id,
      name: name,
      source: 'unity',
      url: id ? 'https://assetstore.unity.com/packages/package/' + id : null,
      license: null
    });
  }

  var GRAPHQL_URL = 'https://assetstore.unity.com/api/graphql';
  var GRAPHQL_MUTATION = 'mutation AddToDownload($id: String!) { addToDownload(id: $id) { id userOverview { lastDownloadAt: last_downloaded_at __typename } userEntitlement { id orderId grantTime __typename } __typename } }';

  var SELECTORS = {
    // The current /listing cards expose stable data-test hooks. Keep the old
    // selectors as fallbacks while Unity rolls the new storefront out.
    currentProductLink: 'a[data-test="product-card-name"][href*="/packages/"]',
    legacyProductCard: ['div._3YDeD', '[class*="packageCard"]', '[class*="PackageCard"]'],
    productLink: 'a[data-test="product-card-name"][href*="/packages/"], a[href*="/packages/"]',
    productTitle: ['a[data-test="product-card-name"]', 'div[data-test="package-title"]', '[class*="packageName"]', '[class*="title"]'],
    nextButton: 'button[aria-label="Next"]:not(:disabled), button[label="Next"]:not(:disabled)'
  };

  function getCsrfToken() {
    var value = '; ' + document.cookie;
    var parts = value.split('; _csrf=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  function normalizedText(node) {
    return String((node && node.textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function hasExactText(root, expected) {
    if (!root) return false;
    var target = String(expected || '').toLowerCase();
    var elements = root.querySelectorAll('*');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (el.children.length === 0 && normalizedText(el) === target) return true;
    }
    return false;
  }

  function findProductCards() {
    var currentLinks = document.querySelectorAll(SELECTORS.currentProductLink);
    if (currentLinks.length > 0) {
      var cards = [];
      var seen = [];
      for (var i = 0; i < currentLinks.length; i++) {
        var card = currentLinks[i].closest('li');
        if (card && seen.indexOf(card) === -1) {
          seen.push(card);
          cards.push(card);
        }
      }
      if (cards.length > 0) return cards;
    }

    for (var s = 0; s < SELECTORS.legacyProductCard.length; s++) {
      var legacyCards = document.querySelectorAll(SELECTORS.legacyProductCard[s]);
      if (legacyCards.length > 0) return Array.from(legacyCards);
    }
    return [];
  }

  function isFreeAndUnowned(product) {
    var text = normalizedText(product);
    var hasFreePrice = hasExactText(product, 'free');
    var isOwned = text.indexOf('you own this asset') !== -1 ||
      text.indexOf('open in unity') !== -1 ||
      text.indexOf('import') !== -1;

    // Old cards used an explicit Add to My Assets action. It remains a useful
    // fallback, but the new listing cards have no claim button at all.
    var hasLegacyAddButton = text.indexOf('add to my assets') !== -1;
    return (hasFreePrice || hasLegacyAddButton) && !isOwned;
  }

  function getFreeUnownedProducts() {
    return findProductCards().filter(isFreeAndUnowned);
  }

  function extractProductId(productElement) {
    var links = productElement.querySelectorAll(SELECTORS.productLink);
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || links[i].href;
      if (!href) continue;
      var pathMatch = href.match(/\/packages\/package\/(\d+)(?:[/?#]|$)/);
      if (pathMatch) return pathMatch[1];
      var slugMatch = href.match(/-(\d+)(?:[/?#]|$)/);
      if (slugMatch) return slugMatch[1];
    }
    return null;
  }

  function extractProductName(productElement) {
    for (var s = 0; s < SELECTORS.productTitle.length; s++) {
      var titleNode = productElement.querySelector(SELECTORS.productTitle[s]);
      if (titleNode && titleNode.innerText.trim()) return titleNode.innerText.trim();
    }
    var link = productElement.querySelector(SELECTORS.productLink);
    if (link) {
      var label = link.getAttribute('aria-label');
      if (label) return label.trim();
      if (link.textContent.trim()) return link.textContent.trim();
    }
    return 'Unknown Product';
  }

  async function redeemProduct(id) {
    var csrfToken = getCsrfToken();
    if (!csrfToken) throw new Error('CSRF token not found. User might not be logged in.');

    var payload = {
      query: GRAPHQL_MUTATION,
      variables: { id: id },
      operationName: 'AddToDownload'
    };

    var response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'operations': 'AddToDownload',
        'x-csrf-token': csrfToken,
        'x-requested-with': 'XMLHttpRequest',
        'x-source': 'storefront, storefront',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('HTTP Error: ' + response.status);

    var data = await response.json();
    if (data && data.data && data.data.addToDownload) return true;
    throw new Error('Invalid GraphQL response or asset already owned.');
  }

  async function processProduct(product, index) {
    var id = extractProductId(product);
    var name = extractProductName(product);
    var asset = state.assetsFound[index];
    if (asset) asset.status = 'processing';
    utils.log('[Unity] Processing: ' + name + ' (ID: ' + (id || 'N/A') + ')');

    if (!id) {
      utils.log('[Unity] Could not extract ID for: ' + name, 'warn');
      if (asset) asset.status = 'failed';
      state.assetsFailed++;
      return false;
    }

    try {
      await utils.retryWithBackoff(function() { return redeemProduct(id); }, config.maxRetries || 2, 1000);
      if (asset) asset.status = 'claimed';
      state.assetsClaimed++;
      recordClaim(id, name);
      utils.log('[Unity] Claimed: ' + name);
      return true;
    } catch (err) {
      utils.log('[Unity] Failed: ' + name + ' - ' + err.message, 'error');
      if (asset) asset.status = 'failed';
      state.assetsFailed++;
      return false;
    }
  }

  function getFreeAssetCards() {
    var products = getFreeUnownedProducts();
    var cards = [];
    for (var i = 0; i < products.length; i++) {
      cards.push({
        element: products[i],
        name: extractProductName(products[i]),
        id: extractProductId(products[i]),
        status: 'pending',
        claimButton: null,
        actionType: null
      });
    }
    utils.log('[Unity] Found ' + cards.length + ' free unowned asset(s).');
    return cards;
  }

  async function processAllAssets() {
    state.statusText = t('controller_scanning');
    utils.log('[Unity] Scanning for free assets...');
    state.assetsFound = getFreeAssetCards();
    state.assetsTotal = state.assetsFound.length;

    if (state.assetsFound.length === 0) {
      state.statusText = t('assets_none_found');
      utils.log('[Unity] No free assets on this page.');
      return;
    }

    utils.log('[Unity] Processing ' + state.assetsFound.length + ' asset(s)...');
    state.statusText = t('controller_claiming_n', String(0), String(state.assetsTotal));
    var products = getFreeUnownedProducts();

    for (var i = 0; i < state.assetsFound.length; i++) {
      if (state.shouldStop) {
        utils.log('[Unity] Stopped by user.');
        state.statusText = t('controller_stopped');
        break;
      }
      state.statusText = t('controller_claiming_n', String(i + 1), String(state.assetsTotal));
      await processProduct(products[i], i);
      if (i < state.assetsFound.length - 1 && !state.shouldStop) {
        var delay = config.unityDelayBetweenProducts || 500;
        var jitter = delay * 0.2 * (Math.random() - 0.5);
        await utils.wait(delay + jitter);
      }
    }

    var summary = t('controller_summary_simple', String(state.assetsClaimed), String(state.assetsFailed));
    state.statusText = summary;
    utils.log('[Unity] ' + summary);
    if (config.unityAutoPaginate !== false && !state.shouldStop) await goToNextPage();
  }

  async function goToNextPage() {
    var nextButton = document.querySelector(SELECTORS.nextButton);
    if (!nextButton) {
      utils.log('[Unity] No more pages.');
      return;
    }

    var pageDelay = config.unityDelayBeforeNextPage || 10000;
    utils.log('[Unity] Next page in ' + pageDelay + 'ms...');
    state.statusText = t('controller_waiting_page');
    await utils.wait(pageDelay);
    if (state.shouldStop) return;

    var previousIds = getFreeUnownedProducts().map(extractProductId).join(',');
    nextButton.click();

    var retries = 15;
    while (!state.shouldStop && retries > 0) {
      await utils.wait(1000);
      var products = getFreeUnownedProducts();
      var currentIds = products.map(extractProductId).join(',');
      if (products.length > 0 && currentIds !== previousIds) break;
      retries--;
    }

    if (!state.shouldStop && getFreeUnownedProducts().length > 0) await processAllAssets();
  }

  ns.assetProcessor = {
    getFreeAssetCards: getFreeAssetCards,
    processAllAssets: processAllAssets,
    processProduct: processProduct,
    getFreeUnownedProducts: getFreeUnownedProducts,
    extractProductId: extractProductId,
    extractProductName: extractProductName,
    redeemProduct: redeemProduct
  };
})();
