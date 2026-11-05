/* Designer's Belt — site behaviour + motion layer.
   No dependencies, no build step. Everything degrades to a static page:
   reveal classes are applied only while this script runs, and
   prefers-reduced-motion turns the whole motion layer off. */

const previews = {
  finder: {
    name: 'QuickFinder',
    html: '<div class="search-field"><span>⌕</span> brand assets</div><div class="file-row"><span class="file-icon">SVG</span>brand-mark.svg<small>Studio / Brand</small></div><div class="file-row"><span class="file-icon">PDF</span>brand-guidelines.pdf<small>Studio / Brand</small></div><div class="file-row"><span class="file-icon">PNG</span>brand-texture.png<small>Studio / Assets</small></div>'
  },
  library: {
    name: 'Library',
    html: '<p class="muted-label">YOUR WORKSPACE</p><div class="mini-grid"><div>Studio ↗</div><div>Editorial ↗</div><div>Personal ↗</div></div><p class="demo-sub">Your existing folders. One familiar place.</p>'
  },
  color: {
    name: 'Color Picker',
    html: '<div class="swatch"></div><div class="hex-line"><span>#D2D7B9</span><button id="copy-color">Copy HEX</button></div><p class="demo-sub">RGB 210, 215, 185 · A little color for your next idea.</p>'
  },
  convert: {
    name: 'QuickConverter',
    html: '<p class="muted-label">BATCH CONVERSION · DEMO</p><div class="file-row"><span class="file-icon">PNG</span>campaign-01.png <small>→ WebP</small></div><div class="file-row"><span class="file-icon">PNG</span>campaign-02.png <small>→ WebP</small></div><div class="demo-progress"></div><p class="demo-sub">Two files. One less interruption.</p>'
  },
  coverage: {
    name: 'FontCoverage',
    html: '<p class="muted-label">CHECK EVERY CHARACTER</p><p class="coverage-title">Aa Éé <span>Æø</span></p><div class="file-row">English · Português <small>Character preview</small></div><p class="demo-sub">Check the characters you need before you commit to a typeface.</p>'
  }
};

const toolOrder = ['finder', 'library', 'color', 'convert', 'coverage'];

function showTool(key) {
  const preview = previews[key];
  if (!preview) return;
  document.getElementById('demo-name').textContent = preview.name;
  const panel = document.getElementById('tool-demo');
  panel.classList.remove('swap');
  panel.innerHTML = preview.html;
  void panel.offsetWidth;
  panel.classList.add('swap');
  document.querySelectorAll('.tool-tab').forEach((button) => {
    const on = button.dataset.tool === key;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on);
  });
  const copy = document.getElementById('copy-color');
  if (copy) {
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText('#D2D7B9'); copy.textContent = 'Copied!'; }
      catch { copy.textContent = '#D2D7B9'; }
    };
  }
}

const autoplay = (() => {
  const ring = document.getElementById('demo-autoplay');
  const shell = document.querySelector('.demo-shell');
  let timer = 0, index = 1, onScreen = false;
  const tick = () => {
    showTool(toolOrder[index % toolOrder.length]);
    index += 1;
  };
  const start = () => {
    if (timer || !onScreen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (ring) ring.classList.add('live');
    timer = setInterval(tick, 5200);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = 0;
    if (ring) ring.classList.remove('live');
  };
  if (shell && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start(); else stop();
      });
    }, { threshold: 0.4 }).observe(shell);
  }
  return { start, stop };
})();

document.querySelectorAll('.tool-tab').forEach((button) => button.addEventListener('click', () => {
  autoplay.stop();
  showTool(button.dataset.tool);
}));

document.querySelectorAll('.dock-item').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.dock-item').forEach((item) => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', item === button);
  });
  document.getElementById('dock-label').textContent = button.getAttribute('aria-label');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (button.dataset.tool === 'font') {
    document.getElementById('tools').scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
  } else {
    autoplay.stop();
    showTool(button.dataset.tool);
    document.getElementById('workflow').scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
  }
}));

showTool('finder');

/* ---------------------------------------------------------------- motion */

