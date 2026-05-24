(function() {
  var TOTAL = 5;
  var current = 0;
  var track = document.getElementById('track');
  var slides = document.querySelectorAll('.slide');
  var skipBtn = document.getElementById('skipBtn');

  function t(key) {
    if (!key) return '';
    var subs = [];
    for (var i = 1; i < arguments.length; i++) subs.push(arguments[i]);
    var ns = window.__fabGrabber && window.__fabGrabber.i18n;
    var msg = ns ? ns.getMessage(key, subs) : chrome.i18n.getMessage(key, subs);
    return msg || key;
  }

  function updateStepLabels() {
    for (var i = 0; i < slides.length; i++) {
      var label = slides[i].querySelector('.step-label');
      if (label) {
        label.textContent = t('onboarding_step_label', String(i + 1), String(TOTAL));
      }
    }
  }

  function goTo(idx) {
    if (idx < 0 || idx >= TOTAL) return;
    slides[current].classList.remove('is-active');
    current = idx;
    slides[current].classList.add('is-active');
    track.style.transform = 'translateX(-' + (current * 20) + '%)';
    skipBtn.style.visibility = (current === TOTAL - 1) ? 'hidden' : 'visible';
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'next') goTo(current + 1);
    if (action === 'prev') goTo(current - 1);
  });

  function postToParent(type) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: type }, '*');
      }
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ onboardingShown: true });
      }
    } catch (_) {}
  }

  skipBtn.addEventListener('click', function() { goTo(TOTAL - 1); });

  document.getElementById('getStartedBtn').addEventListener('click', function() {
    postToParent('ONBOARDING_COMPLETE');
  });

  document.getElementById('goPremiumBtn').addEventListener('click', function() {
    postToParent('OPEN_PREMIUM');
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(current + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(current - 1);
  });

  updateStepLabels();
})();
