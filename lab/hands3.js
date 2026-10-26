// Lab proposal: «Ilustradas» hands for the lesson keyboard, the typing.com way (pending Pol's OK).
// The hands never move. A drawn, translucent pair (hand-left.png, mirrored for the right hand) rests on
// the home row; for each key one extra "ghost finger" in the accent colour reaches from the finger's
// knuckle to that key (a home key only tints the fingertip; the space bar tints both thumbs).
//
// Like hands2.js it wraps the keyboard instance (highlight/clear/setLayout/refreshHands) and reads the
// key boxes from the keyboard's own SVG, so it scales with it. keyboard.js stays untouched.
const Hands3 = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  const f1 = (n) => Math.round(n * 100) / 100;

  // hand-left.png (500 × 669): fingertip contact points of pinky, ring, middle, index and the thumb tip.
  const IMG = { src: 'hand-left.png', w: 500, h: 669 };
  const TIPS = { 0: [99, 79], 1: [199, 44.4], 2: [276, 33.2], 3: [364.3, 53.1], 4: [461.7, 265.8] };
  const EXTRA = 70; // keyboard px under the keyboard where the wrists fade out
  const KNUCKLE_DROP = 1.55; // ghost finger starts this many key pitches below the rest fingertip

  function keyBox(kb, code) {
    const lip = kb.svg && kb.svg.querySelector(`.kb-key[data-code="${code}"] .kb-lip`);
    if (!lip) return null;
    const b = lip.getBBox();
    if (!b.width) return null;
    return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }
  function homeCode(L, finger) {
    const keys = L.rows.flat().filter((k) => !k.mod && k.home && k.finger === finger);
    return (keys.find((k) => k.bump) || keys[0] || {}).code;
  }

  /** Image placement per hand: uniform scale fitted so the four fingertips land on the home keys. */
  function measure(kb) {
    const L = kb.layout;
    const home = {};
    for (const f of [0, 1, 2, 3, 6, 7, 8, 9]) {
      home[f] = keyBox(kb, homeCode(L, f));
      if (!home[f]) return null;
    }
    const tipsX = [0, 1, 2, 3].map((n) => TIPS[n][0]);
    const tipsY = [0, 1, 2, 3].map((n) => TIPS[n][1]);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const p = Math.abs(home[3].cx - home[2].cx);
    const s = (3 * p) / (tipsX[3] - tipsX[0]); // image px -> keyboard px
    const vb = kb.svg.viewBox.baseVal;
    // Squash the drawing a little in height so the thumbs land on the space bar (seen from above
    // the hands are foreshortened anyway).
    const space = keyBox(kb, 'Space');
    const iy0 = mean(tipsY), homeY = mean([0, 1, 2, 3].map((f) => home[f].cy));
    const sy = space ? Math.max(0.72, Math.min(1, (space.cy - homeY) / ((TIPS[4][1] - iy0) * s))) : 1;
    const hands = [false, true].map((right) => {
      const fs = right ? [9, 8, 7, 6] : [0, 1, 2, 3];
      const kx = mean(fs.map((f) => home[f].cx));
      const ky = mean(fs.map((f) => home[f].cy));
      const ix = mean(tipsX), iy = mean(tipsY);
      const dir = right ? -1 : 1;
      // keyboard point of an image point
      const at = ([x, y]) => [kx + dir * (x - ix) * s, ky + (y - iy) * s * sy];
      const fingers = {};
      for (const n of [0, 1, 2, 3, 4]) {
        const f = n === 4 ? (right ? 5 : 4) : (right ? 9 - n : n);
        fingers[f] = { n, tip: at(TIPS[n]) };
      }
      return { right, dir, s, sy, origin: at([0, 0]), fingers };
    });
    return { p, vbW: vb.width, vbH: vb.height, hands };
  }

  const shiftFor = (L, code) => {
    const k = L.byCode.get(code);
    return k && k.finger <= 4 ? 'ShiftRight' : 'ShiftLeft';
  };
  function reachesFor(L, stroke) {
    const out = [];
    const add = (code) => {
      const k = L.byCode.get(code);
      if (!k) return;
      if (code === 'Space') { out.push({ finger: 4, code }, { finger: 5, code }); return; }
      out.push({ finger: k.finger, code });
    };
    add(stroke.code);
    if (stroke.shift) add(shiftFor(L, stroke.code));
    if (stroke.altgr) add('AltRight');
    return out;
  }

  /** Where the fingertip touches a key: nearest point of the key to the rest tip (wide keys at their near end). */
  function touchPoint(kb, G, code, rest) {
    const k = kb.layout.byCode.get(code);
    let b = keyBox(kb, code);
    if (!b) return null;
    if (k && k.iso) b = { x0: b.x1 - 1.25 * G.p, x1: b.x1, cy: (b.cy + b.y1) / 2 };
    const inset = 0.45 * G.p;
    const lo = b.x0 + inset, hi = b.x1 - inset;
    const x = lo <= hi ? Math.max(lo, Math.min(hi, rest[0])) : (b.x0 + b.x1) / 2;
    return [x, b.cy];
  }

  let uid = 0;
  function attach(kb, opts = {}) {
    const id = `hd3-${++uid}`;
    let enabled = opts.enabled !== false;
    let opacity = opts.opacity == null ? 0.3 : opts.opacity;
    let strokes = null;
    let svg = null, G = null, ghosts = null;
    const orig = { highlight: kb.highlight, clear: kb.clear, setLayout: kb.setLayout, refreshHands: kb.refreshHands };
    const toStrokes = (input) => {
      if (typeof input === 'string') return input ? Keyboard.strokesFor(kb.layout, [...input][0]) : [];
      if (input && !Array.isArray(input)) return [input];
      return input || [];
    };

    function build() {
      if (svg) svg.remove();
      svg = null;
      kb.root.classList.remove('hd3-on');
      if (!enabled || !Keyboard.handsOn()) return;
      G = measure(kb);
      if (!G) return;
      const H = G.vbH + EXTRA;
      kb.root.classList.add('hd3-on');
      kb.root.style.setProperty('--hd3-extra', `${(EXTRA / G.vbW) * 100}%`);
      kb.root.style.setProperty('--hd3-op', String(opacity));
      svg = el('svg', { class: 'hd3', viewBox: `0 0 ${G.vbW} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
      const defs = el('defs', {}, svg);
      // Fade the wrists out under the keyboard.
      const grad = el('linearGradient', { id: `${id}-g`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: G.vbH - 10, x2: 0, y2: H }, defs);
      el('stop', { offset: 0, 'stop-color': '#fff' }, grad);
      el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, grad);
      const fade = el('mask', { id: `${id}-f`, maskUnits: 'userSpaceOnUse', x: -60, y: -60, width: G.vbW + 120, height: H + 120 }, defs);
      el('rect', { x: -60, y: -60, width: G.vbW + 120, height: H + 120, fill: `url(#${id}-g)` }, fade);
      // The drawing is used as a mask over a flat rectangle in the theme's ink colour.
      const art = el('mask', { id: `${id}-a`, maskUnits: 'userSpaceOnUse', x: -60, y: -60, width: G.vbW + 120, height: H + 120 }, defs);
      for (const Hd of G.hands) {
        const w = IMG.w * Hd.s, h = IMG.h * Hd.s * Hd.sy;
        const tr = Hd.right
          ? `translate(${f1(Hd.origin[0])} ${f1(Hd.origin[1])}) scale(-1 1)`
          : `translate(${f1(Hd.origin[0])} ${f1(Hd.origin[1])})`;
        el('image', { href: IMG.src, x: 0, y: 0, width: f1(w), height: f1(h), transform: tr, preserveAspectRatio: 'none' }, art);
      }
      const body = el('g', { class: 'hd3-body', mask: `url(#${id}-f)` }, svg);
      el('rect', { class: 'hd3-ink', x: -60, y: -60, width: G.vbW + 120, height: H + 120, mask: `url(#${id}-a)` }, body);

      // Ghost fingers, one per finger, hidden until needed.
      const marks = el('g', { class: 'hd3-marks' }, svg);
      ghosts = {};
      for (const Hd of G.hands) {
        for (const [f, F] of Object.entries(Hd.fingers)) {
          const wdt = (F.n === 4 ? 0.62 : F.n === 0 ? 0.48 : 0.55) * G.p;
          const g = el('g', { class: 'hd3-ghost', 'data-finger': f }, marks);
          const shaft = el('line', { class: 'hd3-shaft', 'stroke-width': f1(wdt), 'stroke-linecap': 'round' }, g);
          const tip = el('circle', { class: 'hd3-tip', r: f1(wdt / 2) }, g);
          const ring = el('circle', { class: 'hd3-ring', r: f1(wdt / 2 + 3.5) }, g);
          ghosts[f] = { F, Hd, wdt, g, shaft, tip, ring };
        }
      }
      kb.root.appendChild(svg);
      pose();
    }

    function pose() {
      if (!svg || !G || !ghosts) return;
      const L = kb.layout;
      const now = strokes && strokes[0] ? reachesFor(L, strokes[0]) : [];
      const after = strokes && strokes[1] ? reachesFor(L, strokes[1]) : [];
      const want = new Map(now.map((r) => [String(r.finger), r.code]));
      const nextF = new Set(after.map((r) => String(r.finger)).filter((f) => !want.has(f)));
      for (const [f, Gh] of Object.entries(ghosts)) {
        const code = want.get(f);
        Gh.g.classList.toggle('is-active', !!code);
        Gh.g.classList.toggle('is-after', nextF.has(f));
        const rest = Gh.F.tip;
        let tip = rest;
        if (code) tip = touchPoint(kb, G, code, rest) || rest;
        const far = Math.hypot(tip[0] - rest[0], tip[1] - rest[1]) > 0.35 * G.p;
        // From the knuckle (below the rest fingertip) to the key; a home key just lights the fingertip.
        const base = Gh.F.n === 4 ? tip : [rest[0], rest[1] + KNUCKLE_DROP * G.p];
        if (far && Gh.F.n !== 4) {
          Gh.shaft.setAttribute('x1', f1(base[0])); Gh.shaft.setAttribute('y1', f1(base[1]));
          Gh.shaft.setAttribute('x2', f1(tip[0])); Gh.shaft.setAttribute('y2', f1(tip[1]));
          Gh.shaft.style.display = '';
        } else {
          Gh.shaft.style.display = 'none';
        }
        for (const c of [Gh.tip, Gh.ring]) { c.setAttribute('cx', f1(tip[0])); c.setAttribute('cy', f1(tip[1])); }
      }
    }

    kb.highlight = function (input) {
      const r = orig.highlight.call(this, input);
      strokes = toStrokes(input);
      if (!strokes.length) strokes = null;
      pose();
      return r;
    };
    kb.clear = function () {
      const r = orig.clear.call(this);
      strokes = null;
      pose();
      return r;
    };
    kb.setLayout = function (next) {
      const r = orig.setLayout.call(this, next);
      build();
      return r;
    };
    kb.refreshHands = function () {
      const r = orig.refreshHands.call(this);
      if (!svg || !svg.isConnected || !Keyboard.handsOn()) build();
      return r;
    };
    let raf = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!enabled || !Keyboard.handsOn()) return;
        const g = measure(kb);
        if (g && (!svg || !svg.isConnected || Math.abs(g.p - G.p) > 0.01)) build();
      });
    }) : null;
    if (ro) ro.observe(kb.root);
    build();

    return {
      setOpacity(v) {
        opacity = Math.max(0, Math.min(1, Number(v) || 0));
        kb.root.style.setProperty('--hd3-op', String(opacity));
      },
      setEnabled(on) { enabled = !!on; build(); },
      refresh: build,
    };
  }

  return { attach };
})();

if (typeof window !== 'undefined') window.Hands3 = Hands3;