(() => {
  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /* Without observers the reveals would never fire, so leave the page static. */
  if (!('IntersectionObserver' in window)) return;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  try {
    root.classList.add('js-motion');

    /* --- split headings into characters, keeping the copy readable --- */
    const splitType = (el) => {
      if (el.dataset.splitDone) return;
      el.dataset.splitDone = '1';
      /* Keep the real sentence for assistive tech and hide the decorative split. */
      const readable = el.cloneNode(true);
      readable.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
      const spoken = document.createElement('span');
      spoken.className = 'sr-only';
      spoken.textContent = readable.textContent.replace(/\s+/g, ' ').trim();
      const inner = document.createElement('span');
      inner.className = 'split-inner';
      inner.setAttribute('aria-hidden', 'true');
      let index = 0;
      const walk = (source, target) => {
        Array.from(source.childNodes).forEach((node) => {
          if (node.nodeType === 3) {
            node.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { target.appendChild(document.createTextNode(part)); return; }
              const word = document.createElement('span');
              word.className = 'w';
              Array.from(part).forEach((character) => {
                const span = document.createElement('span');
                span.className = 'ch';
                span.textContent = character;
                span.style.setProperty('--i', index++);
                word.appendChild(span);
              });
              target.appendChild(word);
            });
          } else if (node.nodeType === 1) {
            if (node.tagName === 'BR') { target.appendChild(document.createElement('br')); return; }
            const clone = node.cloneNode(false);
            target.appendChild(clone);
            walk(node, clone);
          }
        });
      };
      walk(el, inner);
      el.textContent = '';
      el.appendChild(spoken);
      el.appendChild(inner);
      el.classList.add('split');
    };
    document.querySelectorAll('[data-split]').forEach(splitType);

    /* Letters rise when the heading actually enters the viewport. */
    const splitObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('split');
        splitObserver.unobserve(entry.target);
      });
    }, { threshold: 0.2 });
    document.querySelectorAll('[data-split]').forEach((el) => splitObserver.observe(el));

    /* --- scroll reveals --- */
    const revealTargets = Array.from(document.querySelectorAll('[data-reveal]'));
    revealTargets.forEach((el) => {
      const siblings = Array.from(el.parentElement.children).filter((child) => child.hasAttribute('data-reveal'));
      el.style.setProperty('--d', (siblings.indexOf(el) * 70) + 'ms');
    });
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach((el) => revealObserver.observe(el));

    const heroCopy = document.querySelector('.hero-copy');
    requestAnimationFrame(() => {
      heroCopy && heroCopy.classList.add('in');
      const heroEl = document.querySelector('.hero');
      if (heroEl) heroEl.classList.add('in');
    });

    /* --- ambient field --- */
    const canvas = document.getElementById('floaters');
    const ambient = document.querySelector('.ambient');
    const spot = document.getElementById('spot');
    const cursor = document.getElementById('cursor');
    const hero = document.querySelector('.hero');
    const glyphs = ['Aa', '⌕', '▦', 'Æ', '⇄', '◉', '#', '✳', '✦', '↗', '⌘'];
    /* The brand tile floats with the glyphs, loaded lazily and only drawn once decoded. */
    const logo = new Image();
    let logoReady = false;
    logo.onload = () => { logoReady = true; };
    logo.src = '/logo.png';
    const particles = [];
    let width = 0, height = 0, heroVisible = true, running = false;

    const seed = () => {
      particles.length = 0;
      const count = clamp(Math.round((width * height) / 26000), 12, 44);
      for (let i = 0; i < count; i++) {
        const roll = Math.random();
        const kind = roll < 0.12 ? 'logo' : roll < 0.58 ? 'glyph' : 'dot';
        const glyph = kind === 'glyph';
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: -0.06 - Math.random() * 0.2,
          kind,
          size: kind === 'logo' ? 15 + Math.random() * 17 : glyph ? 11 + Math.random() * 20 : 1.2 + Math.random() * 2.2,
          glyph: glyph ? glyphs[(Math.random() * glyphs.length) | 0] : '',
          depth: 0.25 + Math.random() * 0.9,
          alpha: glyph ? 0.1 + Math.random() * 0.2 : 0.14 + Math.random() * 0.3,
          rotation: (Math.random() - 0.5) * 0.5,
          spin: (Math.random() - 0.5) * 0.0016,
          hot: !glyph && Math.random() > 0.72
        });
      }
    };

    const context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    const resize = () => {
      if (!context) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, active: false };
    let scrolling = false;

    const drawParticles = () => {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const offsetX = (pointer.x - width / 2) / width;
      const offsetY = (pointer.y - height / 2) / height;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 150 && distance > 0.001) {
            const force = (1 - distance / 150) * 0.9;
            p.x += (dx / distance) * force;
            p.y += (dy / distance) * force;
          }
        }
        if (p.y < -60) { p.y = height + 40; p.x = Math.random() * width; }
        if (p.x < -60) p.x = width + 40;
        if (p.x > width + 60) p.x = -40;

        const x = p.x + offsetX * 42 * p.depth;
        const y = p.y + offsetY * 30 * p.depth;
        context.save();
        context.translate(x, y);
        context.rotate(p.rotation);
        if (p.kind === 'logo' && logoReady) {
          context.globalAlpha = Math.min(1, p.alpha + 0.12);
          context.drawImage(logo, -p.size / 2, -p.size / 2, p.size, p.size);
          context.globalAlpha = 1;
        } else if (p.glyph) {
          context.font = '600 ' + p.size + 'px Inter, "Segoe UI", sans-serif';
          context.fillStyle = 'rgba(233,237,228,' + p.alpha + ')';
          context.fillText(p.glyph, 0, 0);
        } else {
          context.beginPath();
          context.arc(0, 0, p.size, 0, Math.PI * 2);
          context.fillStyle = p.hot ? 'rgba(251,117,65,' + (p.alpha + 0.16) + ')' : 'rgba(214,222,205,' + p.alpha + ')';
          context.fill();
        }
        context.restore();

        if (pointer.active) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 190) {
            context.beginPath();
            context.moveTo(pointer.x, pointer.y);
            context.lineTo(x, y);
            context.strokeStyle = 'rgba(255,180,137,' + ((1 - distance / 190) * 0.16) + ')';
            context.lineWidth = 0.7;
            context.stroke();
          }
        }
      }
    };

    if (context) {
      resize();
      let resizeTimer = 0;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 160);
      });
      if (hero && 'IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            heroVisible = entry.isIntersecting;
            if (heroVisible && !running) { running = true; requestAnimationFrame(loop); }
          });
        }, { threshold: 0 }).observe(hero);
      }
    }

    function loop() {
      if (!heroVisible || document.hidden) { running = false; return; }
      drawParticles();
      requestAnimationFrame(loop);
    }
    running = true;
    requestAnimationFrame(loop);

    /* --- pointer + scroll driven effects --- */
    const dockItems = Array.from(document.querySelectorAll('.dock-item'));
    const stages = Array.from(document.querySelectorAll('[data-tilt-stage]')).map((stage) => ({
      stage,
      poster: stage.querySelector('.poster'),
      panel: stage.querySelector('.font-panel'),
      rect: { left: 0, top: 0, width: 1, height: 1 }
    }));
    const letters = Array.from(document.querySelectorAll('.hero h1 .ch')).map((el) => ({ el, rect: null }));
    const shards = Array.from(document.querySelectorAll('.hero .metal i'));
    const scrollBar = document.getElementById('scroll-bar');
    const marqueeTrack = document.querySelector('.marquee-track');
    const dockRects = [];

    const measure = () => {
      letters.forEach((letter) => { letter.rect = letter.el.getBoundingClientRect(); });
      stages.forEach((stage) => { stage.rect = stage.stage.getBoundingClientRect(); });
      dockRects.length = 0;
      dockItems.forEach((item) => {
        const rect = item.getBoundingClientRect();
        dockRects.push({ left: rect.left, width: rect.width });
      });
    };

    let measureDirty = true;
    window.addEventListener('scroll', () => { measureDirty = true; scrolling = true; }, { passive: true });
    window.addEventListener('resize', () => { measureDirty = true; }, { passive: true });

    const onMove = (event) => {
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      /* The first real position jumps in, so nothing swoops in from off-screen. */
      if (!pointer.active) { pointer.x = event.clientX; pointer.y = event.clientY; }
      pointer.active = true;
    };
    /* Pointer events cover mouse, pen and touch, so the effects work on hybrids too. */
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', () => { pointer.active = false; });
    if (fine) {
      document.querySelectorAll('a, button, summary').forEach((el) => {
        el.addEventListener('pointerenter', () => cursor && cursor.classList.add('hot'));
        el.addEventListener('pointerleave', () => cursor && cursor.classList.remove('hot'));
      });
    }

    const frame = () => {
      if (measureDirty) { measure(); measureDirty = false; }
      pointer.x = lerp(pointer.x, pointer.tx, 0.09);
      pointer.y = lerp(pointer.y, pointer.ty, 0.09);
      const hasPointer = pointer.active && pointer.x < 1e4;

      if (ambient) ambient.classList.toggle('live', hasPointer);
      if (spot && hasPointer) spot.style.transform = 'translate3d(' + pointer.x + 'px,' + pointer.y + 'px,0) translate(-50%,-50%)';

      if (cursor) {
        if (hasPointer && fine) cursor.classList.add('on');
        cursor.style.transform = 'translate3d(' + pointer.x.toFixed(2) + 'px,' + pointer.y.toFixed(2) + 'px,0)';
      }

      if (hasPointer) {
        for (const letter of letters) {
          if (!letter.rect) continue;
          const dx = pointer.x - (letter.rect.left + letter.rect.width / 2);
          const dy = pointer.y - (letter.rect.top + letter.rect.height / 2);
          const distance = Math.hypot(dx, dy);
          const reach = 200;
          if (distance < reach) {
            const push = (1 - distance / reach) ** 2;
            letter.el.style.transform = 'translate3d(' + ((-dx / reach) * 28 * push).toFixed(2) + 'px,' + ((-dy / reach) * 22 * push).toFixed(2) + 'px,0) scale(' + (1 + push * 0.07).toFixed(3) + ')';
          } else if (letter.el.style.transform) {
            letter.el.style.transform = '';
          }
        }

        dockItems.forEach((item, index) => {
          const rect = dockRects[index];
          if (!rect) return;
          const distance = Math.abs(pointer.x - (rect.left + rect.width / 2));
          const reach = 170;
          const proximity = distance < reach ? (1 - distance / reach) ** 2 : 0;
          item.style.setProperty('--s', (1 + proximity * 0.24).toFixed(3));
          item.style.setProperty('--lift', (proximity * 12).toFixed(2));
        });

        stages.forEach((stage) => {
          const rect = stage.rect;
          const inside = pointer.x > rect.left - 90 && pointer.x < rect.right + 90 && pointer.y > rect.top - 90 && pointer.y < rect.bottom + 90;
          const nx = clamp((pointer.x - rect.left) / rect.width, 0, 1) * 2 - 1;
          const ny = clamp((pointer.y - rect.top) / rect.height, 0, 1) * 2 - 1;
          const mx = (nx + 1) * 50, my = (ny + 1) * 50;
          if (stage.poster) {
            stage.poster.style.setProperty('--rx', (inside ? -ny * 6 : 0).toFixed(2) + 'deg');
            stage.poster.style.setProperty('--ry', (inside ? nx * 8 : 0).toFixed(2) + 'deg');
            stage.poster.style.setProperty('--px', (inside ? nx * 10 : 0).toFixed(2) + 'px');
            stage.poster.style.setProperty('--py', (inside ? ny * 8 : 0).toFixed(2) + 'px');
          }
          if (stage.panel) {
            stage.panel.style.setProperty('--pw-rx', (inside ? -ny * 9 : 0).toFixed(2) + 'deg');
            stage.panel.style.setProperty('--pw-ry', (inside ? nx * 12 : 0).toFixed(2) + 'deg');
            stage.panel.style.setProperty('--qx', (inside ? nx * -16 : 0).toFixed(2) + 'px');
            stage.panel.style.setProperty('--qy', (inside ? ny * -12 : 0).toFixed(2) + 'px');
          }
          stage.stage.style.setProperty('--mx', mx.toFixed(1) + '%');
          stage.stage.style.setProperty('--my', my.toFixed(1) + '%');
          if (stage.stage.classList.contains('launch-card')) {
            stage.stage.style.transform = inside
              ? 'perspective(900px) rotateX(' + (-ny * 4).toFixed(2) + 'deg) rotateY(' + (nx * 5).toFixed(2) + 'deg) translate3d(0,-3px,0)'
              : '';
          }
        });
      }

      if (scrolling) {
        scrolling = false;
        const fade = clamp(1 - window.scrollY / (window.innerHeight * 0.85), 0, 1);
        root.style.setProperty('--ambient', (0.16 + fade * 0.84).toFixed(3));
        if (scrollBar) {
          const max = root.scrollHeight - window.innerHeight;
          scrollBar.style.transform = 'scaleX(' + (max > 0 ? clamp(window.scrollY / max, 0, 1) : 0) + ')';
        }
        shards.forEach((shard, index) => {
          const depth = 0.4 + index * 0.18;
          shard.style.transform = 'skewY(' + (index % 2 ? 17 : -15) + 'deg) translate3d(0,' + (window.scrollY * 0.06 * depth).toFixed(2) + 'px,0)';
        });
      }

      requestAnimationFrame(frame);
    };

    /* initial state: progress bar and ambient level before the first scroll */
    scrolling = true;
    requestAnimationFrame(frame);

    /* --- velocity aware marquee --- */
    if (marqueeTrack) {
      let offset = 0, velocity = 0, lastY = window.scrollY;
      const step = () => {
        const delta = window.scrollY - lastY;
        lastY = window.scrollY;
        velocity = lerp(velocity, delta, 0.12);
        offset -= 0.55 + velocity * 0.6;
        const loopWidth = marqueeTrack.scrollWidth / 2;
        if (loopWidth > 0) {
          if (offset <= -loopWidth) offset += loopWidth;
          if (offset > 0) offset -= loopWidth;
          marqueeTrack.style.transform = 'translate3d(' + offset.toFixed(2) + 'px,0,0)';
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  } catch (error) {
    /* Any failure must leave the page exactly as the static HTML renders it. */
    root.classList.remove('js-motion');
    document.querySelectorAll('[data-reveal]').forEach((el) => el.removeAttribute('style'));
    console.warn('Motion layer disabled:', error);
  }
})();
