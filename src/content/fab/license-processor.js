(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;
  var config = ns.config;

  var _actionClicked = false;

  var BUTTON_TEXT_RE = /add to (my )?library|add to cart|claim|get|download/i;

  async function waitForDialogContentLoaded(dialog) {
    var start = Date.now();
    var timeout = 5000;
    while (Date.now() - start < timeout) {
      var rg = dialog.querySelector('[role="radiogroup"]')
        || dialog.querySelector('.fabkit-RadioGroup-root');
      if (rg) {
        utils.log('[License] Dialog content loaded (radiogroup) at ' + (Date.now() - start) + 'ms');
        return true;
      }
      var ff = dialog.querySelectorAll('.fabkit-FormField-root');
      if (ff.length > 0) {
        utils.log('[License] Dialog content loaded (form fields) at ' + (Date.now() - start) + 'ms');
        return true;
      }
      var btn = dialog.querySelector('button.fabkit-Button--primary');
      if (btn && !btn.disabled) {
        utils.log('[License] Dialog content loaded (button) at ' + (Date.now() - start) + 'ms');
        return true;
      }
      await utils.wait(100);
    }
    utils.log('[License] Dialog content did not load within ' + timeout + 'ms', 'warn');
    return false;
  }

  function findLicenseOptions(dialog) {
    utils.log('[License:Debug] Dialog HTML length: ' + dialog.outerHTML.length);
    utils.log(
      '[License:Debug] Radiogroups in dialog: ' +
      dialog.querySelectorAll('[role="radiogroup"]').length
    );
    utils.log(
      '[License:Debug] FormFields in dialog: ' +
      dialog.querySelectorAll('.fabkit-FormField-root').length
    );
    utils.log(
      '[License:Debug] Radio inputs in dialog: ' +
      dialog.querySelectorAll('input[type="radio"]').length
    );

    var radiogroup = dialog.querySelector('[role="radiogroup"]');

    if (!radiogroup) {
      radiogroup = dialog.querySelector('.fabkit-RadioGroup-root');
    }

    var scope = radiogroup || dialog;

    if (!radiogroup) {
      utils.log(
        '[License] No radiogroup; dialog HTML: ' +
        dialog.outerHTML.substring(0, 800),
        'warn'
      );
      return { personal: null, professional: null };
    }

    utils.log('[License] Radiogroup found: true');

    var fields = scope.querySelectorAll('.fabkit-FormField-root');
    utils.log('[License] Found ' + fields.length + ' license fields.');

    var options = { personal: null, professional: null };

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var label = field.querySelector('label.fabkit-FormField-label');
      var input = field.querySelector('input[type="radio"]');
      if (!label || !input) continue;

      var hint = field.querySelector('.fabkit-FormField-hint');
      var priceEl = null;
      if (hint) {
        priceEl = hint.querySelector(
          '.fabkit-Typography--intent-primary.fabkit-Text--bold'
        );
        if (!priceEl) {
          priceEl = hint.querySelector('.fabkit-Text--bold');
        }
        if (!priceEl) {
          priceEl = hint.querySelector('.fabkit-Typography--intent-primary');
        }
      }
      var priceText = priceEl ? priceEl.textContent.trim() : '';
      var isFree = /^free$/i.test(priceText);
      var tier = label.textContent.trim().toLowerCase();

      if (tier.indexOf('personal') !== -1) {
        options.personal = {
          label: label,
          input: input,
          isFree: isFree,
          priceText: priceText
        };
      } else if (tier.indexOf('professional') !== -1) {
        options.professional = {
          label: label,
          input: input,
          isFree: isFree,
          priceText: priceText
        };
      }
    }

    var pPrice = options.personal ? (options.personal.isFree ? 'Free' : options.personal.priceText) : 'N/A';
    var prPrice = options.professional ? (options.professional.isFree ? 'Free' : options.professional.priceText) : 'N/A';
    utils.log('[License] Fields parsed: personal=' + pPrice + ' pro=' + prPrice);

    if (!options.personal && !options.professional) {
      utils.log('[License] No license options found in dialog.', 'warn');
    }

    return options;
  }

  async function findPrimaryActionButton(dialog) {
    utils.log('[License] Waiting for primary action button...');
    try {
      var btn = await utils.waitForCondition(function() {
        var buttons = dialog.querySelectorAll(
          'button.fabkit-Button--primary, button[class*="primary"]'
        );
        for (var i = 0; i < buttons.length; i++) {
          if (buttons[i].disabled) continue;
          var txt = buttons[i].textContent.trim().toLowerCase();
          if (BUTTON_TEXT_RE.test(txt)) {
            return buttons[i];
          }
        }
        return null;
      }, 5000, 100);
      utils.log(
        '[License] Button found: \'' + btn.textContent.trim() +
        '\' (enabled)'
      );
      return btn;
    } catch (e) {
      utils.log('[License] Primary action button never appeared or never enabled.', 'warn');
      return null;
    }
  }

  async function selectLicenseAndAdd(dialogOrPreferred, assetName) {
    var dialog;
    var preferred;

    if (typeof dialogOrPreferred === 'string' || !dialogOrPreferred) {
      preferred = dialogOrPreferred || config.preferredLicense || 'professional';
      dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    } else {
      dialog = dialogOrPreferred;
      preferred = config.preferredLicense || 'professional';
    }

    _actionClicked = false;

    if (!dialog) {
      utils.log('[License] No dialog found.', 'warn');
      return { success: false, error: 'No dialog found' };
    }

    utils.log('[License] Dialog detected, polling for content...');
    await waitForDialogContentLoaded(dialog);
    await utils.wait(100);

    var options = findLicenseOptions(dialog);

    if (!options.personal && !options.professional) {
      utils.log('[License] No license options found, attempting direct primary button click.');
      var directBtn = await findPrimaryActionButton(dialog);
      if (directBtn) {
        utils.log('[License] Free asset, clicking primary button directly.');
        utils.safeClick(directBtn, 'direct primary action button');
        _actionClicked = true;
        await utils.wait(1500);
        return { success: true, method: 'direct-add' };
      }
      return { success: false, error: 'No license options and no primary button' };
    }

    var preferredKey = preferred.toLowerCase();
    if (preferredKey.indexOf('personal') === -1 && preferredKey.indexOf('professional') === -1) {
      preferredKey = 'professional';
    }
    if (preferredKey.indexOf('personal') !== -1) preferredKey = 'personal';
    if (preferredKey.indexOf('professional') !== -1) preferredKey = 'professional';

    var selected = options[preferredKey];

    if (!selected) {
      var otherKey = preferredKey === 'personal' ? 'professional' : 'personal';
      var other = options[otherKey];
      if (other && other.isFree) {
        utils.log('[License] Preferred "' + preferredKey + '" not found, using free ' + otherKey + '.');
        selected = other;
        preferredKey = otherKey;
      }
    }

    if (!selected) {
      var fallbackKey = preferredKey === 'personal' ? 'professional' : 'personal';
      if (options[fallbackKey]) {
        selected = options[fallbackKey];
        preferredKey = fallbackKey;
        utils.log('[License] Falling back to ' + fallbackKey + '.');
      }
    }

    if (!selected) {
      utils.log('[License] Could not find any selectable license option.', 'warn');
      return { success: false, error: 'No selectable license option' };
    }

    if (!selected.isFree && !options.personal?.isFree && !options.professional?.isFree) {
      utils.log('[License] No free license available. Skipping asset.');
      return { success: false, error: 'No free license available', skip: true };
    }

    if (!selected.isFree) {
      var altKey = preferredKey === 'personal' ? 'professional' : 'personal';
      var alt = options[altKey];
      if (alt && alt.isFree) {
        utils.log('[License] Preferred "' + preferredKey + '" is not free, switching to free ' + altKey + '.');
        selected = alt;
        preferredKey = altKey;
      }
    }

    utils.log('[License] Selected tier: ' + preferredKey + ' (' + (selected.isFree ? 'Free' : selected.priceText) + ')');

    if (selected.input.checked) {
      utils.log('[License] Radio pre-checked: true');
    } else {
      utils.log('[License] Clicking label...');
      utils.safeClick(selected.label, preferredKey + ' license label');

      try {
        await utils.waitForCondition(function() {
          return selected.input.checked === true;
        }, 2000);
        utils.log('[License] Radio checked successfully.');
      } catch (e) {
        utils.log('[License] Label click did not check radio, fallback to input.click().', 'warn');
        selected.input.click();
        selected.input.dispatchEvent(new Event('change', { bubbles: true }));
        await utils.wait(300);

        if (!selected.input.checked) {
          utils.log('[License] Radio still not checked after fallback click.', 'warn');
        }
      }
    }

    var bothFree = options.personal && options.personal.isFree &&
                   options.professional && options.professional.isFree;
    var selectedIsOnlyFreeTier = selected.isFree &&
      ((preferredKey === 'personal' && (!options.professional || !options.professional.isFree)) ||
       (preferredKey === 'professional' && (!options.personal || !options.personal.isFree)));

    if (bothFree || selectedIsOnlyFreeTier) {
      utils.log('[License] Free asset — button may already be enabled, checking...');
    }

    var addBtn = await findPrimaryActionButton(dialog);

    if (!addBtn) {
      utils.log('[License] Primary action button never found.', 'warn');
      return { success: false, error: 'Primary action button never found' };
    }

    utils.log('[License] Clicking button...');
    utils.safeClick(addBtn, 'primary action button');
    _actionClicked = true;

    await utils.wait(1500);

    var dialogGone = !document.querySelector('[role="dialog"][aria-modal="true"]');
    if (dialogGone) {
      utils.log('[License] Dialog closed, claim confirmed.');
    } else {
      utils.log('[License] Dialog still present after clicking add.', 'warn');
    }

    return { success: true, method: 'license-select' };
  }

  async function clickPrimaryAction() {
    if (_actionClicked) {
      utils.log('[License] Primary action already handled by selectLicenseAndAdd, skipping.');
      _actionClicked = false;
      return true;
    }

    var dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) {
      utils.log('[License] No dialog for clickPrimaryAction.', 'warn');
      return false;
    }

    var btn = await findPrimaryActionButton(dialog);
    if (btn) {
      utils.log('[License] Clicking primary action button (standalone).');
      utils.safeClick(btn, 'primary action button standalone');
      await utils.wait(1000);
      return true;
    }

    utils.log('[License] Could not find enabled primary action button.', 'warn');
    return false;
  }

  ns.licenseProcessor = {
    findLicenseOptions: findLicenseOptions,
    selectLicenseAndAdd: selectLicenseAndAdd,
    clickAddToCartButton: clickPrimaryAction,
    clickPrimaryAction: clickPrimaryAction,
    findPrimaryActionButton: findPrimaryActionButton
  };
})();
