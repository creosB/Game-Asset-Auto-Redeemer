(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var utils = ns.utils;

  function setupSearchFunctionality(input, listContainer) {
    if (!input || !listContainer) return;

    var debouncedFilter = utils.debounce(function() {
      filterAssetsList(input, listContainer);
    }, 200);

    input.addEventListener('input', debouncedFilter);

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        input.value = '';
        filterAssetsList(input, listContainer);
      }
    });
  }

  function filterAssetsList(input, listContainer) {
    var query = (input.value || '').toLowerCase().trim();
    var items = listContainer.querySelectorAll('.fab-grab-asset-item');

    for (var i = 0; i < items.length; i++) {
      var nameEl = items[i].querySelector('.fab-grab-asset-name');
      if (!nameEl) continue;
      var name = nameEl.textContent.toLowerCase();
      if (!query || name.indexOf(query) !== -1) {
        items[i].style.display = '';
      } else {
        items[i].style.display = 'none';
      }
    }
  }

  ns.ui = ns.ui || {};
  ns.ui.search = {
    setup: setupSearchFunctionality,
    filter: filterAssetsList
  };
})();
