(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var state = ns.state;
  var config = ns.config;

  function recordClaim(asset) {
    if (!ns.claimHistory) return;
    var link = asset.element ? asset.element.querySelector('a[href*="/listings/"]') : null;
    var url = link ? link.href : null;
    ns.claimHistory.addClaim({
      id: asset.id,
      name: asset.name,
      source: 'fab',
      url: url,
      license: config.preferredLicense || null
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
    return href.split('/').pop();
  }

  async function revealCardButtons(card) {
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
    await utils.wait(250);
  }

  function findCardActionButton(card) {
    var btn;
    var tier;

    btn = card.querySelector('button[aria-label="Add to library"]');
    if (btn) {
      tier = 'aria-label-exact';
      utils.log('[Selector:Button] Tier "' + tier + '" matched type=library');
      return { button: btn, type: 'library' };
    }

    btn = card.querySelector('button[aria-label="Add listing to cart"]');
    if (btn) {
      tier = 'aria-label-exact';
      utils.log('[Selector:Button] Tier "' + tier + '" matched type=cart');
      return { button: btn, type: 'cart' };
    }

    btn = card.querySelector('button:has(i.edsicon-shopping-cart-plus)');
    if (btn) {
      tier = 'icon-class';
      utils.log('[Selector:Button] Tier "' + tier + '" matched type=cart');
      return { button: btn, type: 'cart' };
    }

    btn = card.querySelector(
      'button:has(i[class*="library"]), button:has(i[class*="plus"])'
    );
    if (btn) {
      tier = 'icon-class';
      utils.log('[Selector:Button] Tier "' + tier + '" matched type=library');
      return { button: btn, type: 'library' };
    }

    var buttons = card.querySelectorAll('button[aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      var al = buttons[i].getAttribute('aria-label').toLowerCase();
      if (al.indexOf('library') !== -1) {
        tier = 'aria-label-keyword';
        utils.log('[Selector:Button] Tier "' + tier + '" matched type=library');
        return { button: buttons[i], type: 'library' };
      }
      if (al.indexOf('cart') !== -1) {
        tier = 'aria-label-keyword';
        utils.log('[Selector:Button] Tier "' + tier + '" matched type=cart');
        return { button: buttons[i], type: 'cart' };
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
          utils.log('[Selector:Button] Tier "' + tier + '" matched type=library');
          return { button: overlayBtns[k], type: 'library' };
        }
        if (oal.indexOf('cart') !== -1 || otxt.indexOf('cart') !== -1) {
          tier = 'overlay-container';
          utils.log('[Selector:Button] Tier "' + tier + '" matched type=cart');
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
        utils.log('[Selector:Button] Tier "' + tier + '" matched type=' + btnType + ' (only button in overlay)');
        return { button: onlyBtn, type: btnType };
      }
    }

    return null;
  }

  function findCardRoot(link) {
    var node = link.parentElement;
    while (node && node !== document.body) {
      var hasThumb = node.querySelector('.fabkit-Thumbnail-root');
      if (!hasThumb) { node = node.parentElement; continue; }

      var hasCartBtn = node.querySelector(
        'button[aria-label*="cart" i], button[aria-label*="library" i]'
      );
      if (hasCartBtn) return node;

      var hasOverlay = node.querySelector('.fabkit-Thumbnail-item.fabkit-Thumbnail--top-right');
      if (hasOverlay) return node;

      node = node.parentElement;
    }
    return null;
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
        utils.log('[Selector:CardDetect] Skipping owned asset: ' + getAssetName(card));
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
        id: getAssetId(card),
        status: 'pending',
        claimButton: action ? action.button : null,
        actionType: action ? action.type : null
      };
      cards.push(cardObj);
    }

    utils.log('[Selector:CardDetect] Tier "links+price-text" matched ' + cards.length + ' card(s).');

    if (cards.length === 0) {
      var stackCount = document.querySelectorAll('.fabkit-Stack-root').length;
      utils.log(
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
        utils.log('[Selector] Tier "' + tier.name + '" matched ' + els.length + ' element(s).');
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

  async function processCard(asset) {
    if (!asset || !asset.element) return false;

    utils.log('Processing: ' + asset.name);
    asset.status = 'processing';

    try {
      await revealCardButtons(asset.element);

      var action = findCardActionButton(asset.element);
      if (!action) {
        var link = asset.element.querySelector('a[href*="/listings/"]');
        if (link) {
          link.click();
          await utils.wait(2000);
          action = findCardActionButton(document);
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
        utils.log(
          '[Selector:Button] Button not visible (visibility=' + cs.visibility +
          ', display=' + cs.display + '), attempting click anyway.',
          'warn'
        );
      }

      await utils.safeClick(action.button, action.type + ' button');

      if (action.type === 'library') {
        utils.log('[Asset] Direct library add for: ' + asset.name);
        var ok = await waitForLibraryAddConfirmation(action.button, 5000);
        if (ok) {
          asset.status = 'claimed';
          state.assetsClaimed++;
          recordClaim(asset);
          utils.log('Successfully added to library: ' + asset.name);
          return true;
        }
        asset.status = 'failed';
        state.assetsFailed++;
        utils.log('Library add not confirmed for: ' + asset.name, 'warn');
        return false;
      }

      var dialog = await utils.waitForElement(
        '[role="dialog"][aria-modal="true"]', 8000
      );

      if (dialog) {
        utils.log('License dialog detected for: ' + asset.name);
        utils.log('[Debug] Dialog HTML (first 500 chars): ' + dialog.outerHTML.substring(0, 500));

        if (ns.licenseProcessor) {
          await ns.licenseProcessor.selectLicenseAndAdd(config.preferredLicense);
          await utils.wait(500);
          await ns.licenseProcessor.clickAddToCartButton();
        }

        await utils.wait(2000);

        var success = checkForSuccess(asset);
        if (success) {
          asset.status = 'claimed';
          state.assetsClaimed++;
          recordClaim(asset);
          utils.log('Successfully claimed: ' + asset.name);
          return true;
        }
      } else {
        await utils.wait(2000);
        var directSuccess = checkForSuccess(asset);
        if (directSuccess) {
          asset.status = 'claimed';
          state.assetsClaimed++;
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
    state.statusText = 'Scanning...';
    utils.log('Scanning for free assets...');

    state.assetsFound = getFreeAssetCards();
    state.assetsTotal = state.assetsFound.length;

    if (state.assetsFound.length === 0) {
      state.statusText = 'No free assets found';
      utils.log('No free assets found on this page.');
      return;
    }

    utils.log('Found ' + state.assetsFound.length + ' free asset(s).');
    state.statusText = 'Claiming 0/' + state.assetsTotal + '...';

    for (var i = 0; i < state.assetsFound.length; i++) {
      if (state.shouldStop) {
        utils.log('Stopped by user.');
        state.statusText = 'Stopped';
        break;
      }

      var asset = state.assetsFound[i];
      state.statusText = 'Claiming ' + (i + 1) + '/' + state.assetsTotal + '...';

      await processCard(asset);

      if (i < state.assetsFound.length - 1 && !state.shouldStop) {
        var delay = config.delayBetweenActions || 2000;
        var jitter = delay * 0.3 * (Math.random() - 0.5);
        await utils.wait(delay + jitter);
      }
    }

    state.statusText = 'Done: ' + state.assetsClaimed + ' claimed, ' + state.assetsFailed + ' failed';
    utils.log(state.statusText);
  }

  window.__fabGrabDebug = {
    scan: function() {
      var cards = getFreeAssetCards();
      console.log('[FAB Debug] Found ' + cards.length + ' free card(s).');
      if (cards.length > 0) {
        console.log('[FAB Debug] First card outerHTML (500 chars): ' + cards[0].element.outerHTML.substring(0, 500));
      }
      return cards;
    }
  };

  ns.assetProcessor = {
    getFreeAssetCards: getFreeAssetCards,
    processCard: processCard,
    processAllAssets: processAllAssets,
    findCardActionButton: findCardActionButton,
    findCartButton: findCardActionButton,
    getAssetName: getAssetName,
    getAssetId: getAssetId,
    isAlreadyOwned: isAlreadyOwned,
    revealCardButtons: revealCardButtons,
    waitForLibraryAddConfirmation: waitForLibraryAddConfirmation
  };
})();
