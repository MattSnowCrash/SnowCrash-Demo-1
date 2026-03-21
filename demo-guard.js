/* ═══════════════════════════════════════════════════════════════
   SnowCrash Labs — Demo Guard
   Lightweight deterrent for casual downloading/copying.
   Only included on the demo branch, never on main.
   ═══════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── Disable right-click context menu ──
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });

  // ── Disable common save/copy shortcuts ──
  document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + S (save)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
    }
    // Ctrl/Cmd + U (view source)
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
    }
    // Ctrl/Cmd + Shift + I (dev tools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
    }
    // Ctrl/Cmd + Shift + J (console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') {
      e.preventDefault();
    }
    // F12 (dev tools)
    if (e.key === 'F12') {
      e.preventDefault();
    }
    // Ctrl/Cmd + Shift + C (inspect element)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
    }
  });

  // ── Disable text selection on body (keeps inputs selectable) ──
  document.body.style.userSelect = 'none';
  document.body.style.webkitUserSelect = 'none';

  // ── Disable drag on images and links ──
  document.addEventListener('dragstart', function(e) {
    e.preventDefault();
  });

  // ── Inject confidential banner ──
  var banner = document.createElement('div');
  banner.className = 'confidential-banner';
  banner.innerHTML =
    '<span class="conf-dot"></span>' +
    'Confidential — SnowCrash Labs Demo Preview' +
    '<span style="color:var(--text-3);margin-left:4px">— Not for distribution</span>';
  document.body.appendChild(banner);

  // ── Add bottom padding so banner doesn't cover content ──
  var mainEl = document.querySelector('.page-wrap') || document.querySelector('.shell-main');
  if (mainEl) {
    mainEl.style.paddingBottom = '60px';
  }
})();
