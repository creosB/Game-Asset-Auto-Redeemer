(function() {
  'use strict';

  var PREMIUM_STORAGE_KEY_PREFIX = 'premium_auth_status_v1_';
  var PREMIUM_MAX_ATTEMPTS = 3;
  var PREMIUM_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

  var inMemoryAttempts = {};

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidCode(code) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(code);
  }

  function checkRateLimit(email) {
    var now = Date.now();
    var rec = inMemoryAttempts[email];
    if (rec && now - rec.timestamp < PREMIUM_ATTEMPT_WINDOW_MS) {
      return rec.count < PREMIUM_MAX_ATTEMPTS;
    }
    delete inMemoryAttempts[email];
    return true;
  }

  function incrementAttempts(email) {
    var now = Date.now();
    var rec = inMemoryAttempts[email];
    if (!rec || now - rec.timestamp > PREMIUM_ATTEMPT_WINDOW_MS) {
      inMemoryAttempts[email] = { count: 1, timestamp: now };
    } else {
      rec.count++;
    }
  }

  function createPremiumModal() {
    var overlay = document.createElement('div');
    overlay.id = 'premium-modal-overlay';
    overlay.className = 'premium-modal-overlay';
    overlay.innerHTML =
      '<div class="premium-modal-backdrop" id="premium-modal-backdrop"></div>' +
      '<div class="premium-modal" role="dialog" aria-modal="true">' +
        '<button class="premium-close" id="premium-close-btn" aria-label="Close">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.42L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>' +
        '</button>' +
        '<div class="premium-modal-header">' +
          '<h2 class="premium-modal-title">Premium</h2>' +
          '<div class="premium-modal-subtitle">Unlock premium features and support development.</div>' +
        '</div>' +
        '<div class="premium-modal-body">' +
          '<div class="premium-features">' +
            '<div class="premium-feature"><span class="premium-check">✔</span><span>Claim History — Track and search all your claimed assets</span></div>' +
            '<div class="premium-feature"><span class="premium-check">✔</span><span>FAB Monthly Free Assets — View and claim limited-time free assets</span></div>' +
            '<div class="premium-feature"><span class="premium-check">✔</span><span>Unity Weekly Free Asset — See this week\'s free asset with coupon codes</span></div>' +
            '<div class="premium-feature"><span class="premium-check">✔</span><span>Support ongoing development &amp; future features</span></div>' +
          '</div>' +
          '<div class="premium-form" id="premium-form">' +
            '<input type="email" class="premium-input" id="premium-email" placeholder="Email used at checkout" />' +
            '<input type="text" class="premium-input" id="premium-code" placeholder="License key (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)" />' +
          '</div>' +
          '<div class="premium-status" id="premium-status"></div>' +
          '<div class="premium-actions">' +
            '<button class="premium-btn primary" id="premium-buy-btn">Go Premium</button>' +
            '<button class="premium-btn secondary" id="premium-verify-btn">Verify</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('premium-modal-backdrop').addEventListener('click', closePremiumModal);
    document.getElementById('premium-close-btn').addEventListener('click', closePremiumModal);
    document.getElementById('premium-buy-btn').addEventListener('click', function() {
      window.open('https://artistscompany.lemonsqueezy.com/checkout/buy/6bbaae2a-94bd-4b63-b005-9f6e7c3d98c4', '_blank');
    });
    document.getElementById('premium-verify-btn').addEventListener('click', handlePremiumVerify);

    updatePremiumStatusUI();
  }

  function openPremiumModal() {
    if (!document.getElementById('premium-modal-overlay')) {
      createPremiumModal();
    }
    document.getElementById('premium-modal-overlay').classList.add('is-open');
  }

  function closePremiumModal() {
    var el = document.getElementById('premium-modal-overlay');
    if (el) el.classList.remove('is-open');
  }

  function showPremiumStatus(type, msg) {
    var el = document.getElementById('premium-status');
    if (!el) return;
    el.className = 'premium-status ' + type + ' show';
    el.textContent = msg;
  }

  function showVerifyForm(show) {
    var form = document.getElementById('premium-form');
    var verifyBtn = document.getElementById('premium-verify-btn');
    if (form) form.style.display = show ? '' : 'none';
    if (verifyBtn) verifyBtn.style.display = show ? '' : 'none';
  }

  async function updatePremiumStatusUI() {
    try {
      var bg = await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
      var buyBtn = document.getElementById('premium-buy-btn');
      var statusEl = document.getElementById('premium-status');

      if (!bg || bg.isPremium === undefined) {
        if (statusEl) {
          statusEl.className = 'premium-status info show';
          statusEl.textContent = 'Enter your email and license key to verify.';
        }
        showVerifyForm(true);
        return;
      }

      if (bg.isPremium) {
        if (statusEl) {
          statusEl.className = 'premium-status success show';
          statusEl.textContent = 'Premium active. Thank you!';
        }
        showVerifyForm(false);
        if (buyBtn) {
          buyBtn.style.display = 'none';
          buyBtn.setAttribute('aria-hidden', 'true');
        }
        var actionsEl = document.querySelector('.premium-actions');
        if (actionsEl && !document.getElementById('premium-coffee-btn')) {
          var coffeeBtn = document.createElement('a');
          coffeeBtn.id = 'premium-coffee-btn';
          coffeeBtn.className = 'premium-btn coffee';
          coffeeBtn.href = 'https://buymeacoffee.com/creos';
          coffeeBtn.target = '_blank';
          coffeeBtn.rel = 'noopener noreferrer';
          coffeeBtn.textContent = '☕ Buy Me a Coffee';
          actionsEl.appendChild(coffeeBtn);
        }
      } else {
        if (statusEl) {
          statusEl.className = 'premium-status info show';
          statusEl.textContent = 'License not verified yet.';
        }
        showVerifyForm(true);
        if (buyBtn) {
          buyBtn.style.display = '';
          buyBtn.removeAttribute('aria-hidden');
        }
      }
    } catch (e) {}
  }

  async function handlePremiumVerify() {
    var email = (document.getElementById('premium-email').value || '').trim();
    var code = (document.getElementById('premium-code').value || '').trim();

    if (!email || !code) return showPremiumStatus('error', 'Email and license are required.');
    if (!isValidEmail(email)) return showPremiumStatus('error', 'Invalid email format.');
    if (!isValidCode(code)) return showPremiumStatus('error', 'Invalid license key format.');
    if (!checkRateLimit(email)) return showPremiumStatus('error', 'Too many attempts. Try again later.');
    incrementAttempts(email);

    try {
      var result = await chrome.runtime.sendMessage({
        type: 'CHECK_PREMIUM_STATUS',
        payload: { email: email, code: code }
      });

      if (result && result.success && result.isPremium) {
        showPremiumStatus('success', 'Access granted. Welcome to Premium!');
        applyPremiumGating(true);
        setTimeout(closePremiumModal, 1500);
      } else if (result && result.success && !result.isPremium) {
        showPremiumStatus('info', 'License not verified. Please check your key.');
      } else {
        showPremiumStatus('error', (result && result.error) || 'Verification failed.');
      }
    } catch (e) {
      showPremiumStatus('error', 'Unexpected error. Please try again.');
    }
  }

  async function checkPremiumAndGate() {
    try {
      var result = await chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' });
      var isPremium = result && result.isPremium === true;
      applyPremiumGating(isPremium);
      return isPremium;
    } catch (e) {
      applyPremiumGating(false);
      return false;
    }
  }

  function applyPremiumGating(isPremium) {
    var sections = [
      { id: 'claim-history-section', label: 'Claim History' },
      { id: 'monthly-free-section', label: 'FAB Monthly Free Assets' },
      { id: 'weekly-asset-section', label: 'Unity Weekly Free Asset' }
    ];

    for (var i = 0; i < sections.length; i++) {
      var section = document.getElementById(sections[i].id);
      if (!section) continue;

      var existing = section.querySelector('.premium-gate-overlay');
      if (isPremium) {
        section.classList.remove('premium-gated');
        if (existing) existing.remove();
      } else {
        section.classList.add('premium-gated');
        if (!existing) {
          var gate = document.createElement('div');
          gate.className = 'premium-gate-overlay';
          gate.innerHTML =
            '<div class="premium-gate-content">' +
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="premium-gate-icon"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>' +
              '<span class="premium-gate-label">' + sections[i].label + '</span>' +
              '<span class="premium-gate-desc">Premium feature</span>' +
              '<button class="premium-gate-btn">Unlock with Premium</button>' +
            '</div>';
          var gateBtn = gate.querySelector('.premium-gate-btn');
          if (gateBtn) {
            gateBtn.addEventListener('click', function() { openPremiumModal(); });
          }
          section.appendChild(gate);
        }
      }
    }

    var premiumBtn = document.getElementById('header-premium-btn');
    if (premiumBtn) {
      premiumBtn.style.display = '';
      if (isPremium) {
        premiumBtn.classList.add('is-premium');
        premiumBtn.title = 'Premium Active';
      } else {
        premiumBtn.classList.remove('is-premium');
        premiumBtn.title = 'Go Premium';
      }
    }
  }

  document.addEventListener('openPremiumModal', function() {
    openPremiumModal();
  });

  window.PremiumGate = {
    open: openPremiumModal,
    close: closePremiumModal,
    check: checkPremiumAndGate,
    apply: applyPremiumGating
  };
})();
