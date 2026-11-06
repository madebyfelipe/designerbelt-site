/* Designer's Belt head mascot controller (vanilla, no dependencies).
   const head = DBHead.attach(svgEl);
   head.setState('idle' | 'dragging' | 'dropped');   head.lookAt(clientX, clientY);  head.center(); */
(function () {
  'use strict';
  var EYE_X = 200 / 400, EYE_Y = 257 / 400;          // between the eyes, in the 400x400 viewBox

  function attach(svg, opts) {
    opts = opts || {};
    var reachK = opts.reach || 1.6, idleMs = opts.idleReturnMs || 2500, DROP_MS = 800;
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var raf = 0, px = null, py = null, idleT = 0, dropT = 0, state = 'idle', onScreen = true;

    function reduced() { return mq.matches || svg.classList.contains('is-reduced'); }
    function setLook(x, y) { svg.style.setProperty('--look-x', x.toFixed(3)); svg.style.setProperty('--look-y', y.toFixed(3)); }
    function update() {
      raf = 0;
      if (px === null || reduced()) { setLook(0, 0); svg.classList.remove('is-looking'); return; }
      var r = svg.getBoundingClientRect();
      var dx = px - (r.left + r.width * EYE_X), dy = py - (r.top + r.height * EYE_Y);
      var d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / Math.max(220, r.width * reachK));
      setLook(dx / d * k, dy / d * k); svg.classList.add('is-looking');
    }
    function lookAt(x, y) {
      px = x; py = y; if (!raf) raf = requestAnimationFrame(update);
      clearTimeout(idleT); idleT = setTimeout(center, idleMs);
    }
    function center() { if (state === 'dragging') return; px = null; setLook(0, 0); svg.classList.remove('is-looking'); }

    if (opts.trackPointer !== false) {
      window.addEventListener('pointermove', function (e) { lookAt(e.clientX, e.clientY); }, { passive: true });
      document.addEventListener('pointerout', function (e) { if (!e.relatedTarget) center(); });
      window.addEventListener('blur', center);
    }
    function setState(s) {
      clearTimeout(dropT); svg.classList.remove('is-dragging', 'is-dropped'); state = s;
      if (s === 'dragging') svg.classList.add('is-dragging');
      if (s === 'dropped') {
        void svg.getBoundingClientRect(); svg.classList.add('is-dropped');
        dropT = setTimeout(function () { svg.classList.remove('is-dropped'); state = 'idle'; }, DROP_MS);
      }
    }
    function syncPause() { svg.classList.toggle('is-paused', !onScreen || document.hidden); }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; syncPause(); }).observe(svg);
    document.addEventListener('visibilitychange', syncPause);
    return { setState: setState, lookAt: lookAt, center: center, get state() { return state; } };
  }
  window.DBHead = { attach: attach };
})();
