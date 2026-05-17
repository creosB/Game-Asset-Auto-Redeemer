(function() {
  'use strict';
  var ns = (window.__fabGrabber ??= {});

  var CSS_TEXT = [
    /* SVG filter for glass effect */
    '#fab-grab-filter { position: absolute; width: 0; height: 0; }',
    
    /* ── Dynamic Island (collapsed) ───────────────────────── */
    '#fab-grab-island {',
    '  position: fixed;',
    '  top: 12px;',
    '  left: 50%;',
    '  transform: translateX(-50%);',
    '  z-index: 2147483647;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  background: rgba(20, 20, 30, 0.85);',
    '  backdrop-filter: blur(20px) saturate(1.8);',
    '  -webkit-backdrop-filter: blur(20px) saturate(1.8);',
    '  border: 1px solid rgba(255, 255, 255, 0.08);',
    '  border-radius: 50px;',
    '  padding: 6px 16px;',
    '  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;',
    '  font-size: 13px;',
    '  color: #e0e0e0;',
    '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);',
    '  cursor: default;',
    '  user-select: none;',
    '  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);',
    '  min-width: 180px;',
    '  pointer-events: auto;',
    '}',
    
    '#fab-grab-island:hover {',
    '  background: rgba(20, 20, 30, 0.92);',
    '  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08);',
    '}',
    
    /* Status indicator dot */
    '#fab-grab-dot {',
    '  width: 8px;',
    '  height: 8px;',
    '  border-radius: 50%;',
    '  background: #34c759;',
    '  flex-shrink: 0;',
    '  transition: background 0.3s;',
    '}',
    
    '#fab-grab-dot.running {',
    '  background: #ff9f0a;',
    '  animation: fab-grab-pulse 1.2s ease-in-out infinite;',
    '}',
    
    '#fab-grab-dot.error {',
    '  background: #ff453a;',
    '}',
    
    '@keyframes fab-grab-pulse {',
    '  0%, 100% { opacity: 1; transform: scale(1); }',
    '  50% { opacity: 0.5; transform: scale(0.8); }',
    '}',
    
    /* Status text */
    '#fab-grab-status {',
    '  font-size: 12px;',
    '  font-weight: 500;',
    '  color: rgba(255, 255, 255, 0.7);',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  max-width: 200px;',
    '}',
    
    /* Asset count badge */
    '#fab-grab-count {',
    '  background: rgba(52, 199, 89, 0.2);',
    '  color: #34c759;',
    '  font-size: 11px;',
    '  font-weight: 600;',
    '  padding: 2px 8px;',
    '  border-radius: 20px;',
    '  white-space: nowrap;',
    '}',
    
    /* Expand button */
    '#fab-grab-expand {',
    '  background: none;',
    '  border: none;',
    '  color: rgba(255, 255, 255, 0.5);',
    '  cursor: pointer;',
    '  font-size: 14px;',
    '  padding: 2px 4px;',
    '  border-radius: 4px;',
    '  transition: color 0.2s, background 0.2s;',
    '  display: flex;',
    '  align-items: center;',
    '}',
    
    '#fab-grab-expand:hover {',
    '  color: #fff;',
    '  background: rgba(255, 255, 255, 0.1);',
    '}',
    
    /* ── Expanded Panel ───────────────────────────────────── */
    '#fab-grab-panel {',
    '  position: fixed;',
    '  top: 12px;',
    '  left: 50%;',
    '  transform: translateX(-50%);',
    '  z-index: 2147483647;',
    '  width: 420px;',
    '  max-height: 80vh;',
    '  background: rgba(20, 20, 30, 0.92);',
    '  backdrop-filter: blur(30px) saturate(1.8);',
    '  -webkit-backdrop-filter: blur(30px) saturate(1.8);',
    '  border: 1px solid rgba(255, 255, 255, 0.08);',
    '  border-radius: 20px;',
    '  padding: 0;',
    '  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;',
    '  font-size: 13px;',
    '  color: #e0e0e0;',
    '  box-shadow: 0 16px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);',
    '  overflow: hidden;',
    '  display: none;',
    '  flex-direction: column;',
    '  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);',
    '  pointer-events: auto;',
    '}',
    
    '#fab-grab-panel.visible {',
    '  display: flex;',
    '}',
    
    /* Panel header */
    '.fab-grab-panel-header {',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  padding: 16px 20px 12px;',
    '  border-bottom: 1px solid rgba(255, 255, 255, 0.06);',
    '  cursor: grab;',
    '}',

    '.fab-grab-panel-header:active { cursor: grabbing; }',
    
    '.fab-grab-panel-title {',
    '  font-size: 15px;',
    '  font-weight: 600;',
    '  color: #fff;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '}',
    
    '.fab-grab-panel-close {',
    '  background: none;',
    '  border: none;',
    '  color: rgba(255, 255, 255, 0.4);',
    '  cursor: pointer;',
    '  font-size: 18px;',
    '  padding: 4px 8px;',
    '  border-radius: 8px;',
    '  transition: all 0.2s;',
    '}',
    
    '.fab-grab-panel-close:hover {',
    '  color: #fff;',
    '  background: rgba(255, 255, 255, 0.1);',
    '}',
    
    /* Panel body */
    '.fab-grab-panel-body {',
    '  padding: 16px 20px;',
    '  overflow-y: auto;',
    '  flex: 1;',
    '  cursor: grab;',
    '}',

    '.fab-grab-panel-body:active { cursor: grabbing; }',

    '.fab-grab-panel-body button, .fab-grab-panel-body input, .fab-grab-panel-body select, .fab-grab-panel-body textarea, .fab-grab-panel-body a, .fab-grab-panel-body label, .fab-grab-panel-body .fab-grab-assets-list, .fab-grab-panel-body .fab-grab-search input {',
    '  cursor: auto;',
    '}',
    
    '.fab-grab-panel-body::-webkit-scrollbar { width: 4px; }',
    '.fab-grab-panel-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }',
    '.fab-grab-panel-body::-webkit-scrollbar-track { background: transparent; }',
    
    /* ── Controls Section ─────────────────────────────────── */
    '.fab-grab-controls {',
    '  display: flex;',
    '  gap: 8px;',
    '  margin-bottom: 16px;',
    '  flex-wrap: wrap;',
    '}',
    
    '.fab-grab-btn {',
    '  padding: 8px 16px;',
    '  border: none;',
    '  border-radius: 10px;',
    '  font-size: 12px;',
    '  font-weight: 600;',
    '  cursor: pointer;',
    '  transition: all 0.2s;',
    '  color: #fff;',
    '  font-family: inherit;',
    '}',
    
    '.fab-grab-btn:active { transform: scale(0.96); }',
    
    '.fab-grab-btn-primary {',
    '  background: linear-gradient(135deg, #34c759, #30b350);',
    '  box-shadow: 0 2px 8px rgba(52, 199, 89, 0.3);',
    '}',
    
    '.fab-grab-btn-primary:hover { background: linear-gradient(135deg, #3ddc64, #34c759); }',
    
    '.fab-grab-btn-secondary {',
    '  background: rgba(255, 255, 255, 0.08);',
    '  border: 1px solid rgba(255, 255, 255, 0.1);',
    '}',
    
    '.fab-grab-btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }',
    
    '.fab-grab-btn-danger {',
    '  background: linear-gradient(135deg, #ff453a, #d63031);',
    '  box-shadow: 0 2px 8px rgba(255, 69, 58, 0.3);',
    '}',
    
    '.fab-grab-btn-danger:hover { background: linear-gradient(135deg, #ff6961, #ff453a); }',
    
    '.fab-grab-btn:disabled {',
    '  opacity: 0.4;',
    '  cursor: not-allowed;',
    '  transform: none !important;',
    '}',
    
    /* ── Config Section ───────────────────────────────────── */
    '.fab-grab-config {',
    '  background: rgba(255, 255, 255, 0.03);',
    '  border: 1px solid rgba(255, 255, 255, 0.06);',
    '  border-radius: 12px;',
    '  padding: 12px 16px;',
    '  margin-bottom: 16px;',
    '}',
    
    '.fab-grab-config-row {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  padding: 8px 0;',
    '}',
    
    '.fab-grab-config-row + .fab-grab-config-row {',
    '  border-top: 1px solid rgba(255, 255, 255, 0.04);',
    '}',
    
    '.fab-grab-config-label {',
    '  font-size: 12px;',
    '  color: rgba(255, 255, 255, 0.6);',
    '}',
    
    '.fab-grab-config-value {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 4px;',
    '}',
    
    '.fab-grab-select {',
    '  background: rgba(255, 255, 255, 0.06);',
    '  border: 1px solid rgba(255, 255, 255, 0.1);',
    '  border-radius: 8px;',
    '  color: #e0e0e0;',
    '  font-size: 12px;',
    '  padding: 4px 8px;',
    '  font-family: inherit;',
    '  cursor: pointer;',
    '  outline: none;',
    '}',
    
    '.fab-grab-select:focus { border-color: #34c759; }',
    '.fab-grab-select option { background: #1a1a2e; color: #e0e0e0; }',
    
    '.fab-grab-input {',
    '  background: rgba(255, 255, 255, 0.06);',
    '  border: 1px solid rgba(255, 255, 255, 0.1);',
    '  border-radius: 8px;',
    '  color: #e0e0e0;',
    '  font-size: 12px;',
    '  padding: 4px 8px;',
    '  width: 70px;',
    '  text-align: center;',
    '  font-family: inherit;',
    '  outline: none;',
    '}',
    
    '.fab-grab-input:focus { border-color: #34c759; }',
    
    /* ── Search ───────────────────────────────────────────── */
    '.fab-grab-search {',
    '  position: relative;',
    '  margin-bottom: 12px;',
    '}',
    
    '.fab-grab-search input {',
    '  width: 100%;',
    '  background: rgba(255, 255, 255, 0.04);',
    '  border: 1px solid rgba(255, 255, 255, 0.08);',
    '  border-radius: 10px;',
    '  color: #e0e0e0;',
    '  font-size: 12px;',
    '  padding: 8px 12px 8px 32px;',
    '  font-family: inherit;',
    '  outline: none;',
    '  transition: border-color 0.2s;',
    '}',
    
    '.fab-grab-search input:focus { border-color: rgba(52, 199, 89, 0.5); }',
    '.fab-grab-search input::placeholder { color: rgba(255, 255, 255, 0.3); }',
    
    '.fab-grab-search-icon {',
    '  position: absolute;',
    '  left: 10px;',
    '  top: 50%;',
    '  transform: translateY(-50%);',
    '  color: rgba(255, 255, 255, 0.3);',
    '  font-size: 13px;',
    '  pointer-events: none;',
    '}',
    
    /* ── Assets List ──────────────────────────────────────── */
    '.fab-grab-assets-header {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  margin-bottom: 8px;',
    '}',
    
    '.fab-grab-assets-title {',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  color: rgba(255, 255, 255, 0.8);',
    '}',
    
    '.fab-grab-assets-count {',
    '  font-size: 11px;',
    '  color: rgba(255, 255, 255, 0.4);',
    '}',
    
    '.fab-grab-assets-list {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 4px;',
    '  max-height: 200px;',
    '  overflow-y: auto;',
    '  margin-bottom: 16px;',
    '}',
    
    '.fab-grab-assets-list::-webkit-scrollbar { width: 3px; }',
    '.fab-grab-assets-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }',
    
    '.fab-grab-asset-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  padding: 8px 10px;',
    '  background: rgba(255, 255, 255, 0.03);',
    '  border: 1px solid rgba(255, 255, 255, 0.04);',
    '  border-radius: 8px;',
    '  transition: background 0.2s;',
    '}',
    
    '.fab-grab-asset-item:hover { background: rgba(255, 255, 255, 0.06); }',
    
    '.fab-grab-asset-status {',
    '  width: 6px;',
    '  height: 6px;',
    '  border-radius: 50%;',
    '  flex-shrink: 0;',
    '  background: rgba(255, 255, 255, 0.2);',
    '}',
    
    '.fab-grab-asset-status.claimed { background: #34c759; }',
    '.fab-grab-asset-status.failed { background: #ff453a; }',
    '.fab-grab-asset-status.pending { background: #ff9f0a; }',
    
    '.fab-grab-asset-name {',
    '  font-size: 12px;',
    '  color: rgba(255, 255, 255, 0.7);',
    '  flex: 1;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  white-space: nowrap;',
    '}',
    
    '.fab-grab-asset-license {',
    '  font-size: 10px;',
    '  color: rgba(255, 255, 255, 0.3);',
    '  background: rgba(255, 255, 255, 0.05);',
    '  padding: 2px 6px;',
    '  border-radius: 4px;',
    '  white-space: nowrap;',
    '}',
    
    '.fab-grab-empty {',
    '  text-align: center;',
    '  padding: 20px;',
    '  color: rgba(255, 255, 255, 0.3);',
    '  font-size: 12px;',
    '}',
    
    /* ── Tip Text ─────────────────────────────────────────── */
    '.fab-grab-tip {',
    '  text-align: center;',
    '  font-size: 11px;',
    '  color: rgba(255, 255, 255, 0.25);',
    '  margin-bottom: 12px;',
    '  font-style: italic;',
    '}',
    
    /* ── Social Links (footer) ──────────────────────────────── */
    '.fab-grab-footer-social {',
    '  display: flex;',
    '  gap: 6px;',
    '}',

    '.fab-grab-social-btn {',
    '  width: 28px;',
    '  height: 28px;',
    '  border-radius: 8px;',
    '  background: rgba(255, 255, 255, 0.08);',
    '  border: 1px solid rgba(255, 255, 255, 0.1);',
    '  color: rgba(255, 255, 255, 0.5);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: pointer;',
    '  transition: all 0.2s;',
    '  text-decoration: none;',
    '}',

    '.fab-grab-social-btn:hover {',
    '  background: rgba(255, 255, 255, 0.18);',
    '  color: #fff;',
    '  transform: scale(1.1);',
    '}',

    '.fab-grab-social-btn svg {',
    '  width: 14px;',
    '  height: 14px;',
    '  fill: currentColor;',
    '}',
    
    /* ── Drag Handle ──────────────────────────────────────── */
    '#fab-grab-drag-handle {',
    '  width: 20px;',
    '  height: 20px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  cursor: grab;',
    '  color: rgba(255, 255, 255, 0.3);',
    '  flex-shrink: 0;',
    '}',
    
    '#fab-grab-drag-handle:active { cursor: grabbing; }',
    
    '#fab-grab-drag-handle svg {',
    '  width: 12px;',
    '  height: 12px;',
    '  fill: currentColor;',
    '}',
    
    /* ── Panel Footer ─────────────────────────────────────── */
    '.fab-grab-panel-footer {',
    '  padding: 12px 20px;',
    '  border-top: 1px solid rgba(255, 255, 255, 0.06);',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  cursor: grab;',
    '}',

    '.fab-grab-panel-footer:active { cursor: grabbing; }',
    
    '.fab-grab-version {',
    '  font-size: 10px;',
    '  color: rgba(255, 255, 255, 0.2);',
    '}',
    
    '.fab-grab-dot-icon {',
    '  color: #34c759;',
    '}',

    /* ── Toggle Switch ─────────────────────────────────────── */
    '.fab-grab-toggle {',
    '  position: relative;',
    '  display: inline-block;',
    '  width: 36px;',
    '  height: 20px;',
    '  cursor: pointer;',
    '}',

    '.fab-grab-toggle input {',
    '  opacity: 0;',
    '  width: 0;',
    '  height: 0;',
    '}',

    '.fab-grab-toggle-slider {',
    '  position: absolute;',
    '  top: 0; left: 0; right: 0; bottom: 0;',
    '  background: rgba(255, 255, 255, 0.15);',
    '  border-radius: 20px;',
    '  transition: background 0.2s;',
    '}',

    '.fab-grab-toggle-slider:before {',
    '  content: "";',
    '  position: absolute;',
    '  height: 16px; width: 16px;',
    '  left: 2px; bottom: 2px;',
    '  background: #fff;',
    '  border-radius: 50%;',
    '  transition: transform 0.2s;',
    '}',

    '.fab-grab-toggle input:checked + .fab-grab-toggle-slider {',
    '  background: #34c759;',
    '}',

    '.fab-grab-toggle input:checked + .fab-grab-toggle-slider:before {',
    '  transform: translateX(16px);',
    '}'
  ].join('\n');

  function injectSvgFilter() {
    if (document.getElementById('fab-grab-filter')) return;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'fab-grab-filter';
    svg.style.cssText = 'position: absolute; width: 0; height: 0;';
    var filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'fab-glass-blur';
    var blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '0.5');
    filter.appendChild(blur);
    svg.appendChild(filter);
    document.body.appendChild(svg);
  }

  function injectStyles(shadowRoot) {
    if (shadowRoot) {
      try {
        var sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS_TEXT);
        shadowRoot.adoptedStyleSheets = [sheet];
      } catch (e) {
        var style = document.createElement('style');
        style.textContent = CSS_TEXT;
        shadowRoot.appendChild(style);
      }
    } else {
      if (document.getElementById('fab-grab-styles')) return;
      var style = document.createElement('style');
      style.id = 'fab-grab-styles';
      style.textContent = CSS_TEXT;
      document.head.appendChild(style);
    }

    injectSvgFilter();
  }

  ns.ui = ns.ui || {};
  ns.ui.styles = {
    inject: injectStyles,
    CSS_TEXT: CSS_TEXT
  };
})();
