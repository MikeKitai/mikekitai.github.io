/* ═══════════════════════════════════════════
   Mike Kitai — MK logo background (all pages)
   ═══════════════════════════════════════════
   The MK mark at depth, in place of the falling rain.
     drift — always running
     tilt  — follows the pointer
     tap   — a click sends a ring outward and shoves the marks

   The drawing runs in a Web Worker on an OffscreenCanvas where the
   browser allows it, so the animation never blocks taps, scrolling or
   page load. Elsewhere the same engine runs on the main thread.        */
(function () {
  "use strict";

  var wrap = document.querySelector('.gradient-bg');
  if (!wrap) { return; }

  // Settled with the tuning panel in the preview.
  var SCRIM = 0.85;

  /* Everything that draws lives in engine(), which takes plain messages.
     It must not touch anything outside its own body, because the worker
     gets it as source text. */
  function engine() {
    var MARK_D = "M0,0 L100,0 L100,100 L0,100 Z M31,0 L51.8,20.8 L72.6,0 Z M0,33.3 L0,36.7 L20,36.7 L20,52.6 L36,36.7 L64.3,36.7 L47.2,53.9 L93.2,100 L100,100 L80,79.9 L80,21 L67.6,33.4 L36,33.4 L20,17.4 L20,33.3 Z M20,81 L20,100 L64.9,100 L33,68.1 Z";
    // The "Primary" palette. HUES fill the marks; the two ghosts are the
    // glitch split; RING is the click outline.
    var HUES = ['#fa870e','#92063c','#ef2922','#d1108d','#11aa61','#03731c','#8537e7',
                '#e11572','#9f431c','#090e95','#1a51f5'];
    var GHOST_M = '#ef2922', GHOST_C = '#1a51f5', RING = '#fa870e';
    var cfg = { count: 580, size: 1.3, speed: 2.3, jitter: 1.9, tilt: 1.9 };

    var NEAR = 90, FAR = 1500, FOCAL = 780;
    // Pre-drawn sizes of each mark, so a 10px mark is not shrunk from 384px.
    var LEVELS = [384, 128, 48];

    var raf = typeof requestAnimationFrame === 'function'
      ? function (f) { return requestAnimationFrame(f); }
      : function (f) { return setTimeout(function () { f(performance.now()); }, 16); };
    var unraf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;

    function makeCanvas(n) {
      if (typeof OffscreenCanvas !== 'undefined') { return new OffscreenCanvas(n, n); }
      var c = document.createElement('canvas');
      c.width = c.height = n;
      return c;
    }

    // One colour → the mark at each LEVELS size.
    function bake(colour) {
      var path = new Path2D(MARK_D);
      return LEVELS.map(function (n) {
        var c = makeCanvas(n), g = c.getContext('2d');
        g.scale(n / 100, n / 100);
        g.fillStyle = colour;
        g.fill(path, 'evenodd');
        return c;
      });
    }

    function pick(set, px) {
      for (var i = set.length - 1; i > 0; i--) { if (LEVELS[i] >= px) { return set[i]; } }
      return set[0];
    }

    /* rgbSocialIcon, lifted verbatim: 2.2s, steps(9), alternate. */
    var GLITCH_MS = 2200, GLITCH_STEPS = 9;
    var GLITCH_KEYS = [
      [0.00, 0,0, 0,0], [0.25, 0,0, 0,0], [0.45, 3,0, -3,0],
      [0.50, -3,0, 3,0], [0.55, 0,2, 0,-2], [0.90, -2,2, 2,-2], [1.00, 2,0, -2,0]
    ];
    var gv = [0,0,0,0];

    function glitch(now, phase) {
      var t = ((now + phase) % (GLITCH_MS * 2)) / GLITCH_MS;
      var f = t > 1 ? 2 - t : t;
      f = Math.min(1, Math.floor(f * GLITCH_STEPS) / (GLITCH_STEPS - 1));
      var i = 1;
      while (i < GLITCH_KEYS.length - 1 && GLITCH_KEYS[i][0] < f) { i++; }
      var a = GLITCH_KEYS[i - 1], b = GLITCH_KEYS[i];
      var span = b[0] - a[0], u = span > 0 ? (f - a[0]) / span : 0;
      for (var j = 0; j < 4; j++) { gv[j] = a[j+1] + (b[j+1] - a[j+1]) * u; }
      return gv;
    }

    var cv = null, ctx = null, reduced = false;
    var sprites = [], ghostM = null, ghostC = null;
    var parts = [], w = 0, h = 0, dpr = 1;
    var mx = 0, my = 0, px = 0, py = 0;
    var waves = [], kick = 0, flare = 0;
    var running = false, handle = 0, last = 0;

    function spawn(p, z) {
      p.x = (Math.random() - 0.5) * 2400;
      p.y = (Math.random() - 0.5) * 1700;
      p.z = (z === undefined) ? NEAR + Math.random() * (FAR - NEAR) : z;
      var b = Math.random();
      p.s = b < 0.46 ? 7 + Math.random() * 13
          : b < 0.80 ? 20 + Math.random() * 34
          : b < 0.955 ? 54 + Math.random() * 76
          : 130 + Math.random() * 190;
      p.tilt = (Math.random() - 0.5) * 0.26;
      p.ph = Math.random() * Math.PI * 2;
      p.rot = p.tilt;
      p.t = Math.floor(Math.random() * HUES.length);
      p.gph = Math.random() * GLITCH_MS * 2;
      p.ox = 0; p.oy = 0;
      return p;
    }

    function resize(m) {
      w = m.w; h = m.h; dpr = m.dpr;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }

    function step(dt, now) {
      var drift = (0.030 * cfg.speed + kick) * dt;
      kick *= Math.pow(0.94, dt / 16.7);

      px += (mx * cfg.tilt - px) * 0.055;
      py += (my * cfg.tilt - py) * 0.055;

      var i, wi;
      for (i = waves.length - 1; i >= 0; i--) {
        if (now - waves[i].t0 > 1500) { waves.splice(i, 1); }
      }
      var loud = 0;
      for (i = 0; i < waves.length; i++) {
        loud = Math.max(loud, (1 - Math.max(0, now - waves[i].t0) / 1500) * waves[i].power);
      }
      flare = loud * 0.55;

      var cx = w / 2, cy = h * 0.5;

      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.z -= drift;
        p.rot = p.tilt + Math.sin(now * 0.00035 + p.ph) * 0.11;
        if (p.z < NEAR) { spawn(p, FAR); }
        else if (p.z > FAR) { spawn(p, NEAR + 1); }

        if (waves.length) {
          var k = FOCAL / p.z;
          var sx = cx + p.x * k, sy = cy + p.y * k;
          for (wi = 0; wi < waves.length; wi++) {
            var wv = waves[wi];
            var age = Math.max(0, now - wv.t0);
            var rad = age * 0.55;
            var dx = sx + p.ox - wv.x, dy = sy + p.oy - wv.y;
            var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            var band = Math.abs(d - rad);
            if (band < 46) {
              var hit = (1 - band / 46) * (1 - age / 1500) * 7 * wv.power;
              p.ox += (dx / d) * hit;
              p.oy += (dy / d) * hit;
            }
          }
        }
        p.ox *= 0.935; p.oy *= 0.935;
      }
    }

    function draw(now) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'lighter';

      var cx = w / 2, cy = h * 0.5, boost = 1 + flare;

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var k = FOCAL / p.z;
        var s = p.s * k * cfg.size * (1 + flare * 0.10);
        if (s < 0.7) { continue; }

        var fin = Math.min(1, (FAR - p.z) / 430);
        var fout = Math.min(1, (p.z - NEAR) / 230);
        var a = 0.72 * fin * fout * boost;
        if (s > 170) { a *= Math.max(0.26, 170 / s); }
        if (a > 0.95) { a = 0.95; }
        if (a <= 0.005) { continue; }

        var lean = 0.30 + k * 0.30;
        var sx = cx + p.x * k + px * lean + p.ox;
        var sy = cy + p.y * k + py * lean + p.oy;
        if (sx < -s || sx > w + s || sy < -s || sy > h + s) { continue; }

        // translate + rotate, in one call, at device pixels
        var c = Math.cos(p.rot) * dpr, sn = Math.sin(p.rot) * dpr;
        ctx.setTransform(c, sn, -sn, c, sx * dpr, sy * dpr);
        var spx = s * dpr;

        if (!reduced && cfg.jitter > 0.01 && s > 11) {
          var g = glitch(now, p.gph);
          if (g[0] || g[1] || g[2] || g[3]) {
            var off = cfg.jitter * Math.max(0.35, Math.min(1.6, s / 22));
            ctx.globalAlpha = a * 0.4;
            ctx.drawImage(pick(ghostM, spx), -s/2 + g[0]*off, -s/2 + g[1]*off, s, s);
            ctx.drawImage(pick(ghostC, spx), -s/2 + g[2]*off, -s/2 + g[3]*off, s, s);
          }
        }

        ctx.globalAlpha = a;
        ctx.drawImage(pick(sprites[p.t], spx), -s/2, -s/2, s, s);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (var wi = 0; wi < waves.length; wi++) {
        var wv = waves[wi], age = Math.max(0, now - wv.t0);
        var fade = 1 - age / 1500;
        if (fade <= 0) { continue; }
        ctx.globalAlpha = fade * 0.22 * wv.power;
        ctx.strokeStyle = RING;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(wv.x, wv.y, age * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function frame(now) {
      if (!running) { return; }
      var dt = Math.min(now - last, 48) || 16.7;
      last = now;
      step(dt, now);
      draw(now);
      handle = raf(frame);
    }

    function run(on) {
      if (on && !running && !reduced) {
        running = true;
        last = performance.now();
        handle = raf(frame);
      } else if (!on && running) {
        running = false;
        unraf(handle);
      }
    }

    return function (m) {
      switch (m.type) {
        case 'init':
          cv = m.canvas;
          ctx = cv.getContext('2d');
          reduced = m.reduced;
          sprites = HUES.map(bake);
          ghostM = bake(GHOST_M);
          ghostC = bake(GHOST_C);
          resize(m);
          while (parts.length < cfg.count) { parts.push(spawn({})); }
          draw(performance.now());
          run(true);
          break;
        case 'size':
          resize(m);
          if (reduced) { draw(performance.now()); }
          break;
        case 'pointer':
          mx = m.mx; my = m.my;
          break;
        case 'burst':
          waves.push({ x: m.x, y: m.y, t0: performance.now(), power: m.power });
          if (waves.length > 5) { waves.shift(); }
          kick += 0.05 * m.power;
          break;
        case 'run':
          run(m.on);
          break;
      }
    };
  }

  /* ── page side ───────────────────────────────────────────────────── */

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

  /* The field is bright, so one soft plate sits under the middle of the
     page where the hero column is. */
  var scrim = document.createElement('div');
  scrim.setAttribute('aria-hidden', 'true');
  scrim.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
    'background:radial-gradient(66% 62% at 50% 40%, rgba(7,6,11,.86) 0%, rgba(7,6,11,.60) 48%, rgba(7,6,11,0) 86%),' +
    'linear-gradient(to bottom, rgba(7,6,11,.72) 0%, rgba(7,6,11,.20) 16%, rgba(7,6,11,.34) 58%, rgba(7,6,11,.62) 100%)';
  scrim.style.opacity = String(SCRIM);

  wrap.replaceChildren(cv, scrim);

  var send = function () {};

  function sizeMsg(type) {
    return { type: type, w: window.innerWidth, h: window.innerHeight,
             dpr: Math.min(window.devicePixelRatio || 1, 2), reduced: reduced };
  }

  // Same engine, on this thread. Also the fallback if the worker fails.
  function runHere() {
    var fresh = document.createElement('canvas');
    fresh.setAttribute('aria-hidden', 'true');
    fresh.style.cssText = cv.style.cssText;
    wrap.replaceChild(fresh, cv);
    cv = fresh;
    var handle = engine();
    send = handle;
    var m = sizeMsg('init');
    m.canvas = cv;
    handle(m);
  }

  function runInWorker() {
    var src = 'var engine = ' + engine.toString() + ';\n' +
      'var handle = null;\n' +
      'self.onmessage = function (e) {\n' +
      '  try { if (!handle) { handle = engine(); } handle(e.data); }\n' +
      '  catch (err) { self.postMessage({ type: "fail" }); self.close(); }\n' +
      '};\n';
    var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    var worker = new Worker(url);
    var failed = false;
    function fallBack() {
      if (failed) { return; }
      failed = true;
      worker.terminate();
      runHere();
    }
    worker.onerror = fallBack;
    worker.onmessage = function (e) { if (e.data && e.data.type === 'fail') { fallBack(); } };
    var off = cv.transferControlToOffscreen();
    var m = sizeMsg('init');
    m.canvas = off;
    worker.postMessage(m, [off]);
    send = function (msg) { if (!failed) { worker.postMessage(msg); } };
  }

  function boot() {
    var canWork = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' &&
                  typeof cv.transferControlToOffscreen === 'function';
    if (canWork) {
      try { runInWorker(); return; } catch (e) { /* fall through */ }
    }
    runHere();
  }

  addEventListener('pointermove', function (e) {
    if (reduced) { return; }
    send({ type: 'pointer',
           mx: (e.clientX / window.innerWidth - 0.5) * 150,
           my: (e.clientY / window.innerHeight - 0.5) * 110 });
  }, { passive: true });

  addEventListener('pointerdown', function (e) {
    if (reduced) { return; }
    var portrait = e.target.closest('.portrait-wrap');
    if (portrait) {
      // A click on the portrait sends a stronger ring.
      var r = portrait.getBoundingClientRect();
      send({ type: 'burst', x: r.left + r.width / 2, y: r.top + r.height / 2, power: 2.1 });
      return;
    }
    if (e.target.closest('a, button')) { return; }
    send({ type: 'burst', x: e.clientX, y: e.clientY, power: 1 });
  }, { passive: true });

  var rt;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { send(sizeMsg('size')); }, 130);
  });

  document.addEventListener('visibilitychange', function () {
    send({ type: 'run', on: !document.hidden });
  });

  // Start after load, on idle, so the field never competes with first paint.
  function scheduleBoot() {
    if ('requestIdleCallback' in window) { requestIdleCallback(boot, { timeout: 900 }); }
    else { setTimeout(boot, 60); }
  }
  if (document.readyState === 'complete') { scheduleBoot(); }
  else { addEventListener('load', scheduleBoot, { once: true }); }
})();
