(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var INTERACTIVE_SEL = 'button, input, select, textarea, a, label, .fab-grab-toggle, .fab-grab-toggle-slider, .fab-grab-assets-list, .fab-grab-search';

  function isInteractive(target, handle) {
    var node = target;
    while (node && node !== handle) {
      if (node.matches && node.matches(INTERACTIVE_SEL)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function makeDraggable(el, handle) {
    var isDragging = false;
    var startX, startY, origLeft, origTop;

    handle.addEventListener('mousedown', function(e) {
      if (isInteractive(e.target, handle)) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      var rect = el.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      el.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      el.style.left = (origLeft + dx) + 'px';
      el.style.top = (origTop + dy) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
    });

    document.addEventListener('mouseup', function() {
      if (isDragging) {
        isDragging = false;
        el.style.transition = '';
      }
    });

    handle.addEventListener('touchstart', function(e) {
      if (isInteractive(e.target, handle)) return;
      var touch = e.touches[0];
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      var rect = el.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      el.style.transition = 'none';
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      var touch = e.touches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      el.style.left = (origLeft + dx) + 'px';
      el.style.top = (origTop + dy) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (isDragging) {
        isDragging = false;
        el.style.transition = '';
      }
    });
  }

  ns.ui = ns.ui || {};
  ns.ui.drag = {
    makeDraggable: makeDraggable
  };
})();
