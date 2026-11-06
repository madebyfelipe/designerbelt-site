/* Designer's Belt — home behaviour. Vanilla, no dependencies, no network.
   Three things only: the mascot follows the cursor and reacts to the drag demo, the demo itself
   (pointer events for mouse and touch, plus a keyboard path), and the client library switch.
   Without this file the page stays readable: the mascot sits in its idle pose and the library shows
   the first client. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------------------------------------------------------------- mascot
  function attachMascot(svg) {
    if (!svg) return { setState: function () {}, center: function () {} };
    var EYE_X = 300 / 600, EYE_Y = 277 / 660;      // eye midpoint in the 600x660 viewBox
    var reach = 1.4, idleMs = 2500, DROP_MS = 900;
    var raf = 0, px = null, py = null, idleT = 0, dropT = 0, state = 'idle', onScreen = true;

    function setLook(x, y) {
      svg.style.setProperty('--look-x', x.toFixed(3));
      svg.style.setProperty('--look-y', y.toFixed(3));
    }
    function update() {
      raf = 0;
      if (px === null || reducedMotion.matches) { setLook(0, 0); return; }
      var r = svg.getBoundingClientRect();
      var dx = px - (r.left + r.width * EYE_X), dy = py - (r.top + r.height * EYE_Y);
      var d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / Math.max(240, r.width * reach));
      setLook(dx / d * k, dy / d * k);
    }
    function lookAt(x, y) {
      px = x; py = y;
      if (!raf) raf = requestAnimationFrame(update);
      clearTimeout(idleT); idleT = setTimeout(center, idleMs);
    }
    function center() { if (state === 'dragging') return; px = null; setLook(0, 0); }

    window.addEventListener('pointermove', function (e) { lookAt(e.clientX, e.clientY); }, { passive: true });
    document.addEventListener('pointerout', function (e) { if (!e.relatedTarget) center(); });
    window.addEventListener('blur', center);

    function setState(next) {
      clearTimeout(dropT);
      svg.classList.remove('is-dragging', 'is-dropped');
      state = next;
      if (next === 'dragging') svg.classList.add('is-dragging');
      if (next === 'dropped') {
        void svg.getBoundingClientRect();             // restart the one-shot animation on a repeat drop
        svg.classList.add('is-dropped');
        dropT = setTimeout(function () { svg.classList.remove('is-dropped'); state = 'idle'; }, DROP_MS);
      }
    }
    function syncPause() { svg.classList.toggle('is-paused', !onScreen || document.hidden); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { onScreen = entries[0].isIntersecting; syncPause(); }).observe(svg);
    }
    document.addEventListener('visibilitychange', syncPause);
    return { setState: setState, lookAt: lookAt, center: center };
  }

  var mascot = attachMascot(document.querySelector('.hero-mascot .db-mascot'));

  // ---------------------------------------------------------------- drag demo
  var demo = document.querySelector('[data-stage]');
  if (demo) {
    var target = demo.querySelector('[data-target]');
    var result = demo.querySelector('[data-result]');
    var hint = demo.querySelector('[data-hint]');
    var status = demo.querySelector('[data-status]');
    var reset = demo.querySelector('[data-reset]');
    var addButton = demo.querySelector('[data-add]');
    var live = demo.querySelector('[data-asset]');
    var restStatus = status ? status.textContent : '';
    var dragging = false, moved = false, ghost = null, startX = 0, startY = 0, pointerId = null;

    function stage(name, message) {
      demo.dataset.stage = name;
      Array.prototype.forEach.call(demo.querySelectorAll('.legend li'), function (li) {
        li.classList.toggle('active', li.getAttribute('data-for') === name);
      });
      if (status && message) status.textContent = message;
    }

    function dropped() {
      if (result) result.hidden = false;
      if (hint) hint.hidden = true;
      if (reset) reset.hidden = false;
      if (live) live.setAttribute('aria-grabbed', 'false');
      ghost = null;
      mascot.setState('dropped');
      stage('drop', 'Dropped in your design. The belt keeps up.');
    }

    function addWithoutDrag() {
      if (result && !result.hidden) return;
      mascot.setState('dragging');
      setTimeout(function () { dropped(); }, 180);
    }

    function resetDemo() {
      if (result) result.hidden = true;
      if (hint) hint.hidden = false;
      if (reset) reset.hidden = true;
      if (live) live.removeAttribute('aria-grabbed');
      mascot.setState('idle');
      stage('rest', restStatus);
    }

    function overTarget(x, y) {
      if (!target) return false;
      var r = target.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    function moveGhost(x, y) {
      if (!ghost) return;
      ghost.style.left = x + 'px';
      ghost.style.top = y + 'px';
      target.classList.toggle('over', overTarget(x, y));
    }

    function endDrag(x, y, cancelled) {
      if (!dragging) return;
      dragging = false;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      target.classList.remove('over');
      if (live && pointerId !== null && live.hasPointerCapture && live.hasPointerCapture(pointerId)) {
        try { live.releasePointerCapture(pointerId); } catch (e) { /* already released */ }
      }
      pointerId = null;
      if (!cancelled && overTarget(x, y)) dropped();
      else { mascot.setState('idle'); stage('rest', restStatus); }
    }

    if (live) {
      live.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (result && !result.hidden) { resetDemo(); }
        dragging = true; moved = false; startX = e.clientX; startY = e.clientY;
        pointerId = e.pointerId;
        try { live.setPointerCapture(pointerId); } catch (err) { /* capture is a nicety */ }
        live.setAttribute('aria-grabbed', 'true');
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = '<span class="asset-thumb thumb-light" aria-hidden="true"></span><span>logo-primary.png</span>';
        document.body.appendChild(ghost);
        moveGhost(e.clientX, e.clientY);
        mascot.setState('dragging');
        stage('drag', 'Carrying the file. Let go inside “Your design”.');
        e.preventDefault();
      });

      live.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 4) moved = true;
        if (moved) moveGhost(e.clientX, e.clientY);
      });

      live.addEventListener('pointerup', function (e) { endDrag(e.clientX, e.clientY, false); });
      live.addEventListener('pointercancel', function () { endDrag(0, 0, true); });
      live.addEventListener('lostpointercapture', function (e) {
        if (dragging) endDrag(e.clientX, e.clientY, false);
      });

      // Click without a drag (keyboard Enter/Space, or a plain click) does the same thing as a drop.
      live.addEventListener('click', function () {
        if (moved) { moved = false; return; }
        addWithoutDrag();
      });
      live.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); addWithoutDrag(); }
        if (e.key === 'Escape' && dragging) { dragging = false; endDrag(0, 0, true); }
      });
    }

    if (addButton) addButton.addEventListener('click', addWithoutDrag);
    if (reset) reset.addEventListener('click', resetDemo);

    // A demonstration cursor performs the gesture on its own, so the section is busy
    // before anyone touches it. The first real interaction stops it for good.
    var cursor = demo.querySelector('[data-cursor]');
    var autoToken = 0, autoStopped = false;
    var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };

    function pointIn(el) {
      var box = demo.getBoundingClientRect(), rect = el.getBoundingClientRect();
      return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 };
    }
    function placeCursor(x, y, instant) {
      if (!cursor) return;
      cursor.style.transition = instant ? 'opacity .18s linear' : '';
      cursor.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    }
    function stopAuto() {
      if (autoStopped) return;
      autoStopped = true;
      autoToken++;
      if (cursor) cursor.classList.remove('is-live');
      if (live) live.classList.remove('is-grabbed');
    }
    function scheduleAuto(ms) {
      if (autoStopped) return;
      setTimeout(runAuto, ms);
    }
    function onScreen() {
      var rect = demo.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.9 && rect.bottom > window.innerHeight * 0.1;
    }

    async function runAuto() {
      if (autoStopped) return;
      if (reducedMotion.matches || document.hidden || !onScreen() || !cursor || !live || !target) {
        scheduleAuto(2600);
        return;
      }
      var token = ++autoToken;
      try {
        var from = pointIn(live), to = pointIn(target);
        placeCursor(from.x + 52, from.y + 38, true);
        cursor.classList.add('is-live');
        await wait(520); if (token !== autoToken) return;
        live.classList.add('is-grabbed');
        mascot.setState('dragging');
        stage('drag', 'Carrying the file to the canvas.');
        placeCursor(from.x - 2, from.y - 3);
        await wait(380); if (token !== autoToken) return;
        placeCursor(to.x - 6, to.y - 4);
        await wait(1150); if (token !== autoToken) return;
        live.classList.remove('is-grabbed');
        dropped();
        await wait(1750); if (token !== autoToken) return;
        cursor.classList.remove('is-live');
        resetDemo();
      } catch (error) {
        if (cursor) cursor.classList.remove('is-live');
        if (live) live.classList.remove('is-grabbed');
      }
      scheduleAuto(1600);
    }

    // Any real interaction wins over the demonstration.
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (type) {
      demo.addEventListener(type, stopAuto, { passive: true });
    });
    scheduleAuto(700);
  }

  // ---------------------------------------------------------------- client library
  var clients = {
    acme: { name: 'Acme Demo', initials: 'AD', color: '#2D8CFF',
      colors: ['#2D8CFF', '#0B1F3A', '#F5F3EF', '#FFC400', '#F26D6D'],
      fonts: [['Sora', 'Bold'], ['Inter', 'Regular']],
      pngs: [['logo-primary.png', '#E8E5DE'], ['symbol.png', '#2D8CFF'], ['badge.png', '#FFC400'], ['pattern.png', '#4A4A4A']] },
    lorem: { name: 'Lorem Coffee', initials: 'LC', color: '#3DD68C',
      colors: ['#3DD68C', '#123528', '#EFE7DA', '#B9793F', '#F2B880'],
      fonts: [['Fraunces', 'Bold'], ['Karla', 'Regular']],
      pngs: [['bag-front.png', '#EFE7DA'], ['bean-mark.png', '#3DD68C'], ['stamp.png', '#B9793F'], ['paper.png', '#E4D9C6']] },
    example: { name: 'Example Bank', initials: 'EB', color: '#8B5CF6',
      colors: ['#8B5CF6', '#1B1240', '#F3F1FB', '#22C55E', '#EF4444'],
      fonts: [['Manrope', 'Bold'], ['IBM Plex Sans', 'Regular']],
      pngs: [['card-front.png', '#F3F1FB'], ['shield.png', '#8B5CF6'], ['chart.png', '#22C55E'], ['lockup.png', '#1B1240']] },
    sample: { name: 'Sample Studio', initials: 'SS', color: '#F472B6',
      colors: ['#F472B6', '#2A1220', '#F7F3F5', '#FBBF24', '#38BDF8'],
      fonts: [['Playfair Display', 'Bold'], ['Work Sans', 'Regular']],
      pngs: [['monogram.png', '#F7F3F5'], ['grid.png', '#F472B6'], ['tag.png', '#FBBF24'], ['cover.png', '#38BDF8']] }
  };

  var clientsRoot = document.querySelector('[data-clients]');
  if (clientsRoot) {
    var title = clientsRoot.querySelector('[data-title]');
    var badge = clientsRoot.querySelector('[data-badge]');
    var swatches = clientsRoot.querySelector('[data-swatches]');
    var fonts = clientsRoot.querySelector('[data-fonts]');
    var pngs = clientsRoot.querySelector('[data-pngs]');
    var buttons = Array.prototype.slice.call(clientsRoot.querySelectorAll('[data-client]'));

    function render(id) {
      var data = clients[id];
      if (!data) return;
      if (title) title.textContent = data.name;
      if (badge) { badge.textContent = data.initials; badge.style.setProperty('--who', data.color); }
      if (swatches) {
        swatches.innerHTML = '';
        data.colors.forEach(function (hex) {
          var span = document.createElement('span');
          span.className = 'swatch';
          span.style.setProperty('--c', hex);
          span.title = hex;
          swatches.appendChild(span);
        });
      }
      if (fonts) {
        fonts.innerHTML = '';
        data.fonts.forEach(function (pair) {
          var p = document.createElement('p');
          p.className = 'font-row';
          p.innerHTML = '<span class="font-aa">Aa</span><span class="font-name"></span><span class="font-style"></span>';
          p.querySelector('.font-name').textContent = pair[0];
          p.querySelector('.font-style').textContent = pair[1];
          fonts.appendChild(p);
        });
      }
      if (pngs) {
        pngs.innerHTML = '';
        data.pngs.forEach(function (pair) {
          var fig = document.createElement('figure');
          fig.className = 'png';
          var thumb = document.createElement('span');
          thumb.className = 'png-thumb';
          thumb.style.setProperty('--c', pair[1]);
          var cap = document.createElement('figcaption');
          cap.textContent = pair[0];
          fig.appendChild(thumb); fig.appendChild(cap);
          pngs.appendChild(fig);
        });
      }
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-client') === id)); });
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () { render(b.getAttribute('data-client')); });
    });
  }

  // ---------------------------------------------------------------- library tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-group]'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var wanted = tab.getAttribute('data-filter');
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      groups.forEach(function (g) { g.hidden = wanted !== 'all' && g.getAttribute('data-group') !== wanted; });
    });
  });
})();
