/* Designer's Belt — home behaviour. Vanilla, no dependencies, no network.
   The head mascot and the drag autoplay come from the motion package
   (/mascot-head.js and /drag-autoplay.js); this file wires them to the page and
   keeps the demo usable without the autoplay: pointer drag for mouse and touch,
   Enter on the file for the keyboard.
   Without this file the page still reads: the head sits in its idle pose, the
   Library shows the first client and the editor shows its base layers. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  // Four fictional clients. The Library window and the clients section both read this.
  var clients = {
    acme: { name: 'Acme Demo', initials: 'AD', color: '#2D8CFF', count: 24,
      colors: ['#2D8CFF', '#0B1F3A', '#F5F3EF', '#FFC400', '#F26D6D'],
      fonts: [['Sora', 'Bold'], ['Inter', 'Regular']],
      assets: [['logo-primary.png', '#0B0C0C'], ['symbol.png', '#2D8CFF'], ['badge.png', '#FFC400'], ['pattern.png', '#4A4A4A']] },
    lorem: { name: 'Lorem Coffee', initials: 'LC', color: '#3DD68C', count: 18,
      colors: ['#3DD68C', '#123528', '#EFE7DA', '#B9793F', '#F2B880'],
      fonts: [['Fraunces', 'Bold'], ['Karla', 'Regular']],
      assets: [['bag-front.png', '#EFE7DA'], ['bean-mark.png', '#3DD68C'], ['stamp.png', '#B9793F'], ['paper.png', '#E4D9C6']] },
    example: { name: 'Example Bank', initials: 'EB', color: '#8B5CF6', count: 31,
      colors: ['#8B5CF6', '#1B1240', '#F3F1FB', '#22C55E', '#EF4444'],
      fonts: [['Manrope', 'Bold'], ['IBM Plex Sans', 'Regular']],
      assets: [['card-front.png', '#F3F1FB'], ['shield.png', '#8B5CF6'], ['chart.png', '#22C55E'], ['lockup.png', '#1B1240']] },
    sample: { name: 'Sample Studio', initials: 'SS', color: '#F472B6', count: 12,
      colors: ['#F472B6', '#2A1220', '#F7F3F5', '#FBBF24', '#38BDF8'],
      fonts: [['Playfair Display', 'Bold'], ['Work Sans', 'Regular']],
      assets: [['monogram.png', '#F7F3F5'], ['grid.png', '#F472B6'], ['tag.png', '#FBBF24'], ['cover.png', '#38BDF8']] }
  };

  var headSvg = document.querySelector('.hero-mascot .db-head');
  var head = window.DBHead ? window.DBHead.attach(headSvg) : { setState: function () {}, lookAt: function () {}, center: function () {} };

  /* ------------------------------------------------------------------ clients section */
  var section = document.querySelector('[data-clients]');
  var sectionTitle = section && section.querySelector('[data-title]');
  var sectionBadge = section && section.querySelector('[data-badge]');
  var sectionSwatches = section && section.querySelector('[data-swatches]');
  var sectionFonts = section && section.querySelector('[data-fonts]');
  var sectionPngs = section && section.querySelector('[data-pngs]');
  var sectionButtons = section ? [].slice.call(section.querySelectorAll('[data-client]')) : [];

  function paintSection(id) {
    var data = clients[id];
    if (!section || !data) return;
    if (sectionTitle) sectionTitle.textContent = data.name;
    if (sectionBadge) { sectionBadge.textContent = data.initials; sectionBadge.style.setProperty('--who', data.color); }
    if (sectionSwatches) {
      sectionSwatches.textContent = '';
      data.colors.forEach(function (hex) {
        var span = document.createElement('span');
        span.className = 'swatch';
        span.style.setProperty('--c', hex);
        span.title = hex;
        sectionSwatches.appendChild(span);
      });
    }
    if (sectionFonts) {
      sectionFonts.textContent = '';
      data.fonts.forEach(function (pair) {
        var p = document.createElement('p'); p.className = 'font-row';
        var aa = document.createElement('span'); aa.className = 'font-aa'; aa.textContent = 'Aa';
        var name = document.createElement('span'); name.className = 'font-name'; name.textContent = pair[0];
        var style = document.createElement('span'); style.className = 'font-style'; style.textContent = pair[1];
        p.appendChild(aa); p.appendChild(name); p.appendChild(style);
        sectionFonts.appendChild(p);
      });
    }
    if (sectionPngs) {
      sectionPngs.textContent = '';
      data.assets.forEach(function (pair) {
        var fig = document.createElement('figure'); fig.className = 'png';
        var thumb = document.createElement('span'); thumb.className = 'png-thumb'; thumb.style.setProperty('--c', pair[1]);
        var cap = document.createElement('figcaption'); cap.textContent = pair[0];
        fig.appendChild(thumb); fig.appendChild(cap);
        sectionPngs.appendChild(fig);
      });
    }
    sectionButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-client') === id)); });
  }

  /* ------------------------------------------------------------------ Library window */
  var demo = document.querySelector('[data-stage]');
  var libTitle = demo && demo.querySelector('[data-lib-title]');
  var libCount = demo && demo.querySelector('[data-lib-count]');
  var libGrid = demo && demo.querySelector('[data-lib-grid]');
  var libColors = demo && demo.querySelector('[data-lib-colors]');
  var libFonts = demo && demo.querySelector('[data-lib-fonts]');
  var libPanes = demo ? [].slice.call(demo.querySelectorAll('[data-lib-pane]')) : [];
  var libAvatars = demo ? [].slice.call(demo.querySelectorAll('[data-lib-client]')) : [];
  var libTabs = demo ? [].slice.call(demo.querySelectorAll('[data-lib-filter]')) : [];
  var live = demo && demo.querySelector('[data-asset]');

  function paintLibrary(id, animate) {
    var data = clients[id];
    if (!demo || !data) return;
    if (libTitle) libTitle.textContent = data.name;
    if (libCount) libCount.textContent = data.count + ' assets';
    libAvatars.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lib-client') === id)); });

    var write = function () {
      if (live) {
        var thumb = live.querySelector('.asset-thumb');
        var name = live.querySelector('.asset-name');
        if (thumb) thumb.style.setProperty('--thumb', data.assets[0][1]);
        if (name) name.textContent = data.assets[0][0];
      }
      if (libGrid) {
        var tiles = [].slice.call(libGrid.querySelectorAll('.asset'));
        for (var i = 1; i < tiles.length && i < data.assets.length; i++) {
          var t = tiles[i].querySelector('.asset-thumb');
          var n = tiles[i].querySelector('.asset-name');
          if (t) t.style.setProperty('--thumb', data.assets[i][1]);
          if (n) n.textContent = data.assets[i][0];
        }
        libGrid.classList.remove('is-swapping');
      }
      if (libColors) {
        libColors.textContent = '';
        data.colors.forEach(function (hex) {
          var chip = document.createElement('span');
          chip.className = 'lib-chip';
          chip.style.setProperty('--c', hex);
          libColors.appendChild(chip);
        });
      }
      if (libFonts) {
        libFonts.textContent = '';
        data.fonts.forEach(function (pair) {
          var row = document.createElement('p');
          row.className = 'lib-font';
          var name = document.createElement('span'); name.textContent = pair[0];
          var style = document.createElement('em'); style.textContent = pair[1];
          row.appendChild(name); row.appendChild(style);
          libFonts.appendChild(row);
        });
      }
    };

    if (!animate || !libGrid) { write(); return; }
    libGrid.classList.add('is-swapping');
    setTimeout(write, 170);
  }

  function chooseClient(id) {
    paintSection(id);
    paintLibrary(id, true);
  }

  sectionButtons.forEach(function (b) { b.addEventListener('click', function () { chooseClient(b.getAttribute('data-client')); }); });
  libAvatars.forEach(function (b) { b.addEventListener('click', function () { chooseClient(b.getAttribute('data-lib-client')); }); });

  libTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var wanted = tab.getAttribute('data-lib-filter');
      libTabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      libPanes.forEach(function (pane) {
        var name = pane.getAttribute('data-lib-pane');
        pane.hidden = !(name === 'assets' ? (wanted === 'all' || wanted === 'png') : name === wanted);
      });
    });
  });

  [].slice.call(document.querySelectorAll('[data-filter]')).forEach(function (tab) {
    tab.addEventListener('click', function () {
      var wanted = tab.getAttribute('data-filter');
      [].slice.call(document.querySelectorAll('[data-filter]')).forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      [].slice.call(document.querySelectorAll('[data-group]')).forEach(function (g) { g.hidden = wanted !== 'all' && g.getAttribute('data-group') !== wanted; });
    });
  });

  /* ------------------------------------------------------------------ the drag demo */
  if (!demo) return;

  var target = demo.querySelector('[data-target]');
  var result = demo.querySelector('[data-result]');
  var status = demo.querySelector('[data-status]');
  var reset = demo.querySelector('[data-reset]');
  var addButton = demo.querySelector('[data-add]');
  var restStatus = status ? status.textContent : '';
  var dragging = false, moved = false, ghost = null, startX = 0, startY = 0, pointerId = null;

  function stage(name, message) {
    demo.dataset.stage = name;
    [].slice.call(demo.querySelectorAll('.legend li')).forEach(function (li) {
      li.classList.toggle('active', li.getAttribute('data-for') === name);
    });
    if (result) result.hidden = name !== 'drop';
    if (status && message) status.textContent = message;
  }

  // After a real drop the result is the visitor's, so it stays until "Start over":
  // the guard re-asserts it if the autoplay's own bookkeeping touches the same attributes.
  var manual = false;
  function dropped() {
    manual = true;
    if (reset) reset.hidden = false;
    if (live) live.setAttribute('aria-grabbed', 'false');
    if (result) { result.hidden = false; result.classList.add('dda-pop'); }
    ghost = null;
    head.setState('dropped');
    stage('drop', 'Dropped. It lands as a new layer, selected in the editor.');
  }

  function holdManualDrop() {
    if (!manual) return;
    if (demo.dataset.stage !== 'drop') demo.dataset.stage = 'drop';
    if (result) result.hidden = false;
    [].slice.call(demo.querySelectorAll('.legend li')).forEach(function (li) {
      li.classList.toggle('active', li.getAttribute('data-for') === 'drop');
    });
  }

  if ('MutationObserver' in window) {
    var guard = new MutationObserver(holdManualDrop);
    guard.observe(demo, { attributes: true, attributeFilter: ['data-stage', 'class'] });
    if (result) guard.observe(result, { attributes: true, attributeFilter: ['hidden'] });
  }

  function addWithoutDrag() {
    // Works even if the autoplay's own drop is on screen: the click always lands the layer.
    head.setState('dragging');
    setTimeout(dropped, 180);
  }

  function resetDemo() {
    manual = false;
    if (reset) reset.hidden = true;
    if (result) result.classList.remove('dda-pop');
    if (live) live.removeAttribute('aria-grabbed');
    head.setState('idle');
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
    else { head.setState('idle'); stage('rest', restStatus); }
  }

  if (live) {
    live.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      stopAutoplay();
      dragging = true; moved = false; startX = e.clientX; startY = e.clientY; pointerId = e.pointerId;
      try { live.setPointerCapture(pointerId); } catch (err) { /* capture is a nicety */ }
      live.setAttribute('aria-grabbed', 'true');
      var name = live.querySelector('.asset-name');
      var thumb = live.querySelector('.asset-thumb');
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.innerHTML = '<span class="asset-thumb" aria-hidden="true"></span><span class="drag-ghost-name"></span>';
      if (thumb) ghost.firstChild.style.setProperty('--thumb', thumb.style.getPropertyValue('--thumb') || '#0B0C0C');
      ghost.lastChild.textContent = name ? name.textContent : 'asset';
      document.body.appendChild(ghost);
      moveGhost(e.clientX, e.clientY);
      head.setState('dragging');
      stage('drag', 'Carrying the file to the editor.');
      e.preventDefault();
    });
    live.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 4) moved = true;
      if (moved) moveGhost(e.clientX, e.clientY);
    });
    live.addEventListener('pointerup', function (e) { endDrag(e.clientX, e.clientY, false); });
    live.addEventListener('pointercancel', function () { endDrag(0, 0, true); });
    live.addEventListener('lostpointercapture', function (e) { if (dragging) endDrag(e.clientX, e.clientY, false); });
    // A click without a drag (keyboard Enter/Space, or a plain click) does the same as a drop.
    live.addEventListener('click', function () {
      if (moved) { moved = false; return; }
      addWithoutDrag();
    });
    live.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stopAutoplay(); addWithoutDrag(); }
      if (e.key === 'Escape' && dragging) { dragging = false; endDrag(0, 0, true); }
    });
  }

  if (addButton) addButton.addEventListener('click', function () { stopAutoplay(); addWithoutDrag(); });
  if (reset) reset.addEventListener('click', function () { stopAutoplay(); resetDemo(); if (autoplay) autoplay.start(); });

  // The motion package owns the self-playing cursor; it reuses these hooks and reports
  // each stage so the head reacts the same way it does to a real drag. Any real
  // interaction stops it outright, so its clock can never overwrite the visitor's result.
  var autoplay = window.DBDragAutoplay ? window.DBDragAutoplay.attach(demo, {
    onStage: function (s) { head.setState(s === 'drag' ? 'dragging' : s === 'drop' ? 'dropped' : 'idle'); },
    onGhost: function (x, y) { head.lookAt(x, y); },
    resumeAfterMs: 10000
  }) : null;

  function stopAutoplay() { if (autoplay) autoplay.stop(); }

  paintSection('acme');
  paintLibrary('acme');
})();
