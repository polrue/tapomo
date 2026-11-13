// Lab only: «Novedades» study (2026-11-13). What the first window after an update says is new, in 1.1.0.
// Shown once, the first time the main window opens after updating (never on a fresh install).
// A · Tarjeta (modal card), B · Franja (strip on the first page), C · Paso a paso (corner card).
// The mock is the main window (ui/style.css tokens) in an overlay, like levelup.js. The cap, freckles and
// plaster are copied from the lab Tapomo via PequesLab (peques.js), so they stay in sync with that study.
(() => {
  const E = window.Estudios;
  if (!E) return;
  const { el, btn, seg, R } = E;
  const opts = { v: 'a', high: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', reduced: false };
  const calm = () => opts.reduced || E.calm();
  const VARS = { a: 'A · Tarjeta', b: 'B · Franja', c: 'C · Paso a paso' };

  // ------------------------------------------------------------------ content
  const premios = () => (opts.high
    ? { t: 'Ya son tuyos: Tirita, Pecas y Gorro con hélice', d: '' }
    : { t: 'Premios nuevos en los niveles 2, 3 y 5', d: 'Tirita, pecas y gorro con hélice.' });
  const items = () => [
    { ic: '🎯', t: 'Objetivo automático', d: 'Se ajusta cada semana a tu ritmo, desde 5 minutos.', pic: 'goal' },
    { ic: '🎁', ...premios(), pic: 'cap', prizes: opts.high },
    { ic: '🔔', t: 'Tapomo te avisa', d: 'Cuando haya una versión nueva te lo dirá con un paquetito.', pic: 'parcel' },
    { ic: '🧔', t: 'Cejas y barba', d: 'Ahora llevan el color del pelo.', pic: 'hair' },
  ];

  // ------------------------------------------------------------------ pictures
  // Copies the study drawing `k` (gorro / pecas / tirita) off the lab Tapomo, then puts the lab as it was.
  const cache = {};
  function art(k) {
    const P = window.PequesLab;
    if (!P) return '';
    if (cache[k] === undefined) {
      const was = P.st.on[k];
      P.st.on[k] = true;
      P.paint();
      const g = E.mascot.querySelector(`.pq-${k}`);
      cache[k] = g ? g.innerHTML.replace(/pq-dome-\d+/g, 'pq-dome-__N__') : '';
      P.st.on[k] = was;
      P.paint();
      R.set(R.state.skin, [...R.state.acc]); // repaint: the crown lift goes back
    }
    return cache[k];
  }
  /** A small Tapomo in the default look wearing `acc` (+ study drawings `arts`); the propeller spins. */
  function pic(acc, arts = [], { hair, face } = {}) {
    const keep = R.state.hair;
    if (hair) R.state.hair = hair;
    const s = E.tapomo({ skin: 'clasico', acc }, face || {});
    R.state.hair = keep;
    R.set(R.state.skin, [...R.state.acc]);
    s.setAttribute('viewBox', '-8 -24 176 192');
    for (const k of arts) E.overlay(s, art(k), `nv-${k}`);
    return s;
  }
  function spin(root, turnsPerSec = 1.2) {
    if (calm()) return;
    root.querySelectorAll('.pq-rot').forEach((r) => r.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: E.dur(1000 / turnsPerSec), iterations: Infinity }));
  }
  const goalRing = () => {
    const w = el('div', 'nv-ring');
    w.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--nv-cell)" stroke-width="8"/><circle class="nv-arc" cx="32" cy="32" r="26" fill="none" stroke="var(--nv-accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="163" stroke-dashoffset="52" transform="rotate(-90 32 32)"/></svg><b>10<small>min</small></b>';
    return w;
  };
  const parcel = () => {
    const w = el('div', 'nv-parcel');
    w.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 26h44v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z" fill="#ffd9a0" stroke="#23202b" stroke-width="3" stroke-linejoin="round"/><path d="M7 18h50v9H7Z" fill="#ffc47a" stroke="#23202b" stroke-width="3" stroke-linejoin="round"/><path d="M32 18v40" stroke="#f0764a" stroke-width="6"/><path d="M32 18c-6-10-17-8-14-2 2 3 9 2 14 2Zm0 0c6-10 17-8 14-2-2 3-9 2-14 2Z" fill="#ff9e7a" stroke="#23202b" stroke-width="2.6" stroke-linejoin="round"/></svg>';
    return w;
  };
  /** The illustration of a novelty: `size` tells the CSS how big (hero, step). */
  function picture(it) {
    const w = el('div', `nv-pic nv-pic-${it.pic}`);
    w.setAttribute('aria-hidden', 'true');
    if (it.pic === 'goal') w.append(goalRing());
    else if (it.pic === 'parcel') w.append(parcel());
    else if (it.pic === 'hair') w.append(pic(['flequillo', 'cejas', 'barba'], [], { hair: 'rubio', face: { eyes: 'sparkle', mouth: 'big', cheeks: true } }));
    else if (it.prizes) w.append(minis());
    else { w.append(pic([], ['pecas', 'gorro'], { face: { eyes: 'sparkle', mouth: 'big', cheeks: true } })); spin(w); }
    return w;
  }
  const minis = () => {
    const row = el('span', 'nv-minis');
    row.setAttribute('aria-hidden', 'true');
    for (const [k, n] of [['tirita', 'Tirita'], ['pecas', 'Pecas'], ['gorro', 'Gorro']]) {
      const s = pic([], [k]);
      s.setAttribute('class', `${s.getAttribute('class')} nv-mini`);
      s.setAttribute('viewBox', k === 'gorro' ? '10 -22 140 160' : '10 18 140 140');
      row.append(s);
      s.dataset.n = n;
    }
    spin(row, 1.6);
    return row;
  };

  // ------------------------------------------------------------------ mock main window
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  function mainWindow() {
    const w = el('div', 'nv-win');
    w.setAttribute('aria-label', 'Maqueta de la ventana principal de Tapomo');
    const top = el('div', 'nv-top');
    const brand = el('div', 'nv-brand');
    const mw = el('div', 'nv-mw');
    mw.append(pic([]));
    brand.append(mw, el('h1', '', 'Tapomo'));
    const tabs = el('div', 'nv-tabs');
    tabs.setAttribute('aria-hidden', 'true');
    ['Hoy', 'Progreso', 'Aprender', 'Mi Tapomo'].forEach((t, i) => tabs.append(el('span', i ? '' : 'on', t)));
    const ic = el('div', 'nv-icons');
    ic.setAttribute('aria-hidden', 'true');
    ic.innerHTML = icon('M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-.5-1.6 1 .3 1.8-2 2-1.8-.3-1 1.6h-2.6l-1-1.6-1.8.3-2-2 .3-1.8-1.6-1v-2.6l1.6-1-.3-1.8 2-2 1.8.3 1-1.6h2.6l1 1.6 1.8-.3 2 2-.3 1.8 1.6 1Z') + icon('M12 20.5s-7.5-4.6-9.2-9.1C1.6 8.2 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.6 3.7 4.4 6.9-1.7 4.5-9.2 9.1-9.2 9.1Z');
    top.append(brand, tabs, ic);
    const main = el('div', 'nv-main');
    const slot = el('div', 'nv-slot');
    const tiles = el('div', 'nv-tiles');
    tiles.setAttribute('aria-hidden', 'true');
    [['Velocidad media', '42 ppm', 1], ['Récord (10 s)', '71 ppm'], ['Racha actual', '3 días'], ['Mejor racha', '9 días'], ['Tiempo activo', '38 min'], ['Caracteres', '6.214']].forEach(([l, v, big]) => {
      const t = el('div', big ? 'nv-tile big' : 'nv-tile');
      t.append(el('span', '', l), el('strong', '', v));
      tiles.append(t);
    });
    const card = el('div', 'nv-card');
    card.setAttribute('aria-hidden', 'true');
    card.append(el('h2', '', 'Ahora mismo'), el('p', '', 'Hoy llevas 38 min de 10 de objetivo. ¡Bien!'));
    const bar = el('div', 'nv-goal');
    bar.append(el('i'));
    card.append(bar);
    main.append(slot, tiles, card);
    w.append(top, main);
    return { w, slot };
  }

  // ------------------------------------------------------------------ the three designs
  let cur = null; // { ov, win, onKey, opener }
  const list = (its, cls = '') => {
    const ul = el('ul', `nv-list ${cls}`);
    its.forEach((it) => {
      const li = el('li');
      li.append(el('span', 'nv-ic', it.ic));
      const tx = el('span', 'nv-tx');
      tx.append(el('b', '', it.t));
      if (it.d) tx.append(el('span', '', it.d));
      if (it.prizes) tx.append(minis());
      li.append(tx);
      ul.append(li);
    });
    return ul;
  };
  function xBtn(onClose) {
    const b = btn('', 'nv-x');
    b.setAttribute('aria-label', 'Cerrar');
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    b.addEventListener('click', onClose);
    return b;
  }
  const seeAll = () => {
    const a = btn('Ver todas las novedades', 'nv-link');
    a.addEventListener('click', () => note('Abriría las notas de la versión 1.1.0 en GitHub.'));
    return a;
  };
  // Lab-only toast inside the mock window, to show where a button would take you.
  function note(text) {
    if (!cur) return;
    cur.win.querySelector('.nv-note')?.remove();
    const n = el('div', 'nv-note', text);
    n.setAttribute('role', 'status');
    cur.win.append(n);
    setTimeout(() => n.remove(), 2600);
  }
  const dialog = (cls, labelled) => {
    const c = el('div', `nv-card-pop ${cls}`);
    c.setAttribute('role', 'dialog');
    c.setAttribute('aria-labelledby', labelled);
    c.tabIndex = -1;
    return c;
  };

  const BUILD = {
    a(win, close) {
      const scrim = el('div', 'nv-scrim');
      const c = dialog('nv-a', 'nv-title');
      c.setAttribute('aria-modal', 'true');
      const hero = el('div', 'nv-hero');
      hero.setAttribute('aria-hidden', 'true');
      hero.append(pic([], ['pecas', 'gorro'], { face: { eyes: 'sparkle', mouth: 'big', cheeks: true } }));
      spin(hero);
      const h = el('h2', '', 'Novedades de la 1.1.0');
      h.id = 'nv-title';
      const ok = btn('¡Vale!', 'nv-btn');
      ok.addEventListener('click', close);
      const its = items();
      const nav = el('div', 'nv-nav');
      nav.append(ok, seeAll());
      if (opts.high) {
        const t = btn('Probar el gorro', 'nv-link');
        t.addEventListener('click', () => { close(); note('Abriría Mi Tapomo con el gorro puesto.'); });
        nav.append(t);
      }
      c.append(xBtn(close), hero, h, list(its), nav);
      scrim.append(c);
      scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
      win.append(scrim);
      return { card: c, focus: ok };
    },
    b(win, close, slot) {
      const s = el('section', 'nv-strip');
      s.setAttribute('aria-label', 'Novedades de la 1.1.0');
      const row = el('div', 'nv-strip-row');
      const tx = el('p', '');
      tx.append(el('span', 'nv-spark', '✨ '), el('b', '', 'Novedades de la 1.1.0: '), 'objetivo automático, premios nuevos y más');
      const more = btn('Ver', 'nv-btn nv-sm');
      more.setAttribute('aria-expanded', 'false');
      const x = xBtn(close);
      const body = el('div', 'nv-strip-body');
      body.hidden = true;
      body.append(list(items(), 'nv-tight'), seeAll());
      body.id = 'nv-strip-body';
      more.setAttribute('aria-controls', 'nv-strip-body');
      more.addEventListener('click', () => {
        const open = body.hidden;
        body.hidden = !open;
        more.textContent = open ? 'Ocultar' : 'Ver';
        more.setAttribute('aria-expanded', String(open));
      });
      row.append(tx, more, x);
      s.append(row, body);
      slot.append(s);
      return { card: s, focus: more };
    },
    c(win, close) {
      const its = items();
      let i = 0;
      const c = dialog('nv-c', 'nv-ctitle');
      const hd = el('div', 'nv-c-head');
      const dots = el('div', 'nv-dots');
      dots.setAttribute('aria-hidden', 'true');
      its.forEach(() => dots.append(el('i')));
      hd.append(el('span', 'nv-eyebrow', 'Novedades de la 1.1.0'), dots);
      const stage = el('div', 'nv-c-step');
      stage.setAttribute('aria-live', 'polite');
      const nav = el('div', 'nv-nav');
      const next = btn('Siguiente', 'nv-btn');
      nav.append(next);
      const render = () => {
        const it = its[i];
        [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
        const h = el('h3', '', it.t);
        h.id = 'nv-ctitle';
        stage.replaceChildren(picture(it), h, ...(it.d ? [el('p', '', it.d)] : []));
        stage.classList.remove('nv-in');
        if (!calm()) { void stage.offsetWidth; stage.classList.add('nv-in'); }
        const last = i === its.length - 1;
        next.textContent = last ? '¡Vale!' : 'Siguiente';
        nav.replaceChildren(next, ...(last ? [seeAll()] : []));
      };
      next.addEventListener('click', () => { if (i === its.length - 1) close(); else { i++; render(); next.focus(); } });
      c.append(xBtn(close), hd, stage, nav);
      render();
      win.append(c);
      return { card: c, focus: next };
    },
  };

  // ------------------------------------------------------------------ open / close
  // close() dismisses the novelty (the mock stays); closeAll() also removes the mock window.
  function close() {
    if (!cur) return;
    cur.win.querySelectorAll('.nv-scrim, .nv-strip, .nv-card-pop').forEach((n) => n.remove());
    cur.dismissed = true;
  }
  function closeAll() {
    if (!cur) return;
    document.removeEventListener('keydown', cur.onKey, true);
    cur.ov.remove();
    cur = null;
    syncOpen();
    openBtn.focus();
  }
  function open() {
    const prev = cur;
    if (prev) { document.removeEventListener('keydown', prev.onKey, true); prev.ov.remove(); }
    const ov = el('div', 'nv-ov');
    ov.dataset.theme = opts.theme;
    ov.classList.toggle('nv-rm', opts.reduced);
    const bar = el('div', 'nv-bar');
    const { w, slot } = mainWindow();
    const frame = el('div', 'nv-frame');
    frame.append(w);
    const st = { ov, win: w, dismissed: false };
    const built = BUILD[opts.v](w, close, slot);
    const tb = Object.entries(VARS).map(([v, t]) => {
      const b = btn(t, 'nv-tb');
      b.setAttribute('aria-pressed', String(v === opts.v));
      b.addEventListener('click', () => { opts.v = v; syncSeg(); open(); });
      return b;
    });
    const again = btn('Ver otra vez', 'nv-tb');
    again.addEventListener('click', open);
    const shut = btn('Cerrar la maqueta', 'nv-tb nv-shut');
    shut.addEventListener('click', closeAll);
    bar.append(...tb, again, shut);
    ov.append(bar, frame);
    st.onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (st.dismissed) closeAll(); else close();
      if (!cur) return;
      (cur.dismissed ? shut : built.focus).focus();
    };
    // Esc: first closes the novelty, then the mock. Focus rings are the lab-wide :focus-visible ones.
    cur = st;
    document.addEventListener('keydown', st.onKey, true);
    document.body.append(ov);
    if (!calm()) built.card.classList.add('nv-enter');
    (built.focus || built.card).focus();
    syncOpen();
  }

  // ------------------------------------------------------------------ lab panel
  const { body, set } = E.add('novedades', 'Novedades');
  set('stop', () => { if (cur) closeAll(); });
  body.append(el('p', 'note', 'Qué se enseña la primera vez que se abre la ventana principal tras actualizar a la 1.1.0. Resumido, compacto y fácil de ver. Elige A, B o C: la maqueta imita la ventana principal con su tema.'));
  const openBtn = btn('Abrir la maqueta', '');
  openBtn.setAttribute('aria-haspopup', 'dialog');
  openBtn.addEventListener('click', open);
  const syncOpen = () => openBtn.classList.toggle('on', !!cur);
  const vs = seg('Variante', Object.entries(VARS), () => opts.v, (v) => { opts.v = v; if (cur) open(); });
  const syncSeg = () => vs.sync();
  const hs = seg('Nivel', [[false, 'Nuevo (< 5)'], [true, 'Ya tiene nivel ≥ 5']], () => opts.high, (v) => { opts.high = v; if (cur) open(); });
  const ts = seg('Tema', [['light', 'Claro'], ['dark', 'Oscuro']], () => opts.theme, (v) => { opts.theme = v; if (cur) cur.ov.dataset.theme = v; });
  const rmL = el('label');
  const rm = el('input');
  rm.type = 'checkbox';
  rm.addEventListener('change', () => { opts.reduced = rm.checked; if (cur) open(); });
  rmL.append(rm, 'Reducir movimiento');
  const bs = el('div', 'btns');
  bs.append(openBtn);
  body.append(vs.box, hs.box, ts.box, rmL, bs, el('p', 'rw-sub', 'Decidido hasta ahora'), E.list([
    'Se enseña una sola vez, la primera vez que se abre la ventana principal tras actualizar. Nunca en una instalación nueva.',
    'El aviso de «premios nuevos» vive dentro de esta tarjeta: no hay un segundo popup. Si ya tienes el nivel, la línea pasa a «Ya son tuyos…» con las miniaturas.',
    'La burbuja de la mascota «Mira las novedades» abre la ventana principal sobre esta tarjeta.',
    'Esc la cierra y el foco va al botón principal. Con «reducir movimiento» la hélice no gira y nada se desliza.',
  ]));

  window.NovedadesLab = { open, close: closeAll, opts };
})();
