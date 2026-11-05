// Lab only: «Avisos fuera de la app» study. Level-ups (with and without reward), one challenge done and
// all challenges done go unnoticed when the main window is behind, and Windows' native toast is plain.
// Three ways to show them on the desktop, each in a mock of the bottom-right corner of the screen
// (the desktop pet's default spot, above the taskbar):
// A · Tapomo te lo enseña (the desktop pet holds up a sign), B · Aviso Tapomo (a custom toast
// window), C · Tapomo + tarjeta (the pet reacts and a small card sits next to it).
// Decided 2026-11-05: approved as shown (the setting, «Automático (según el aviso)» by default, and the
// mapping table); it lives in «Ya decidido».
(() => {
  const E = window.Estudios;
  if (!E) return;
  const { el, btn, seg, later, tapomo, bubble, hush, talk, dur, calm } = E;
  const fmt = (n) => n.toLocaleString('es-ES');
  const xpFor = E.R.xpFor;
  const span7 = xpFor(8) - xpFor(7);
  const span8 = xpFor(9) - xpFor(8);

  // ------------------------------------------------------------------ events (texts from ui/locales/es.json where they exist)
  const EV = {
    reward: {
      label: 'Nivel + premio', kind: 'level', reward: 'lacito', eyebrow: '¡Nivel 7!', title: 'Estreno: Lacito', short: 'Lacito nuevo',
      sub: 'Accesorio', xp: `faltan ${fmt(Math.round(span7 * 0.96))} XP para el nivel 8`, pct: 4, open: 'Armario', action: 'Ponérmelo',
      face: { eyes: 'sparkle', mouth: 'big', cheeks: true }, say: '¡Mira! 👀', more: '¿Me queda bien? 😊', ms: 9000,
    },
    plain: {
      label: 'Nivel', kind: 'level', eyebrow: '¡Nivel 8!', title: '¡Tapomo está orgulloso de ti!', short: '¡Sigue así!',
      sub: 'Próximo premio en el nivel 10: Fresa', xp: `faltan ${fmt(Math.round(span8 * 0.96))} XP para el nivel 9`, pct: 4, open: 'Hoy',
      face: { eyes: 'sparkle', mouth: 'big', cheeks: true }, say: '¡Toma ya! 🎉', more: 'A por el 10 💪', ms: 7000,
    },
    challenge: {
      label: 'Un reto', kind: 'challenge', eyebrow: '¡Reto cumplido!', title: 'Escribe 2.000 caracteres hoy', short: '+15 XP',
      sub: '+15 XP · 2 de 3 retos', open: 'Retos del día', face: { eyes: 'star', mouth: 'open', cheeks: true }, say: '¡Reto hecho! ✓', more: 'Queda uno 😉', ms: 7000,
    },
    all: {
      label: 'Pleno', kind: 'all', eyebrow: '¡Pleno!', title: 'Retos del día completados', short: '3 de 3 · +15 XP extra',
      sub: '3 de 3 · +15 XP extra · Mañana, más.', open: 'Retos del día', face: { eyes: 'star', mouth: 'open', cheeks: true }, say: '¡Pleno! 🏆', more: 'Mañana, más 😊', ms: 8000, confetti: true,
    },
  };
  const opt = { ev: 'reward', notify: true, wins: false };

  // ------------------------------------------------------------------ pieces
  function confetti(host, n = 18) {
    if (calm()) return;
    const c = el('div', 'lu-confetti av-confetti');
    c.setAttribute('aria-hidden', 'true');
    const cols = ['#ff9e7a', '#ffc93c', '#74d6bf', '#8ccbf0', '#c4a8f0', '#f0764a'];
    for (let i = 0; i < n; i++) {
      const p = el('i', i % 4 === 3 ? 'lu-dot' : '');
      p.style.cssText = `--x:${(6 + Math.random() * 88).toFixed(1)}%;--s:${6 + Math.round(Math.random() * 4)}px;--c:${cols[i % cols.length]};--d:${(1400 + Math.random() * 900) | 0}ms;--w:${(Math.random() * 400) | 0}ms;--dx:${((Math.random() - 0.5) * 50) | 0}px;--r:${((Math.random() - 0.5) * 600) | 0}deg`;
      c.append(p);
    }
    host.append(c);
    later(3200, () => c.remove());
  }
  /** Badge used where there's no mascot picture (challenges). */
  function badge(ev) {
    const b = el('div', `av-badge av-badge-${ev.kind}`);
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = ev.kind === 'all'
      ? '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#ffc93c" stroke="#23202b" stroke-width="2.4"/><polygon points="20,9.5 23.2,16.2 30.5,17 25,22 26.5,29.3 20,25.7 13.5,29.3 15,22 9.5,17 16.8,16.2" fill="#fff8e0" stroke="#23202b" stroke-width="2" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#74d6bf" stroke="#23202b" stroke-width="2.4"/><path d="M12.5 20.5l5 5 10-11" fill="none" stroke="#23202b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return b;
  }
  function closeX(fn) {
    const x = btn('', 'av-x');
    x.setAttribute('aria-label', 'Cerrar');
    x.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    x.addEventListener('click', (e) => { e.stopPropagation(); fn('x'); });
    return x;
  }
  /** Auto-dismiss line: a CSS animation; hovering the card pauses it, its end closes the card. */
  function timer(card, ms, fn) {
    const t = el('i', 'av-timer');
    t.style.setProperty('--t', `${dur(ms)}ms`);
    t.addEventListener('animationend', () => fn('auto'));
    card.append(t);
  }
  function snapshot(look) {
    const s = tapomo(look, { eyes: 'sparkle', mouth: 'big', cheeks: true });
    s.classList.add('av-snap');
    return s;
  }
  const bar = (pct) => { const b = el('div', 'av-bar'); const i = el('i'); i.style.width = `${pct}%`; b.append(i); return b; };

  // ------------------------------------------------------------------ the screen corner
  const screen = () => E.desktop();

  // ------------------------------------------------------------------ variants
  const V = {
    a: {
      title: 'A · Tapomo te lo enseña',
      desc: 'El Tapomo de escritorio da un salto y levanta un cartel con el aviso, sujeto con sus manitas. Con premio, se lo pone en el aire. Con el pleno, confeti.',
      tech: [
        'Sin ventana nueva: la del Tapomo de escritorio (pet.rs) crece de 210 × 210 a unos 230 × 270 mientras enseña el cartel, anclada por los pies, y luego vuelve.',
        'Ya es WS_EX_NOACTIVATE y nunca coge el foco: el clic funciona sin sacarte del documento. El «click-through» debe contar el rectángulo del cartel además del cuerpo.',
        'Si Tapomo está escondido (ajuste, 1 hora, modo vergonzoso, pantalla completa), el aviso espera a que vuelva, o cae a B.',
        'Varios monitores: sale donde esté Tapomo; cerca de un borde, el cartel se mete hacia dentro.',
      ],
      show(ctx, ev) {
        const { pet, svg } = ctx;
        const sign = el('div', 'av-sign');
        sign.setAttribute('role', 'status');
        sign.append(el('div', 'av-eyebrow', ev.eyebrow), el('div', 'av-title', ev.kind === 'level' ? (ev.reward ? ev.title : ev.short) : ev.title));
        if (ev.kind === 'level') sign.append(bar(ev.pct));
        else sign.append(el('div', 'av-sub', ev.kind === 'all' ? ev.short : ev.sub));
        sign.append(el('span', 'av-mitt av-mitt-l'), el('span', 'av-mitt av-mitt-r'), closeX(ctx.done));
        sign.querySelectorAll('.av-mitt').forEach((m) => (m.style.background = E.bodyFill(svg)));
        sign.addEventListener('click', () => ctx.open(ev));
        timer(sign, ev.ms - 1500, ctx.done);
        const say = talk.v !== 'silencioso';
        pet.classList.add('grow-a');
        if (say) bubble(ctx.core, ev.say, 1300);
        later(say ? 1100 : 150, () => {
          if (!ctx.live()) return;
          hush(ctx.core);
          jump(ctx, ev);
          pet.append(sign);
          ctx.card = sign;
        });
      },
      after(ctx, ev) { if (talk.v === 'parlanchin') bubble(ctx.core, ev.more, 2200); },
    },
    b: {
      title: 'B · Aviso Tapomo',
      desc: 'Un aviso propio con el estilo del popup de la app, que entra por la derecha encima de la barra de tareas. Tapomo no hace nada: como mucho mira hacia arriba.',
      tech: [
        'Una ventana Tauri más («toast»): transparente, sin bordes, siempre encima, fuera de la barra de tareas, focused(false) + WS_EX_NOACTIVATE. Se crea al avisar y se cierra al acabar.',
        'Monitor: el de la ventana activa (o el principal), abajo a la derecha del área de trabajo. Si Tapomo está en esa esquina, el aviso se apila encima.',
        'Sale aunque Tapomo esté escondido. Con pantalla completa o «No molestar» espera (platform::fullscreen_busy ya existe).',
        'Sustituye a la notificación nativa de Windows, que puede quedarse como plan B si la ventana fallara.',
      ],
      show(ctx, ev, base) {
        const t = el('div', 'av-toast');
        t.setAttribute('role', 'status');
        const head = el('div', 'av-toast-head');
        head.append(el('span', 'av-tray-ic'), el('span', '', 'Tapomo · ahora'), closeX(ctx.done));
        const row = el('div', 'av-toast-row');
        const pic = el('div', 'av-pic');
        if (ev.kind === 'level') pic.append(snapshot(ev.reward ? { skin: base.skin, acc: [...base.acc, ev.reward] } : base));
        else pic.append(badge(ev));
        const txt = el('div', 'av-txt');
        txt.append(el('div', 'av-eyebrow', ev.eyebrow), el('div', 'av-title', ev.title));
        if (ev.kind === 'level') txt.append(bar(ev.pct), el('div', 'av-sub', ev.reward ? ev.xp : ev.sub));
        else txt.append(el('div', 'av-sub', ev.sub));
        row.append(pic, txt);
        t.append(head, row);
        if (ev.action) {
          const nav = el('div', 'av-toast-nav');
          const wear = btn(ev.action, 'av-btn');
          const see = btn('Abrir Tapomo', 'av-btn av-ghost');
          wear.addEventListener('click', (e) => { e.stopPropagation(); ctx.log(`«${ev.action}»: se lo pone sin abrir la app; el aviso dice «¡Puesto!» y se cierra.`); wear.textContent = '✓ ¡Puesto!'; wear.disabled = true; });
          see.addEventListener('click', (e) => { e.stopPropagation(); ctx.open(ev); });
          nav.append(see, wear);
          t.append(nav);
        }
        t.addEventListener('click', () => ctx.open(ev));
        timer(t, ev.ms, ctx.done);
        ctx.screen.append(t);
        ctx.card = t;
        later(250, () => ctx.live() && Mascot.look(ctx.svg, -0.3, -1));
      },
      after(ctx) { Mascot.look(ctx.svg, 0, 0); },
    },
    c: {
      title: 'C · Tapomo + tarjeta',
      desc: 'Tapomo salta (y dice algo según cómo hable) y a su lado aparece una tarjeta pequeña con el aviso, con una colita que apunta a él. Celebra más que B y ocupa menos que A.',
      tech: [
        'Como A: la ventana del Tapomo crece hacia un lado (izquierda; derecha si está pegado al borde izquierdo) y la tarjeta le sigue si lo arrastras.',
        'Tarjeta corta: título y una línea; el botón solo cuando hay premio.',
        'Si Tapomo está escondido: sale solo la tarjeta, con su mini-Tapomo, en la misma esquina (como B).',
        'Mismo foco y click-through que A: el rectángulo de la tarjeta se suma al del cuerpo.',
      ],
      show(ctx, ev) {
        const { pet } = ctx;
        const c = el('div', 'av-mini');
        c.setAttribute('role', 'status');
        const row = el('div', 'av-mini-row');
        if (ev.kind !== 'level') row.append(badge(ev));
        const txt = el('div', 'av-txt');
        txt.append(el('div', 'av-eyebrow', ev.eyebrow), el('div', 'av-title', ev.kind === 'level' && !ev.reward ? ev.short : ev.title), el('div', 'av-sub', ev.kind === 'level' ? (ev.reward ? ev.sub : ev.sub) : ev.short));
        row.append(txt);
        c.append(row, closeX(ctx.done));
        if (ev.action) {
          const wear = btn(ev.action, 'av-btn av-btn-s');
          wear.addEventListener('click', (e) => { e.stopPropagation(); ctx.log(`«${ev.action}»: ya lo lleva puesto; la tarjeta dice «¡Puesto!».`); wear.textContent = '✓ ¡Puesto!'; wear.disabled = true; });
          c.append(wear);
        }
        c.addEventListener('click', () => ctx.open(ev));
        timer(c, ev.ms - 1000, ctx.done);
        pet.classList.add('grow-c');
        jump(ctx, ev);
        if (talk.v !== 'silencioso') later(300, () => ctx.live() && bubble(ctx.core, ev.say, 1800));
        later(380, () => { if (!ctx.live()) return; pet.append(c); ctx.card = c; });
      },
      after(ctx, ev) { if (talk.v === 'parlanchin') bubble(ctx.core, ev.more, 2200); },
    },
  };

  function jump(ctx, ev) {
    Mascot.setFace(ctx.svg, ev.face);
    Mascot.jump(ctx.svg, { big: true });
    if (ev.reward) {
      const r = ctx.svg.querySelector(`[data-acc="${ev.reward}"]`);
      if (r) later(300, () => { r.style.opacity = ''; if (!calm()) r.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: dur(420), easing: 'cubic-bezier(.34,1.56,.64,1)' }); });
    }
    if (ev.confetti || (ctx.v === 'a' && ev.reward)) confetti(ctx.pet); // the sign celebrates rewards too
  }

  // ------------------------------------------------------------------ run (one desktop mock on the lab's stage)
  // The future setting «Avisos fuera de la app»: Automático (by event) or one design for everything.
  const AUTO = { reward: 'a', all: 'a', plain: 'c', challenge: 'b' };
  const st = { mode: 'auto', gen: 0 };
  const pick = (ev) => (st.mode === 'auto' ? AUTO[ev] : st.mode);
  let mock = null; // { screen, pet, core, stage, s }
  function ensureMock() {
    if (!mock) mock = screen();
    mock.s.classList.toggle('show-win', opt.wins);
    E.takeStage('avisos', mock.s, () => { st.gen++; });
    return mock;
  }
  function run() {
    E.play('avisos');
    const x = ensureMock();
    const v = pick(opt.ev);
    show();
    st.gen++;
    const gen = st.gen;
    const ev = EV[opt.ev];
    const base = E.current();
    x.s.querySelectorAll('.av-toast, .av-sign, .av-mini, .av-confetti').forEach((n) => n.remove());
    x.pet.classList.remove('grow-a', 'grow-c');
    hush(x.core);
    // The desktop pet wears what the lab's Tapomo wears in «Premios»; with a reward it already has it on, hidden until the jump.
    const look = ev.reward ? { skin: base.skin, acc: [...base.acc.filter((k) => k !== ev.reward), ev.reward] } : base;
    const svg = tapomo(look);
    if (ev.reward) { const r = svg.querySelector(`[data-acc="${ev.reward}"]`); if (r) r.style.opacity = '0'; }
    x.stage.replaceChildren(svg);
    const ctx = {
      v, screen: x.s, pet: x.pet, core: x.core, stage: x.stage, svg, card: null,
      live: () => st.gen === gen,
      log: (t) => { logEl.textContent = t; },
      open: (e) => { logEl.textContent = `Clic: se abriría Tapomo en «${e.open}» (la ventana principal pasa delante; el aviso se cierra).`; ctx.done('open'); },
      done: (why) => {
        if (!ctx.live() || ctx.closed) return;
        ctx.closed = true;
        const c = ctx.card;
        if (c) { c.classList.add('av-out'); later(260, () => c.remove()); }
        x.pet.classList.remove('grow-a', 'grow-c');
        Mascot.setFace(svg, {});
        if (why === 'auto') logEl.textContent = 'Se ha cerrado solo. Con el ratón encima espera.';
        if (why === 'x') logEl.textContent = 'Cerrado con la ×.';
        later(300, () => ctx.live() && V[v].after(ctx, ev));
      },
    };
    logEl.textContent = '';
    if (!opt.notify) {
      if (v !== 'b') { Mascot.setFace(svg, ev.face); Mascot.jump(svg, { big: false }); later(900, () => Mascot.setFace(svg, {})); }
      logEl.textContent = v === 'b' ? 'Avisos desactivados: no sale nada fuera de la app.' : 'Avisos desactivados: solo un saltito, sin cartel ni texto.';
      return;
    }
    later(350, () => ctx.live() && V[v].show(ctx, ev, base));
  }

  // ------------------------------------------------------------------ fieldset
  const { body, set } = E.addDecided('avisos', 'Avisos fuera de la app', '2026-11-05', 'Aprobado tal cual: ajuste «Avisos fuera de la app» con estilo «Automático (según el aviso)» por defecto, o Cartel / Aviso / Tarjeta fijo para todo. Automático reparte como dice la tabla.');
  set('stop', () => { st.gen++; });
  set('onAnchor', () => run());
  body.append(el('p', 'note', 'Las subidas de nivel y los retos cumplidos pasan desapercibidos si la ventana de Tapomo está detrás, y la notificación de Windows es muy sosa. Al lanzar un aviso, el escenario muestra la esquina de la pantalla (Bloc de notas, barra de tareas y el Tapomo de escritorio, con su ropa de «Premios»).'));
  const desc = el('p', 'note');
  const tech = el('div');
  const NAMES = { a: 'A · Cartel', b: 'B · Aviso', c: 'C · Tarjeta' };
  // Mock of the setting: «Avisos fuera de la app» on/off (exists today for challenges) + its style.
  const setBox = el('div', 'rw');
  const modeSeg = seg('Estilo', [['auto', 'Automático (según el aviso)'], ['a', 'Cartel'], ['b', 'Aviso'], ['c', 'Tarjeta']], () => st.mode, (v) => { st.mode = v; run(); });
  const tbl = el('table', 'pack av-auto');
  tbl.innerHTML = '<thead><tr><th>Aviso</th><th>Automático elige</th></tr></thead>';
  const tb = el('tbody');
  const ROWS = [['reward', 'Subida de nivel con premio', 'A · Cartel (+ confeti)'], ['all', 'Pleno de retos', 'A · Cartel (+ confeti)'], ['plain', 'Subida de nivel sin premio', 'C · Tarjeta'], ['challenge', 'Un reto hecho', 'B · Aviso (discreto)']];
  const rowEls = {};
  for (const [k, a, b] of ROWS) { const tr = el('tr'); tr.append(el('td', '', a), el('td', '', b)); tb.append(tr); rowEls[k] = tr; }
  tbl.append(tb);
  function show() {
    const v = pick(opt.ev);
    desc.replaceChildren(el('b', '', `Ahora sale ${NAMES[v]}. `), V[v].desc);
    tech.replaceChildren(el('p', 'rw-sub', `Técnica de ${NAMES[v]}`), E.list(V[v].tech));
    for (const [k, tr] of Object.entries(rowEls)) tr.classList.toggle('on', st.mode === 'auto' && k === opt.ev);
  }
  const evs = seg('Tipo de aviso', Object.entries(EV).map(([k, e]) => [k, e.label]), () => opt.ev, (v) => { opt.ev = v; run(); });
  const nt = seg('Avisos fuera de la app', [[true, 'sí'], [false, 'no']], () => opt.notify, (v) => { opt.notify = v; run(); });
  setBox.append(el('p', 'rw-sub', 'Ajuste de la app (maqueta)'), nt.box, modeSeg.box, el('p', 'note', 'Por defecto, Automático: la app elige según el aviso. Quien quiera, fija uno para todo.'), tbl);
  const bs = el('div', 'btns');
  const go = btn('▶ Lanzar el aviso');
  go.addEventListener('click', run);
  const wl = el('label');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.addEventListener('change', () => { opt.wins = cb.checked; if (mock) mock.s.classList.toggle('show-win', cb.checked); });
  wl.append(cb, 'Ver los bordes de las ventanas');
  bs.append(go, E.backBtn(), wl);
  const logEl = el('p', 'note');
  logEl.setAttribute('role', 'status');
  const rules = el('details', 'rules-d');
  rules.append(el('summary', '', 'Reglas comunes'), E.list([
    'Solo cuando la ventana principal no está delante; si la estás mirando, sale el popup de dentro (como hoy con las notificaciones).',
    'Ajuste: hoy es «Avisarme con una notificación de Windows al completar un reto». Propuesta: «Avisarme fuera de la ventana: retos y subidas de nivel», apagado hasta que se pida.',
    'Nunca roban el foco: puedes seguir escribiendo. Clic = abrir Tapomo en la página que toca. Se cierran solos; con el ratón encima esperan.',
    'De uno en uno: el pleno sustituye al reto suelto (como ya hace notify.rs); una subida de nivel que llega a la vez espera a que se cierre el anterior.',
    'Silencioso / normal / parlanchín solo cambian lo que DICE Tapomo (bocadillos); el cartel o la tarjeta salen igual si los avisos están activados.',
  ]));
  body.append(setBox, evs.box, desc, E.talkSeg(), bs, logEl, tech, rules);
  show();

  window.AvisosLab = { run, opt, mode: (v) => { st.mode = v; modeSeg.sync(); show(); } };
})();
