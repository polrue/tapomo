// On-screen keyboard for the typing lessons: physical layouts, a char -> keystroke map and an SVG
// renderer that lights up the next key. Decorative help only: the lesson text is the real content.
//
// Key units: 1u = one letter key. Every row of the main block is 15u wide. Each key carries
//   { code, label, shift, altgr?, w, finger, home, bump?, dead?, x, y }
// finger: 0 left pinky, 1 left ring, 2 left middle, 3 left index, 4 left thumb,
//         5 right thumb, 6 right index, 7 right middle, 8 right ring, 9 right pinky.
// dead: { label?, shift?, altgr? } marks which of the key's levels is a dead key.
const Keyboard = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- Layout data ----------

  /** One printable key. `extra` can add altgr, w, dead, home, bump. */
  const key = (code, label, shift, finger, extra = {}) => ({ code, label, shift, finger, w: 1, home: false, ...extra });
  /** One modifier/control key: `label` is a short name, `icon` an icon id (see ICONS). */
  const mod = (code, label, w, finger, extra = {}) => ({ code, label, shift: null, w, finger, home: false, mod: true, ...extra });
  /** Letter key: shifted is the uppercase letter. */
  const letter = (ch, finger, extra = {}) =>
    key(`Key${ch.toUpperCase()}`, ch, ch.toUpperCase(), finger, extra);
  const HOME = { home: true };
  const BUMP = { home: true, bump: true };

  const digits = (shifts, altgrs = {}) =>
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
      const d = (i + 1) % 10; // 1..9, 0
      const finger = [0, 1, 2, 3, 3, 6, 6, 7, 8, 9][i];
      return key(`Digit${d}`, String(d), shifts[i], finger, altgrs[d] ? { altgr: altgrs[d] } : {});
    });

  const letterRows = {
    top: [['q', 0], ['w', 1], ['e', 2], ['r', 3], ['t', 3], ['y', 6], ['u', 6], ['i', 7], ['o', 8], ['p', 9]],
    home: [['a', 0], ['s', 1], ['d', 2], ['f', 3], ['g', 3], ['h', 6], ['j', 6], ['k', 7], ['l', 8]],
    bottom: [['z', 0], ['x', 1], ['c', 2], ['v', 3], ['b', 3], ['n', 6], ['m', 6]],
  };
  const homeLetter = ([ch, f]) => letter(ch, f, ch === 'f' || ch === 'j' ? BUMP : ch === 'g' || ch === 'h' ? {} : HOME);

  const ES = {
    id: 'es',
    name: 'Español (ISO)',
    rows: [
      [
        key('Backquote', 'º', 'ª', 0, { altgr: '\\' }),
        ...digits(['!', '"', '·', '$', '%', '&', '/', '(', ')', '='], {
          1: '|', 2: '@', 3: '#', 4: '~', 6: '¬',
        }),
        key('Minus', "'", '?', 9),
        key('Equal', '¡', '¿', 9),
        mod('Backspace', '', 2, 9, { icon: 'backspace' }),
      ].map((k) => (k.code === 'Digit4' ? { ...k, dead: { altgr: true } } : k)),
      [
        mod('Tab', '', 1.5, 0, { icon: 'tab' }),
        ...letterRows.top.map(([ch, f]) => letter(ch, f, ch === 'e' ? { altgr: '€' } : {})),
        key('BracketLeft', '`', '^', 9, { altgr: '[', dead: { label: true, shift: true } }),
        key('BracketRight', '+', '*', 9, { altgr: ']' }),
        mod('Enter', '', 1.5, 9, { icon: 'enter', iso: true }),
      ],
      [
        mod('CapsLock', '', 1.75, 0, { icon: 'caps' }),
        ...letterRows.home.map(homeLetter),
        key('Semicolon', 'ñ', 'Ñ', 9, HOME),
        key('Quote', '´', '¨', 9, { altgr: '{', dead: { label: true, shift: true } }),
        key('Backslash', 'ç', 'Ç', 9, { altgr: '}' }),
      ],
      [
        mod('ShiftLeft', '', 1.25, 0, { icon: 'shift' }),
        key('IntlBackslash', '<', '>', 0),
        ...letterRows.bottom.map(([ch, f]) => letter(ch, f)),
        key('Comma', ',', ';', 7),
        key('Period', '.', ':', 8),
        key('Slash', '-', '_', 9),
        mod('ShiftRight', '', 2.75, 9, { icon: 'shift' }),
      ],
      [
        mod('ControlLeft', 'Ctrl', 1.5, 0),
        mod('MetaLeft', '', 1.25, 4, { icon: 'win' }),
        mod('AltLeft', 'Alt', 1.5, 4),
        mod('Space', '', 7.25, 4),
        mod('AltRight', 'Alt Gr', 1.5, 5),
        mod('ControlRight', 'Ctrl', 2, 9),
      ],
    ],
  };

  const US = {
    id: 'us',
    name: 'English (US)',
    rows: [
      [
        key('Backquote', '`', '~', 0),
        ...digits(['!', '@', '#', '$', '%', '^', '&', '*', '(', ')']),
        key('Minus', '-', '_', 9),
        key('Equal', '=', '+', 9),
        mod('Backspace', '', 2, 9, { icon: 'backspace' }),
      ],
      [
        mod('Tab', '', 1.5, 0, { icon: 'tab' }),
        ...letterRows.top.map(([ch, f]) => letter(ch, f)),
        key('BracketLeft', '[', '{', 9),
        key('BracketRight', ']', '}', 9),
        key('Backslash', '\\', '|', 9, { w: 1.5 }),
      ],
      [
        mod('CapsLock', '', 1.75, 0, { icon: 'caps' }),
        ...letterRows.home.map(homeLetter),
        key('Semicolon', ';', ':', 9, HOME),
        key('Quote', "'", '"', 9),
        mod('Enter', '', 2.25, 9, { icon: 'enter' }),
      ],
      [
        mod('ShiftLeft', '', 2.25, 0, { icon: 'shift' }),
        ...letterRows.bottom.map(([ch, f]) => letter(ch, f)),
        key('Comma', ',', '<', 7),
        key('Period', '.', '>', 8),
        key('Slash', '/', '?', 9),
        mod('ShiftRight', '', 2.75, 9, { icon: 'shift' }),
      ],
      [
        mod('ControlLeft', 'Ctrl', 1.5, 0),
        mod('MetaLeft', '', 1.25, 4, { icon: 'win' }),
        mod('AltLeft', 'Alt', 1.5, 4),
        mod('Space', '', 7.25, 4),
        mod('AltRight', 'Alt', 1.5, 5),
        mod('ControlRight', 'Ctrl', 2, 9),
      ],
    ],
  };

  // AZERTY/QWERTZ move letters around: physical codes (KeyboardEvent.code) stay the US ones.
  const CODES = {
    top: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
    home: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
    bottom: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'],
  };
  /** Letters `chars` placed on the physical keys of `row`, with the US row's fingers. */
  const lettersOn = (row, chars, extra = () => ({})) =>
    [...chars].map((ch, i) => key(CODES[row][i], ch, ch.toUpperCase(), letterRows[row][i][1], {
      ...(row === 'home' ? (i === 3 || i === 6 ? BUMP : i === 4 || i === 5 ? {} : HOME) : {}),
      ...extra(ch),
    }));
  /** Number row from [label, shift, altgr?] for 1..9, 0. */
  const digitRow = (defs) =>
    defs.map(([label, shift, altgr], i) => {
      const d = (i + 1) % 10;
      const finger = [0, 1, 2, 3, 3, 6, 6, 7, 8, 9][i];
      return key(`Digit${d}`, label, shift, finger, altgr ? { altgr } : {});
    });
  const bottomMods = () => [
    mod('ControlLeft', 'Ctrl', 1.5, 0),
    mod('MetaLeft', '', 1.25, 4, { icon: 'win' }),
    mod('AltLeft', 'Alt', 1.5, 4),
    mod('Space', '', 7.25, 4),
    mod('AltRight', 'Alt Gr', 1.5, 5),
    mod('ControlRight', 'Ctrl', 2, 9),
  ];

  // French AZERTY (Windows, kbdfr): digits need Shift; ^ and ¨ are dead, as are AltGr ~ and `.
  const FR = {
    id: 'fr',
    name: 'Français (AZERTY)',
    rows: [
      [
        key('Backquote', '²', '', 0),
        ...digitRow([['&', '1'], ['é', '2', '~'], ['"', '3', '#'], ["'", '4', '{'], ['(', '5', '['],
          ['-', '6', '|'], ['è', '7', '`'], ['_', '8', '\\'], ['ç', '9', '^'], ['à', '0', '@']]),
        key('Minus', ')', '°', 9, { altgr: ']' }),
        key('Equal', '=', '+', 9, { altgr: '}' }),
        mod('Backspace', '', 2, 9, { icon: 'backspace' }),
      ].map((k) => (k.code === 'Digit2' || k.code === 'Digit7' ? { ...k, dead: { altgr: true } } : k)),
      [
        mod('Tab', '', 1.5, 0, { icon: 'tab' }),
        ...lettersOn('top', 'azertyuiop', (ch) => (ch === 'e' ? { altgr: '€' } : {})),
        key('BracketLeft', '^', '¨', 9, { dead: { label: true, shift: true } }),
        key('BracketRight', '$', '£', 9, { altgr: '¤' }),
        mod('Enter', '', 1.5, 9, { icon: 'enter', iso: true }),
      ],
      [
        mod('CapsLock', '', 1.75, 0, { icon: 'caps' }),
        ...lettersOn('home', 'qsdfghjkl'),
        key('Semicolon', 'm', 'M', 9, HOME),
        key('Quote', 'ù', '%', 9),
        key('Backslash', '*', 'µ', 9),
      ],
      [
        mod('ShiftLeft', '', 1.25, 0, { icon: 'shift' }),
        key('IntlBackslash', '<', '>', 0),
        ...lettersOn('bottom', 'wxcvbn'),
        key('KeyM', ',', '?', 6),
        key('Comma', ';', '.', 7),
        key('Period', ':', '/', 8),
        key('Slash', '!', '§', 9),
        mod('ShiftRight', '', 2.75, 9, { icon: 'shift' }),
      ],
      bottomMods(),
    ],
  };

  // German QWERTZ (Windows, kbdgr): ^ ´ ` are dead keys.
  const DE = {
    id: 'de',
    name: 'Deutsch (QWERTZ)',
    rows: [
      [
        key('Backquote', '^', '°', 0, { dead: { label: true } }),
        ...digitRow([['1', '!'], ['2', '"', '²'], ['3', '§', '³'], ['4', '$'], ['5', '%'],
          ['6', '&'], ['7', '/', '{'], ['8', '(', '['], ['9', ')', ']'], ['0', '=', '}']]),
        key('Minus', 'ß', '?', 9, { altgr: '\\' }),
        key('Equal', '´', '`', 9, { dead: { label: true, shift: true } }),
        mod('Backspace', '', 2, 9, { icon: 'backspace' }),
      ],
      [
        mod('Tab', '', 1.5, 0, { icon: 'tab' }),
        ...lettersOn('top', 'qwertzuiop', (ch) => (ch === 'q' ? { altgr: '@' } : ch === 'e' ? { altgr: '€' } : {})),
        key('BracketLeft', 'ü', 'Ü', 9),
        key('BracketRight', '+', '*', 9, { altgr: '~' }),
        mod('Enter', '', 1.5, 9, { icon: 'enter', iso: true }),
      ],
      [
        mod('CapsLock', '', 1.75, 0, { icon: 'caps' }),
        ...lettersOn('home', 'asdfghjkl'),
        key('Semicolon', 'ö', 'Ö', 9, HOME),
        key('Quote', 'ä', 'Ä', 9),
        key('Backslash', '#', "'", 9),
      ],
      [
        mod('ShiftLeft', '', 1.25, 0, { icon: 'shift' }),
        key('IntlBackslash', '<', '>', 0, { altgr: '|' }),
        ...lettersOn('bottom', 'yxcvbnm', (ch) => (ch === 'm' ? { altgr: 'µ' } : {})),
        key('Comma', ',', ';', 7),
        key('Period', '.', ':', 8),
        key('Slash', '-', '_', 9),
        mod('ShiftRight', '', 2.75, 9, { icon: 'shift' }),
      ],
      bottomMods(),
    ],
  };

  /** Fills in x/y (in key units) and a code -> key index. ISO Enter spans rows 1 and 2. */
  function finish(layout) {
    layout.byCode = new Map();
    layout.rows.forEach((row, y) => {
      let x = 0;
      for (const k of row) {
        k.x = x;
        k.y = y;
        x += k.w;
        layout.byCode.set(k.code, k);
      }
    });
    Object.defineProperty(layout, 'byCode', { enumerable: false });
    return Object.freeze(layout);
  }

  const LAYOUTS = { es: finish(ES), us: finish(US), fr: finish(FR), de: finish(DE) };

  const resolve = (layout) => (typeof layout === 'string' ? LAYOUTS[layout] : layout) || LAYOUTS.us;

  // ---------- Characters -> keystrokes ----------

  // Dead key compositions (the dead key's own character -> base letter -> composed letter).
  const COMPOSE = {
    '´': { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' },
    '¨': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' },
    '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
    '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
  };

  const charMaps = new WeakMap();

  /**
   * Map from every typeable character to its keystroke: `{ code, shift, altgr }`, or an array of
   * two strokes for dead-key characters (the first one has `dead: true`). Space, '\n' (Enter) and
   * '\t' (Tab) are included. A standalone dead character (´ ` ^ ¨ ~ on es) is dead key + Space.
   */
  function charMap(layout) {
    const L = resolve(layout);
    if (charMaps.has(L)) return charMaps.get(L);
    const map = new Map();
    const deads = new Map(); // dead char -> its stroke
    const levels = [['label', false, false], ['shift', true, false], ['altgr', false, true]];
    for (const row of L.rows) {
      for (const k of row) {
        if (k.mod) continue;
        for (const [level, shift, altgr] of levels) {
          const ch = k[level];
          if (!ch || ch.length !== 1) continue;
          const stroke = { code: k.code, shift, altgr };
          if (k.dead && k.dead[level]) deads.set(ch, { ...stroke, dead: true });
          else if (!map.has(ch)) map.set(ch, stroke);
        }
      }
    }
    const plain = (code) => ({ code, shift: false, altgr: false });
    map.set(' ', plain('Space'));
    map.set('\n', plain('Enter'));
    map.set('\t', plain('Tab'));
    for (const [dch, dstroke] of deads) {
      const table = COMPOSE[dch] || {};
      for (const [base, composed] of Object.entries(table)) {
        const second = map.get(base);
        if (second && !Array.isArray(second) && !map.has(composed)) map.set(composed, [dstroke, second]);
      }
      if (!map.has(dch)) map.set(dch, [dstroke, plain('Space')]);
    }
    charMaps.set(L, map);
    return map;
  }

  /** Always an array of strokes (empty if the character can't be typed on this layout). */
  function strokesFor(layout, ch) {
    const s = charMap(layout).get(ch);
    return s ? (Array.isArray(s) ? s : [s]) : [];
  }

  const fingerName = (i) => `finger.${i}`;

  // ---------- SVG rendering ----------

  const U = 40; // px per key unit in the viewBox
  const GAP = 5; // space between keys
  const LIP = 3; // keycap side visible under the face
  const PAD = 6;
  const R = 7; // corner radius

  const ICONS = {
    shift: 'M8 2.5 L13.5 8 H10.5 V13.5 H5.5 V8 H2.5 Z',
    caps: 'M8 2 L13.5 7.5 H10.5 V10.5 H5.5 V7.5 H2.5 Z M5.5 13.5 H10.5',
    tab: 'M2 8 H12.5 M9 4.5 L12.5 8 L9 11.5 M14.5 3.5 V12.5',
    enter: 'M13.5 3 V9 H3 M6.5 5.5 L3 9 L6.5 12.5',
    backspace: 'M14 8 H3 M6.5 4.5 L3 8 L6.5 11.5',
  };

  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  /** Rounded polygon path (works for concave corners too, e.g. the ISO Enter). */
  function roundedPath(pts, r) {
    const n = pts.length;
    let d = '';
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[(i - 1 + n) % n];
      const [cx, cy] = pts[i];
      const [nx, ny] = pts[(i + 1) % n];
      const lin = Math.hypot(cx - px, cy - py);
      const lout = Math.hypot(nx - cx, ny - cy);
      const ri = Math.min(r, lin / 2, lout / 2);
      const ax = cx + ((px - cx) / lin) * ri;
      const ay = cy + ((py - cy) / lin) * ri;
      const bx = cx + ((nx - cx) / lout) * ri;
      const by = cy + ((ny - cy) / lout) * ri;
      d += `${i ? 'L' : 'M'}${ax.toFixed(2)} ${ay.toFixed(2)} Q${cx} ${cy} ${bx.toFixed(2)} ${by.toFixed(2)} `;
    }
    return d + 'Z';
  }

  /** Outline points of a key in viewBox px, with the bottom edge raised by `lift`. */
  function keyPoints(L, k, lift = 0) {
    const g = GAP / 2;
    const x0 = PAD + k.x * U + g;
    const y0 = PAD + k.y * U + g;
    const x1 = PAD + (k.x + k.w) * U - g;
    if (k.iso) {
      // ISO Enter: 1.5u on its own row, 1.25u (flush right) on the row below.
      const below = L.rows[k.y + 1];
      const xb = PAD + (below[below.length - 1].x + below[below.length - 1].w) * U + g;
      const yStep = PAD + (k.y + 1) * U - g;
      const y1 = PAD + (k.y + 2) * U - g - lift;
      return [[x0, y0], [x1, y0], [x1, y1], [xb, y1], [xb, yStep], [x0, yStep]];
    }
    const y1 = PAD + (k.y + 1) * U - g - lift;
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }

  /** Letter keys (a, ñ, ö, ü...) show one big uppercase glyph; ù/% or é/2 keep both legends. */
  const isLetterKey = (k) => /\p{L}/u.test(k.label) && k.shift !== k.label && k.shift === k.label.toUpperCase();
  const reduceMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function drawKey(L, k, parent) {
    const g = el('g', { class: `kb-key kb-f${k.finger}${k.mod ? ' kb-mod' : ''}`, 'data-code': k.code }, parent);
    const pts = keyPoints(L, k);
    const face = keyPoints(L, k, LIP);
    el('path', { class: 'kb-lip', d: roundedPath(pts, R) }, g);
    el('path', { class: 'kb-face', d: roundedPath(face, R - 1) }, g);
    el('path', { class: 'kb-ring', d: roundedPath(pts, R + 1) }, g);
    el('path', { class: 'kb-flash', d: roundedPath(pts, R) }, g);

    // Label area = the face's top rectangle (for the ISO Enter, its upper part).
    const [fx0, fy0] = face[0];
    const fx1 = face[1][0];
    const fy1 = k.iso ? face[5][1] : face[2][1];
    const cx = (fx0 + fx1) / 2;
    const cy = (fy0 + fy1) / 2;
    const text = (cls, x, y, s, anchor = 'middle') => {
      const t = el('text', { class: cls, x, y, 'text-anchor': anchor, 'dominant-baseline': 'central' }, g);
      t.textContent = s;
      return t;
    };

    if (k.mod) {
      if (k.icon === 'win') {
        const s = 5;
        const ox = cx - s - 0.8;
        const oy = cy - s - 0.8;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          el('rect', { class: 'kb-icon-fill', x: ox + dx * (s + 1.6), y: oy + dy * (s + 1.6), width: s, height: s, rx: 1 }, g);
        }
      } else if (k.icon) {
        // Wide keys get their icon near the left edge, like a real keycap; small ones centred.
        const ix = k.w >= 1.75 && k.code !== 'Backspace' ? fx0 + 8 : cx - 8;
        const iy = cy - 8;
        el('path', { class: 'kb-icon', d: ICONS[k.icon], transform: `translate(${ix} ${iy})` }, g);
      } else if (k.label) {
        text('kb-modtext', cx, cy, k.label);
      }
      return g;
    }

    const deadCls = (lvl) => (k.dead && k.dead[lvl] ? ' kb-dead' : '');
    if (isLetterKey(k)) {
      // Letters: one big uppercase glyph, like a real keycap.
      text('kb-main', k.altgr ? cx - 3 : cx, cy + 0.5, k.shift);
    } else {
      text(`kb-sub${deadCls('shift')}`, fx0 + 7, fy0 + 8.5, k.shift, 'start');
      text(`kb-sub kb-base${deadCls('label')}`, fx0 + 7, fy1 - 9, k.label, 'start');
    }
    if (k.altgr) text(`kb-alt${deadCls('altgr')}`, fx1 - 6, fy1 - 8, k.altgr, 'end');
    if (k.bump) el('rect', { class: 'kb-bump', x: cx - 5, y: fy1 - 6, width: 10, height: 2.4, rx: 1.2 }, g);
    return g;
  }

  function buildSvg(L, ariaLabel) {
    const width = PAD * 2 + 15 * U;
    const height = PAD * 2 + L.rows.length * U;
    const svg = el('svg', {
      class: 'kb-svg',
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': ariaLabel,
      focusable: 'false',
    });
    const keys = el('g', { class: 'kb-keys' }, svg);
    for (const row of L.rows) for (const k of row) drawKey(L, k, keys);
    el('g', { class: 'kb-badges', 'aria-hidden': 'true' }, svg);
    return svg;
  }

  /** The Shift on the other hand from the key being pressed. */
  const shiftFor = (L, code) => {
    const k = L.byCode.get(code);
    return k && k.finger <= 4 ? 'ShiftRight' : 'ShiftLeft';
  };

  /**
   * Draws the keyboard into `container`. opts: { ariaLabel, legend (bool), t (translator) }.
   * Returns { highlight(strokes|char), flash(code, ok), clear(), setLayout(layout), svg, layout }.
   */
  function render(container, layout, opts = {}) {
    const tr = opts.t || (typeof t === 'function' ? t : (k) => k);
    const label = () => {
      if (opts.ariaLabel) return opts.ariaLabel;
      const s = tr('keyboard.aria');
      return s && s !== 'keyboard.aria' ? s : 'Keyboard';
    };
    const root = document.createElement('div');
    root.className = 'kb';
    container.appendChild(root);

    let L = resolve(layout);
    let svg;
    const api = { layout: L, svg: null };

    function mount() {
      root.textContent = '';
      svg = buildSvg(L, `${label()} (${L.name})`);
      root.appendChild(svg);
      if (opts.legend) root.appendChild(buildLegend(tr));
      api.layout = L;
      api.svg = svg;
    }

    const keyEl = (code) => svg.querySelector(`.kb-key[data-code="${code}"]`);

    function clear() {
      svg.classList.remove('has-next');
      svg.querySelectorAll('.is-next, .is-then').forEach((n) => {
        n.classList.remove('is-next', 'is-then');
        delete n.dataset.level;
      });
      svg.querySelector('.kb-badges').textContent = '';
    }

    function badge(code, n) {
      const k = L.byCode.get(code);
      if (!k) return;
      const pts = keyPoints(L, k);
      const x = pts[1][0] - 2;
      const y = pts[0][1] + 2;
      const g = el('g', { class: `kb-badge kb-badge-${n}` }, svg.querySelector('.kb-badges'));
      el('circle', { cx: x, cy: y, r: 8 }, g);
      const tx = el('text', { x, y: y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      tx.textContent = String(n);
    }

    function mark(stroke, cls) {
      const codes = [stroke.code];
      if (stroke.shift) codes.push(shiftFor(L, stroke.code));
      if (stroke.altgr) codes.push('AltRight');
      const main = keyEl(stroke.code);
      if (main && cls === 'is-next') main.dataset.level = stroke.altgr ? 'altgr' : stroke.shift ? 'shift' : 'base';
      for (const c of codes) {
        const n = keyEl(c);
        if (n && !(cls === 'is-then' && n.classList.contains('is-next'))) n.classList.add(cls);
      }
    }

    /** Light up the next key(s). Takes a character, one stroke, or an array of strokes. */
    function highlight(input) {
      clear();
      let strokes = input;
      if (typeof input === 'string') strokes = input ? strokesFor(L, [...input][0]) : [];
      else if (input && !Array.isArray(input)) strokes = [input];
      if (!strokes || !strokes.length) return;
      svg.classList.add('has-next');
      mark(strokes[0], 'is-next');
      if (strokes[1]) {
        mark(strokes[1], 'is-then');
        badge(strokes[0].code, 1);
        badge(strokes[1].code, 2);
      }
    }

    /** Brief soft flash on one key: ok = gentle green, otherwise a soft red. */
    function flash(code, ok = true) {
      const n = keyEl(code);
      if (!n) return;
      const f = n.querySelector('.kb-flash');
      f.classList.toggle('bad', !ok);
      f.classList.toggle('ok', !!ok);
      if (f._anim) f._anim.cancel();
      const peak = ok ? 0.9 : 0.85;
      f._anim = reduceMotion()
        ? f.animate([{ opacity: peak }, { opacity: 0 }], { duration: 320, easing: 'steps(1, end)' })
        : f.animate([{ opacity: 0 }, { opacity: peak, offset: 0.15 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
    }

    function setLayout(next) {
      L = resolve(next);
      mount();
    }

    function destroy() {
      root.remove();
    }

    mount();
    return Object.assign(api, { highlight, flash, clear, setLayout, destroy, root });
  }

  /** Optional legend: one swatch per finger (thumbs share the neutral one). */
  function buildLegend(tr) {
    const ul = document.createElement('ul');
    ul.className = 'kb-legend';
    for (const i of [0, 1, 2, 3, 4, 6, 7, 8, 9]) {
      const li = document.createElement('li');
      li.className = `kb-f${i}`;
      const sw = document.createElement('span');
      sw.className = 'kb-swatch';
      sw.setAttribute('aria-hidden', 'true');
      li.append(sw, document.createTextNode(tr(i === 4 ? 'finger.thumbs' : fingerName(i))));
      ul.appendChild(li);
    }
    return ul;
  }

  return { LAYOUTS, charMap, strokesFor, render, fingerName };
})();

if (typeof window !== 'undefined') window.Keyboard = Keyboard;
if (typeof module !== 'undefined') module.exports = Keyboard;
