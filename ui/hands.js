// Hands over the lesson keyboard. A drawn, translucent pair (hand-left.png, mirrored for the right hand) rests on the home row. The
// drawing is cut into a palm and five fingers: for each key the finger to use takes a colour and bends
// towards the key, and the hand moves part of the way when the key is far (the space bar presses both
// thumbs).
//
// Keyboard.render attaches it to every keyboard: it wraps the instance (highlight/clear/setLayout/
// refreshHands/destroy) and reads the key boxes from the keyboard's own SVG, so it scales with it.
const Hands = (() => {
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
      return { right, dir, s, sy, origin: at([0, 0]), at, fingers };
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

  // The drawing cut into a palm and five fingers (image px, left hand). Each finger piece runs a
  // little below its knuckle line so the palm never shows a seam when the finger bends.
  const PIECES = {
    palm: [[-10, 238], [110, 228], [172, 232], [255, 236], [340, 264], [338, 352], [392, 452], [520, 340], [520, 690], [-10, 690]],
    0: [[-10, -10], [140, -10], [132, 50], [120, 125], [108, 175], [110, 228], [110, 242], [-10, 252]],
    1: [[140, -10], [228, -10], [222, 45], [198, 100], [190, 150], [185, 195], [172, 232], [172, 246], [110, 242], [110, 228], [108, 175], [120, 125], [132, 50]],
    2: [[228, -10], [320, -10], [322, 40], [305, 100], [288, 150], [272, 200], [262, 222], [255, 236], [255, 250], [172, 246], [172, 232], [185, 195], [190, 150], [198, 100], [222, 45]],
    3: [[320, -10], [430, -10], [430, 220], [370, 250], [340, 264], [342, 278], [255, 250], [255, 236], [262, 222], [272, 200], [288, 150], [305, 100], [322, 40]],
    4: [[338, 352], [346, 300], [370, 262], [430, 220], [520, 220], [520, 340], [392, 452], [380, 460], [326, 356]],
  };
  // Where each finger bends (image px): the middle of its knuckle line.
  const PIVOTS = { 0: [62, 236], 1: [141, 236], 2: [214, 240], 3: [296, 250], 4: [362, 404] };
  const MOVE = 0.17; // seconds; keep under the player's fastest step

  let uid = 0;
  function attach(kb) {
    const id = `kh-${++uid}`;
    let strokes = null;
    let svg = null, G = null, parts = null;
    const orig = { highlight: kb.highlight, clear: kb.clear, setLayout: kb.setLayout, refreshHands: kb.refreshHands, destroy: kb.destroy };
    const toStrokes = (input) => {
      if (typeof input === 'string') return input ? Keyboard.strokesFor(kb.layout, [...input][0]) : [];
      if (input && !Array.isArray(input)) return [input];
      return input || [];
    };

    function build() {
      if (svg) svg.remove();
      svg = null;
      parts = null;
      kb.root.classList.remove('kh-on');
      if (!Keyboard.handsOn()) return;
      G = measure(kb);
      if (!G) return;
      const H = G.vbH + EXTRA;
      kb.root.classList.add('kh-on');
      kb.root.style.setProperty('--kh-extra', `${(EXTRA / G.vbW) * 100}%`);
      kb.root.style.setProperty('--kh-move', `${MOVE}s`);
      svg = el('svg', { class: 'kh', viewBox: `0 0 ${G.vbW} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
      const defs = el('defs', {}, svg);
      // Fade the wrists out under the keyboard.
      const grad = el('linearGradient', { id: `${id}-g`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: G.vbH - 10, x2: 0, y2: H }, defs);
      el('stop', { offset: 0, 'stop-color': '#fff' }, grad);
      el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, grad);
      const box = { x: -200, y: -200, width: G.vbW + 400, height: H + 400 };
      const fade = el('mask', { id: `${id}-f`, maskUnits: 'userSpaceOnUse', ...box }, defs);
      el('rect', { ...box, fill: `url(#${id}-g)` }, fade);
      for (const [k, pts] of Object.entries(PIECES)) {
        const cp = el('clipPath', { id: `${id}-c${k}`, clipPathUnits: 'userSpaceOnUse' }, defs);
        el('polygon', { points: pts.map((p) => p.join(',')).join(' ') }, cp);
      }
      // One mask per hand and piece: the drawing, clipped to the piece, used over a flat rectangle in
      // the theme's ink (or the finger's colour). The rectangles carry the movement, so the masks
      // move with them.
      const maskOf = (Hd, k) => {
        const m = el('mask', { id: `${id}-m${Hd.right ? 'r' : 'l'}${k}`, maskUnits: 'userSpaceOnUse', ...box }, defs);
        const g = el('g', { transform: `translate(${f1(Hd.origin[0])} ${f1(Hd.origin[1])}) scale(${f1(Hd.dir * Hd.s * 1e4) / 1e4} ${f1(Hd.s * Hd.sy * 1e4) / 1e4})` }, m);
        el('image', { href: IMG.src, x: 0, y: 0, width: IMG.w, height: IMG.h, preserveAspectRatio: 'none', 'clip-path': `url(#${id}-c${k})` }, g);
        return `url(#${m.id})`;
      };
      const body = el('g', { class: 'kh-body' }, svg);
      const glow = el('g', { class: 'kh-glow' }, svg);
      parts = {};
      for (const Hd of G.hands) {
        const hand = el('g', { class: 'kh-hand' }, body);
        // the wrist fade travels with the hand, so a raised hand never shows the drawing's cut edge
        const faded = el('g', { mask: `url(#${id}-f)` }, hand);
        const glowHand = el('g', { class: 'kh-hand' }, glow);
        el('rect', { class: 'kh-ink', ...box, mask: maskOf(Hd, 'palm') }, faded);
        const fingers = {};
        for (const [f, F] of Object.entries(Hd.fingers)) {
          const mask = maskOf(Hd, F.n);
          const ink = el('g', { class: 'kh-finger' }, faded);
          el('rect', { class: 'kh-ink', ...box, mask }, ink);
          const lit = el('g', { class: `kh-finger kh-lit kb-f${f}` }, glowHand);
          // Only the end of the finger takes the colour, fading out towards the knuckle.
          const pivot = Hd.at(PIVOTS[F.n]);
          const gr = el('linearGradient', { id: `${id}-t${f}`, gradientUnits: 'userSpaceOnUse',
            x1: f1(F.tip[0]), y1: f1(F.tip[1]), x2: f1(pivot[0]), y2: f1(pivot[1]) }, lit);
          for (const [o, a] of [[0, 1], [F.n === 4 ? 0.45 : 0.32, 1], [F.n === 4 ? 0.8 : 0.58, 0]]) el('stop', { offset: o, 'stop-opacity': a }, gr);
          el('rect', { ...box, mask, fill: `url(#${gr.id})` }, lit);
          fingers[f] = { F, ink, lit, pivot };
        }
        parts[Hd.right ? 'r' : 'l'] = { Hd, hand, glowHand, fingers };
      }
      kb.root.appendChild(svg);
      pose();
    }

    /** Matrix that bends a finger about its knuckle so its tip goes from rest to want (both relative to the knuckle). */
    function bend(P, v0, v1) {
      const l0 = Math.hypot(v0[0], v0[1]), l1 = Math.hypot(v1[0], v1[1]);
      const k = l1 / l0, ux = v0[0] / l0, uy = v0[1] / l0;
      // stretch along the finger, then turn
      const s = [1 + (k - 1) * ux * ux, (k - 1) * ux * uy, (k - 1) * ux * uy, 1 + (k - 1) * uy * uy];
      const th = Math.atan2(v1[1], v1[0]) - Math.atan2(v0[1], v0[0]);
      const c = Math.cos(th), si = Math.sin(th);
      const a = c * s[0] - si * s[2], b = si * s[0] + c * s[2];
      const cc = c * s[1] - si * s[3], d = si * s[1] + c * s[3];
      const e = P[0] - (a * P[0] + cc * P[1]), f = P[1] - (b * P[0] + d * P[1]);
      return `matrix(${[a, b, cc, d, e, f].map((n) => Math.round(n * 1e4) / 1e4).join(',')})`;
    }

    function pose() {
      if (!svg || !G || !parts) return;
      const L = kb.layout;
      const now = strokes && strokes[0] ? reachesFor(L, strokes[0]) : [];
      const after = strokes && strokes[1] ? reachesFor(L, strokes[1]) : [];
      const want = new Map(now.map((r) => [String(r.finger), r.code]));
      const nextF = new Set(after.map((r) => String(r.finger)).filter((f) => !want.has(f)));
      for (const side of Object.values(parts)) {
        // Each hand follows the first of its fingers that has to leave the home row: the hand moves
        // part of the way and the finger bends/stretches the rest, within what a finger can do.
        let shift = [0, 0];
        const targets = {};
        for (const [f, Fp] of Object.entries(side.fingers)) {
          const code = want.get(f);
          if (code) targets[f] = touchPoint(kb, G, code, Fp.F.tip) || Fp.F.tip;
        }
        const lead = Object.keys(targets).find((f) => side.fingers[f].F.n !== 4 && Math.hypot(targets[f][0] - side.fingers[f].F.tip[0], targets[f][1] - side.fingers[f].F.tip[1]) > 0.3 * G.p);
        if (lead) {
          const Fp = side.fingers[lead], T = targets[lead], R = Fp.F.tip, P = Fp.pivot;
          const d = [T[0] - R[0], T[1] - R[1]];
          const l0 = Math.hypot(R[0] - P[0], R[1] - P[1]);
          const a0 = Math.atan2(R[1] - P[1], R[0] - P[0]);
          for (let a = 0.5; a <= 0.9001; a += 0.05) {
            shift = [d[0] * a, d[1] * a];
            const v = [T[0] - shift[0] - P[0], T[1] - shift[1] - P[1]];
            const k = Math.hypot(v[0], v[1]) / l0;
            let turn = Math.abs(Math.atan2(v[1], v[0]) - a0);
            if (turn > Math.PI) turn = 2 * Math.PI - turn;
            if (k <= 1.15 && k >= 0.85 && turn <= 0.26) break;
          }
        }
        const hs = `translate(${f1(shift[0])}px, ${f1(shift[1])}px)`;
        side.hand.style.transform = hs;
        side.glowHand.style.transform = hs;
        for (const [f, Fp] of Object.entries(side.fingers)) {
          const T = targets[f];
          let m = 'none';
          if (T && Fp.F.n !== 4) {
            const P = Fp.pivot, R = Fp.F.tip;
            const v1 = [T[0] - shift[0] - P[0], T[1] - shift[1] - P[1]];
            if (Math.hypot(v1[0] - (R[0] - P[0]), v1[1] - (R[1] - P[1])) > 0.5) m = bend(P, [R[0] - P[0], R[1] - P[1]], v1);
          } else if (T) {
            // thumb on the space bar: a small press
            const P = Fp.pivot, R = Fp.F.tip;
            m = bend(P, [R[0] - P[0], R[1] - P[1]], [(R[0] - P[0]) * 0.97, (R[1] - P[1]) * 0.97 + 0.06 * G.p]);
          }
          Fp.ink.style.transform = m;
          Fp.lit.style.transform = m;
          Fp.lit.classList.toggle('is-active', !!T);
          Fp.lit.classList.toggle('is-after', nextF.has(f));
        }
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
        if (!Keyboard.handsOn()) return;
        const g = measure(kb);
        if (g && (!svg || !svg.isConnected || Math.abs(g.p - G.p) > 0.01)) build();
      });
    }) : null;
    if (ro) ro.observe(kb.root);
    build();

    kb.destroy = function () {
      if (ro) ro.disconnect();
      return orig.destroy.call(this);
    };
  }

  return { attach };
})();

if (typeof window !== 'undefined') window.Hands = Hands;
