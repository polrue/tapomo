// Lab only: «Gafas + gafas de sol de racha» study. When Tapomo beats its own pace (zone «beating»,
// Mascot.setZone → setShades) it slides the black sunglasses on. Today, glasses from the wardrobe
// just fade out underneath (rewards.js / ui/wardrobe.css: [data-shades="on"] .rw-glasses { opacity: 0 }).
// Played on the lab's real Tapomo with the glasses it wears in «Premios» (the real drawings, so the
// «de sol de chulito» keep their dark lenses). Hoy = today; A · Voltereta, B · Pinza, C · Fotocromáticas.
(() => {
  const E = window.Estudios;
  if (!E) return;
  const INK = '#23202b';
  const { el, btn, seg, later, overlay, defs, calm, dur } = E;
  const svg = E.mascot;
  const DARK = `<linearGradient id="gs-dark-__N__" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#140f22"/><stop offset=".6" stop-color="#2a2150"/><stop offset="1" stop-color="#5a48a8"/></linearGradient>`;

  // ------------------------------------------------------------------ geometry of the worn glasses
  function lenses() {
    const g = svg.querySelector('.rw-glasses');
    if (!g) return null;
    const circles = [...g.querySelectorAll('circle')].slice(0, 2);
    if (circles.length === 2 && circles[0].getAttribute('r')) {
      const [a, b] = circles.map((c) => ({ x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r') }));
      return { round: true, a, b, shape: (inset = 0, attrs = '') => `<circle cx="${a.x}" cy="${a.y}" r="${a.r - inset}" ${attrs}/><circle cx="${b.x}" cy="${b.y}" r="${b.r - inset}" ${attrs}/>` };
    }
    // «De sol de chulito»: the two lens shapes are the first two paths (filled with their own dark gradient).
    const paths = [...g.querySelectorAll('path')].slice(0, 2).map((p) => p.getAttribute('d'));
    return { round: false, shape: (_inset, attrs = '') => paths.map((d) => `<path d="${d}" ${attrs}/>`).join('') };
  }

  // ------------------------------------------------------------------ small effects
  function anim(node, frames, ms, opts = {}) {
    if (!node) return null;
    if (calm()) { const last = frames[frames.length - 1]; Object.assign(node.style, { transform: last.transform || '', opacity: last.opacity ?? '' }); return null; }
    return node.animate(frames, { duration: dur(ms), fill: 'forwards', easing: 'ease-in-out', ...opts });
  }
  function glint(x, y, delay = 0) {
    const g = overlay(svg, `<path transform="translate(${x} ${y})" d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8Z" fill="#fff" stroke="${INK}" stroke-width=".8" stroke-opacity=".35"/>`, 'gs-glint');
    g.style.transformOrigin = `${x}px ${y}px`;
    g.style.opacity = '0';
    if (calm()) { g.remove(); return; }
    const a = g.animate([{ opacity: 0, transform: 'scale(.1) rotate(0deg)' }, { opacity: 1, transform: 'scale(1.3) rotate(35deg)', offset: 0.45 }, { opacity: 0, transform: 'scale(.3) rotate(70deg)' }], { duration: dur(560), delay: dur(delay), easing: 'ease-out' });
    a.onfinish = () => g.remove();
  }
  function shine(delay = 0) {
    const s = svg.querySelector('.gs-shine');
    if (!s || calm()) return;
    s.animate([{ transform: 'translateX(-10px)', opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0.9, offset: 0.8 }, { transform: 'translateX(92px)', opacity: 0 }], { duration: dur(700), delay: dur(delay), easing: 'ease-in-out', fill: 'backwards' });
  }
  function streakFace(on) {
    svg.dataset.zone = on ? 'beating' : 'idle';
    Mascot.setFace(svg, on ? { eyes: 'round', mouth: 'big', cheeks: true } : {});
  }
  /** Tint over the worn lenses (clipped to their shape) + a shine; used by C, and by A for chulito. */
  function tintLayer(L) {
    defs(svg, DARK + `<clipPath id="gs-lens-__N__">${L.shape(0, '')}</clipPath>`);
    const t = overlay(svg, `<g class="gs-tint">${L.shape(L.round ? 1.3 : 0, 'fill="url(#gs-dark-__N__)"')}</g>
      <g clip-path="url(#gs-lens-__N__)"><path class="gs-shine" d="M40 64 L49 64 L37 106 L28 106 Z" fill="#fff" opacity="0"/></g>`, 'gs-c');
    const g = svg.querySelector('.rw-glasses');
    g.after(t); // right over the lenses, under anything worn on top
    if (L.round) {
      // Round frames are redrawn on top so the rims and their highlights stay crisp over the tint.
      const f = g.cloneNode(true);
      f.setAttribute('class', 'gs-c-frame');
      f.querySelectorAll('circle').forEach((c) => c.setAttribute('fill-opacity', '0'));
      t.append(f);
    }
    t.dataset.round = L.round ? '1' : '0';
    return t;
  }

  // ------------------------------------------------------------------ the variants
  const V = {
    hoy: {
      title: 'Hoy',
      desc: 'Las gafas del armario se desvanecen y bajan las gafas de sol negras de siempre. Parece un fallo; y con las de sol de chulito, cambia las suyas por otras más sosas.',
      notes: ['Sin gafas en el armario no cambia nada en ninguna variante: bajan las negras de siempre.'],
      setup() {},
      on() { streakFace(true); Mascot.setShades(svg, true); },
      off() { streakFace(false); Mascot.setShades(svg, false); },
    },
    a: {
      title: 'A · Voltereta',
      desc: 'Las redondas dan una voltereta y aterrizan convertidas en gafas de sol con su misma montura. Las de sol de chulito ya lo son: dan una vuelta en el sitio, se oscurecen un poco más y brillan.',
      notes: ['Cada montura necesita su versión oscura (redondas → redondas de sol): una pieza más por cada gafa del armario.', 'Al bajar el ritmo, voltereta al revés.'],
      setup(L) {
        if (!L.round) { tintLayer(L); return; }
        defs(svg, DARK);
        const { a, b } = L;
        const d = overlay(svg, `<g stroke-linecap="round">
          ${L.shape(0, `fill="url(#gs-dark-__N__)" stroke="${INK}" stroke-width="3"`)}
          <path d="M${a.x + a.r} 82.5 Q80 78.6 ${b.x - b.r} 82.5" fill="none" stroke="${INK}" stroke-width="3"/>
          <path d="M${a.x - a.r} 81.5 L31 78 M${b.x + b.r} 81.5 L129 78" stroke="${INK}" stroke-width="3"/>
          <path d="M${a.x - 9} 79 l8 0 M${b.x - 9} 79 l8 0" stroke="#fff" stroke-width="2.4" opacity=".8"/>
          <path d="M${a.x - 6} 90 l3 -3 M${b.x - 6} 90 l3 -3" stroke="#fff" stroke-width="1.8" opacity=".55"/></g>`, 'gs-a-dark');
        d.style.transformOrigin = '80px 84px';
        d.style.opacity = '0';
      },
      on(L) {
        streakFace(true);
        const g = svg.querySelector('.rw-glasses');
        g.style.transformOrigin = '80px 84px';
        if (!L.round) {
          const t = svg.querySelector('.gs-c');
          t.style.transformOrigin = '80px 84px';
          for (const n of [g, t]) anim(n, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(-1) translateY(-6px)', offset: 0.5 }, { transform: 'scaleX(1)' }], 520);
          later(380, () => { t.classList.add('on'); shine(300); });
          glint(52, 78, 520);
          return;
        }
        const d = svg.querySelector('.gs-a-dark');
        const x = anim(g, [{ transform: 'translateY(0) scaleY(1)' }, { transform: 'translateY(-10px) scaleY(.05)' }], 160, { easing: 'ease-in' });
        const swap = () => {
          g.style.opacity = '0';
          anim(d, [{ opacity: 1, transform: 'translateY(-10px) scaleY(.05)' }, { opacity: 1, transform: 'translateY(2px) scaleY(1.12)', offset: 0.6 }, { opacity: 1, transform: 'none' }], 300, { easing: 'cubic-bezier(.34,1.4,.64,1)' });
          glint(52, 77, 220);
        };
        if (x) x.onfinish = swap; else swap();
      },
      off(L) {
        streakFace(false);
        const g = svg.querySelector('.rw-glasses');
        if (!L.round) { svg.querySelector('.gs-c')?.classList.remove('on'); return; }
        const d = svg.querySelector('.gs-a-dark');
        const x = anim(d, [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'translateY(-10px) scaleY(.05)' }], 160, { easing: 'ease-in' });
        const swap = () => {
          d.style.opacity = '0';
          g.style.opacity = '';
          anim(g, [{ transform: 'translateY(-10px) scaleY(.05)' }, { transform: 'translateY(2px) scaleY(1.1)', offset: 0.6 }, { transform: 'none' }], 300, { easing: 'cubic-bezier(.34,1.4,.64,1)' });
        };
        if (x) x.onfinish = swap; else swap();
      },
    },
    b: {
      title: 'B · Lentes de pinza',
      desc: 'Unas lentes oscuras de pinza bajan sobre las redondas, ¡clic!, y suben al acabar. Con las de sol de chulito no hace falta pinza: se las baja a la punta, te mira por encima con ojitos brillantes y se las vuelve a subir.',
      notes: ['Se nota que siguen siendo SUS gafas: la montura no desaparece.', 'Una sola pieza nueva (la pinza) sirve para todas las monturas redondas.'],
      setup(L) {
        if (!L.round) return;
        defs(svg, DARK);
        const { a, b } = L;
        const top = Math.min(a.y - a.r, b.y - b.r) - 1;
        const c = overlay(svg, `<g stroke-linecap="round">
          ${L.shape(1.6, `fill="url(#gs-dark-__N__)" fill-opacity=".95" stroke="${INK}" stroke-width="1.6"`)}
          <path d="M${a.x - 4} ${top} H${b.x + 4}" stroke="${INK}" stroke-width="3.4"/>
          <path d="M${a.x - 4} ${top} H${b.x + 4}" stroke="#c3c9d4" stroke-width="1.4"/>
          <rect x="${a.x - 3}" y="${top - 2.5}" width="6" height="6" rx="1.6" fill="#c3c9d4" stroke="${INK}" stroke-width="1.4"/>
          <rect x="${b.x - 3}" y="${top - 2.5}" width="6" height="6" rx="1.6" fill="#c3c9d4" stroke="${INK}" stroke-width="1.4"/>
          <path d="M${a.x - 8} ${a.y - 3} l6 0 M${b.x - 8} ${b.y - 3} l6 0" stroke="#fff" stroke-width="2.2" opacity=".75"/></g>`, 'gs-b-clip');
        c.style.transformOrigin = `80px ${top}px`;
        c.style.opacity = '0';
      },
      on(L) {
        streakFace(true);
        if (!L.round) {
          const g = svg.querySelector('.rw-glasses');
          anim(g, [{ transform: 'none' }, { transform: 'translateY(10px)', offset: 0.22 }, { transform: 'translateY(10px)', offset: 0.78 }, { transform: 'translateY(-1.5px)', offset: 0.9 }, { transform: 'none' }], 2000);
          later(420, () => { Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big', cheeks: true }); Mascot.look(svg, 0, -1); });
          later(1500, () => { Mascot.look(svg, 0, 0); if (svg.dataset.zone === 'beating') streakFace(true); });
          glint(52, 78, 1850);
          return;
        }
        anim(svg.querySelector('.gs-b-clip'), [{ opacity: 0, transform: 'scaleY(-1)' }, { opacity: 1, transform: 'scaleY(-1)', offset: 0.3 }, { opacity: 1, transform: 'scaleY(1.1)', offset: 0.78 }, { opacity: 1, transform: 'none' }], 560);
        glint(104, 76, 520);
      },
      off(L) {
        streakFace(false);
        if (!L.round) return;
        anim(svg.querySelector('.gs-b-clip'), [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'scaleY(-1)', offset: 0.65 }, { opacity: 0, transform: 'scaleY(-1)' }], 420);
      },
    },
    c: {
      title: 'C · Fotocromáticas',
      desc: 'Los cristales se oscurecen poco a poco, como al salir al sol, y pasa un destello. Al bajar el ritmo se aclaran. Las de sol de chulito se ponen todavía más oscuras, con su destello.',
      notes: ['La más sutil: nada entra ni sale, solo cambia el tinte.', 'Vale para cualquier montura (también las futuras): el tinte usa la forma de sus cristales.', 'Con «reducir movimiento»: solo el tinte, sin destello.'],
      setup(L) { tintLayer(L); },
      on() { streakFace(true); svg.querySelector('.gs-c').classList.add('on'); shine(900); glint(52, 78, 1000); },
      off() { streakFace(false); svg.querySelector('.gs-c')?.classList.remove('on'); },
    },
  };
  const ORDER = [['hoy', 'Hoy'], ['a', 'A · Voltereta'], ['b', 'B · Pinza'], ['c', 'C · Tinte']];

  // ------------------------------------------------------------------ run
  const st = { v: 'a', on: false, L: null, loop: 0 };
  const note = el('p', 'rm-note');
  note.setAttribute('role', 'status');
  note.hidden = true;
  function reset() {
    Mascot.setShades(svg, false);
    E.clearOverlays(svg);
    const g = svg.querySelector('.rw-glasses');
    if (g) { g.getAnimations().forEach((a) => a.cancel()); g.style.opacity = ''; g.style.transform = ''; }
    streakFace(false);
  }
  function on() {
    E.play('gafas-racha');
    if (st.on) return;
    reset();
    st.L = lenses();
    note.hidden = !!st.L || st.v === 'hoy';
    if (!st.L) note.textContent = 'Tapomo no lleva gafas: ponle unas con «Gafas» (o en «Premios»). Sin gafas, todas hacen lo de hoy.';
    st.on = true;
    if (!st.L) { V.hoy.on(); return; }
    V[st.v].setup(st.L);
    // One frame for the new drawings to settle in their «off» state.
    requestAnimationFrame(() => st.on && V[st.v].on(st.L));
  }
  function off() {
    if (!st.on) return;
    st.on = false;
    if (!st.L) V.hoy.off(); else V[st.v].off(st.L);
  }
  function stop() { clearInterval(st.loop); off(); later(700, () => { if (!st.on) reset(); }); }
  function cycle() { on(); later(3600, off); }
  const restart = () => { const was = st.on; if (was) { off(); later(650, () => { reset(); on(); }); } };

  // ------------------------------------------------------------------ fieldset («Ya decidido»: only B)
  // Decided 2026-11-05: B · Pinza. Hoy, A and C stay in the code above but are no longer offered.
  st.v = 'b';
  const { body, set } = E.addDecided('gafas-racha', 'Gafas + racha', '2026-11-05', 'B · Pinza: con gafas redondas, unas lentes oscuras de pinza bajan sobre ellas y suben al acabar; con las de sol de chulito, se las baja a la punta, te mira por encima y se las vuelve a subir.');
  set('stop', stop);
  body.append(el('p', 'note', 'Sale en la zona «te estás superando», con el brillo dorado y las rayitas. Pruébalo con cada gafa: se ve en el escenario con la ropa de «Premios».'));
  const gl = E.glassesSeg(() => { if (st.on) { off(); later(650, () => { reset(); on(); }); } else reset(); });
  const bs = el('div', 'btns');
  const go = btn('😎 Te estás superando');
  const out = btn('Baja el ritmo');
  const cyc = btn('↻ Ponérselas y quitárselas');
  go.addEventListener('click', on);
  out.addEventListener('click', off);
  cyc.addEventListener('click', () => { if (st.on) { off(); later(650, cycle); } else cycle(); });
  const loop = el('label');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.addEventListener('change', () => { clearInterval(st.loop); if (cb.checked) { cycle(); st.loop = setInterval(cycle, dur(6000)); } });
  loop.append(cb, 'Repetir solo');
  bs.append(go, out, cyc, loop);
  body.append(gl, bs, note, E.list(V.b.notes));

  window.GafasLab = { on, off, cycle };
})();
