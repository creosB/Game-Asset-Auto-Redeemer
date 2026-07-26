(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

  /* ── Centralized selectors + constants ───────────────────────────── */
  var SELECTORS = {
    card:        '.js-card-wrapper',
    cardLink:    'a[href^="/products/"]',
    cardPrice:   '.card-price',
    gridFallback: 'main, [role="main"], .product-list, .catalog, .products',
    pagyNav:     '.js-pagyContainer',
    pagyNextA:   '.js-pagyContainer li.page-item.next:not(.disabled) a[href]',
    pagyNextRel: '.js-pagyContainer a[rel="next"]',
    productForm: 'form.button_to[action*="/cart_items"]',
    productBtn:  '.js-item-addToCart, .btn-add-to-cart',
    productPrice:'.js-price-cart',
    cartBadge:   '.shopping-cart-badge'
  };

  var MAX_PAGES        = 200;     // hard safety cap on endless pagination
  var THROTTLE_MAX_MS  = 8000;    // cap on extra backoff under 429/503
  var JITTER_MS        = 600;
  var COOLDOWN_MS      = 15000;   // max single rate-limit wait

  // Phrases that mark a product as currently unavailable.
  var UNAVAILABLE_RE = /currently\s+unavailable|no longer available|unpublished|out of stock|not available for purchase/i;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function delay()      { return config.superhiveDelayBetweenAssets || 1200; }
  function pageDelay()  { return config.superhivePageDelay || 700; }
  function maxRetries() { return config.superhiveMaxRetries != null ? config.superhiveMaxRetries : 4; }

  function sleep(ms)    { return new Promise(function(r) { setTimeout(r, ms); }); }

  var throttleBump = 0;
  var rateLimitStreak = 0;

  function isPriceAscending() {
    var search = location.search.toLowerCase();
    if (search.indexOf('sort_price=asc') !== -1) return true;
    var sortSelect = document.querySelector('select[name="sort"], select[id*="sort"], .js-sort-select');
    if (sortSelect) {
      var opt = sortSelect.options[sortSelect.selectedIndex] || sortSelect.querySelector('option[selected], option:checked');
      if (opt) {
        var dataType = opt.getAttribute('data-type') || opt.getAttribute('data-sort');
        var val = opt.value || opt.getAttribute('value');
        if (dataType === 'sort_price' && val === 'asc') return true;
      }
    }
    return false;
  }

  // Rate-limit aware fetch with exponential backoff + jitter (adapted from the
  // prototype). Honors Retry-After on 429/503, retries 5xx, throws when retries
  // are exhausted so callers can mark the item as failed.
  function rlFetch(url, opts) {
    opts = opts || {};
    return rlFetchInner(url, opts, 0);
  }

  function rlFetchInner(url, opts, attempt) {
    return fetch(url, Object.assign({ credentials: 'include' }, opts)).then(function(res) {
      if (res.status === 429 || res.status === 503) {
        rateLimitStreak++;
        var maxStreak = config.superhiveMaxRateLimitStreak || 3;
        if (rateLimitStreak >= maxStreak) {
          throw new Error('circuit_breaker');
        }
        if (attempt >= maxRetries()) throw new Error('rate limited (429/503)');
        var ra = parseFloat(res.headers.get('Retry-After'));
        var wait = Number.isFinite(ra)
          ? ra * 1000
          : Math.min(COOLDOWN_MS, 2000 * Math.pow(2, attempt)) + Math.random() * 1000;
        throttleBump = Math.min(THROTTLE_MAX_MS, throttleBump + 800);
        state.statusText = t('superhive_status_rate_limited', String(Math.round(wait / 1000)));
        return sleep(wait).then(function() { return rlFetchInner(url, opts, attempt + 1); });
      }
      if (res.status >= 500) {
        if (attempt >= maxRetries()) throw new Error('server ' + res.status);
        throttleBump = Math.min(THROTTLE_MAX_MS, throttleBump + 400);
        return sleep(1500 * (attempt + 1)).then(function() { return rlFetchInner(url, opts, attempt + 1); });
      }
      rateLimitStreak = 0;
      throttleBump = Math.max(0, throttleBump - 100);
      return res;
    });
  }

  /* ── Card parsing ────────────────────────────────────────────────── */
  function priceText(card) {
    var el = card.querySelector(SELECTORS.cardPrice);
    if (!el) return '';
    var spans = el.querySelectorAll('span');
    return (spans.length ? spans[spans.length - 1] : el).textContent.trim();
  }

  // Free = $0 / $0.00 / $0.0 / Free (case-insensitive).
  function isFree(card) {
    return /^\$?0(\.0+)?\$?$|^free$/i.test(priceText(card).replace(/\s+/g, '').replace(/\$/g, '$'));
  }

  function slugOf(card) {
    var a = card.querySelector(SELECTORS.cardLink);
    return (a && a.getAttribute('href')) || ('#' + Math.random());
  }

  function nameOf(card) {
    var a = card.querySelector(SELECTORS.cardLink);
    if (a) {
      var label = a.getAttribute('aria-label');
      if (label && label.trim()) return label.trim();
      var text = a.textContent.trim();
      if (text) return text;
    }
    var title = card.querySelector('[class*="title"], [class*="name"], h2, h3');
    if (title && title.textContent.trim()) return title.textContent.trim();
    var slug = slugOf(card);
    return slug.indexOf('/products/') === 0 ? slug.split('/').pop() : 'Superhive Product';
  }

  // Track product URLs we've seen to dedupe across pages during endless loading.
  var seen = new Set();

  function resetSeen() { seen = new Set(); }

  function getGrid() {
    var first = document.querySelector(SELECTORS.card);
    if (first && first.parentElement) return first.parentElement;
    return document.querySelector(SELECTORS.gridFallback) || document.body;
  }

  /* ── Free detection surfaced to shared UI ────────────────────────── */
  function getFreeAssetCards() {
    var cards = [];
    var nodes = document.querySelectorAll(SELECTORS.card);
    for (var i = 0; i < nodes.length; i++) {
      var c = nodes[i];
      var slug = slugOf(c);
      // We add all cards (so non-free can be hidden when free-only is on)
      // but the bulk-add flow filters by isFree again on the live page.
      seen.add(slug);
      cards.push({
        element: c,
        name: nameOf(c),
        id: slug,
        status: 'pending',
        claimButton: null,
        actionType: null
      });
    }
    utils.log('[Superhive] Detected ' + cards.length + ' listing card(s) (' +
      countFreeIn(cards) + ' free).');
    return cards;
  }

  function countFreeIn(cards) {
    var n = 0;
    for (var i = 0; i < cards.length; i++) if (isFree(cards[i].element)) n++;
    return n;
  }

  /* ── Product availability re-check on the product page ───────────── */
  function checkUnavailable(doc) {
    var targets = doc.querySelectorAll(
      '.product-sidebar, .price-box, .action-wish, .product-info-header, .alert'
    );
    for (var i = 0; i < targets.length; i++) {
      if (UNAVAILABLE_RE.test(targets[i].textContent || '')) return true;
    }
    return false;
  }

  /* ── Add one free product to cart ────────────────────────────────── */
  // Returns: true on success, or an object { skip: '<reason>' } for a benign
  // skip, or throws on a hard failure.
  async function addOneToCart(href) {
    var page = await rlFetch(href);
    if (!page.ok) throw new Error('product page ' + page.status);
    var doc = new DOMParser().parseFromString(await page.text(), 'text/html');

    if (checkUnavailable(doc)) return { skip: 'unavailable' };

    // Re-verify price is free on the product page.
    var priceEl = doc.querySelector(SELECTORS.productPrice);
    if (priceEl) {
      var p = priceEl.textContent.trim().replace(/\s+/g, '');
      if (p && !/^\$0(\.0+)?\$?$|^free$/i.test(p)) return { skip: 'not free' };
    }

    var form = doc.querySelector(SELECTORS.productForm);
    var btn  = form ? (form.querySelector('button[type="submit"], input[type="submit"], button, .js-item-addToCart, .btn-add-to-cart') || doc.querySelector(SELECTORS.productBtn))
                    : doc.querySelector(SELECTORS.productBtn);

    if (!form || !btn || btn.disabled) {
      var bodyText = doc.body ? doc.body.textContent : '';
      if (!form && (/log\s*in|sign\s*in|create\s*account/i.test(bodyText))) {
        return { skip: 'not_signed_in' };
      }
      if (/in\s+cart|added\s+to\s+cart|already\s+in\s+cart/i.test(bodyText)) {
        return { skip: 'already_in_cart' };
      }
      if (/you\s+own\s+this|already\s+owned|download\s+files?|purchased/i.test(bodyText) || (btn && btn.disabled)) {
        return { skip: 'owned' };
      }
      return { skip: 'no_cart_form' };
    }

    var action = new URL(form.getAttribute('action'), location.origin).href;
    var token  = form.querySelector('input[name="authenticity_token"]') &&
                 form.querySelector('input[name="authenticity_token"]').value || '';

    var res = await rlFetch(action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'text/javascript, application/javascript, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': token
      },
      body: new URLSearchParams({ authenticity_token: token }).toString()
    });
    if (!res.ok) throw new Error('cart ' + res.status);
    if (UNAVAILABLE_RE.test(await res.text())) return { skip: 'unavailable (server)' };
    return true;
  }

  function recordClaim(id, name) {
    if (!ns.claimHistory) return;
    ns.claimHistory.addClaim({
      id: id,
      name: name,
      source: 'superhive',
      url: id && id.indexOf('/products/') === 0 ? new URL(id, location.origin).href : (id || null),
      license: null
    });
  }

  /* ── Endless pagination ──────────────────────────────────────────── */
  var paging = {
    running: false,
    stop: false,
    done: false,
    paused: false,
    stoppedEarly: false,
    promise: null,
    nextUrl: undefined,
    pages: 1,
    pagesInBurst: 0,
    total: null
  };

  function nextPageUrl(doc) {
    var a = doc.querySelector(SELECTORS.pagyNextA) ||
            doc.querySelector(SELECTORS.pagyNextRel);
    var href = a && a.getAttribute('href');
    return (href && href !== '#') ? new URL(href, location.origin).href : null;
  }

  function readTotal(doc) {
    var nav = doc.querySelector(SELECTORS.pagyNav);
    var m = (nav && nav.textContent || '').match(/of\s+([\d,]+)\s+in total/i);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  function setPagyHidden(hide) {
    var nodes = document.querySelectorAll(SELECTORS.pagyNav + ' .pagy-bootstrap-nav');
    for (var i = 0; i < nodes.length; i++) nodes[i].style.display = hide ? 'none' : '';
  }

  function loadAllPages(isResume) {
    if (paging.promise) return paging.promise;
    paging.promise = (async function() {
      paging.running = true;
      paging.stop = false;
      paging.paused = false;
      if (!isResume) paging.pagesInBurst = 0;
      paging.total = paging.total != null ? paging.total : readTotal(document);
      setPagyHidden(true);
      if (paging.nextUrl === undefined) paging.nextUrl = nextPageUrl(document);
      var visited = new Set([location.href]);
      var grid = getGrid();
      var n = 0;
      var priceAsc = isPriceAscending();
      var budget = config.superhivePageBudget || 5;

      if (!priceAsc) {
        state.statusText = t('superhive_status_unsorted_notice', String(budget));
        utils.log('[Superhive] Listing is not price-ascending sorted. Relying on page budget (' + budget + ').');
      }

      try {
        while (paging.nextUrl && !paging.stop && n < MAX_PAGES) {
          if (visited.has(paging.nextUrl)) break;
          visited.add(paging.nextUrl);
          state.statusText = t('superhive_status_loading_page', String(paging.pages + 1));
          var res = await rlFetch(paging.nextUrl);
          if (!res.ok) throw new Error('page ' + res.status);
          var doc = new DOMParser().parseFromString(await res.text(), 'text/html');
          if (paging.total == null) paging.total = readTotal(doc);

          var frag = document.createDocumentFragment();
          var added = 0;
          var nodes = doc.querySelectorAll(SELECTORS.card);
          var hitPaidInAsc = false;

          for (var i = 0; i < nodes.length; i++) {
            var card = nodes[i];
            if (priceAsc && !isFree(card)) {
              hitPaidInAsc = true;
              utils.log('[Superhive] Price-ascending early stop: reached first non-free card.');
              break;
            }
            var key = slugOf(card);
            if (seen.has(key)) continue;
            seen.add(key);
            frag.appendChild(document.importNode(card, true));
            added++;
          }

          if (added > 0) grid.appendChild(frag);
          paging.pages++;
          paging.pagesInBurst++;
          n++;

          state.assetsFound = getFreeAssetCards();
          state.assetsTotal = state.assetsFound.length;
          applyHideNonFree();

          if (priceAsc && hitPaidInAsc) {
            paging.done = true;
            paging.stoppedEarly = true;
            paging.nextUrl = null;
            state.statusText = t('superhive_status_stopped_past_free', String(state.assetsFound.length));
            utils.log('[Superhive] Early stop triggered — found ' + state.assetsFound.length + ' free products.');
            break;
          }

          paging.nextUrl = nextPageUrl(doc);
          if (!added && !paging.nextUrl) break;

          if (paging.pagesInBurst >= budget && paging.nextUrl) {
            paging.paused = true;
            state.statusText = t('superhive_status_budget_reached', String(paging.pages), String(state.assetsFound.length));
            utils.log('[Superhive] Page budget reached (' + budget + ' pages). Pausing pagination.');
            break;
          }

          if (paging.nextUrl && !paging.stop) {
            await sleep(pageDelay() + throttleBump + Math.random() * JITTER_MS);
          }
        }
        if (!paging.paused) {
          paging.done = !paging.nextUrl || paging.stoppedEarly;
        }
      } catch (e) {
        if (e.message === 'circuit_breaker') {
          paging.paused = true;
          state.statusText = t('superhive_status_circuit_breaker', String(config.superhiveMaxRateLimitStreak || 3));
          utils.log('[Superhive] Circuit breaker triggered after rate limit streak.', 'warn');
        } else {
          utils.log('[Superhive] pagination error: ' + e.message, 'warn');
          state.statusText = t('superhive_status_page_failed', e.message);
        }
      } finally {
        paging.running = false;
        paging.promise = null;
        if (paging.done) {
          if (!paging.stoppedEarly) {
            state.statusText = t('superhive_status_pages_done', String(state.assetsFound.length));
          }
          utils.log('[Superhive] Endless pagination complete.');
        }
        updatePanelLoadMoreVisibility();
        applyHideNonFree();
      }
    })();
    return paging.promise;
  }

  function updatePanelLoadMoreVisibility() {
    try {
      var showGate = (paging.paused && !paging.done && paging.nextUrl);
      var loadBtn = document.querySelector('#fab-grab-superhive-load-more');
      if (loadBtn) loadBtn.style.display = showGate ? '' : 'none';
      var cartBtn = document.querySelector('#fab-grab-superhive-cart-loaded');
      if (cartBtn) cartBtn.style.display = showGate ? '' : 'none';
    } catch (_) {}
  }

  async function cartLoadedAssets() {
    paging.bypassGate = true;
    if (ns.controller) {
      await ns.controller.start('superhive', processAllAssets);
    } else {
      await processAllAssets();
    }
  }

  /* ── Free-only / hide-non-free ───────────────────────────────────── */
  function applyHideNonFree() {
    if (state.isRunning) return;
    var hide = config.superhiveFreeOnly && config.superhiveHideNonFree;
    var nodes = document.querySelectorAll(SELECTORS.card);
    for (var i = 0; i < nodes.length; i++) {
      var c = nodes[i];
      if (!hide) { c.style.display = ''; continue; }
      c.style.display = isFree(c) ? '' : 'none';
    }
  }

  /* ── Bulk add-to-cart ────────────────────────────────────────────── */
  async function processAllAssets() {
    state.statusText = t('controller_scanning');
    utils.log('[Superhive] Scanning listing for free products...');

    // Handle pagination if enabled and incomplete.
    if (config.superhiveEndlessPagination && !paging.done) {
      if (paging.paused && !paging.bypassGate) {
        state.statusText = t('superhive_status_cart_gate', String(state.assetsFound.length));
        utils.log('[Superhive] Paging paused (' + state.assetsFound.length + ' products loaded). Click "Cart Loaded Products" to proceed or "Load More Pages" to continue pagination.');
        updatePanelLoadMoreVisibility();
        return;
      }
      state.statusText = t('superhive_status_waiting_pages');
      await loadAllPages();
      if (!paging.done && !paging.bypassGate) {
        state.statusText = t('superhive_status_cart_gate', String(state.assetsFound.length));
        utils.log('[Superhive] Pagination paused — click "Cart Loaded Products" to proceed or "Load More Pages" to continue pagination.', 'warn');
        updatePanelLoadMoreVisibility();
        return;
      }
    }
    paging.bypassGate = false;

    // Re-scan the live DOM after pagination so the list reflects reality.
    var allCards = getFreeAssetCards();
    state.assetsFound = allCards;
    state.assetsTotal = allCards.length;

    var cards = [];
    for (var i = 0; i < allCards.length; i++) {
      var c = allCards[i].element;
      if (isFree(c) && c.style.display !== 'none') cards.push(allCards[i]);
    }

    if (cards.length === 0) {
      state.statusText = t('assets_none_found');
      utils.log('[Superhive] No free products on this listing.');
      applyHideNonFree();
      return;
    }

    // Login guard: verify session on first card before starting bulk processing
    if (cards.length > 0) {
      var checkHref = slugOf(cards[0].element);
      try {
        var testRes = await rlFetch(checkHref);
        if (testRes.ok) {
          var testDoc = new DOMParser().parseFromString(await testRes.text(), 'text/html');
          var testForm = testDoc.querySelector(SELECTORS.productForm);
          var bodyTxt = testDoc.body ? testDoc.body.textContent : '';
          var isLoggedOut = !testForm && (/log\s*in|sign\s*in|create\s*account/i.test(bodyTxt));
          var isOwned = /you\s+own\s+this|already\s+owned|download\s+files?|purchased/i.test(bodyTxt);
          if (isLoggedOut && !isOwned) {
            state.statusText = t('superhive_status_not_signed_in');
            utils.log('[Superhive] Not signed in to Superhive. Aborting bulk run.', 'warn');
            return;
          }
        }
      } catch (e) {
        // Continue if single check encounters network error
      }
    }

    utils.log('[Superhive] Adding ' + cards.length + ' free product(s) to cart...');
    state.statusText = t('controller_claiming_n', String(0), String(cards.length));

    for (var j = 0; j < cards.length; j++) {
      if (state.shouldStop) {
        utils.log('[Superhive] Stopped by user.');
        state.statusText = t('controller_stopped');
        break;
      }

      var asset = cards[j];
      asset.status = 'processing';
      var href = slugOf(asset.element);
      var name = asset.name;
      state.statusText = t('superhive_status_carting',
        String(j + 1), String(cards.length),
        String(state.assetsClaimed), String(state.assetsSkipped), String(state.assetsFailed));

      try {
        var r = await addOneToCart(href);
        if (r && r.skip) {
          asset.status = 'skipped';
          state.assetsSkipped++;
          utils.log('[Superhive] Skipped "' + name + '": ' + r.skip, 'warn');
        } else {
          asset.status = 'claimed';
          state.assetsClaimed++;
          recordClaim(href, name);
          utils.log('[Superhive] Added "' + name + '" to cart.');
        }
      } catch (err) {
        asset.status = 'failed';
        state.assetsFailed++;
        utils.log('[Superhive] Failed "' + name + '": ' + err.message, 'error');
      }

      if (j < cards.length - 1 && !state.shouldStop) {
        var d = delay();
        var jitter = d * 0.25 * (Math.random() - 0.5);
        await sleep(d + throttleBump + jitter);
      }
    }

    var summary = t('controller_summary_simple',
      String(state.assetsClaimed), String(state.assetsFailed));
    state.statusText = summary;
    utils.log('[Superhive] ' + summary);

    // Try to refresh the on-page cart badge count after the run.
    refreshCartBadge();
  }

  function refreshCartBadge() {
    try {
      rlFetch(location.href).then(function(r) { return r.text(); }).then(function(t) {
        var doc = new DOMParser().parseFromString(t, 'text/html');
        var n = doc.querySelector(SELECTORS.cartBadge);
        if (!n) return;
        var b = document.querySelector(SELECTORS.cartBadge);
        if (b) b.textContent = n.textContent.trim();
      }).catch(function() {});
    } catch (e) {}
  }

  /* ── Public surface (contract with shared UI/controller) ─────────── */
  ns.assetProcessor = {
    getFreeAssetCards: getFreeAssetCards,
    processAllAssets:  processAllAssets,
    cartLoadedAssets:  cartLoadedAssets,
    isFree:            isFree,
    applyHideNonFree:  applyHideNonFree,
    loadAllPages:      loadAllPages,
    resetSeen:         resetSeen,
    paging:            paging
  };
})();
