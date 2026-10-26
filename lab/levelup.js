// Level-up popup proposals (lab only). Builds its own "Popup de subida de nivel" fieldset at the end of
// #panel: "Actual" recreates the reveal of ui/xp.js + ui/index.html (#level-dialog) faithfully, and
// A · Insignia, B · Escenario and C · Aviso discreto are the alternatives. Uses the real mascot
// (Mascot.mount, wrapped by rewards.js so it wears the reward drawings) and TapomoRewards for the looks.
// Needs mascot.js and rewards.js loaded before it; it does not touch lab.js, pet.js or shy.js.
(() => {
  const panel = document.getElementById('panel');
  const R = window.TapomoRewards;
  if (!panel || typeof Mascot === 'undefined' || !R) return;
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (n) => n.toLocaleString('es-ES');
  const xpFor = R.xpFor;

  // ui/wardrobe.js PACKS (0.8.0): one reward per level.
  const PACKS = [
    [4, 'gafassol'], [7, 'lacito'], [10, 'fresa'], [13, 'bigote'], [16, 'flequillo'], [19, 'bufanda'], [21, 'gorra'], [22, 'cejas'], [23, 'gafas'],
    [24, 'matcha'], [25, 'gamer'], [26, 'tupe'], [27, 'parche'], [28, 'auris'], [29, 'barba'], [30, 'gorrito'], [31, 'ninja'], [32, 'mango'],
    [33, 'melenita'], [34, 'pajarita'], [35, 'pesa'], [36, 'capa'], [37, 'hipster'], [38, 'superheroe'], [39, 'arandano'], [40, 'vikingo'],
    [41, 'chef'], [42, 'musculitos'], [43, 'flores'], [44, 'cicatriz'], [45, 'dino'], [46, 'sesamo'], [47, 'aureola'], [48, 'astronauta'],
    [49, 'rockero'], [50, 'dorado'],
  ];
  // ui/locales/es.json item.*
  const NAMES = {
    lacito: 'Lacito', bigote: 'Bigote postizo', gafas: 'Gafas redondas', gafassol: 'Gafas de sol de chulito', fresa: 'Fresa', cejas: 'Cejas pobladas',
    bufanda: 'Bufanda', gorra: 'Gorra al revés', auris: 'Auriculares', gamer: 'Auriculares gamer', matcha: 'Matcha', parche: 'Parche pirata',
    gorrito: 'Gorrito de lana', ninja: 'Cinta ninja', pajarita: 'Pajarita', barba: 'Barba de leñador', hipster: 'Barba hipster', mango: 'Mango',
    pesa: 'Pesas', capa: 'Capa', superheroe: 'Superhéroe', chef: 'Gorro de chef', vikingo: 'Casco vikingo', arandano: 'Arándano',
    musculitos: 'Musculitos', flores: 'Corona de flores', dino: 'Dinosaurio', sesamo: 'Sésamo negro', cicatriz: 'Cicatriz en X',
    aureola: 'Aureola de estrellitas', astronauta: 'Astronauta', rockero: 'Traje de rockero', dorado: 'Tapomo dorado',
    flequillo: 'Flequillo', tupe: 'Tupé', melenita: 'Melenita',
  };
  const SKINS = new Set(['fresa', 'matcha', 'mango', 'arandano', 'sesamo', 'dorado']);
  const COSTUMES = new Set(['superheroe', 'dino', 'astronauta', 'rockero']);
  const HAIR = new Set(['flequillo', 'tupe', 'melenita']);
  const kindOf = (id) => (SKINS.has(id) ? 'Color de Tapomo' : COSTUMES.has(id) ? 'Disfraz' : HAIR.has(id) ? 'Peinado' : 'Accesorio');
  const lc = (s) => s[0].toLowerCase() + s.slice(1);
  const rewardAt = (lv) => (PACKS.find((p) => p[0] === lv) || [])[1] || null;
  const nextAfter = (lv) => PACKS.find((p) => p[0] > lv) || null;

  const opts = {
    design: null,
    level: 10,
    reward: 'auto',
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    reduced: false,
  };
  const calm = () => opts.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ dom helpers
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function btn(text, cls = 'lu-btn') {
    const b = el('button', cls, text);
    b.type = 'button';
    return b;
  }
  function closeX(onClose) {
    const b = btn('', 'lu-x');
    b.setAttribute('aria-label', 'Cerrar');
    b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    b.addEventListener('click', onClose);
    return b;
  }
  function lockIcon() {
    const i = el('span', 'lu-lock');
    i.setAttribute('aria-hidden', 'true');
    i.innerHTML = '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7.5" rx="2" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    return i;
  }
  function bar(pct) {
    const b = el('div', 'lu-bar');
    b.setAttribute('aria-hidden', 'true');
    const i = el('i');
    b.append(i);
    b.__fill = () => { i.style.width = `${pct.toFixed(1)}%`; };
    return b;
  }

  // ------------------------------------------------------------------ looks and mascots
  // rewards.js paints every mounted Tapomo with one global look, so: snapshots are still copies of a
  // hidden source mascot, and only B's hero is live (the look is restored when the popup closes).
  const lookNow = () => ({ skin: R.state.skin, acc: [...R.state.acc] });
  const setLook = (l) => R.set(l.skin, l.acc);
  const wearing = (base, id) => (!id ? base : SKINS.has(id) ? { skin: id, acc: base.acc } : { skin: base.skin, acc: [id] });
  let src = null;
  function svgEl(cls, viewBox = '0 0 160 160') {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', viewBox);
    s.setAttribute('class', cls);
    return s;
  }
  function snapshot(look, viewBox) {
    const keep = lookNow();
    setLook(look);
    if (!src) { src = svgEl('lu-src'); Mascot.mount(src); }
    const c = src.cloneNode(true);
    setLook(keep);
    if (viewBox) c.setAttribute('viewBox', viewBox);
    c.classList.add('lu-snap');
    c.setAttribute('aria-hidden', 'true');
    c.removeAttribute('id');
    return c;
  }
  let hero = null;
  function heroMascot(look) {
    if (!hero) { hero = svgEl('lu-b-hero'); Mascot.mount(hero); }
    hero.setAttribute('aria-hidden', 'true');
    setLook(look);
    Mascot.setFace(hero, { eyes: 'sparkle', mouth: 'big', cheeks: true });
    return hero;
  }

  // ------------------------------------------------------------------ context
  function context() {
    const lv = opts.level;
    const id = opts.reward === 'auto' ? rewardAt(lv) : opts.reward === 'none' ? null : opts.reward;
    const span = xpFor(lv + 1) - xpFor(lv);
    const into = Math.max(1, Math.round(span * 0.04)); // the XP that spilled over into the new level
    return { lv, id, next: nextAfter(lv), span, into, left: span - into, pct: (into / span) * 100 };
  }

  // ------------------------------------------------------------------ open / close
  let cur = null; // { ov, design, saved, opener, onKey }

  function close() {
    if (!cur) return;
    const { ov, saved, opener, onKey, modal } = cur;
    cur = null;
    document.removeEventListener('keydown', onKey, true);
    const lab = document.querySelector('.lab');
    if (lab) lab.inert = false;
    setLook(saved);
    const done = () => ov.remove();
    if (calm()) done();
    else { ov.classList.add('lu-out'); setTimeout(done, 170); }
    if (opener && (modal || ov.contains(document.activeElement))) opener.focus();
    syncButtons();
  }

  function trap(e, card) {
    if (e.key !== 'Tab') return;
    const f = [...card.querySelectorAll('button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(design, opener) {
    if (cur) {
      const o = cur;
      cur = null;
      document.removeEventListener('keydown', o.onKey, true);
      setLook(o.saved);
      o.ov.remove();
    }
    opts.design = design;
    const saved = lookNow();
    const ctx = context();
    const modal = design !== 'c';
    const ov = el('div', 'lu-ov');
    ov.dataset.design = design;
    ov.dataset.theme = opts.theme;
    if (opts.reduced) ov.classList.add('lu-rm');
    const state = { saved, opener, modal, ov, design };
    const built = BUILD[design](ctx, state);
    ov.append(built.card);
    if (modal) ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    state.onKey = (e) => {
      if (e.key === 'Escape' && (modal || ov.contains(document.activeElement) || !e.target.closest('input, select, textarea'))) { e.preventDefault(); close(); return; }
      if (modal) trap(e, built.card);
    };
    document.addEventListener('keydown', state.onKey, true);
    cur = state;
    document.body.append(ov);
    if (modal) {
      const lab = document.querySelector('.lab');
      if (lab) lab.inert = true;
      (built.focus || built.card).focus();
    }
    requestAnimationFrame(() => requestAnimationFrame(() => built.after && built.after()));
    syncButtons();
  }

  /** Lab version of "Ponérmelo": the outfit kept after closing gets the item. */
  function putOn(state, id) {
    if (SKINS.has(id)) state.saved.skin = id;
    else state.saved.acc = [...new Set([...state.saved.acc, id])];
  }

  // ------------------------------------------------------------------ the designs
  const BUILD = {
    /** Actual: #level-dialog as ui/xp.js fills it (no mascot inside; the header one jumps behind the scrim). */
    cur(ctx, state) {
      const card = el('div', 'lu-card lu-cur');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'lu-title');
      card.setAttribute('aria-describedby', 'lu-text');
      card.tabIndex = -1;
      const body = el('div', 'lu-cur-body');
      const h = el('h2', '', `¡Nivel ${fmt(ctx.lv)}!`);
      h.id = 'lu-title';
      const p = el('p', '', ctx.id ? 'Has desbloqueado:' : '¡Tapomo está orgulloso de ti!');
      p.id = 'lu-text';
      body.append(h, p);
      if (ctx.id) {
        const box = el('div', 'lu-cur-items');
        const fig = el('figure', 'lu-cur-item');
        const wear = btn('Ponérmelo');
        wear.addEventListener('click', () => { putOn(state, ctx.id); wear.textContent = '¡Puesto!'; wear.disabled = true; });
        fig.append(snapshot(wearing(state.saved, ctx.id)), el('figcaption', '', NAMES[ctx.id]), wear);
        box.append(fig);
        body.append(box);
      } else if (ctx.next) {
        body.append(el('p', 'lu-cur-next', `Próximo premio en el nivel ${fmt(ctx.next[0])}: ${NAMES[ctx.next[1]]}`));
      }
      const nav = el('div', 'lu-cur-nav');
      const ok = btn('¡Genial!');
      ok.addEventListener('click', close);
      nav.append(ok);
      card.append(body, nav);
      return { card, focus: ok };
    },

    /** A · Insignia: the level card's badge grows into the hero, with the XP bar and one reward row. */
    a(ctx, state) {
      const card = el('div', 'lu-card lu-a');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'lu-title');
      card.setAttribute('aria-describedby', 'lu-text');
      card.tabIndex = -1;
      const head = el('div', 'lu-a-head');
      head.setAttribute('aria-hidden', 'true');
      const badge = el('div', 'lu-a-badge');
      const num = el('div', 'lu-a-num');
      const nNew = el('b', '', fmt(ctx.lv));
      if (!calm()) {
        const nOld = el('b', 'lu-old', fmt(ctx.lv - 1));
        nNew.classList.add('lu-new');
        nNew.style.animationDelay = '520ms';
        nOld.style.animationDelay = '480ms';
        num.append(nOld);
      }
      num.append(nNew);
      badge.append(el('span', '', 'Nivel'), num);
      head.append(el('div', 'lu-a-rays'), badge);
      const h = el('h2', '', `¡Has subido al nivel ${fmt(ctx.lv)}!`);
      h.id = 'lu-title';
      const p = el('p', 'lu-muted', ctx.id ? 'Tapomo estrena algo para ti.' : '¡Tapomo está orgulloso de ti!');
      p.id = 'lu-text';
      const xp = el('div', 'lu-a-xp');
      const row = el('div', 'lu-a-xp-row');
      row.append(el('span', '', `Hacia el nivel ${fmt(ctx.lv + 1)}`), el('span', '', `faltan ${fmt(ctx.left)} XP`));
      const b = bar(ctx.pct);
      xp.append(row, b);
      card.append(closeX(close), head, h, p, xp);

      const rw = el('div', 'lu-a-reward');
      const th = el('div', 'lu-a-thumb');
      const txt = el('div');
      if (ctx.id) {
        th.append(snapshot(wearing(state.saved, ctx.id), '-6 -14 172 172'));
        txt.append(el('div', 'lu-a-eyebrow', 'Nuevo premio'), el('div', 'lu-a-name', NAMES[ctx.id]), el('div', 'lu-a-kind', kindOf(ctx.id)));
        const wear = btn('Ponérmelo');
        wear.addEventListener('click', () => {
          putOn(state, ctx.id);
          wear.innerHTML = '<span class="lu-tick" aria-hidden="true">✓</span>¡Puesto!';
          wear.disabled = true;
          ok.focus();
        });
        rw.append(th, txt, wear);
        card.append(rw);
      } else if (ctx.next) {
        const sil = snapshot(wearing(state.saved, ctx.next[1]), '-6 -14 172 172');
        sil.classList.add('lu-locked');
        th.append(sil, lockIcon());
        txt.append(el('div', 'lu-a-eyebrow', `Próximo premio · nivel ${fmt(ctx.next[0])}`), el('div', 'lu-a-name', NAMES[ctx.next[1]]), el('div', 'lu-a-kind', kindOf(ctx.next[1])));
        rw.append(th, txt);
        card.append(rw);
      }
      const nav = el('div', 'lu-a-nav');
      const ok = btn('¡Genial!');
      ok.addEventListener('click', close);
      nav.append(ok);
      card.append(nav);
      return { card, focus: ok, after: () => b.__fill() };
    },

    /** B · Escenario: Tapomo is the hero, already wearing the reward as a preview; confetti once. */
    b(ctx, state) {
      const card = el('div', 'lu-card lu-b');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'lu-title');
      card.setAttribute('aria-describedby', 'lu-text');
      card.tabIndex = -1;
      const stage = el('div', 'lu-b-stage');
      const confetti = el('div', 'lu-confetti');
      confetti.setAttribute('aria-hidden', 'true');
      if (!calm()) {
        const cols = ['#ff9e7a', '#ffc93c', '#74d6bf', '#8ccbf0', '#c4a8f0', '#f0764a'];
        for (let i = 0; i < 22; i++) {
          const c = el('i', i % 4 === 3 ? 'lu-dot' : '');
          const s = 6 + Math.round(Math.random() * 5);
          c.style.cssText = `--x:${(4 + Math.random() * 92).toFixed(1)}%;--s:${s}px;--c:${cols[i % cols.length]};--d:${(1500 + Math.random() * 1100) | 0}ms;--w:${(150 + Math.random() * 500) | 0}ms;--dx:${((Math.random() - 0.5) * 60) | 0}px;--r:${((Math.random() - 0.5) * 720) | 0}deg`;
          confetti.append(c);
        }
      }
      const pill = el('div', 'lu-b-pill', `Nivel ${fmt(ctx.lv)}`);
      pill.setAttribute('aria-hidden', 'true');
      const svg = heroMascot(wearing(state.saved, ctx.id));
      stage.append(confetti, pill, svg);
      if (ctx.id) stage.append(el('span', 'lu-b-tag', 'Vista previa'));
      const body = el('div', 'lu-b-body');
      const h = el('h2', '', `¡Nivel ${fmt(ctx.lv)}!`);
      h.id = 'lu-title';
      const p = el('p', 'lu-b-sub lu-muted');
      p.id = 'lu-text';
      if (ctx.id) { p.append('Estrenas '); p.append(el('b', '', NAMES[ctx.id])); p.append('.'); }
      else p.textContent = '¡Tapomo está orgulloso de ti!';
      const xp = el('div', 'lu-b-xp');
      const b = bar(ctx.pct);
      xp.append(b, el('span', '', `${fmt(ctx.left)} XP para el nivel ${fmt(ctx.lv + 1)}`));
      body.append(h, p);
      if (!ctx.id && ctx.next) body.append(el('p', 'lu-b-next lu-muted', `Próximo premio en el nivel ${fmt(ctx.next[0])}: ${NAMES[ctx.next[1]]}`));
      body.append(xp);
      const nav = el('div', 'lu-b-nav');
      let focus;
      if (ctx.id) {
        const wear = btn('Ponérmelo');
        const later = btn('Ahora no', 'lu-btn lu-ghost');
        wear.addEventListener('click', () => {
          putOn(state, ctx.id);
          wear.innerHTML = '<span class="lu-tick" aria-hidden="true">✓</span>¡Puesto!';
          wear.disabled = true;
          later.textContent = 'Cerrar';
          later.focus();
          if (!calm()) Mascot.jump(svg, { big: false });
        });
        later.addEventListener('click', close);
        nav.append(later, wear);
        focus = wear;
      } else {
        const ok = btn('¡Genial!');
        ok.addEventListener('click', close);
        nav.append(ok);
        focus = ok;
      }
      card.append(stage, closeX(close), body, nav);
      return {
        card,
        focus,
        after: () => {
          b.__fill();
          if (!calm()) setTimeout(() => { if (svg.isConnected) Mascot.jump(svg, { big: true }); }, 260);
        },
      };
    },

    /** C · Aviso discreto: a corner card that doesn't block the app or steal focus. */
    c(ctx, state) {
      const card = el('div', 'lu-card lu-c');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'false');
      card.setAttribute('aria-labelledby', 'lu-title');
      const pic = el('div', 'lu-c-pic');
      pic.append(snapshot(wearing(state.saved, ctx.id), '-4 -12 168 168'));
      const txt = el('div', 'lu-c-text');
      const h = el('h2', '', ctx.id ? `Nuevo: ${NAMES[ctx.id]}` : '¡Tapomo está orgulloso de ti!');
      h.id = 'lu-title';
      const b = bar(ctx.pct);
      txt.append(el('div', 'lu-c-eyebrow', `¡Nivel ${fmt(ctx.lv)}!`), h, b, el('p', 'lu-c-xp', `${fmt(ctx.left)} XP para el nivel ${fmt(ctx.lv + 1)}`));
      // Announced without moving focus (the person may be typing).
      const live = el('p', 'lu-sr');
      live.setAttribute('role', 'status');
      card.append(closeX(close), pic, txt, live);
      if (ctx.id) {
        const nav = el('div', 'lu-c-nav');
        const wear = btn('Ponérmelo');
        const look = btn('Ver el armario', 'lu-btn lu-ghost');
        wear.addEventListener('click', () => {
          putOn(state, ctx.id);
          wear.innerHTML = '<span class="lu-tick" aria-hidden="true">✓</span>¡Puesto!';
          wear.disabled = true;
          look.focus();
        });
        look.addEventListener('click', close);
        nav.append(look, wear);
        card.append(nav);
      }
      return {
        card,
        after: () => {
          b.__fill();
          live.textContent = `Nivel ${fmt(ctx.lv)}. ${ctx.id ? `Nuevo premio: ${NAMES[ctx.id]}.` : ''} Pulsa Escape para cerrar.`;
        },
      };
    },
  };

  // ------------------------------------------------------------------ lab panel
  const fs = el('fieldset', 'prop');
  const lg = el('legend', '', 'Popup de subida de nivel ');
  lg.append(el('span', 'pend', 'Propuesta, pendiente de Pol'));
  fs.append(lg);
  const wrap = el('div', 'lu-panel');
  wrap.append(el('p', 'note', 'Pol pidió mejorar la estética del popup al subir de nivel. «Actual» es una copia fiel del de la app; A, B y C son las alternativas. Se abren encima de la página con el Tapomo y los dibujos de premios reales; Esc o la X los cierran.'));

  const DESIGNS = [
    ['cur', 'Actual', 'Título, «Has desbloqueado:», miniatura del premio y «¡Genial!». Sin Tapomo dentro ni XP.'],
    ['a', 'A · Insignia', 'La insignia de nivel de la tarjeta crece y cambia de número; barra de XP y una fila con el premio. La más cercana a lo de hoy.'],
    ['b', 'B · Escenario', 'Tapomo es el protagonista y ya lleva el premio puesto como vista previa, con confeti una vez. «Ponérmelo» es el botón principal.'],
    ['c', 'C · Aviso discreto', 'Tarjeta pequeña en la esquina: no tapa la app ni roba el foco mientras escribes. Celebra menos, molesta menos.'],
  ];
  const openers = {};
  const list = el('ul', 'lu-designs');
  for (const [k, label, note] of DESIGNS) {
    const li = el('li');
    const b = btn(label, '');
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => open(k, b));
    openers[k] = b;
    li.append(b, el('p', 'note', note));
    list.append(li);
  }
  const dsub = el('div');
  dsub.append(el('p', 'rw-sub', 'Abrir diseño'), list);
  wrap.append(dsub);
  function syncButtons() {
    for (const [k, b] of Object.entries(openers)) b.classList.toggle('on', !!cur && cur.design === k);
  }

  /** A segmented control in the lab's style (.seg + .seg-z.on). */
  function seg(label, values, get, set) {
    const box = el('div', 'seg');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', label);
    box.append(el('span', 'seg-l', label));
    const bs = values.map(([v, text]) => {
      const b = btn(text, 'seg-z');
      b.addEventListener('click', () => { set(v); sync(); });
      box.append(b);
      return [v, b];
    });
    const sync = () => bs.forEach(([v, b]) => { const on = get() === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    sync();
    return { box, sync };
  }
  const reopen = () => { if (cur) open(cur.design, cur.opener); };

  const lvSeg = seg('Nivel', [[2, '2'], [4, '4'], [10, '10'], [25, '25'], [50, '50']], () => opts.level, (v) => { opts.level = v; showLevelInfo(); reopen(); });
  const lvInfo = el('p', 'note');
  lvSeg.box.append(lvInfo);
  function showLevelInfo() {
    const id = rewardAt(opts.level);
    const n = nextAfter(opts.level);
    lvInfo.textContent = id ? `En el nivel ${opts.level} se gana: ${NAMES[id]} (${lc(kindOf(id))}).` : `El nivel ${opts.level} no trae premio${n ? `; el siguiente es ${NAMES[n[1]]} en el nivel ${n[0]}` : ''}.`;
  }
  showLevelInfo();

  const rwRow = el('div');
  const rwLabel = el('label');
  rwLabel.append(el('span', 'seg-l', 'Premio'));
  const sel = el('select');
  sel.append(new Option('El del nivel elegido', 'auto'), new Option('Sin premio', 'none'));
  for (const [lv, id] of PACKS) sel.append(new Option(`${NAMES[id]} · nivel ${lv} · ${lc(kindOf(id))}`, id));
  sel.addEventListener('change', () => { opts.reward = sel.value; reopen(); });
  rwLabel.append(sel);
  rwRow.append(rwLabel);

  const thSeg = seg('Tema del popup', [['light', 'Claro'], ['dark', 'Oscuro']], () => opts.theme, (v) => { opts.theme = v; if (cur) cur.ov.dataset.theme = v; });
  const rmLabel = el('label');
  const rm = el('input');
  rm.type = 'checkbox';
  rm.addEventListener('change', () => { opts.reduced = rm.checked; reopen(); });
  rmLabel.append(rm, 'Simular «reducir movimiento»');

  const csub = el('div');
  csub.append(el('p', 'rw-sub', 'Ajustes de la demo'));
  const controls = el('div', 'lu-panel');
  controls.append(lvSeg.box, rwRow, thSeg.box, rmLabel);
  csub.append(controls);
  wrap.append(csub);
  wrap.append(el('p', 'note', 'Con premio, «Ponérmelo» se lo deja puesto al Tapomo del lab al cerrar. En el lab la XP del nivel nuevo es un 4 % de ejemplo (lo que sobra al subir).'));
  fs.append(wrap);
  panel.append(fs);

  window.LevelupLab = { open: (d) => open(d, openers[d]), close, opts };
})();
