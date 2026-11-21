(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

  var _sessionClaimedIds = new Set();

  function markCardClaimedInDom(asset) {
    if (!asset) return;
    if (asset.id) _sessionClaimedIds.add(asset.id);
    if (asset.element && asset.element.isConnected) {
      asset.element.setAttribute('data-fab-grab-claimed', '1');
      if (ns.hideOwned && ns.hideOwned.isActive && ns.hideOwned.isActive()) {
        asset.element.classList.add('fab-grab-hidden-owned');
      }
    }
  }

  function recordClaim(asset, licenseUsed) {
    if (!ns.claimHistory) return;
    var link = asset.element ? asset.element.querySelector('a[href*="/listings/"]') : null;
    var url = link ? link.href : (asset.id ? 'https://www.fab.com/listings/' + asset.id : null);
    ns.claimHistory.addClaim({
      id: asset.id,
      name: asset.name,
      source: 'fab',
      url: url,
      license: licenseUsed || asset.license || config.preferredLicense || null
    });
  }

  function getAssetName(card) {
    var primary = card.querySelector('.fabkit-Typography-ellipsisWrapper');
    if (primary && primary.textContent.trim()) {
      return primary.textContent.trim();
    }
    var link = card.querySelector('a[href*="/listings/"]');
    if (link) {
      var label = link.getAttribute('aria-label');
      if (label) {
        return label.replace(/\s+by\s+.+$/, '').trim();
      }
    }
    return 'Unknown Asset';
  }

  function getAssetId(card) {
    var link = card.querySelector('a[href*="/listings/"]');
    if (!link) return null;
    var href = link.getAttribute('href');
    if (!href) return null;
    var m = href.match(/\/listings\/([^/?#]+)/i);
    return m ? m[1] : href.split('/').pop();
  }

  function dispatchHover(card) {
    var rect = card.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy
    };
    card.dispatchEvent(new PointerEvent('pointerover', opts));
    card.dispatchEvent(new PointerEvent('pointerenter', opts));
    card.dispatchEvent(new MouseEvent('mouseover', opts));
    card.dispatchEvent(new MouseEvent('mouseenter', opts));
    card.dispatchEvent(new MouseEvent('mousemove', opts));
  }

  async function revealCardButtons(card) {
    dispatchHover(card);
    await utils.wait(250);
  }

  /** Hover every card once, then wait a single shared beat for React to
   * mount hover-lazy quick-action buttons. Lets those assets join the batch
   * fast-path instead of the slow sequential queue. */
  async function bulkRevealButtons(assets) {
    var needsReveal = false;
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].actionType === 'library' && assets[i].claimButton) continue;
      needsReveal = true;
      if (assets[i].element && assets[i].element.isConnected) {
        dispatchHover(assets[i].element);
      }
    }
    if (needsReveal) await utils.wait(600);
    return needsReveal;
  }

  function findCardActionButton(card) {
    var btn;
    var tier;

    btn = card.querySelector('button[aria-label="Add to library"]');
    if (btn) {
      tier = 'aria-label-exact';
      utils.debug('[Selector:Button] Tier "' + tier + '" matched type=library');
      return { button: btn, type: 'library' };
    }

    btn = card.querySelector('button[aria-label="Add listing to cart"]');
    if (btn) {
      tier = 'aria-label-exact';
      utils.debug('[Selector:Button] Tier "' + tier + '" matched type=cart');
      return { button: btn, type: 'cart' };
    }

    btn = card.querySelector('button:has(i.edsicon-shopping-cart-plus)');
    if (btn) {
      tier = 'icon-class';
      utils.debug('[Selector:Button] Tier "' + tier + '" matched type=cart');
      return { button: btn, type: 'cart' };
    }

    btn = card.querySelector(
      'button:has(i[class*="library"]), button:has(i[class*="plus"])'
    );
    if (btn) {
      tier = 'icon-class';
      utils.debug('[Selector:Button] Tier "' + tier + '" matched type=library');
      return { button: btn, type: 'library' };
    }

    var buttons = card.querySelectorAll('button[aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      var al = buttons[i].getAttribute('aria-label').toLowerCase();
      if (al.indexOf('library') !== -1) {
        tier = 'aria-label-keyword';
        utils.debug('[Selector:Button] Tier "' + tier + '" matched type=library');
        return { button: buttons[i], type: 'library' };
      }
      if (al.indexOf('cart') !== -1) {
        tier = 'aria-label-keyword';
        utils.debug('[Selector:Button] Tier "' + tier + '" matched type=cart');
        return { button: buttons[i], type: 'cart' };
      }
    }

    // Listing detail pages render their CTA without an aria-label (e.g. a
    // plain "Add to cart" button). Match on the visible text.
    var plainButtons = card.querySelectorAll('button');
    for (var p = 0; p < plainButtons.length; p++) {
      var ptxt = plainButtons[p].textContent.trim().toLowerCase();
      if (!ptxt || ptxt.indexOf('wishlist') !== -1 || ptxt.indexOf('add') === -1) continue;
      if (ptxt.indexOf('library') !== -1) {
        tier = 'button-text';
        utils.debug('[Selector:Button] Tier "' + tier + '" matched type=library');
        return { button: plainButtons[p], type: 'library' };
      }
      if (ptxt.indexOf('cart') !== -1) {
        tier = 'button-text';
        utils.debug('[Selector:Button] Tier "' + tier + '" matched type=cart');
        return { button: plainButtons[p], type: 'cart' };
      }
    }

    var overlay = card.querySelector('.fabkit-Thumbnail-item.fabkit-Thumbnail--top-right');
    if (overlay) {
      var overlayBtns = overlay.querySelectorAll('button');
      for (var k = 0; k < overlayBtns.length; k++) {
        var oal = (overlayBtns[k].getAttribute('aria-label') || '').toLowerCase();
        var otxt = overlayBtns[k].textContent.trim().toLowerCase();
        if (oal.indexOf('library') !== -1 || otxt.indexOf('library') !== -1) {
          tier = 'overlay-container';
          utils.debug('[Selector:Button] Tier "' + tier + '" matched type=library');
          return { button: overlayBtns[k], type: 'library' };
        }
        if (oal.indexOf('cart') !== -1 || otxt.indexOf('cart') !== -1) {
          tier = 'overlay-container';
          utils.debug('[Selector:Button] Tier "' + tier + '" matched type=cart');
          return { button: overlayBtns[k], type: 'cart' };
        }
      }

      if (overlayBtns.length === 1) {
        tier = 'overlay-singleton';
        var onlyBtn = overlayBtns[0];
        var onlyAl = (onlyBtn.getAttribute('aria-label') || '').toLowerCase();
        var onlyTxt = onlyBtn.textContent.trim().toLowerCase();
        var isLibrary = onlyAl.indexOf('library') !== -1 || onlyAl.indexOf('add') !== -1 ||
                        onlyTxt.indexOf('library') !== -1;
        var btnType = isLibrary ? 'library' : 'cart';
        utils.debug('[Selector:Button] Tier "' + tier + '" matched type=' + btnType + ' (only button in overlay)');
        return { button: onlyBtn, type: btnType };
      }
    }

    return null;
  }

  function findCardRoot(link) {
    var node = link.parentElement;
    var compactRoot = null;
    while (node && node !== document.body) {
      var hasThumb = node.querySelector('.fabkit-Thumbnail-root');
      if (!hasThumb) { node = node.parentElement; continue; }

      // Remember the nearest thumbnail ancestor: seller/publisher profiles
      // render compact cards whose quick-action buttons are not in the DOM,
      // so it becomes the fallback card root.
      if (!compactRoot) compactRoot = node;

      // An ancestor holding several thumbnails is a grid, not a card. Stop
      // here: a sibling's button must not hijack this card's root.
      if (node.querySelectorAll('.fabkit-Thumbnail-root').length > 1) break;

      var hasCartBtn = node.querySelector(
        'button[aria-label*="cart" i], button[aria-label*="library" i]'
      );
      if (hasCartBtn) return node;

      var hasOverlay = node.querySelector('.fabkit-Thumbnail-item.fabkit-Thumbnail--top-right');
      if (hasOverlay) return node;

      node = node.parentElement;
    }
    return compactRoot;
  }

  function isAlreadyOwned(card) {
    var successEls = card.querySelectorAll(
      '.fabkit-Typography-root[class*="intent-success"], [class*="intent-success"]'
    );
    for (var i = 0; i < successEls.length; i++) {
      if (successEls[i].textContent.indexOf('Saved in My Library') !== -1) return true;
    }

    var checkIcons = card.querySelectorAll('i.edsicon-check-circle-filled, i[class*="check-circle"]');
    for (var j = 0; j < checkIcons.length; j++) {
      var parent = checkIcons[j].closest('div');
      if (parent && parent.textContent.indexOf('Saved in My Library') !== -1) return true;
    }

    var allText = card.querySelectorAll('div, span, p');
    for (var k = 0; k < allText.length; k++) {
      var t = allText[k];
      if (t.children.length === 0 && t.textContent.indexOf('Saved in My Library') !== -1) return true;
    }

    return false;
  }

  function getFreeAssetCards() {
    if (!utils.isCatalogPage()) return [];

    var links = document.querySelectorAll('a[href*="/listings/"]');
    var seen = new Set();
    var cards = [];

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var card = findCardRoot(link);
      if (!card) continue;

      if (seen.has(card)) continue;
      seen.add(card);

      var priceCandidates = card.querySelectorAll('.fabkit-Typography--intent-primary');
      var isFree = false;
      for (var j = 0; j < priceCandidates.length; j++) {
        if (priceCandidates[j].tagName === 'A') continue;
        if (priceCandidates[j].textContent.trim().toLowerCase() === 'free') {
          isFree = true;
          break;
        }
      }
      if (!isFree) continue;

      if (isAlreadyOwned(card)) {
        utils.debug('[Selector:CardDetect] Skipping owned asset: ' + getAssetName(card));
        continue;
      }

      var assetId = getAssetId(card);
      if (card.getAttribute('data-fab-grab-claimed') === '1' ||
          (assetId && _sessionClaimedIds.has(assetId))) {
        utils.debug('[Selector:CardDetect] Skipping session-claimed asset: ' + getAssetName(card));
        continue;
      }

      var action = findCardActionButton(card);
      if (action && action.button.disabled) continue;

      var btnText = action ? action.button.textContent.trim().toLowerCase() : '';
      if (
        btnText.indexOf('owned') !== -1 ||
        btnText.indexOf('in library') !== -1 ||
        btnText.indexOf('purchased') !== -1 ||
        btnText.indexOf('in cart') !== -1
      ) {
        continue;
      }

      var cardObj = {
        element: card,
        name: getAssetName(card),
        id: assetId,
        status: 'pending',
        claimButton: action ? action.button : null,
        actionType: action ? action.type : null
      };
      cards.push(cardObj);
    }

    utils.debug('[Selector:CardDetect] Tier "links+price-text" matched ' + cards.length + ' card(s).');

    if (cards.length === 0) {
      var stackCount = document.querySelectorAll('.fabkit-Stack-root').length;
      utils.debug(
        '[Selector:CardDetect] No cards found. URL: ' + window.location.href +
        ' | fabkit-Stack-root count: ' + stackCount,
        'warn'
      );
    }

    return cards;
  }

  var TOAST_TIERS = [
    {
      name: 'role-status',
      selector: '[role="status"]'
    },
    {
      name: 'class-based',
      selector: '[class*="toast"], [class*="Toast"], [class*="notification"], ' +
        '[class*="Notification"], [class*="snackbar"]'
    }
  ];

  function queryTiered(root, tiers) {
    for (var t = 0; t < tiers.length; t++) {
      var tier = tiers[t];
      if (!tier.selector) return { elements: [], tier: tier.name };
      var els = root.querySelectorAll(tier.selector);
      if (els.length > 0) {
        utils.debug('[Selector] Tier "' + tier.name + '" matched ' + els.length + ' element(s).');
        return { elements: Array.from(els), tier: tier.name };
      }
    }
    return { elements: [], tier: null };
  }

  async function waitForLibraryAddConfirmation(button, timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    var intervalMs = 200;
    var elapsed = 0;

    return new Promise(function(resolve) {
      var timer = setInterval(function() {
        elapsed += intervalMs;

        var al = (button.getAttribute('aria-label') || '').toLowerCase();
        if (
          al.indexOf('owned') !== -1 ||
          al.indexOf('in library') !== -1 ||
          al.indexOf('remove') !== -1
        ) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (button.disabled) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        var toastResult = queryTiered(document, TOAST_TIERS);
        var toast = toastResult.elements[0] || null;
        if (toast) {
          var toastText = toast.textContent.toLowerCase();
          if (
            toastText.indexOf('added') !== -1 ||
            toastText.indexOf('library') !== -1 ||
            toastText.indexOf('success') !== -1
          ) {
            clearInterval(timer);
            resolve(true);
            return;
          }
        }

        if (elapsed >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, intervalMs);
    });
  }

  /** SPA re-renders (e.g. returning from a listing detail page) rebuild the
   * grid, detaching stale element references. Re-resolve by listing id. */
  function rehydrateAsset(asset) {
    if (!asset.id) return;
    var link = document.querySelector('a[href$="/listings/' + asset.id + '"]') ||
      document.querySelector('a[href*="/listings/' + asset.id + '"]');
    if (!link) return;
    var root = findCardRoot(link);
    if (!root) return;
    asset.element = root;
    utils.debug('[Asset] Rehydrated element for: ' + asset.name);
  }

  async function waitForActionButton(root, timeoutMs) {
    var elapsed = 0;
    var step = 200;
    while (elapsed < timeoutMs) {
      var action = findCardActionButton(root);
      if (action) return action;
      await utils.wait(step);
      elapsed += step;
    }
    return null;
  }

  // ── Direct same-origin FAB API fast-path ──────────────────────────────
  // Claims free listings via GET /i/listings/<uid> + POST /i/listings/<uid>/add-to-library
  // in a bounded concurrent worker pool — bypassing card hovers, license modals,
  // detail-page roundtrips, and inter-click delays. Any listing that cannot be
  // claimed via API (or if auth/CSRF is unavailable) falls back cleanly to DOM.

  var API_CONCURRENCY = 2;
  var API_PACE_MS = 350;
  var API_MAX_PACE_MS = 4000;
  var API_RATE_LIMIT_RETRIES = 4;
  var API_RECOVERY_STREAK = 8;
  var LISTING_STATES_CHUNK = 24;

  var SPEED_PRESETS = {
    fast: { apiConcurrency: 4, apiClaimDelayMs: 120, delayBetweenActions: 800, dialogTimeout: 6000 },
    normal: { apiConcurrency: 2, apiClaimDelayMs: 350, delayBetweenActions: 1500, dialogTimeout: 10000 },
    casual: { apiConcurrency: 1, apiClaimDelayMs: 1000, delayBetweenActions: 2500, dialogTimeout: 12000 }
  };

  function resolveSpeedSettings() {
    if (ns.getFabSpeedSettings) return ns.getFabSpeedSettings(config);
    var mode = config.fabClaimSpeed;
    if (mode && SPEED_PRESETS[mode]) {
      return Object.assign({ mode: mode }, SPEED_PRESETS[mode]);
    }
    return {
      mode: mode || 'advanced',
      apiConcurrency: typeof config.apiConcurrency === 'number' && config.apiConcurrency >= 1
        ? Math.min(4, Math.floor(config.apiConcurrency))
        : API_CONCURRENCY,
      apiClaimDelayMs: typeof config.apiClaimDelayMs === 'number' && config.apiClaimDelayMs >= 0
        ? Math.min(5000, config.apiClaimDelayMs)
        : API_PACE_MS,
      delayBetweenActions: typeof config.delayBetweenActions === 'number' && config.delayBetweenActions >= 500
        ? config.delayBetweenActions
        : 2000,
      dialogTimeout: typeof config.dialogTimeout === 'number' && config.dialogTimeout >= 3000
        ? config.dialogTimeout
        : 10000
    };
  }

  function getCsrfToken() {
    var cookies = (document.cookie || '').split(';');
    for (var i = 0; i < cookies.length; i++) {
      var part = cookies[i].trim();
      if (part.indexOf('fab_csrftoken=') === 0) {
        var val = part.slice('fab_csrftoken='.length);
        try {
          return decodeURIComponent(val) || null;
        } catch (e) {
          return val || null;
        }
      }
    }
    return null;
  }

  function isLicenseFree(lic) {
    if (!lic) return false;
    var offerId = lic.offerId || lic.offer_id;
    if (!offerId) return false;
    var pt = lic.priceTier;
    if (!pt) return false;
    if (pt.isFree === true) return true;
    if (typeof pt.discountedPrice === 'number') return pt.discountedPrice === 0;
    if (pt.discountPercentage === 100) return true;
    if (typeof pt.price === 'number') return pt.price === 0;
    return false;
  }

  /** Choose the best FREE license offerId honoring preferredLicense.
   * Fail-closed: never returns an offerId for a paid license. */
  function pickFreeLicense(listing, preferred) {
    if (!listing || !Array.isArray(listing.licenses) || listing.licenses.length === 0) {
      return { fallback: true, reason: 'no_licenses' };
    }

    var free = [];
    var hasIncompleteSchema = false;
    for (var i = 0; i < listing.licenses.length; i++) {
      var lic = listing.licenses[i];
      if (!lic || !(lic.offerId || lic.offer_id) || !lic.priceTier) {
        hasIncompleteSchema = true;
      }
      if (isLicenseFree(lic)) {
        free.push(lic);
      }
    }

    if (free.length === 0) {
      if (hasIncompleteSchema) {
        return { fallback: true, reason: 'incomplete_license_schema' };
      }
      return { paidOnly: true };
    }

    var pref = String(preferred || config.preferredLicense || 'professional').toLowerCase();
    if (pref.indexOf('personal') !== -1) pref = 'personal';
    else if (pref.indexOf('professional') !== -1) pref = 'professional';
    else pref = 'professional';

    var alt = pref === 'personal' ? 'professional' : 'personal';
    var chosen = null;

    for (var a = 0; a < free.length; a++) {
      if ((free[a].slug || '').toLowerCase().indexOf(pref) !== -1) {
        chosen = free[a];
        break;
      }
    }
    if (!chosen) {
      for (var b = 0; b < free.length; b++) {
        if ((free[b].slug || '').toLowerCase().indexOf(alt) !== -1) {
          chosen = free[b];
          break;
        }
      }
    }
    if (!chosen) {
      chosen = free[0];
    }

    return {
      offerId: chosen.offerId || chosen.offer_id,
      slug: chosen.slug || null
    };
  }

  async function waitWithStop(ms) {
    var remaining = ms;
    while (remaining > 0 && !state.shouldStop) {
      var step = Math.min(remaining, 200);
      await utils.wait(step);
      remaining -= step;
    }
  }

  async function waitCooldownWithStatus(untilTs) {
    while (!state.shouldStop) {
      var remaining = untilTs - Date.now();
      if (remaining <= 0) break;
      var secs = Math.max(1, Math.ceil(remaining / 1000));
      state.statusText = 'Rate limited — resuming in ' + secs + 's...';
      await waitWithStop(Math.min(remaining, 500));
    }
  }

  function parseRetryAfterMs(res, attempt) {
    var header = res && res.headers && res.headers.get ? res.headers.get('Retry-After') : null;
    if (header) {
      var secs = Number(header);
      if (Number.isFinite(secs) && secs > 0) {
        return Math.min(65000, Math.ceil(secs * 1000) + 250);
      }
    }
    // Sliding-window backoff when no Retry-After header is returned:
    // 4s -> 8s -> 16s -> 30s (covers typical 30-60s rate-limit buckets).
    return Math.min(30000, 4000 * Math.pow(2, attempt));
  }

  /** Serialize request starts with jittered pacing + shared 429 cooldown so
   * workers never burst simultaneously or thundering-herd after a backoff. */
  async function acquireSlot(shared) {
    while (!state.shouldStop) {
      var now = Date.now();
      if (shared.rateLimitUntil > now) {
        await waitCooldownWithStatus(shared.rateLimitUntil);
        continue;
      }
      var jitter = shared.paceMs * 0.2 * Math.random();
      var target = Math.max(now, shared.nextSlotAt);
      shared.nextSlotAt = target + shared.paceMs + jitter;
      if (target > now) {
        await waitWithStop(target - now);
        if (shared.rateLimitUntil > Date.now()) continue;
      }
      return;
    }
  }

  /** Batch pre-check which listings are already owned so we skip claiming them. */
  async function fetchListingStates(ids) {
    var owned = new Set();
    if (!ids || ids.length === 0) return owned;

    for (var i = 0; i < ids.length; i += LISTING_STATES_CHUNK) {
      if (state.shouldStop) break;
      var chunk = ids.slice(i, i + LISTING_STATES_CHUNK);
      var qs = chunk.map(function(id) {
        return 'listing_ids=' + encodeURIComponent(id);
      }).join('&');
      try {
        var res = await fetch('/i/users/me/listings-states?' + qs, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        if (!res.ok) continue;
        var ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (ct && ct.indexOf('json') === -1) continue;
        var data = await res.json();
        var rows = Array.isArray(data)
          ? data
          : (data && Array.isArray(data.results) ? data.results : null);
        if (rows) {
          for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (row && row.uid && (row.acquired === true || row.isAcquired === true)) {
              owned.add(row.uid);
            }
          }
        } else if (data && typeof data === 'object') {
          var keys = Object.keys(data);
          for (var k = 0; k < keys.length; k++) {
            var entry = data[keys[k]];
            if (entry && (entry.acquired === true || entry.isAcquired === true)) {
              owned.add(keys[k]);
            }
          }
        }
      } catch (e) {
        utils.debug('[API] Listing states pre-check skipped: ' + e.message);
      }
    }
    return owned;
  }

  function applyRateLimitBackoff(shared, res, attempt) {
    var waitMs = parseRetryAfterMs(res, attempt);
    shared.concurrency = 1;
    shared.cleanStreak = 0;
    shared.rateLimitHits++;
    shared.paceMs = Math.min(
      API_MAX_PACE_MS,
      Math.max(1000, Math.round(shared.paceMs * 2))
    );
    var until = Date.now() + waitMs;
    shared.rateLimitUntil = Math.max(shared.rateLimitUntil, until);
    shared.nextSlotAt = Math.max(shared.nextSlotAt, shared.rateLimitUntil);
    utils.log(
      '[API] Rate limited (' + res.status + '), cooling down ' +
      Math.ceil(waitMs / 1000) + 's (concurrency=1, pace=' + shared.paceMs + 'ms).',
      'warn'
    );
    return shared.rateLimitUntil;
  }

  function recordCleanSuccess(shared) {
    shared.cleanStreak++;
    if (shared.rateLimitHits > 0) {
      shared.nextSlotAt = Math.max(shared.nextSlotAt, Date.now() + shared.paceMs);
      if (shared.cleanStreak >= API_RECOVERY_STREAK) {
        var floor = Math.max(shared.basePaceMs, 450);
        if (shared.paceMs > floor) {
          shared.paceMs = Math.max(floor, Math.round(shared.paceMs * 0.8));
          shared.cleanStreak = 0;
          utils.debug('[API] Clean streak reached; easing pace to ' + shared.paceMs + 'ms.');
        }
      }
    }
  }

  async function fetchJsonWithRetry(url, shared) {
    var maxRetries = Math.max(
      typeof config.maxRetries === 'number' ? config.maxRetries : 2,
      API_RATE_LIMIT_RETRIES
    );
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      if (state.shouldStop) return { stopped: true };
      if (shared.rateLimitUntil > Date.now()) {
        await waitCooldownWithStatus(shared.rateLimitUntil);
        if (state.shouldStop) return { stopped: true };
      }

      var res;
      try {
        res = await fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
      } catch (e) {
        return { fallback: true, reason: 'network_error' };
      }

      if (res.status === 401 || res.status === 403) {
        return { blocked: true, status: res.status };
      }

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < maxRetries) {
          var until = applyRateLimitBackoff(shared, res, attempt);
          await waitCooldownWithStatus(until);
          continue;
        }
        return res.status === 429
          ? { rateLimited: true, reason: 'http_429' }
          : { fallback: true, reason: 'http_' + res.status };
      }

      if (!res.ok) {
        return { fallback: true, reason: 'http_' + res.status };
      }

      try {
        var json = await res.json();
        return { ok: true, json: json };
      } catch (e) {
        return { fallback: true, reason: 'invalid_json' };
      }
    }
    return { fallback: true, reason: 'retries_exhausted' };
  }

  async function claimAssetViaApi(asset, csrf, shared) {
    if (!asset || !asset.id) {
      return { outcome: 'fallback', reason: 'missing_id' };
    }

    await acquireSlot(shared);
    if (state.shouldStop) return { outcome: 'stopped' };

    var detail = await fetchJsonWithRetry(
      '/i/listings/' + encodeURIComponent(asset.id),
      shared
    );
    if (detail.stopped) return { outcome: 'stopped' };
    if (detail.blocked) return { outcome: 'blocked' };
    if (detail.rateLimited) return { outcome: 'rate_limited', reason: detail.reason };
    if (!detail.ok) return { outcome: 'fallback', reason: detail.reason };

    var listing = detail.json;
    if (listing && (listing.isAcquired === true || listing.acquired === true)) {
      return { outcome: 'skipped', reason: 'already_owned' };
    }

    var pick = pickFreeLicense(listing, config.preferredLicense);
    if (pick.paidOnly) {
      return { outcome: 'skipped', reason: 'paid_only' };
    }
    if (pick.fallback || !pick.offerId) {
      return { outcome: 'fallback', reason: pick.reason || 'no_offer_id' };
    }

    var maxRetries = Math.max(
      typeof config.maxRetries === 'number' ? config.maxRetries : 2,
      API_RATE_LIMIT_RETRIES
    );
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      if (state.shouldStop) return { outcome: 'stopped' };
      if (shared.rateLimitUntil > Date.now()) {
        await waitCooldownWithStatus(shared.rateLimitUntil);
        if (state.shouldStop) return { outcome: 'stopped' };
      }

      var body = new FormData();
      body.append('offer_id', pick.offerId);

      var res;
      try {
        res = await fetch(
          '/i/listings/' + encodeURIComponent(asset.id) + '/add-to-library',
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'X-CsrfToken': csrf,
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json'
            },
            body: body
          }
        );
      } catch (e) {
        return { outcome: 'fallback', reason: 'post_network_error' };
      }

      if (res.ok) {
        recordCleanSuccess(shared);
        return { outcome: 'claimed', license: pick.slug };
      }

      if (res.status === 401 || res.status === 403) {
        return { outcome: 'blocked' };
      }

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < maxRetries) {
          var until = applyRateLimitBackoff(shared, res, attempt);
          await waitCooldownWithStatus(until);
          continue;
        }
        return res.status === 429
          ? { outcome: 'rate_limited', reason: 'post_http_429' }
          : { outcome: 'fallback', reason: 'post_http_' + res.status };
      }

      if (res.status === 400 || res.status === 409) {
        var text = '';
        try { text = (await res.text() || '').toLowerCase(); } catch (e) {}
        if (
          text.indexOf('already') !== -1 ||
          text.indexOf('owned') !== -1 ||
          text.indexOf('acquired') !== -1 ||
          text.indexOf('duplicate') !== -1
        ) {
          return { outcome: 'skipped', reason: 'already_owned' };
        }
        return { outcome: 'fallback', reason: 'post_http_' + res.status };
      }

      return { outcome: 'fallback', reason: 'post_http_' + res.status };
    }

    return { outcome: 'fallback', reason: 'post_retries_exhausted' };
  }

  /** Fast path: claim all free listings via Fab's same-origin API in a bounded
   * paced worker pool with AIMD 429 backoff. Any asset that lacks API support
   * or hits auth rejection is pushed to fallbackQueue for the DOM claimer. */
  async function processApiBatch(assets, fallbackQueue) {
    var csrf = getCsrfToken();
    if (!csrf) {
      utils.debug('[API] No fab_csrftoken cookie found; using DOM claimer.');
      for (var f = 0; f < assets.length; f++) fallbackQueue.push(assets[f]);
      return false;
    }

    var total = state.assetsTotal || assets.length;
    var speed = resolveSpeedSettings();
    var baseConcurrency = speed.apiConcurrency;
    var basePaceMs = speed.apiClaimDelayMs;

    utils.log(
      '[API] Fast-claiming ' + assets.length + ' free asset(s) (mode=' + speed.mode +
      ', concurrency=' + baseConcurrency + ', pace=' + basePaceMs + 'ms)...'
    );

    var ids = [];
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].id) ids.push(assets[i].id);
    }

    var preOwned = await fetchListingStates(ids);
    var work = [];
    var completed = 0;

    for (var j = 0; j < assets.length; j++) {
      var a = assets[j];
      if (!a.id) {
        fallbackQueue.push(a);
        continue;
      }
      if (preOwned.has(a.id)) {
        a.status = 'skipped';
        state.assetsSkipped = (state.assetsSkipped || 0) + 1;
        markCardClaimedInDom(a);
        completed++;
        utils.debug('[API] Already owned (pre-check): ' + a.name);
        continue;
      }
      work.push(a);
    }

    if (work.length === 0) return true;

    var shared = {
      concurrency: Math.min(baseConcurrency, work.length),
      basePaceMs: basePaceMs,
      paceMs: basePaceMs,
      nextSlotAt: 0,
      rateLimitUntil: 0,
      rateLimitHits: 0,
      cleanStreak: 0,
      blocked: false
    };
    var cursor = 0;

    async function worker(workerId) {
      while (!state.shouldStop && !shared.blocked) {
        if (workerId >= shared.concurrency) break;
        var idx = cursor++;
        if (idx >= work.length) break;

        var asset = work[idx];
        asset.status = 'processing';
        var result = await claimAssetViaApi(asset, csrf, shared);

        if (result.outcome === 'claimed') {
          asset.status = 'claimed';
          asset.license = result.license || null;
          state.assetsClaimed++;
          markCardClaimedInDom(asset);
          recordClaim(asset, result.license);
          completed++;
          state.statusText = t('controller_claiming_n', String(completed), String(total));
          utils.log('[API] Claimed: ' + asset.name + (result.license ? ' (' + result.license + ')' : ''));
        } else if (result.outcome === 'skipped') {
          asset.status = 'skipped';
          state.assetsSkipped = (state.assetsSkipped || 0) + 1;
          if (result.reason === 'already_owned') markCardClaimedInDom(asset);
          completed++;
          state.statusText = t('controller_claiming_n', String(completed), String(total));
          utils.log('[API] Skipped (' + result.reason + '): ' + asset.name);
        } else if (result.outcome === 'rate_limited') {
          asset.status = 'failed';
          state.assetsFailed++;
          completed++;
          state.statusText = t('controller_claiming_n', String(completed), String(total));
          utils.log('[API] Rate limit persisted after retries for: ' + asset.name, 'warn');
        } else if (result.outcome === 'blocked') {
          if (!shared.blocked) {
            shared.blocked = true;
            utils.log('[API] Auth/CSRF rejected; switching remaining assets to DOM flow.', 'warn');
          }
          asset.status = 'pending';
          fallbackQueue.push(asset);
          break;
        } else if (result.outcome === 'fallback') {
          utils.debug('[API] Falling back to DOM for ' + asset.name + ' (' + result.reason + ')');
          asset.status = 'pending';
          fallbackQueue.push(asset);
        } else if (result.outcome === 'stopped') {
          asset.status = 'pending';
          break;
        }
      }
    }

    var pool = [];
    for (var w = 0; w < shared.concurrency; w++) {
      pool.push(worker(w));
    }
    await Promise.all(pool);

    if (shared.blocked && !state.shouldStop) {
      while (cursor < work.length) {
        var rem = work[cursor++];
        rem.status = 'pending';
        fallbackQueue.push(rem);
      }
    }

    return true;
  }

  var LIBRARY_BATCH_GAP = 200;

  /** Fast path for direct library adds: click every button in a tight loop,
   * then confirm all of them in one shared sweep. Per-asset confirmation
   * windows are what made large batches crawl. */
  async function processLibraryBatch(assets, sequentialQueue) {
    utils.log('Batch-adding ' + assets.length + ' asset(s) directly to library...');
    var clicked = [];

    for (var i = 0; i < assets.length; i++) {
      if (state.shouldStop) break;
      var asset = assets[i];
      asset.status = 'processing';
      state.statusText = t('controller_claiming_n', String(i + 1), String(assets.length));

      if (!asset.element.isConnected) rehydrateAsset(asset);

      var action = findCardActionButton(asset.element);
      if (!action) {
        await revealCardButtons(asset.element);
        action = await waitForActionButton(asset.element, 1200);
      }

      if (!action || action.type !== 'library') {
        // Button lost or not a direct add — let the sequential path handle it.
        sequentialQueue.push(asset);
        continue;
      }

      await utils.safeClick(action.button, 'library button');

      // Some "Add to library" buttons still open a license modal. Handle it
      // immediately so it does not block subsequent batch clicks.
      var unexpectedDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (unexpectedDialog && ns.licenseProcessor) {
        var licRes = await ns.licenseProcessor.selectLicenseAndAdd(config.preferredLicense);
        if (licRes && licRes.success) {
          asset.status = 'claimed';
          state.assetsClaimed++;
          markCardClaimedInDom(asset);
          recordClaim(asset);
        } else if (licRes && licRes.skip) {
          await ns.licenseProcessor.closeDialog();
          asset.status = 'skipped';
          state.assetsSkipped = (state.assetsSkipped || 0) + 1;
        } else {
          await ns.licenseProcessor.closeDialog();
          sequentialQueue.push(asset);
        }
        continue;
      }

      clicked.push(asset);

      if (i < assets.length - 1 && !state.shouldStop) {
        var jitter = LIBRARY_BATCH_GAP * 0.3 * (Math.random() - 0.5);
        await utils.wait(LIBRARY_BATCH_GAP + jitter);
      }
    }

    await verifyLibraryAdds(clicked);
  }

  function libraryAddConfirmed(asset) {
    if (!asset || !asset.element) return false;
    var action = findCardActionButton(asset.element);
    if (action && action.button) {
      var al = (action.button.getAttribute('aria-label') || '').toLowerCase();
      var txt = action.button.textContent.trim().toLowerCase();
      if (
        al.indexOf('owned') !== -1 || al.indexOf('remove') !== -1 ||
        al.indexOf('in library') !== -1 || action.button.disabled ||
        txt.indexOf('owned') !== -1 || txt.indexOf('in library') !== -1 ||
        txt.indexOf('added') !== -1
      ) {
        return true;
      }
    }
    return isAlreadyOwned(asset.element);
  }

  /** Shared confirmation sweep for batch-clicked library adds: poll the
   * cards' own button/badge state until they all resolve or time out. */
  async function verifyLibraryAdds(assets, timeoutMs) {
    if (assets.length === 0) return;
    var pending = assets.slice();
    var budget = typeof timeoutMs === 'number'
      ? timeoutMs
      : Math.min(30000, 5000 + pending.length * 400);
    var elapsed = 0;

    while (pending.length > 0 && elapsed < budget && !state.shouldStop) {
      pending = pending.filter(function(asset) {
        if (!libraryAddConfirmed(asset)) return true;
        asset.status = 'claimed';
        state.assetsClaimed++;
        markCardClaimedInDom(asset);
        recordClaim(asset);
        utils.log('Successfully added to library: ' + asset.name);
        return false;
      });
      if (pending.length > 0) {
        await utils.wait(150);
        elapsed += 150;
      }
    }

    for (var i = 0; i < pending.length; i++) {
      pending[i].status = 'failed';
      state.assetsFailed++;
      utils.log('Library add not confirmed for: ' + pending[i].name, 'warn');
    }
  }

  /** Poll checkForSuccess instead of sleeping a fixed amount after a click. */
  async function pollForSuccess(asset, timeoutMs) {
    var elapsed = 0;
    while (elapsed < timeoutMs) {
      if (checkForSuccess(asset)) return true;
      await utils.wait(50);
      elapsed += 50;
    }
    return checkForSuccess(asset);
  }

  async function processCard(asset) {
    if (!asset || !asset.element) return false;

    utils.log('Processing: ' + asset.name);
    asset.status = 'processing';
    var navigatedToDetail = false;

    try {
      if (!asset.element.isConnected) rehydrateAsset(asset);

      // Fast path: most logged-in cards keep their buttons in the DOM, so try
      // without the hover choreography first and only reveal if missing.
      var action = findCardActionButton(asset.element);
      if (!action) {
        await revealCardButtons(asset.element);
        action = await waitForActionButton(asset.element, 1500);
      }
      if (!action) {
        var link = asset.element.querySelector('a[href*="/listings/"]');
        if (link) {
          link.click();
          navigatedToDetail = true;
          action = await waitForActionButton(document, 8000);
        }
      }

      if (!action) {
        utils.log('No claim button found for: ' + asset.name, 'warn');
        asset.status = 'failed';
        state.assetsFailed++;
        return false;
      }

      asset.actionType = action.type;

      var cs = window.getComputedStyle(action.button);
      if (cs.visibility === 'hidden' || cs.display === 'none') {
        utils.debug(
          '[Selector:Button] Button not visible (visibility=' + cs.visibility +
          ', display=' + cs.display + '), attempting click anyway.',
          'warn'
        );
      }

      await utils.safeClick(action.button, action.type + ' button');

      if (action.type === 'library') {
        utils.debug('[Asset] Direct library add for: ' + asset.name);
        var ok = await waitForLibraryAddConfirmation(action.button, 5000);
        if (ok) {
          asset.status = 'claimed';
          state.assetsClaimed++;
          markCardClaimedInDom(asset);
          recordClaim(asset);
          utils.log('Successfully added to library: ' + asset.name);
          return true;
        }
        asset.status = 'failed';
        state.assetsFailed++;
        utils.log('Library add not confirmed for: ' + asset.name, 'warn');
        return false;
      }

      var speed = resolveSpeedSettings();
      var dialog = await utils.waitForElement(
        '[role="dialog"][aria-modal="true"]', speed.dialogTimeout || 8000
      );

      if (dialog) {
        utils.debug('License dialog detected for: ' + asset.name);
        utils.debug('[Debug] Dialog HTML (first 500 chars): ' + dialog.outerHTML.substring(0, 500));

        if (ns.licenseProcessor) {
          var licResult = await ns.licenseProcessor.selectLicenseAndAdd(config.preferredLicense);
          if (licResult && licResult.skip) {
            if (ns.licenseProcessor.closeDialog) await ns.licenseProcessor.closeDialog();
            asset.status = 'skipped';
            state.assetsSkipped = (state.assetsSkipped || 0) + 1;
            utils.log('Skipped (no free license): ' + asset.name);
            return false;
          }
          if (licResult && !licResult.success) {
            if (ns.licenseProcessor.closeDialog) await ns.licenseProcessor.closeDialog();
            asset.status = 'failed';
            state.assetsFailed++;
            utils.log('License selection failed for ' + asset.name + ': ' + (licResult.error || 'unknown'), 'warn');
            return false;
          }
          await ns.licenseProcessor.clickAddToCartButton();
        }

        // Poll instead of sleeping: resolves as soon as the dialog closes
        // and/or the success toast lands.
        var success = await pollForSuccess(asset, 3000);
        if (success) {
          asset.status = 'claimed';
          state.assetsClaimed++;
          markCardClaimedInDom(asset);
          recordClaim(asset);
          utils.log('Successfully claimed: ' + asset.name);
          return true;
        }
      } else {
        var directSuccess = await pollForSuccess(asset, 2500);
        if (directSuccess) {
          asset.status = 'claimed';
          state.assetsClaimed++;
          markCardClaimedInDom(asset);
          recordClaim(asset);
          utils.log('Successfully claimed: ' + asset.name);
          return true;
        }
      }

      asset.status = 'failed';
      state.assetsFailed++;
      utils.log('Could not confirm claim for: ' + asset.name, 'warn');
      return false;

    } catch (err) {
      utils.log('Error processing ' + asset.name + ': ' + err.message, 'error');
      asset.status = 'failed';
      state.assetsFailed++;
      return false;
    } finally {
      // Remaining assets still reference card elements on the page we left
      // (e.g. a seller grid). Restore it so the batch can continue.
      if (navigatedToDetail && !utils.isCatalogPage()) {
        history.back();
        await utils.waitForElements('a[href*="/listings/"]', 8000);
        await utils.wait(500);
      }
    }
  }

  function checkForSuccess(asset) {
    var action = asset.element ? findCardActionButton(asset.element) : null;
    if (action && action.button) {
      var txt = action.button.textContent.trim().toLowerCase();
      var al = (action.button.getAttribute('aria-label') || '').toLowerCase();
      if (
        txt.indexOf('owned') !== -1 || txt.indexOf('in library') !== -1 ||
        txt.indexOf('purchased') !== -1 || txt.indexOf('added') !== -1 ||
        txt.indexOf('in cart') !== -1 ||
        al.indexOf('owned') !== -1 || al.indexOf('in library') !== -1 ||
        al.indexOf('remove') !== -1
      ) {
        return true;
      }
    }

    var toastResult = queryTiered(document, TOAST_TIERS);
    var toast = toastResult.elements[0] || null;
    if (toast) {
      var toastText = toast.textContent.toLowerCase();
      if (
        toastText.indexOf('added') !== -1 || toastText.indexOf('claimed') !== -1 ||
        toastText.indexOf('success') !== -1 || toastText.indexOf('cart') !== -1
      ) {
        return true;
      }
    }

    var dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) {
      return true;
    }

    return false;
  }

  async function processAllAssets() {
    state.statusText = t('controller_scanning');
    utils.log('Scanning for free assets...');

    state.assetsFound = getFreeAssetCards();
    state.assetsTotal = state.assetsFound.length;

    if (state.assetsFound.length === 0) {
      state.statusText = t('assets_none_found');
      utils.log('No free assets found on this page.');
      return;
    }

    utils.log('Found ' + state.assetsFound.length + ' free asset(s).');

    // Tier 1: Direct same-origin API claiming (bypasses modals & hover delays).
    // Anything that cannot be claimed via API drops into domQueue seamlessly.
    var domQueue = [];
    await processApiBatch(state.assetsFound, domQueue);

    if (domQueue.length > 0 && !state.shouldStop) {
      // Some layouts mount quick-action buttons only on hover. One shared
      // reveal pass lets those assets join the batch fast-path instead of
      // the sequential modal queue, without losing API-claimed progress.
      if (await bulkRevealButtons(domQueue)) {
        for (var r = 0; r < domQueue.length; r++) {
          if (domQueue[r].element && !domQueue[r].element.isConnected) {
            rehydrateAsset(domQueue[r]);
          }
          var revealed = domQueue[r].element ? findCardActionButton(domQueue[r].element) : null;
          if (revealed) {
            domQueue[r].claimButton = revealed.button;
            domQueue[r].actionType = revealed.type;
          }
        }
      }

      // Tier 2: Direct "Add to library" DOM buttons are batch clicked and
      // verified in one shared sweep. Tier 3: Modal (cart) / compact cards
      // stay sequential.
      var batch = [];
      var sequential = [];
      for (var i = 0; i < domQueue.length; i++) {
        var asset = domQueue[i];
        if (asset.actionType === 'library' && asset.claimButton) batch.push(asset);
        else sequential.push(asset);
      }

      if (batch.length > 0) {
        await processLibraryBatch(batch, sequential);
      }

      if (sequential.length > 0 && !state.shouldStop) {
        if (batch.length > 0) await utils.wait(500);
        await processSequentialQueue(sequential);
      }
    }

    state.statusText = t('controller_summary_simple', String(state.assetsClaimed), String(state.assetsFailed));
    utils.log(state.statusText);
  }

  async function processSequentialQueue(assets) {
    for (var i = 0; i < assets.length; i++) {
      if (state.shouldStop) {
        utils.log('Stopped by user.');
        state.statusText = t('controller_stopped');
        break;
      }

      var asset = assets[i];
      state.statusText = t('controller_claiming_n', String(i + 1), String(assets.length));

      await processCard(asset);

      if (i < assets.length - 1 && !state.shouldStop) {
        var delay = resolveSpeedSettings().delayBetweenActions || 2000;
        var jitter = delay * 0.3 * (Math.random() - 0.5);
        await waitWithStop(delay + jitter);
      }
    }
  }

  window.__fabGrabDebug = {
    /** One-off scan report, regardless of the verbose setting. */
    scan: function() {
      var cards = getFreeAssetCards();
      console.log('[FAB Debug] Catalog page: ' + utils.isCatalogPage() +
        ' | path: ' + utils.catalogPath());
      console.log('[FAB Debug] Found ' + cards.length + ' free card(s).');
      if (cards.length > 0) {
        console.log('[FAB Debug] First card outerHTML (500 chars): ' + cards[0].element.outerHTML.substring(0, 500));
      }
      return cards;
    },
    /** Persistent selector diagnostics. __fabGrabDebug.verbose(true) to enable. */
    verbose: function(on) {
      var next = utils.setVerbose(on !== false);
      console.log('[FAB Debug] Verbose logging ' + (next ? 'ON' : 'OFF'));
      return next;
    }
  };

  ns.assetProcessor = {
    getFreeAssetCards: getFreeAssetCards,
    processCard: processCard,
    processAllAssets: processAllAssets,
    processApiBatch: processApiBatch,
    claimAssetViaApi: claimAssetViaApi,
    pickFreeLicense: pickFreeLicense,
    isLicenseFree: isLicenseFree,
    getCsrfToken: getCsrfToken,
    fetchListingStates: fetchListingStates,
    resolveSpeedSettings: resolveSpeedSettings,
    processLibraryBatch: processLibraryBatch,
    verifyLibraryAdds: verifyLibraryAdds,
    bulkRevealButtons: bulkRevealButtons,
    findCardActionButton: findCardActionButton,
    findCartButton: findCardActionButton,
    getAssetName: getAssetName,
    getAssetId: getAssetId,
    isAlreadyOwned: isAlreadyOwned,
    revealCardButtons: revealCardButtons,
    waitForLibraryAddConfirmation: waitForLibraryAddConfirmation,
    rehydrateAsset: rehydrateAsset
  };
})();
