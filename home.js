/* Designer's Belt — home behaviour. Vanilla, no dependencies, no network.
   The head mascot comes from the motion package (/mascot-head.js) and the drag
   section from /drag-v3.js (DBDragV3): this file keeps the one client list that
   feeds both the Library widget and the clients section, and hands the drag
   section the mascot so the head reacts to the same stages.
   Without this file the page still reads: the head sits in its idle pose, the
   Library shows the first client and the editor shows its base layers. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  // Four fictional clients. The Library widget and the clients section both read this.
  var clients = {
    acme: { name: 'Acme Demo', initials: 'AD', color: '#2D8CFF', count: 24,
      colors: ['#2D8CFF', '#0B1F3A', '#F5F3EF', '#FFC400', '#F26D6D'],
      fonts: [['Sora', 'Bold'], ['Inter', 'Regular']],
      assets: [['logo-primary.png', '#0B0C0C'], ['symbol.png', '#2D8CFF'], ['badge.png', '#FFC400'], ['pattern.png', '#4A4A4A']],
      files: { logo: 'logo-primary.png', photo: 'photo-hero.png', badge: 'badge.png' } },
    lorem: { name: 'Lorem Coffee', initials: 'LC', color: '#3DD68C', count: 18,
      colors: ['#3DD68C', '#123528', '#EFE7DA', '#B9793F', '#F2B880'],
      fonts: [['Fraunces', 'Bold'], ['Karla', 'Regular']],
      assets: [['logo-coin.png', '#EFE7DA'], ['bean-mark.png', '#3DD68C'], ['badge-stamp.png', '#B9793F'], ['paper.png', '#E4D9C6']],
      files: { logo: 'logo-coin.png', photo: 'photo-roast.png', badge: 'badge-stamp.png' } },
    example: { name: 'Example Bank', initials: 'EB', color: '#8B5CF6', count: 31,
      colors: ['#8B5CF6', '#1B1240', '#F3F1FB', '#22C55E', '#EF4444'],
      fonts: [['Manrope', 'Bold'], ['IBM Plex Sans', 'Regular']],
      assets: [['shield-mark.png', '#F3F1FB'], ['shield.png', '#8B5CF6'], ['badge-seal.png', '#EF4444'], ['lockup.png', '#1B1240']],
      files: { logo: 'shield-mark.png', photo: 'photo-branch.png', badge: 'badge-seal.png' } },
    sample: { name: 'Sample Studio', initials: 'SS', color: '#F472B6', count: 12,
      colors: ['#F472B6', '#2A1220', '#F7F3F5', '#FBBF24', '#38BDF8'],
      fonts: [['Playfair Display', 'Bold'], ['Work Sans', 'Regular']],
      assets: [['monogram.png', '#F7F3F5'], ['grid.png', '#F472B6'], ['badge-tag.png', '#FBBF24'], ['cover.png', '#38BDF8']],
      files: { logo: 'monogram.png', photo: 'photo-studio.png', badge: 'badge-tag.png' } }
  };
  var KINDS = ['logo', 'photo', 'badge'];

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

  /* ------------------------------------------------------------------ Library widget */
  var demo = document.querySelector('[data-dv3]');
  var libTitle = demo && demo.querySelector('[data-lib-title]');
  var libCount = demo && demo.querySelector('[data-lib-count]');
  var libGrid = demo && demo.querySelector('.lb-grid');
  var libAvatars = demo ? [].slice.call(demo.querySelectorAll('[data-lib-client]')) : [];
  var cards = {}, rows = {};
  if (demo) {
    [].forEach.call(demo.querySelectorAll('[data-asset]'), function (c) { cards[c.dataset.asset] = c; });
    [].forEach.call(demo.querySelectorAll('[data-layer]'), function (r) { rows[r.dataset.layer] = r; });
  }

  var dv3 = demo && window.DBDragV3 ? window.DBDragV3.attach(demo, {
    onStage: function (s) { head.setState(s === 'drag' ? 'dragging' : s === 'drop' ? 'dropped' : 'idle'); },
    onGhost: function (x, y) { head.lookAt(x, y); },
    resumeAfterMs: 12000
  }) : null;

  function paintLibrary(id, animate, restart) {
    var data = clients[id];
    if (!demo || !data) return;
    var write = function () {
      demo.dataset.client = id;                     // picks the palette of the client's art
      if (libTitle) libTitle.textContent = data.name;
      if (libCount) libCount.textContent = data.count + ' assets';
      libAvatars.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lib-client') === id)); });
      KINDS.forEach(function (k) {
        var fn = cards[k] && cards[k].querySelector('.lb-fn');
        if (fn) fn.textContent = data.files[k];
        var layer = rows[k] && rows[k].querySelector('.ly-name');
        if (layer) layer.textContent = data.files[k].replace(/\.png$/, '');
      });
      if (libGrid) libGrid.classList.remove('is-swapping');
      // A new client means new files: clear the canvas and let the demo start again
      // with the new palette, instead of leaving the previous client's layers behind.
      if (restart && dv3) dv3.reset();
    };

    if (!animate || !libGrid) { write(); return; }
    libGrid.classList.add('is-swapping');
    setTimeout(write, 170);
  }

  function chooseClient(id) {
    paintSection(id);
    paintLibrary(id, true, true);
  }

  sectionButtons.forEach(function (b) { b.addEventListener('click', function () { chooseClient(b.getAttribute('data-client')); }); });
  libAvatars.forEach(function (b) { b.addEventListener('click', function () { chooseClient(b.getAttribute('data-lib-client')); }); });

  [].slice.call(document.querySelectorAll('[data-filter]')).forEach(function (tab) {
    tab.addEventListener('click', function () {
      var wanted = tab.getAttribute('data-filter');
      [].slice.call(document.querySelectorAll('[data-filter]')).forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      [].slice.call(document.querySelectorAll('[data-group]')).forEach(function (g) { g.hidden = wanted !== 'all' && g.getAttribute('data-group') !== wanted; });
    });
  });

  paintSection('acme');
  paintLibrary('acme');
})();
