(function() {
  'use strict';
  var ns = window.__fabGrabber;
  if (!ns) return;

  var state = ns.state;
  var t = function(k) { return (ns.i18n && ns.i18n.t) ? ns.i18n.t.apply(null, arguments) : k; };

  function updateAssetsList(container) {
    if (!container) return;
    container.innerHTML = '';

    var assets = state.assetsFound;
    if (!assets || assets.length === 0) {
      container.innerHTML = '<div class="fab-grab-empty">' + t('assets_none_found') + '</div>';
      return;
    }

    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      var item = document.createElement('div');
      item.className = 'fab-grab-asset-item';

      var statusClass = '';
      if (asset.status === 'claimed') statusClass = ' claimed';
      else if (asset.status === 'failed') statusClass = ' failed';
      else if (asset.status === 'processing') statusClass = ' pending';

      item.innerHTML =
        '<div class="fab-grab-asset-status' + statusClass + '"></div>' +
        '<div class="fab-grab-asset-name">' + escapeHtml(asset.name || t('assets_unknown')) + '</div>' +
        (asset.license ? '<div class="fab-grab-asset-license">' + escapeHtml(asset.license) + '</div>' : '');

      container.appendChild(item);
    }
  }

  function updateCountBadge(el) {
    if (!el) return;
    var claimed = state.assetsClaimed;
    var total = state.assetsTotal || state.assetsFound.length;
    el.textContent = claimed + '/' + total;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  ns.ui = ns.ui || {};
  ns.ui.assetsList = {
    update: updateAssetsList,
    updateCount: updateCountBadge
  };
})();
