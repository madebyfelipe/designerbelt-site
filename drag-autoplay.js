/* Designer's Belt: autoplay for the drag demo (vanilla, no dependencies).
   A fake cursor grabs the Library asset and drops it into "Your design", on a 6.4 s loop.
   Works on the existing LP markup (.demo[data-stage], .asset-live, [data-target], .target-body,
   [data-hint], [data-result], .legend li[data-for]). It never writes to the aria-live status.
   The visitor takes over on the first pointerdown / keydown / focus inside the demo.

   const auto = DBDragAutoplay.attach(document.querySelector('.demo'), {
     onStage: s => head.setState(s === 'drag' ? 'dragging' : s === 'drop' ? 'dropped' : 'idle'),
     onGhost: (x, y) => head.lookAt(x, y),   // client coords of the carried file
     resumeAfterMs: 10000                     // 0 = never resume after the visitor took over
   });  */
(function () {
  'use strict';
  var T = 6.4;                                         // loop length (s)
  var K = { show: .25, go0: .45, go1: 1.2, press: 1.25, lift: 1.4, mv0: 1.45, mv1: 2.85, drop: 2.9, land: 3.2, away0: 3.25, away1: 3.9, out0: 5.35, out1: 5.8 };
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var u = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var eio = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var eo = function (x) { return 1 - Math.pow(1 - x, 3); };
  var lerp = function (a, b, x) { return a + (b - a) * x; };

  function attach(demo, opts) {
    opts = opts || {};
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var asset = demo.querySelector('.asset-live'), target = demo.querySelector('[data-target]');
    var body = demo.querySelector('.target-body') || target, hint = demo.querySelector('[data-hint]');
    var result = demo.querySelector('[data-result]'), legend = [].slice.call(demo.querySelectorAll('.legend li[data-for]'));
    if (!asset || !target) return { stop: function () {}, start: function () {} };

    var cursor = document.createElement('div'); cursor.className = 'dda-cursor'; cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2.5 L3 19.5 L7.4 15.4 L10.4 22 L13.6 20.6 L10.6 14.1 L16.6 14.1 Z" fill="#F3F2EF" stroke="#0B0C0C" stroke-width="1.4" stroke-linejoin="round"/></svg><span class="dda-badge">+</span>';
    var ghost = asset.cloneNode(true); ghost.className = 'asset dda-ghost'; ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('aria-describedby'); ghost.removeAttribute('data-asset'); ghost.tabIndex = -1;
    if (getComputedStyle(demo).position === 'static') demo.style.position = 'relative';
    demo.appendChild(ghost); demo.appendChild(cursor);

    var raf = 0, t0 = 0, running = false, inView = false, takenOver = false, resumeT = 0, lastStage = '', resultWasHidden = true;

    function rel(el) { var d = demo.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height, cx: r.left - d.left + r.width / 2, cy: r.top - d.top + r.height / 2 }; }
    function stage(s) {
      if (s === lastStage) return; lastStage = s;
      demo.dataset.stage = s;
      legend.forEach(function (li) { li.classList.toggle('active', li.getAttribute('data-for') === s); });
      asset.classList.toggle('dda-picked', s === 'drag');
      target.classList.toggle('over', false);
      if (result) { result.hidden = s !== 'drop'; result.classList.toggle('dda-pop', s === 'drop'); }
      if (hint) hint.hidden = s === 'drop';
      if (opts.onStage) opts.onStage(s);
    }
    // position of the carried file's centre at time t (demo coords) + whether the button is held
    function pose(t, g) {
      var start = { x: g.a.x + g.a.w * .55, y: g.a.y + g.a.h + 110 };
      var grab = { x: g.a.x + Math.min(70, g.a.w * .3), y: g.a.cy + 4 };
      var drop = { x: g.b.cx, y: g.b.cy };
      var p;
      if (t < K.go1) { var k = eio(u(t, K.go0, K.go1)); p = { x: lerp(start.x, grab.x, k), y: lerp(start.y, grab.y, k) }; }
      else if (t < K.mv0) p = grab;
      else if (t < K.mv1) {                              // arc toward the canvas
        var s = eio(u(t, K.mv0, K.mv1)), c = { x: (grab.x + drop.x) / 2, y: Math.min(grab.y, drop.y) - 70 }, m = 1 - s;
        p = { x: m * m * grab.x + 2 * m * s * c.x + s * s * drop.x, y: m * m * grab.y + 2 * m * s * c.y + s * s * drop.y };
      } else { var a = eo(u(t, K.away0, K.away1)); p = { x: lerp(drop.x, drop.x + 86, a), y: lerp(drop.y, drop.y - 58, a) }; }   // moves up-right, away from the drop button
      return { p: p, grab: grab, drop: drop };
    }
    function frame(now) {
      raf = 0; if (!running) return;
      var t = ((now - t0) / 1000) % T, g = { a: rel(asset), b: rel(body) };
      var P = pose(t, g), held = t >= K.press && t < K.drop;
      // cursor
      var cA = Math.min(u(t, K.show - .2, K.show + .1), 1 - u(t, K.out0, K.out1));
      var press = t >= K.press && t < K.drop ? 1 : 0;
      cursor.style.opacity = cA.toFixed(3);
      cursor.style.transform = 'translate(' + (P.p.x - 3).toFixed(1) + 'px,' + (P.p.y - 2).toFixed(1) + 'px) scale(' + (press ? .88 : 1) + ')';
      cursor.classList.toggle('dda-dragging', t >= K.lift && t < K.drop);
      // ghost: follows the grab point while held, then flies into the canvas and fades
      ghost.classList.add('dda-measure'); var gw = ghost.offsetWidth, gh = ghost.offsetHeight; ghost.classList.remove('dda-measure');
      var off = { x: 26, y: gh / 2 };                   // the cursor holds the compact card by its thumbnail
      if (t >= K.lift && t < K.land) {
        var lift = eo(u(t, K.lift, K.lift + .16)), gx, gy, sc, op = 1;
        if (t < K.drop) {
          var P2 = pose(Math.min(t + .016, K.mv1), g), vx = (P2.p.x - P.p.x) / .016;
          gx = P.p.x - off.x; gy = P.p.y - off.y; sc = lerp(1, 1.04, lift);
          ghost.style.setProperty('--tilt', clamp(vx * .006, -7, 7).toFixed(2) + 'deg');
        } else {
          var d = eio(u(t, K.drop, K.land)); gx = lerp(P.drop.x - off.x, P.drop.x - gw / 2, d); gy = lerp(P.drop.y - off.y, P.drop.y - gh / 2, d);
          sc = lerp(1.04, .55, d); op = 1 - d; ghost.style.setProperty('--tilt', '0deg');
        }
        ghost.style.opacity = op.toFixed(3);
        ghost.style.transform = 'translate(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px) rotate(var(--tilt)) scale(' + sc.toFixed(4) + ')';
        ghost.classList.add('dda-on');
        if (opts.onGhost) { var dr = demo.getBoundingClientRect(); opts.onGhost(dr.left + gx + gw / 2, dr.top + gy + gh / 2); }
      } else ghost.classList.remove('dda-on');
      // stage + hover state on the canvas
      stage(t < K.lift || t >= K.out1 ? 'rest' : t < K.drop ? 'drag' : 'drop');
      if (lastStage === 'drag') { var b = g.b, cx = P.p.x - off.x + gw / 2, cy = P.p.y - off.y + gh / 2; target.classList.toggle('over', cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h); }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || mq.matches || takenOver || !inView || document.hidden) return;
      if (result) resultWasHidden = result.hidden;
      if (!resultWasHidden) return;                     // the visitor's own drop is on screen: leave it
      running = true; demo.classList.add('is-auto'); t0 = performance.now(); lastStage = ''; raf = requestAnimationFrame(frame);
    }
    function stop(clean) {
      running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      demo.classList.remove('is-auto'); cursor.style.opacity = 0; ghost.classList.remove('dda-on');
      if (clean !== false) { lastStage = ''; stage('rest'); if (result) result.classList.remove('dda-pop'); }
    }
    function takeover() {
      if (takenOver && !running) { schedule(); return; }
      takenOver = true; if (running) stop(true); schedule();
    }
    function schedule() {
      clearTimeout(resumeT);
      if (opts.resumeAfterMs === 0) return;
      resumeT = setTimeout(function () { if (demo.dataset.stage === 'rest') { takenOver = false; start(); } else schedule(); }, opts.resumeAfterMs || 10000);
    }
    ['pointerdown', 'keydown', 'focusin', 'touchstart'].forEach(function (ev) { demo.addEventListener(ev, takeover, { passive: true, capture: true }); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) start(); else stop(true); }, { threshold: .35 }).observe(demo);
    else { inView = true; start(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(true); else start(); });
    if (mq.addEventListener) mq.addEventListener('change', function () { if (mq.matches) stop(true); else start(); });
    return { start: function () { takenOver = false; start(); }, stop: stop, get running() { return running; } };
  }
  window.DBDragAutoplay = { attach: attach };
})();
