// Lab only: «Hay una actualización» study. When Tapomo finds a new version, the desktop pet shows it
// (once, then only a small sign stays), its right-click menu gets «Actualizar a la versión X», the
// pet shows the download / install, and after the restart it says «¡Me he actualizado!».
// A · Regalito (a small gift box with an up arrow next to the pet + one bubble),
// B · Paquete (the pet holds a parcel with a ribbon and shakes it now and then),
// C · Puntito (a soft glowing dot on the keycap; bubble only in parlanchín).
// Two flavours: GitHub build (Tapomo's own updater, updater.rs) and Microsoft Store build (Windows installs).
(() => {
  const E = window.Estudios;
  if (!E) return;
  const INK = '#23202b';
  const NS = E.NS;
  const { el, btn, seg, later, tapomo, overlay, bubble, hush, talk, dur, calm } = E;
  const VER = '1.1.0';

  // ------------------------------------------------------------------ drawings
  // A: on the floor next to Tapomo (outside the body, so it doesn't hop with it).
  const GIFT_A = `<g class="up-gift">
      <g class="up-arrow"><path d="M146 92 V104 M140.5 97.5 L146 92 L151.5 97.5" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M146 92 V104 M140.5 97.5 L146 92 L151.5 97.5" fill="none" stroke="#3ddc97" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>
      <g class="up-box" stroke-linejoin="round">
        <rect x="134" y="117" width="24" height="20" rx="3.5" fill="#74d6bf" stroke="${INK}" stroke-width="2.2"/>
        <rect x="132" y="111" width="28" height="8" rx="3" fill="#8fe3cd" stroke="${INK}" stroke-width="2.2"/>
        <path d="M146 111 V137" stroke="#ffcc4d" stroke-width="4"/><path d="M146 111 V137" stroke="${INK}" stroke-width="1" opacity=".35"/>
        <path d="M146 111 Q139 102 136.5 107 Q137 112 146 111 Q153 102 155.5 107 Q155 112 146 111 Z" fill="#ffcc4d" stroke="${INK}" stroke-width="1.8"/>
        <path d="M136.5 121 Q137 119 139 118.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
      </g>
      <g class="up-ring"><circle cx="146" cy="124" r="17" fill="none" stroke="${INK}" stroke-opacity=".15" stroke-width="3.4"/>
        <circle class="up-ring-fill" cx="146" cy="124" r="17" fill="none" stroke="#3ddc97" stroke-width="3.4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 146 124)"/></g>
    </g>`;
  // B: a parcel held in front of the belly, with two mittens.
  const PARCEL_B = `<g class="up-parcel" stroke-linejoin="round">
      <rect x="61" y="110" width="38" height="28" rx="4" fill="#d9a86c" stroke="${INK}" stroke-width="2.2"/>
      <path d="M61 121 H99" stroke="#e8384f" stroke-width="4"/><path d="M80 110 V138" stroke="#e8384f" stroke-width="4"/>
      <path d="M80 110 Q70 100 66.5 105 Q67 111 80 110 Q90 100 93.5 105 Q93 111 80 110 Z" fill="#ff5a6e" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="80" cy="110" r="2.6" fill="#e8384f" stroke="${INK}" stroke-width="1.4"/>
      <path d="M65 114 Q66 112.5 68 112.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
      <path d="M86 129 h8 M86 133 h5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity=".35"/>
      <circle cx="59" cy="128" r="6" fill="__BODY__" stroke="${INK}" stroke-width="2.2"/>
      <circle cx="101" cy="128" r="6" fill="__BODY__" stroke="${INK}" stroke-width="2.2"/>
    </g>`;
  // C: a soft dot on the keycap's top-right corner, with a slow glow.
  const DOT_C = `<g class="up-dot">
      <circle class="up-dot-glow" cx="117" cy="53" r="7" fill="#ffc93c"/>
      <circle cx="117" cy="53" r="6.2" fill="#ffc93c" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="115.6" cy="51.6" r="1.4" fill="#fff" opacity=".9"/>
    </g>`;

  const V = {
    a: {
      title: 'A · Regalito', say: '¡Hay versión nueva! 🎁', sayParl: true,
      desc: 'Aparece una cajita de regalo con una flecha hacia arriba a su lado y Tapomo lo dice una vez. Después solo se queda la cajita, que da un saltito de vez en cuando.',
      notes: ['Al descargar, un anillo alrededor de la caja se va llenando.', 'Clic en la cajita: abre Tapomo en la tarjeta de la actualización.'],
      gh: 'GitHub: la cajita y el menú dicen la versión; «Actualizar» descarga e instala aquí mismo y Tapomo se reinicia solo.',
      store: 'Store: la misma cajita; la entrada del menú abre la página de Tapomo en Microsoft Store, que hace el resto.',
      setup(svg) {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'st-ov up-a');
        g.innerHTML = GIFT_A;
        svg.querySelector('.m-fx').before(g);
      },
    },
    b: {
      title: 'B · Paquete', say: 'Me ha llegado un paquete 📦', sayParl: true,
      desc: 'Tapomo sujeta un paquetito con lazo rojo y de vez en cuando lo agita, como quien adivina qué hay dentro. Lo dice una vez; luego solo el paquete.',
      notes: ['Lo suelta mientras escribes (las manitas no estorban) y lo vuelve a coger en las pausas.', 'Al instalar, desata el lazo; la barra sale debajo, donde la de ritmo.'],
      gh: 'GitHub: «Actualizar» abre el paquete: descarga, instala y reinicia.',
      store: 'Store: el paquete «se lo lleva el cartero»: la entrada del menú abre Microsoft Store y Windows instala.',
      setup(svg) { overlay(svg, PARCEL_B, 'up-b'); },
    },
    c: {
      title: 'C · Puntito',
      say: 'Psst… hay versión nueva ✨', sayParl: false,
      desc: 'Un puntito dorado que brilla flojito en la esquina de la tecla, como el aviso de una app del móvil. Solo habla en modo parlanchín.',
      notes: ['Lo más discreto: si no te fijas, no molesta nada.', 'Pasar el ratón por encima: «Versión ' + VER + ' lista · clic derecho para actualizar».'],
      gh: 'GitHub: igual que A y B; durante la descarga el puntito late más rápido.',
      store: 'Store: el puntito se queda hasta que Windows termina; Tapomo no ve el progreso.',
      setup(svg) { overlay(svg, DOT_C, 'up-c'); },
    },
  };

  const opt = { flavour: 'gh', v: 'b' }; // decided 2026-11-05: B · Paquetito
  let story = 0;
  // c = { s (screen), pet, core, svg, gen, shake } — one desktop mock on the lab's stage.
  let c = null;

  function screen() {
    const d = E.desktop();
    d.s.classList.add('up-screen');
    d.pet.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(); });
    return { ...d, gen: 0, shake: 0, svg: null };
  }
  /** Shows the mock on the stage with the desktop pet (wearing the lab's outfit) and the variant's sign. */
  function ensure() {
    E.play('actualizacion');
    if (!c) c = screen();
    if (!c.svg || c.v !== opt.v || c.look !== JSON.stringify(E.current())) {
      c.svg = tapomo();
      V[opt.v].setup(c.svg);
      if (opt.v === 'c') c.svg.querySelector('.up-dot').insertAdjacentHTML('beforeend', `<title>Versión ${VER} lista · clic derecho para actualizar</title>`);
      c.svg.querySelector('.up-gift')?.addEventListener('click', () => { log.textContent = 'Clic en la cajita: se abriría Tapomo en la tarjeta de la actualización.'; });
      c.stage.replaceChildren(c.svg);
      c.v = opt.v;
      c.look = JSON.stringify(E.current());
    }
    E.takeStage('actualizacion', c.s, () => { c.gen++; clearInterval(c.shake); });
    return c;
  }

  // ------------------------------------------------------------------ menu (Windows 11 context menu look)
  function openMenu() {
    ensure();
    if (!c.s.classList.contains('found')) found();
    c.gen++; // a pending «found» bubble must not pop up over the menu
    c.s.querySelectorAll('.up-menu, .up-cursor').forEach((n) => n.remove());
    hush(c.core);
    const m = el('ul', 'up-menu');
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', 'Menú de Tapomo (clic derecho)');
    const upd = opt.flavour === 'gh' ? `Actualizar a la versión ${VER}` : 'Actualizar desde Microsoft Store…';
    const items = [[upd, 'new'], ['sep'], ['Abrir Tapomo'], ['Dime algo'], ['Esconderte 1 hora'], ['Ocultar a Tapomo'], ['sep'], ['Pausar medición', 'check']];
    for (const [t, k] of items) {
      if (t === 'sep') { const sp = el('li', 'up-sep'); sp.setAttribute('role', 'separator'); m.append(sp); continue; }
      const li = el('li', k === 'new' ? 'up-new' : '');
      li.setAttribute('role', 'menuitem');
      li.append(el('span', k === 'new' ? 'up-ic' : k === 'check' ? 'up-chk' : 'up-pad'), el('span', '', t));
      li.addEventListener('click', () => { m.remove(); cur.remove(); if (k === 'new') progress(); });
      m.append(li);
    }
    // Right-click on Tapomo near the bottom-right corner: Windows opens the menu up and to the left of the cursor.
    const cur = el('i', 'up-cursor');
    cur.setAttribute('aria-hidden', 'true');
    c.s.append(m, cur);
    later(700, () => m.querySelector('.up-new')?.classList.add('hl'));
  }

  // ------------------------------------------------------------------ phases
  function reset() {
    c.gen++;
    c.s.querySelectorAll('.up-menu, .up-cursor, .up-prog, .up-store').forEach((n) => n.remove());
    c.s.classList.remove('found', 'busy');
    hush(c.core);
    clearInterval(c.shake);
    Mascot.setFace(c.svg, {});
    c.svg.style.opacity = '';
    c.svg.querySelector('.up-ring-fill')?.setAttribute('stroke-dashoffset', '100');
  }
  function found() {
    ensure();
    reset();
    const g = c.gen;
    c.s.classList.add('found');
    const v = V[opt.v];
    // Shown once: one bubble (C only in parlanchín), then only the sign stays.
    const speak = talk.v === 'parlanchin' || (talk.v === 'normal' && v.sayParl);
    if (speak) later(600, () => c.gen === g && bubble(c.core, v.say, 2600));
    if (opt.v === 'b') {
      const shake = () => {
        const p = c.svg.querySelector('.up-parcel');
        if (p && !calm()) p.animate([{ transform: 'none' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(4deg)' }, { transform: 'none' }], { duration: dur(620), easing: 'ease-in-out' });
      };
      later(900, shake);
      c.shake = setInterval(shake, dur(4500));
    }
    if (opt.v === 'a') later(300, () => c.gen === g && Mascot.look(c.svg, 1, 0.6));
    later(1400, () => c.gen === g && Mascot.look(c.svg, 0, 0));
  }
  function progress() {
    ensure();
    const g = ++c.gen;
    c.s.querySelectorAll('.up-menu, .up-cursor').forEach((n) => n.remove());
    hush(c.core);
    clearInterval(c.shake);
    c.s.classList.add('found', 'busy');
    Mascot.setFace(c.svg, { eyes: 'round', mouth: 'small' });
    if (opt.flavour === 'store') {
      c.s.classList.remove('busy'); // Windows installs: Tapomo sees no progress
      if (talk.v !== 'silencioso') bubble(c.core, 'Te abro la Tienda ✨', 1800);
      const w = el('div', 'up-store');
      w.setAttribute('aria-hidden', 'true');
      w.innerHTML = `<div class="up-store-bar"><span class="up-store-ic"></span>Microsoft Store</div><div class="up-store-body"><span class="av-tray-ic up-store-app"></span><div><b>Tapomo</b><small>Actualización disponible</small></div><span class="up-store-btn">Actualizar</span></div>`;
      later(900, () => c.gen === g && c.s.append(w));
      later(3400, () => { if (c.gen !== g) return; w.remove(); restart(g); });
      return;
    }
    const p = el('div', 'up-prog');
    p.setAttribute('role', 'status');
    const t = el('span', '', 'Descargando… 0 %');
    const b = el('div', 'up-bar');
    const i = el('i');
    b.append(i);
    p.append(b, t);
    c.core.append(p);
    const ring = c.svg.querySelector('.up-ring-fill');
    const T = 3000;
    const t0 = performance.now();
    const step = (now) => {
      if (c.gen !== g) return;
      const k = Math.min(1, (now - t0) / dur(T));
      const pct = Math.round(k * 100);
      i.style.width = `${pct}%`;
      t.textContent = `Descargando… ${pct} %`;
      if (ring) ring.setAttribute('stroke-dashoffset', String(100 - pct));
      if (k < 1) requestAnimationFrame(step);
      else {
        t.textContent = 'Instalando… Tapomo se reiniciará';
        p.classList.add('installing');
        later(1600, () => { if (c.gen !== g) return; p.remove(); restart(g); });
      }
    };
    requestAnimationFrame(step);
  }
  /** Tapomo closes (falls asleep and fades), the new version opens, and it says so once. */
  function restart(g) {
    c.s.classList.remove('busy');
    Mascot.setFace(c.svg, { eyes: 'closed', mouth: 'small' });
    c.svg.style.opacity = '0';
    later(900, () => {
      if (c.gen !== g) return;
      c.svg.style.opacity = '';
      reborn(g);
    });
  }
  /** Decided flow: the new version opens. What Tapomo does then is the «Después de actualizar» study. */
  function reborn(g) {
    c.svg.querySelector('.up-ring-fill')?.setAttribute('stroke-dashoffset', '100');
    c.s.classList.remove('found', 'busy');
    Mascot.setFace(c.svg, {});
    log.textContent = 'Tapomo se ha reiniciado con la versión nueva. Lo que hace al volver está en «Después de actualizar» (pendiente).';
    later(100, () => c.gen === g && Mascot.jump(c.svg, { big: false }));
  }
  function after(g) {
    ensure();
    if (g === undefined) g = ++c.gen;
    c.s.querySelectorAll('.up-menu, .up-cursor, .up-prog, .up-store').forEach((n) => n.remove());
    c.s.classList.remove('found', 'busy');
    clearInterval(c.shake);
    c.svg.querySelector('.up-ring-fill')?.setAttribute('stroke-dashoffset', '100');
    Mascot.setFace(c.svg, { eyes: 'sparkle', mouth: 'big', cheeks: true });
    Mascot.jump(c.svg, { big: talk.v !== 'silencioso' });
    if (talk.v === 'silencioso') {
      // No words: a small sparkle; the news wait inside the app («Novedades» on the next open).
      later(200, () => Mascot.burstStars(c.svg, 5, 0.6));
      log.textContent = 'Silencioso: sin bocadillo; las novedades esperan dentro de la app.';
      later(1500, () => c.gen === g && Mascot.setFace(c.svg, {}));
      return;
    }
    later(500, () => {
      if (c.gen !== g) return;
      const b = bubble(c.core, '', 7000);
      b.classList.add('up-hi');
      b.replaceChildren(el('b', '', '¡Me he actualizado!'), document.createElement('br'), el('u', '', 'Mira las novedades'));
      b.onclick = () => { log.textContent = `Clic: se abriría Tapomo en «Novedades de la ${VER}».`; b.hidden = true; };
    });
    later(1500, () => c.gen === g && Mascot.setFace(c.svg, {}));
  }
  const PH = { found, menu: openMenu, progress, after: () => after() };
  function phase(p) { story++; log.textContent = ''; PH[p](); }
  function all() {
    const r = ++story;
    log.textContent = '';
    found();
    later(3600, () => r === story && openMenu());
    later(5600, () => { if (r !== story) return; const n = c.s.querySelector('.up-new'); if (n) n.click(); });
  }

  // ------------------------------------------------------------------ fieldset («Ya decidido»: only B)
  // Decided 2026-11-05: B · Paquetito. A and C stay in the code above but are no longer offered;
  // the «after restart» moment moved to the «Después de actualizar» study (reinicio.js).
  const { body, set } = E.addDecided('actualizacion', 'Hay una actualización', '2026-11-05', 'B · Paquetito: Tapomo sujeta un paquete con lazo rojo y lo agita de vez en cuando. Lo dice una vez y luego solo queda el paquete. El clic derecho trae «Actualizar a la versión X» (GitHub) o «Actualizar desde Microsoft Store…» (Store).');
  set('stop', () => { story++; if (c) { c.gen++; clearInterval(c.shake); } });
  set('onAnchor', () => phase('found'));
  body.append(el('p', 'note', 'El escenario muestra la esquina de la pantalla con el Tapomo de escritorio (ropa de «Premios»); clic derecho sobre él abre el menú.'));
  const fl = seg('Versión', [['gh', 'GitHub'], ['store', 'Microsoft Store']], () => opt.flavour, (v) => { opt.flavour = v; phase('found'); });
  const bs = el('div', 'btns');
  const st1 = btn('↻ Todo seguido');
  st1.addEventListener('click', all);
  bs.append(st1);
  for (const [t, p] of [['1 · Versión nueva', 'found'], ['2 · Clic derecho', 'menu'], ['3 · Actualizar', 'progress']]) {
    const b = btn(t);
    b.addEventListener('click', () => phase(p));
    bs.append(b);
  }
  const back = E.backBtn();
  back.className = '';
  bs.append(back);
  const log = el('p', 'note');
  log.setAttribute('role', 'status');
  body.append(fl.box, E.talkSeg(), bs, log, E.list([...V.b.notes, V.b.gh, V.b.store, 'Nunca insiste: el bocadillo sale una sola vez por versión. Mientras escribes, nada se mueve.']));

  window.ActualizaLab = { phase, all, opt };
})();
