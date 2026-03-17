/* ═══════════════════════════════════════════════════════════════════════════
   SnowCrash Labs — Shared JS (loaded on every page)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Mobile-friendly dropdown toggle (click/tap) ── */
(function() {
  var dropdowns = document.querySelectorAll('.nav-dropdown');
  dropdowns.forEach(function(dd) {
    var trigger = dd.querySelector('.nav-dropdown-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Close any other open dropdowns
      dropdowns.forEach(function(other) {
        if (other !== dd) other.classList.remove('open');
      });
      dd.classList.toggle('open');
    });
  });

  // Close dropdown when tapping outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.nav-dropdown')) {
      dropdowns.forEach(function(dd) { dd.classList.remove('open'); });
    }
  });

  // Close dropdown when a menu link is clicked
  document.querySelectorAll('.nav-dropdown-menu a').forEach(function(link) {
    link.addEventListener('click', function() {
      dropdowns.forEach(function(dd) { dd.classList.remove('open'); });
    });
  });
})();
