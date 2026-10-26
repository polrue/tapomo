// Lab proposal: «Silueta» hands for the lesson keyboard (pending Pol's OK, not in ui/ yet).
// Two translucent single-colour hand silhouettes laid OVER the on-screen keyboard (keyboard.js),
// fingertips resting on the home row and thumbs on the space bar. When the keyboard lights the next
// key, the finger that presses it reaches there from its knuckle (the hand follows a little for far
// keys) and the other fingers ride along; on the next key it goes back to rest.
//
// It never edits keyboard.js: Hands2.attach(kb) wraps the instance's highlight/clear/setLayout/
// refreshHands and reads the key positions from the keyboard's own SVG (getBBox of each key, i.e.
// keyboard viewBox units), so it scales with the keyboard at any width. Finger per key comes from
// the layout data (key.finger) with the same Shift / AltGr / Space rules as keyboard.js.
const Hands2 = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = (n) => Math.round(n * 100) / 100;

  // ---------- Hand model ----------
  // Left hand seen from above, in "keyboard px at a 40 px key pitch", origin = centre of the left
  // index home key (F), y grows downwards. The right hand is the mirror image anchored on J. Rest
  // fingertips are not here: they are measured from the home keys (A S D F / J K L Ñ) at run time.
  // Proportions follow a real hand: fingers about as long as the palm is wide / 1.7, the middle one
  // longest, the pinky clearly shorter; knuckles fan narrower (~34 px) than the keys (40 px).
  const KNUCKLE = { 3: [-6, 68], 2: [-41, 72], 1: [-74, 68], 0: [-103, 58] }; // index, middle, ring, pinky
  const WIDTH = { 3: [21, 18], 2: [22, 18.5], 1: [20.5, 17.5], 0: [18, 15], 4: [27, 22] }; // [base, tip]
  const THUMB_PIVOT = [2, 146]; // the thumb turns from its base, low on the inner side of the palm
  const THUMB_REST_X = 24; // thumb tip on the space bar, just inside the index finger
  // Back of the hand + wrist (closed Catmull-Rom curve). The top edge runs a little above the
  // knuckles so the fingers part there, like the webbing of a real hand.
  const PALM = [
    [-113, 66], [-108, 52], [-96, 50], [-88, 60], [-80, 58], [-68, 58], [-58, 64], [-48, 61],
    [-34, 61], [-24, 64], [-14, 58], [2, 58], [11, 68], [14, 90], [17, 112], [14, 136], [5, 160],
    [-2, 200], [-4, 250], [-86, 250], [-90, 200], [-100, 160], [-111, 122], [-117, 90],
  ];
  // Space under the keyboard where the hands fade out (keyboard px).
  const EXTRA = 46;
  // How far a finger bends or stretches before the whole hand moves instead.
  const SWING = 22; // degrees either side of its rest direction
  const STRETCH = [0.74, 1.55]; // x rest length

  /** Closed smooth path through points (Catmull-Rom -> cubic Bézier). */
  function smoothClosed(pts) {
    const n = pts.length;
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${p2[0]} ${p2[1]}`;
    }
    return d + 'Z';
  }

  /** Finger in a unit-length frame (y from 0 at the knuckle to -1 at the fingertip centre), running
   * a little into the palm. A plain taper: CSS scaleY(length) stretches it without changing its
   * width; the round fingertip is a separate shape that only moves. */
  function shaftPath(wb, wt) {
    const hb = wb / 2, ht = wt / 2;
    return `M${-hb} 0.25 L${-hb} 0 L${-ht} -1 L${ht} -1 L${hb} 0 L${hb} 0.25 Z`;
  }

  // ---------- Geometry from the rendered keyboard ----------

  /** Key rectangle in keyboard viewBox units (null if not drawn / not laid out yet). */
  function keyBox(kb, code) {
    const lip = kb.svg && kb.svg.querySelector(`.kb-key[data-code="${code}"] .kb-lip`);
    if (!lip) return null;
    const b = lip.getBBox();
    if (!b.width) return null;
    return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }

  /** The home key of each finger (bump key for the index fingers), from the layout data. */
  function homeCode(L, finger) {
    const keys = L.rows.flat().filter((k) => !k.mod && k.home && k.finger === finger);
    return (keys.find((k) => k.bump) || keys[0] || {}).code;
  }

  function measure(kb) {
    const L = kb.layout;
    const box = {};
    for (const f of [0, 1, 2, 3, 6, 7, 8, 9]) {
      box[f] = keyBox(kb, homeCode(L, f));
      if (!box[f]) return null;
    }
    const space = keyBox(kb, 'Space');
    if (!space) return null;
    const p = Math.abs(box[3].cx - box[2].cx); // key pitch in viewBox units
    const sc = p / 40;
    const vb = kb.svg.viewBox.baseVal;
    const hands = [false, true].map((right) => {
      const A = right ? box[6] : box[3];
      const sx = right ? -sc : sc;
      const toLocal = (gx, gy) => [(gx - A.cx) / sx, (gy - A.cy) / sc];
      const fingers = {};
      for (const n of [0, 1, 2, 3]) {
        const f = right ? 9 - n : n;
        const K = KNUCKLE[n];
        const T = toLocal(box[f].cx, box[f].cy);
        fingers[f] = { n, K, T, len: Math.hypot(T[0] - K[0], T[1] - K[1]), a0: angle(T[0] - K[0], T[1] - K[1]), w: WIDTH[n] };
      }
      const tf = right ? 5 : 4;
      const T = [THUMB_REST_X, (space.cy - A.cy) / sc];
      fingers[tf] = { n: 4, K: THUMB_PIVOT, T, len: Math.hypot(T[0] - THUMB_PIVOT[0], T[1] - THUMB_PIVOT[1]), a0: angle(T[0] - THUMB_PIVOT[0], T[1] - THUMB_PIVOT[1]), w: WIDTH[4], thumb: true };
      return { right, A, sx, sc, toLocal, fingers };
    });
    return { p, sc, vbW: vb.width, vbH: vb.height, hands };
  }

  /** Where a finger should touch a key: the point of the key nearest its rest spot (wide keys like
   * Shift or Space are touched at their near end, 1u keys at the centre). ISO Enter: its lower part. */
  function touchPoint(kb, G, code, restGlobal) {
    const k = kb.layout.byCode.get(code);
    let b = keyBox(kb, code);
    if (!b) return null;
    if (k && k.iso) b = { x0: b.x1 - 1.25 * G.p, x1: b.x1, y0: b.cy, y1: b.y1, cy: (b.cy + b.y1) / 2 };
    const inset = 0.45 * G.p;
    const lo = b.x0 + inset, hi = b.x1 - inset;
    const x = lo <= hi ? clamp(restGlobal[0], lo, hi) : (b.x0 + b.x1) / 2;
    return [x, b.cy];
  }

  // ---------- Finger choice (same rules as keyboard.js) ----------

  const shiftFor = (L, code) => {
    const k = L.byCode.get(code);
    return k && k.finger <= 4 ? 'ShiftRight' : 'ShiftLeft';
  };
  /** [{ finger, code }] for one stroke: the key's finger, the Shift on the other hand, AltGr with the
   * right thumb, and the space with both thumbs. */
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

  // ---------- Pose ----------

  /** Rest + reaches -> per hand { shift: [x, y], fingers: { f: { a, len } } } in hand-local units.
   * The main finger points at its key; if that needs more bend or stretch than a real finger has,
   * the whole hand slides the rest of the way (so far keys move the hand, near keys only the finger).
   * The other fingers keep their rest pose and ride along with the hand. */
  function solve(kb, G, reaches) {
    const poses = G.hands.map((H) => {
      const fingers = {};
      for (const [f, F] of Object.entries(H.fingers)) fingers[f] = { a: F.a0, len: F.len };
      return { shift: [0, 0], fingers };
    });
    G.hands.forEach((H, hi) => {
      const mine = reaches.filter((r) => H.fingers[r.finger]);
      if (!mine.length) return;
      const pose = poses[hi];
      mine.forEach((r, i) => {
        const F = H.fingers[r.finger];
        const restG = [H.A.cx + F.T[0] * H.sx, H.A.cy + F.T[1] * H.sc];
        const pg = touchPoint(kb, G, r.code, restG);
        if (!pg) return;
        const P = H.toLocal(pg[0], pg[1]);
        const first = i === 0;
        if (first) {
          // Sideways the hand slides (about half the way); up it follows a little for far rows;
          // down it hardly moves, the finger curls instead.
          const D = [P[0] - F.T[0], P[1] - F.T[1]];
          const up = clamp((-D[1] - 45) / 40, 0, 1);
          pose.shift = [D[0] * (F.thumb ? 0.7 : F.n === 0 ? 0.68 : 0.5), D[1] < 0 ? D[1] * 0.15 * up : D[1] * 0.1];
        }
        const V = [P[0] - F.K[0] - pose.shift[0], P[1] - F.K[1] - pose.shift[1]];
        const swing = first ? SWING : SWING * 1.6;
        const a = F.a0 + clamp(wrap(angle(V[0], V[1]) - F.a0), -swing, swing);
        // Seen from above, a finger that curls towards the palm gets much shorter.
        const curl = P[1] > F.T[1] + 4 ? STRETCH[0] * 0.62 : STRETCH[0];
        const len = clamp(Math.hypot(V[0], V[1]), F.len * curl, F.len * (first ? STRETCH[1] : 1.6));
        if (first) {
          const rad = (a * Math.PI) / 180;
          const W = [Math.sin(rad) * len, -Math.cos(rad) * len];
          pose.shift = [pose.shift[0] + V[0] - W[0], pose.shift[1] + V[1] - W[1]];
        }
        pose.fingers[r.finger] = { a, len };
      });
    });
    return poses;
  }
  const wrap = (d) => ((d + 540) % 360) - 180;
  /** Rotation (deg, clockwise) that turns "straight up" into the vector (vx, vy). */
  const angle = (vx, vy) => (Math.atan2(vx, -vy) * 180) / Math.PI;

  // ---------- Overlay ----------

  let uid = 0;

  /**
   * Lays the silhouette hands over a Keyboard.render() instance.
   * opts: { opacity (0..1, default 0.24), enabled (default true) }.
   * Returns { setOpacity(v), setEnabled(on), refresh(), destroy() }.
   */
  function attach(kb, opts = {}) {
    const id = `hd2-${++uid}`;
    let enabled = opts.enabled !== false;
    let opacity = opts.opacity == null ? 0.24 : opts.opacity;
    let strokes = null; // what the keyboard is showing now
    let svg = null, G = null, rigs = null;

    const orig = { highlight: kb.highlight, clear: kb.clear, setLayout: kb.setLayout, refreshHands: kb.refreshHands, flash: kb.flash };

    const toStrokes = (input) => {
      if (typeof input === 'string') return input ? Keyboard.strokesFor(kb.layout, [...input][0]) : [];
      if (input && !Array.isArray(input)) return [input];
      return input || [];
    };

    function build() {
      if (svg) svg.remove();
      svg = null;
      rigs = null;
      kb.root.classList.toggle('hd2-on', false);
      if (!enabled || !Keyboard.handsOn()) return;
      G = measure(kb);
      if (!G) return; // not laid out yet (hidden): the ResizeObserver tries again
      const H = G.vbH + EXTRA;
      kb.root.classList.add('hd2-on');
      kb.root.style.setProperty('--hd2-extra', `${(EXTRA / G.vbW) * 100}%`);
      kb.root.style.setProperty('--hd2-op', String(opacity));
      svg = el('svg', { class: 'hd2', viewBox: `0 0 ${G.vbW} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
      const defs = el('defs', {}, svg);
      const grad = el('linearGradient', { id: `${id}-g`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: G.vbH - 4, x2: 0, y2: H - 2 }, defs);
      el('stop', { offset: 0, 'stop-color': '#fff' }, grad);
      el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }, grad);
      const mask = el('mask', { id: `${id}-m`, maskUnits: 'userSpaceOnUse', x: -50, y: -50, width: G.vbW + 100, height: H + 100 }, defs);
      el('rect', { x: -50, y: -50, width: G.vbW + 100, height: H + 100, fill: `url(#${id}-g)` }, mask);

      // Two layers with the same rig: the silhouette (one group opacity, so overlaps never darken)
      // and the marks on top (active finger tint + fingertip ring), which must not be dimmed by it.
      const body = el('g', { class: 'hd2-body', mask: `url(#${id}-m)` }, svg);
      const marks = el('g', { class: 'hd2-marks' }, svg);
      rigs = G.hands.map((Hd) => {
        const tr = `translate(${f1(Hd.A.cx)} ${f1(Hd.A.cy)}) scale(${f1(Hd.sx)} ${f1(Hd.sc)})`;
        const hb = el('g', { class: 'hd2-hand', transform: tr }, body);
        const hm = el('g', { class: 'hd2-hand', transform: tr }, marks);
        const sb = el('g', { class: 'hd2-shift' }, hb);
        const sm = el('g', { class: 'hd2-shift' }, hm);
        const fingers = {};
        // Thumb first (under the palm), then the palm, then the four fingers on top of it.
        const order = Object.keys(Hd.fingers).sort((a, b) => (Hd.fingers[b].thumb ? 1 : 0) - (Hd.fingers[a].thumb ? 1 : 0));
        const mk = (f) => {
          const F = Hd.fingers[f];
          const [wb, wt] = F.w;
          const d = shaftPath(wb, wt);
          const tipR = [wt / 2, (wt / 2) * 1.15];
          const parts = [];
          for (const [layer, isMark] of [[sb, false], [sm, true]]) {
            const g = el('g', { class: `hd2-fin${isMark ? ' hd2-mfin' : ''}`, 'data-finger': f }, layer);
            // The thumb's shaft runs under the palm, so only its tip gets the tint.
            const shaft = el('path', { class: isMark ? (F.thumb ? 'hd2-none' : 'hd2-tint') : 'hd2-skin', d }, g);
            const tip = el('g', { class: 'hd2-tipg' }, g);
            el('ellipse', { class: isMark ? 'hd2-tint' : 'hd2-skin', cx: 0, cy: 0, rx: tipR[0], ry: tipR[1] }, tip);
            if (isMark) el('circle', { class: 'hd2-ring', cx: 0, cy: 0, r: wt / 2 + 4.5 }, tip);
            parts.push({ g, shaft, tip });
          }
          fingers[f] = { F, parts };
        };
        order.filter((f) => Hd.fingers[f].thumb).forEach(mk);
        el('path', { class: 'hd2-skin hd2-palm', d: smoothClosed(PALM) }, sb);
        order.filter((f) => !Hd.fingers[f].thumb).forEach(mk);
        return { Hd, shifts: [sb, sm], fingers };
      });
      // First pose without a tween (so the hands don't fly in from the corner).
      svg.classList.add('hd2-still');
      kb.root.appendChild(svg);
      pose();
      requestAnimationFrame(() => requestAnimationFrame(() => svg && svg.classList.remove('hd2-still')));
    }

    function pose() {
      if (!svg || !G) return;
      const L = kb.layout;
      const now = strokes && strokes[0] ? reachesFor(L, strokes[0]) : [];
      const after = strokes && strokes[1] ? reachesFor(L, strokes[1]) : [];
      const poses = solve(kb, G, now);
      const active = new Set(now.map((r) => String(r.finger)));
      const next = new Set(after.map((r) => String(r.finger)).filter((f) => !active.has(f)));
      rigs.forEach((rig, hi) => {
        const P = poses[hi];
        const st = `translate(${f1(P.shift[0])}px, ${f1(P.shift[1])}px)`;
        rig.shifts.forEach((s) => { s.style.transform = st; });
        for (const [f, R] of Object.entries(rig.fingers)) {
          const { a, len } = P.fingers[f];
          for (const part of R.parts) {
            part.g.style.transform = `translate(${f1(R.F.K[0])}px, ${f1(R.F.K[1])}px) rotate(${f1(a)}deg)`;
            part.shaft.style.transform = `scale(1, ${f1(len)})`;
            part.tip.style.transform = `translate(0px, ${f1(-len)}px)`;
            part.g.classList.toggle('is-active', active.has(f));
            part.g.classList.toggle('is-after', next.has(f));
          }
        }
      });
    }

    // ---- wrap the keyboard instance (keyboard.js itself stays untouched)
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
      const r = orig.setLayout.call(this, next); // remounts the keyboard: rebuild on the new keys
      build();
      return r;
    };
    kb.refreshHands = function () {
      const r = orig.refreshHands.call(this);
      if (!svg || !svg.isConnected || !Keyboard.handsOn()) build();
      return r;
    };

    // Re-measure when the keyboard changes size (e.g. it was hidden, or the layout reflowed).
    let raf = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!enabled || !Keyboard.handsOn()) return;
        const g = measure(kb);
        if (!g) return;
        if (!svg || !svg.isConnected || Math.abs(g.p - G.p) > 0.01) build();
      });
    }) : null;
    if (ro) ro.observe(kb.root);

    build();

    return {
      setOpacity(v) {
        opacity = clamp(Number(v) || 0, 0, 1);
        kb.root.style.setProperty('--hd2-op', String(opacity));
      },
      setEnabled(on) {
        enabled = !!on;
        build();
      },
      refresh: build,
      destroy() {
        if (ro) ro.disconnect();
        Object.assign(kb, orig);
        enabled = false;
        build();
      },
    };
  }

  return { attach, reachesFor };
})();

if (typeof window !== 'undefined') window.Hands2 = Hands2;
