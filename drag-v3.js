/* drag-v3: Library -> image editor demo. Vanilla, no dependencies.
   Autoplay (10.4 s loop, pure function of time) until the visitor touches it; then a real drag demo
   (Pointer Events: mouse + touch; Enter/Space on a card as the keyboard path).
   DBDragV3.attach(root, { onStage(s) { 'rest' | 'drag' | 'drop' }, onGhost(x, y), resumeAfterMs }) */
(function () {
  'use strict';
  var T = 10.4;
  var K = { in0: .2, c1a: .5, c1b: 1.1, p1: 1.15, l1: 1.3, m1a: 1.35, m1b: 2.55, d1: 2.6, h0: 2.9, h1: 3.4, hp: 3.45, s0: 3.5, s1: 4.2, hr: 4.25,
            k0: 4.4, k1: 4.9, kc: 4.95, c2a: 5.1, c2b: 5.8, p2: 5.85, l2: 5.95, m2a: 6.0, m2b: 7.0, d2: 7.05, a0: 7.2, a1: 7.8, out0: 9.3, r0: 9.4, r1: 9.9 };
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var u = function (t, a, b) { return clamp((t - a) / (b - a), 0, 1); };
  var eio = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var eo = function (x) { return 1 - Math.pow(1 - x, 3); };
  var lerp = function (a, b, x) { return a + (b - a) * x; };

  function attach(root, opts) {
    opts = opts || {};
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var $ = function (s) { return root.querySelector(s); };
    var section = root.closest('section') || root.parentNode;
    var canvas = $('[data-canvas]'), photoSlot = $('[data-photo-slot]'), photoImg = $('[data-photo]');
    var cursor = $('.dv3-cursor'), ghost = $('.dv3-ghost'), ghostArt = ghost.querySelector('.art'), commit = $('[data-commit]');
    var cards = {}, placedEl = {}, rows = {};
    // The file name comes from the card, so a client switch renames it everywhere.
    function label(kind) { var c = cards[kind] && cards[kind].querySelector('.lb-fn'); return c ? c.textContent : kind; }
    [].forEach.call(root.querySelectorAll('[data-asset]'), function (c) { cards[c.dataset.asset] = c; });
    [].forEach.call(root.querySelectorAll('[data-placed]'), function (p) { placedEl[p.dataset.placed] = p; });
    [].forEach.call(root.querySelectorAll('[data-layer]'), function (r) { rows[r.dataset.layer] = r; });
    var status = section.querySelector('[data-status]'), resetBtn = section.querySelector('[data-reset]'), wEl = $('[data-w]'), hEl = $('[data-h]');
    var REST = status ? status.textContent : '';

    // ---------- state -> DOM ----------
    var cur = { placed: {}, scale: 1, tf: null, sel: null, over: null, hover: null, picked: null, press: false, fade: 0 };
    function blank() { return { placed: { logo: false, photo: false, badge: false }, scale: 1, tf: null, sel: null, over: null, hover: null, picked: null, press: false, fade: 0 }; }
    function apply(s) {
      ['logo', 'photo', 'badge'].forEach(function (k) {
        var on = s.placed[k];
        if (on !== cur.placed[k]) {
          if (k === 'photo') { photoImg.classList.toggle('on', on); photoImg.classList.add('art-photo'); }
          else placedEl[k].classList.toggle('on', on);
          rows[k].classList.toggle('show', on);
          if (cards[k]) cards[k].classList.toggle('used', on);
        }
        rows[k].classList.toggle('sel', s.sel === k);
        if (k !== 'photo') placedEl[k].classList.toggle('tf-on', s.tf === k);
        if (cards[k]) { cards[k].classList.toggle('hover', s.hover === k); cards[k].classList.toggle('picked', s.picked === k); }
      });
      placedEl.logo.style.transform = 'scale(' + s.scale.toFixed(4) + ')';
      var op = (1 - s.fade).toFixed(3); placedEl.logo.style.opacity = placedEl.badge.style.opacity = photoImg.style.opacity = s.fade ? op : '';
      ['logo', 'photo', 'badge'].forEach(function (k) { rows[k].style.opacity = s.fade && s.placed[k] ? op : ''; });
      root.classList.toggle('is-tf', !!s.tf);
      root.classList.toggle('is-over', s.over === 'canvas');
      photoSlot.classList.toggle('is-over', s.over === 'photo');
      commit.classList.toggle('press', !!s.press);
      var pct = (s.scale * 100).toFixed(1) + '%'; wEl.textContent = pct; hEl.textContent = pct;
      cur = JSON.parse(JSON.stringify(s));
    }
    function rel(el) { var d = root.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height, cx: r.left - d.left + r.width / 2, cy: r.top - d.top + r.height / 2 }; }
    function inside(p, r) { return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h; }
    function showGhost(kind, x, y, tilt, sc) {
      ghost.className = 'dv3-ghost on' + (kind === 'photo' ? ' photo' : ''); ghostArt.className = 'art art-' + kind;
      ghost.style.transform = 'translate(' + (x - 38).toFixed(1) + 'px,' + (y - 38).toFixed(1) + 'px) rotate(' + (tilt || 0).toFixed(2) + 'deg) scale(' + (sc || 1).toFixed(3) + ')';
      if (opts.onGhost) { var d = root.getBoundingClientRect(); opts.onGhost(d.left + x, d.top + y); }
    }
    function hideGhost() { ghost.className = 'dv3-ghost'; }
    function placeCursor(x, y, a, pressed, drag) {
      cursor.style.opacity = a.toFixed(3);
      cursor.style.transform = 'translate(' + (x - 3).toFixed(1) + 'px,' + (y - 2).toFixed(1) + 'px) scale(' + (pressed ? .88 : 1) + ')';
      cursor.classList.toggle('drag', !!drag);
    }
    var lastStage = 'rest';
    function stage(s) { if (s !== lastStage) { lastStage = s; root.dataset.dv3Stage = s; if (opts.onStage) opts.onStage(s); } }

    // ---------- autoplay: everything is a function of t ----------
    function arc(a, b, s, lift) { var c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift }, m = 1 - s; return { x: m * m * a.x + 2 * m * s * c.x + s * s * b.x, y: m * m * a.y + 2 * m * s * c.y + s * s * b.y }; }
    function frame(now) {
      raf = 0; if (!running) return;
      var t = ((now - t0) / 1000) % T, s = blank();
      var g = { c1: rel(cards.logo.querySelector('.lb-th')), c2: rel(cards.photo.querySelector('.lb-th')), slot: rel(root.querySelector('[data-logo-slot]')), photo: rel(photoSlot), cv: rel(canvas) };
      var start = { x: g.c1.cx + 60, y: g.c1.cy + 150 };
      // logo
      if (t >= K.d1 && t < K.r1) { s.placed.logo = true; s.sel = 'logo'; }
      s.scale = t < K.s0 ? 1 : lerp(1, .72, eio(u(t, K.s0, K.s1)));
      if (t >= K.d1 && t < K.kc) s.tf = 'logo';
      s.press = t >= K.kc && t < K.kc + .14;
      // photo
      if (t >= K.d2 && t < K.r1) { s.placed.photo = true; s.sel = 'photo'; }
      s.fade = t >= K.r0 && t < K.r1 ? eio(u(t, K.r0, K.r1)) : 0;
      if (t >= K.r1) { s.scale = 1; }
      // cursor path
      var p, pressed = false, drag = false, a = Math.min(u(t, K.in0, K.in0 + .3), 1 - u(t, K.out0, K.out0 + .3));
      var slotC = { x: g.slot.cx, y: g.slot.cy }, photoC = { x: g.photo.cx, y: g.photo.cy };
      if (t < K.c1b) p = { x: lerp(start.x, g.c1.cx, eio(u(t, K.c1a, K.c1b))), y: lerp(start.y, g.c1.cy, eio(u(t, K.c1a, K.c1b))) };
      else if (t < K.m1a) p = { x: g.c1.cx, y: g.c1.cy };
      else if (t < K.d1) p = arc({ x: g.c1.cx, y: g.c1.cy }, slotC, eio(u(t, K.m1a, K.m1b)), 90);
      else if (t < K.h1) { var hd = rel(root.querySelector('[data-handle]')); p = { x: lerp(slotC.x, hd.cx, eio(u(t, K.h0, K.h1))), y: lerp(slotC.y, hd.cy, eio(u(t, K.h0, K.h1))) }; }
      else if (t < K.k0) { var h2 = rel(root.querySelector('[data-handle]')); p = { x: h2.cx, y: h2.cy }; }
      else if (t < K.c2a) {
        var from = { x: slotC.x + (g.slot.w * .72) / 2, y: slotC.y + (g.slot.h * .72) / 2 }; var cm = rel(commit);
        p = t < K.k1 ? { x: lerp(from.x, cm.cx, eio(u(t, K.k0, K.k1))), y: lerp(from.y, cm.cy, eio(u(t, K.k0, K.k1))) } : { x: cm.cx, y: cm.cy };
        if (!p.x) p = from;                                  // commit hidden on very small layouts
      }
      else if (t < K.c2b) { var cm2 = rel(commit); var f2 = cm2.w ? { x: cm2.cx, y: cm2.cy } : slotC; p = { x: lerp(f2.x, g.c2.cx, eio(u(t, K.c2a, K.c2b))), y: lerp(f2.y, g.c2.cy, eio(u(t, K.c2a, K.c2b))) }; }
      else if (t < K.m2a) p = { x: g.c2.cx, y: g.c2.cy };
      else if (t < K.d2) p = arc({ x: g.c2.cx, y: g.c2.cy }, photoC, eio(u(t, K.m2a, K.m2b)), 70);
      else p = { x: lerp(photoC.x, photoC.x + 50, eo(u(t, K.a0, K.a1))), y: lerp(photoC.y, photoC.y + 120, eo(u(t, K.a0, K.a1))) };
      if ((t >= K.p1 && t < K.d1) || (t >= K.hp && t < K.hr) || (t >= K.kc && t < K.kc + .14) || (t >= K.p2 && t < K.d2)) pressed = true;
      // hover / pick / ghost
      if (t >= K.c1b - .15 && t < K.l1) s.hover = 'logo';
      if (t >= K.c2b - .15 && t < K.l2) s.hover = 'photo';
      var carrying = null;
      if (t >= K.l1 && t < K.d1) carrying = 'logo'; else if (t >= K.l2 && t < K.d2) carrying = 'photo';
      if (carrying) {
        s.picked = carrying; drag = true;
        var ahead = carrying === 'logo' ? arc({ x: g.c1.cx, y: g.c1.cy }, slotC, eio(u(t + .02, K.m1a, K.m1b)), 90) : arc({ x: g.c2.cx, y: g.c2.cy }, photoC, eio(u(t + .02, K.m2a, K.m2b)), 70);
        var lift = eo(u(t, carrying === 'logo' ? K.l1 : K.l2, (carrying === 'logo' ? K.l1 : K.l2) + .16));
        showGhost(carrying, p.x, p.y, clamp((ahead.x - p.x) * .5, -9, 9), lerp(.85, 1.06, lift));
        if (carrying === 'logo' && inside(p, g.cv)) s.over = 'canvas';
        if (carrying === 'photo' && inside(p, g.photo)) s.over = 'photo';
        stage('drag');
      } else { hideGhost(); stage(t >= K.d1 && t < K.r1 ? 'drop' : 'rest'); }
      placeCursor(p.x, p.y, a, pressed, drag);
      apply(s);
      raf = requestAnimationFrame(frame);
    }

    // ---------- run / stop / takeover ----------
    var raf = 0, t0 = 0, running = false, inView = false, takenOver = false, resumeT = 0;
    function start() {
      if (running || mq.matches || takenOver || !inView || document.hidden) return;
      if (cur.placed.logo || cur.placed.photo || cur.placed.badge) return;   // the visitor's own composition stays
      running = true; root.classList.add('is-auto'); t0 = performance.now(); raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; root.classList.remove('is-auto'); placeCursor(0, 0, 0); hideGhost(); stage('rest'); }
    function resetAll() { apply(blank()); if (status) status.textContent = REST; if (resetBtn) resetBtn.hidden = true; }
    function takeover() {
      if (running) { stop(); resetAll(); }
      takenOver = true; clearTimeout(resumeT);
      if (opts.resumeAfterMs !== 0) resumeT = setTimeout(function again() { if (!dragging && !(cur.placed.logo || cur.placed.photo || cur.placed.badge)) { takenOver = false; start(); } else resumeT = setTimeout(again, opts.resumeAfterMs || 12000); }, opts.resumeAfterMs || 12000);
    }
    ['pointerdown', 'keydown', 'focusin', 'wheel'].forEach(function (ev) { root.addEventListener(ev, takeover, { passive: true, capture: true }); });
    if (resetBtn) resetBtn.addEventListener('click', function () { resetAll(); takeover(); });

    // ---------- the visitor's own drag ----------
    var dragging = null;
    function place(kind) {
      var s = JSON.parse(JSON.stringify(cur)); s.placed[kind] = true; s.sel = kind; s.over = null; s.picked = null; s.hover = null; s.fade = 0;
      if (kind !== 'photo') s.tf = kind;
      apply(s); stage('drop');
      if (kind !== 'photo') setTimeout(function () { if (cur.tf === kind) { var s2 = JSON.parse(JSON.stringify(cur)); s2.tf = null; apply(s2); } }, 900);
      if (status) status.textContent = label(kind) + ' placed on the canvas as a new layer.';
      if (resetBtn) resetBtn.hidden = false;
      setTimeout(function () { stage('rest'); }, 900);
    }
    Object.keys(cards).forEach(function (kind) {
      var c = cards[kind];
      c.addEventListener('pointerdown', function (e) {
        if (e.button && e.button !== 0) return;
        dragging = { kind: kind, x0: e.clientX, y0: e.clientY, moved: false }; e.preventDefault();
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
      });
      c.addEventListener('pointermove', function (e) {
        if (!dragging || dragging.kind !== kind) return;
        if (!dragging.moved && Math.hypot(e.clientX - dragging.x0, e.clientY - dragging.y0) < 5) return;
        if (!dragging.moved) { dragging.moved = true; var s = JSON.parse(JSON.stringify(cur)); s.picked = kind; apply(s); stage('drag'); if (status) status.textContent = 'Carrying ' + label(kind) + '. Let go over the canvas.'; }
        var d = root.getBoundingClientRect(), p = { x: e.clientX - d.left, y: e.clientY - d.top };
        showGhost(kind, p.x, p.y, 0, 1.04);
        var s2 = JSON.parse(JSON.stringify(cur)); s2.over = kind === 'photo' ? (inside(p, rel(photoSlot)) || inside(p, rel(canvas)) ? 'photo' : null) : (inside(p, rel(canvas)) ? 'canvas' : null); apply(s2);
      });
      function end(e, cancelled) {
        if (!dragging || dragging.kind !== kind) return;
        var was = dragging; dragging = null; hideGhost();
        var d = root.getBoundingClientRect(), p = { x: e.clientX - d.left, y: e.clientY - d.top }, hit = !cancelled && was.moved && inside(p, rel(canvas));
        var s = JSON.parse(JSON.stringify(cur)); s.picked = null; s.over = null; apply(s);
        if (hit) place(kind); else if (was.moved) { stage('rest'); if (status) status.textContent = 'Dropped outside the canvas. Try again.'; }
        else place(kind);                                    // a plain click/tap places it too
      }
      c.addEventListener('pointerup', function (e) { end(e, false); });
      c.addEventListener('pointercancel', function (e) { end(e, true); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(kind); } });
      c.addEventListener('click', function (e) { if (e.detail === 0) place(kind); });   // keyboard-generated click
    });

    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) start(); else if (running) { stop(); resetAll(); } }, { threshold: .35 }).observe(root);
    else { inView = true; start(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden && running) { stop(); resetAll(); } else start(); });
    if (mq.addEventListener) mq.addEventListener('change', function () { if (mq.matches && running) { stop(); resetAll(); } else start(); });
    apply(blank());
    return { get running() { return running; }, start: function () { takenOver = false; start(); }, stop: stop,
             reset: function () { stop(); resetAll(); takenOver = false; start(); } };
  }
  window.DBDragV3 = { attach: attach };
})();

