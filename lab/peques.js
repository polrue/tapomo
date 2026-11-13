// Lab only: «Premios para peques» study (2026-11-10). Pol approved three NEW wardrobe rewards at low
// levels so small kids get something early: level 2 «Tirita», level 3 «Pecas», level 5 «Gorro con
// hélice». Nothing else moves (4 gafas de sol de chulito, 7 lacito, 10 skin fresa…). Two drawings of
// each (A/B) for Pol to pick, worn by the lab's real Tapomo on the stage and combinable with what it
// wears in «Premios».
// Drawings are in Tapomo's 160 × 160 coords and follow rewards.js (ink #23202b, soft fills, white
// highlights), so the chosen one can be ported as is: an ART entry + a RULES line.
//   tirita → slot 'marca' (like the X scar: one mark at a time), drawn on the right cheek.
//   pecas  → new face slot 'pecas' (add it to FACE_SLOTS: costumes keep it). Drawn UNDER the plaster,
//            so tirita + pecas combine (the plaster covers a freckle or two, as in real life).
//   gorro  → slot 'cabeza' with excluye ['slot:frente', 'slot:pelo'] (like gorrito), lift 40, zzz 24.
// The propeller spins (WAAPI): slowly at rest, faster while typing and fast «¡En racha!» and above
// (data-zone fire / beating / super); still when asleep and with «reducir movimiento» (E.calm()).
// Layering on the lab mascot (rewards.js repaints .rw-front on every wardrobe change, so the study's
// items live in their own groups): marks and freckles go right under .rw-front (under glasses, hair
// and hats); the cap goes right over it (under the record crown, which rises over the propeller).
(() => {
  const E = window.Estudios;
  if (!E) return;
  const INK = '#23202b';
  const { el, btn, seg, calm, dur, R, NS } = E;
  const svg = E.mascot;

  // ------------------------------------------------------------------ drawings
  // Small helpers for the plaster: holes in a little grid on both pads.
  const holes = (fill, xs = [-8.6, -6.4, 6.4, 8.6], ys = [-1.4, 1.4]) =>
    xs.flatMap((x) => ys.map((y) => `<circle cx="${x}" cy="${y}" r=".62" fill="${fill}"/>`)).join('');
  const star5 = (x, y, r, fill) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.48 : r;
      d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)} `;
    }
    return `<path d="${d}Z" fill="${fill}" stroke="${INK}" stroke-width=".55" stroke-linejoin="round"/>`;
  };

  const TIRITA = {
    a: {
      name: 'A · Clásica',
      desc: 'La de toda la vida: beige con agujeritos y la gasa en medio, en diagonal sobre la mejilla.',
      art: `<g transform="translate(114 104) rotate(-32)" stroke-linejoin="round">
          <rect x="-12.5" y="-5" width="25" height="10" rx="5" fill="#f4cfa3" stroke="${INK}" stroke-width="1.9"/>
          <rect x="-4.6" y="-3.6" width="9.2" height="7.2" rx="1.6" fill="#fbe7cf" stroke="#c9905e" stroke-width="1"/>
          ${holes('#c9905e')}
          <path d="M-10 -2.6 Q-8.5 -3.6 -6.5 -3.5" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".75"/>
        </g>`,
    },
    b: {
      name: 'B · Estrellas',
      desc: 'Azul cielo con estrellitas amarillas, un poco torcida, como recién puesta por alguien con prisa.',
      art: `<g transform="translate(114 103) rotate(-14)" stroke-linejoin="round">
          <rect x="-12.5" y="-5" width="25" height="10" rx="5" fill="#8fd0f5" stroke="${INK}" stroke-width="1.9"/>
          <rect x="-4.6" y="-3.6" width="9.2" height="7.2" rx="1.6" fill="#fff6d6" stroke="#5aa3cf" stroke-width="1"/>
          ${star5(-8.3, 0, 2.7, '#ffd84d')}${star5(8.3, 0, 2.7, '#ffd84d')}${star5(0, 0, 1.9, '#ff9cc0')}
          <path d="M-10.2 -2.7 Q-8.8 -3.7 -7 -3.6" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
        </g>`,
    },
  };

  // Freckles: soft brown dots (no outline, so they read as skin, not stickers).
  const dots = (pts, fill = '#a8653e', op = 0.7) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${op}"/>`).join('');
  const FRECK_L = [[55, 94.4, 1.6], [60.8, 92.6, 1.4], [58.4, 98, 1.5], [64.8, 95.6, 1.3]];
  const FRECK_R = FRECK_L.map(([x, y, r]) => [160 - x, y, r]);
  const PECAS = {
    a: {
      name: 'A · Pecas',
      desc: 'Cuatro pecas suaves en cada mejilla. Discretas: se ven sin cambiarle la cara.',
      art: `<g>${dots(FRECK_L)}${dots(FRECK_R)}</g>`,
    },
    b: {
      name: 'B · Pecas y coloretes',
      desc: 'Las mismas pecas sobre un colorete rosita que está siempre (no solo cuando se pone contento).',
      art: `<g><ellipse cx="51" cy="97.5" rx="12" ry="8" fill="#ff7f86" opacity=".3"/><ellipse cx="109" cy="97.5" rx="12" ry="8" fill="#ff7f86" opacity=".3"/>
          ${dots(FRECK_L, '#9a5534', 0.66)}${dots(FRECK_R, '#9a5534', 0.66)}</g>`,
    },
  };

  // Propeller beanie. The dome is split in gores (clipped to its outline); the propeller is drawn
  // top-down around (0,0), squashed to look seen from a little above, and spun by .pq-rot.
  const DOME = 'M40 56 Q40 19 80 19 Q120 19 120 56 Z';
  const gores = (cols) => {
    const n = cols.length;
    let s = `<rect x="20" y="0" width="120" height="70" fill="${cols[0]}"/>`;
    for (let i = 0; i < n; i++) {
      const x0 = 14 + (132 / n) * i;
      const x1 = 14 + (132 / n) * (i + 1);
      // Each gore runs from the top of the dome to the band, its edges curving out like seams.
      s += `<path d="M80 18 Q${(x0 + 80) / 2 - 6 * Math.sign(80 - x0)} 30 ${x0} 60 L${x1} 60 Q${(x1 + 80) / 2 - 6 * Math.sign(80 - x1)} 30 80 18 Z" fill="${cols[i]}"/>`;
    }
    return s;
  };
  const seams = (n) => {
    let s = '';
    for (let i = 1; i < n; i++) {
      const x = 14 + (132 / n) * i;
      s += `<path d="M80 19.5 Q${(x + 80) / 2 - 6 * Math.sign(80 - x)} 30 ${x} 60" fill="none" stroke="${INK}" stroke-width="1.3" opacity=".45"/>`;
    }
    return s;
  };
  const blade = (rot, fill, len = 16, w = 6.6) => `<path transform="rotate(${rot})" d="M0 0 C${len * 0.25} ${-w} ${len * 0.9} ${-w * 0.95} ${len} ${-w * 0.2} C${len * 1.05} ${w * 0.5} ${len * 0.5} ${w * 0.7} 0 0 Z" fill="${fill}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  const propeller = (blades, hub) => `<g class="pq-prop">
      <path d="M78.7 21 V8 H81.3 V21 Z" fill="#c3c9d4" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
      <g transform="translate(80 7.6) scale(1 .5)">
        <ellipse class="pq-blur" cx="0" cy="0" rx="17" ry="17" fill="#fff"/>
        <g class="pq-rot">${blades}</g>
      </g>
      <circle cx="80" cy="7.6" r="2.2" fill="${hub}" stroke="${INK}" stroke-width="1.4"/>
    </g>`;
  const GORRO = {
    a: {
      name: 'A · Clásico',
      desc: 'El de los dibujos: gajos rojo, amarillo, azul y verde, borde azul y hélice de dos aspas roja y azul.',
      art: `<g stroke-linejoin="round">
          <clipPath id="pq-dome-__N__"><path d="${DOME}"/></clipPath>
          <g clip-path="url(#pq-dome-__N__)">${gores(['#ef5b66', '#ffcc4d', '#5aa9f0', '#6cc47f'])}${seams(4)}</g>
          <path d="${DOME}" fill="none" stroke="${INK}" stroke-width="2.4"/>
          <path d="M50 33 Q55 25.5 64 23" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
          <rect x="37" y="51" width="86" height="8" rx="4" fill="#5aa9f0" stroke="${INK}" stroke-width="2.3"/>
          <path d="M42 54 H118" stroke="#a9d4fb" stroke-width="1.6" stroke-linecap="round"/>
          ${propeller(blade(0, '#ef5b66') + blade(180, '#5aa9f0'), '#ffcc4d')}
        </g>`,
    },
    b: {
      name: 'B · Menta y lila',
      desc: 'Más redondito, gajos menta y lila, borde de punto color crema y hélice de tres aspas de colores (sin visera).',
      art: `<g stroke-linejoin="round">
          <clipPath id="pq-dome-__N__"><path d="M38 57 Q37 16 80 16 Q123 16 122 57 Z"/></clipPath>
          <g clip-path="url(#pq-dome-__N__)">${gores(['#74d6bf', '#c4a8f0', '#74d6bf', '#c4a8f0', '#74d6bf', '#c4a8f0'])}${seams(6)}</g>
          <path d="M38 57 Q37 16 80 16 Q123 16 122 57 Z" fill="none" stroke="${INK}" stroke-width="2.4"/>
          <path d="M48 32 Q53 23.5 63 20.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
          <rect x="34" y="50" width="92" height="11" rx="5.5" fill="#fff4e0" stroke="${INK}" stroke-width="2.3"/>
          <path d="M42 52.8v5.4 M50 52.8v5.4 M58 52.8v5.4 M66 52.8v5.4 M74 52.8v5.4 M82 52.8v5.4 M90 52.8v5.4 M98 52.8v5.4 M106 52.8v5.4 M114 52.8v5.4" stroke="#f0c9a0" stroke-width="1.7" stroke-linecap="round"/>
          ${propeller(blade(0, '#ffd84d', 14.5, 6.4) + blade(120, '#ff9cc0', 14.5, 6.4) + blade(240, '#8fd0f5', 14.5, 6.4), '#fff4e0')}
        </g>`,
    },
  };
  const ITEMS = { tirita: TIRITA, pecas: PECAS, gorro: GORRO };
  const LABEL = { tirita: 'Tirita', pecas: 'Pecas', gorro: 'Gorro con hélice' };

  // ------------------------------------------------------------------ wardrobe interplay
  // What the cap takes off (as gorrito: slot cabeza + frente + pelo) and what takes the cap off.
  const HEAD = ['lacito', 'gorrito', 'chef', 'flores', 'gorra', 'vikingo', 'astronauta', 'dino', 'ninja', 'flequillo', 'tupe', 'melenita'];
  const MARK = ['cicatriz'];
  const st = { v: { tirita: 'a', pecas: 'a', gorro: 'a' }, on: { tirita: false, pecas: false, gorro: false }, rest: 'slow', spin: null };
  let uid = 0;
  const groups = {};
  function group(k) {
    if (groups[k]?.isConnected) return groups[k];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `pq-wear pq-${k}`);
    g.setAttribute('aria-hidden', 'true');
    groups[k] = g;
    return g;
  }
  /** Draws (or removes) the study's items on the lab Tapomo, in the right place of the stack. */
  function paint(fresh) {
    const body = svg.querySelector('.mascot-body');
    const front = svg.querySelector('.rw-front');
    if (!body || !front) return;
    for (const k of ['pecas', 'tirita', 'gorro']) {
      const g = group(k);
      if (!st.on[k]) { g.remove(); continue; }
      g.innerHTML = ITEMS[k][st.v[k]].art.replaceAll('__N__', `${++uid}`);
      if (k === 'gorro') front.after(g); else front.before(g);
      if (fresh === k && !calm()) g.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: dur(420), easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    // Loop order pecas → tirita, each inserted right before .rw-front: the plaster sits over the freckles.
    svg.classList.toggle('pq-gorro-on', st.on.gorro);
    lift();
    spin();
  }
  // The record crown and the sleeping z's rise over the cap (rewards.js resets them on each repaint).
  const LIFT = 40;
  const ZZZ = 24;
  function lift() {
    const l = svg.querySelector('.rw-crown-lift');
    const z = svg.querySelector('.m-zzz');
    if (!st.on.gorro || !l) return;
    const cur = -parseFloat((l.getAttribute('transform') || '').match(/-?[\d.]+\)/)?.[0] || '0');
    if (cur < LIFT) { l.setAttribute('transform', `translate(0 ${-LIFT})`); l.style.transform = `translateY(${-LIFT}px)`; }
    const zc = -parseFloat((z?.getAttribute('transform') || '').match(/-?[\d.]+\)/)?.[0] || '0');
    if (z && zc < ZZZ) z.setAttribute('transform', `translate(0 ${-ZZZ})`);
  }
  // Spin speed per zone, in turns per second (× the lab speed). Calm = still.
  const RATE = { idle: 0.35, warming: 1, rhythm: 1, good: 1.6, fire: 3.4, beating: 4, super: 4.6 };
  const fastZone = () => ['fire', 'beating', 'super'].includes(svg.dataset.zone);
  function spin() {
    const r = svg.querySelector('.pq-gorro .pq-rot');
    svg.classList.toggle('pq-fast', !!r && fastZone());
    if (!r) { st.spin = null; return; }
    if (calm()) { st.spin?.cancel(); st.spin = null; return; }
    if (!st.spin || st.spin.effect?.target !== r) {
      st.spin = r.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: dur(1000), iterations: Infinity });
    }
    const zone = svg.dataset.zone || 'idle';
    let rate = RATE[zone] ?? 1;
    if (zone === 'idle' && st.rest === 'still') rate = 0;
    if (svg.classList.contains('sleeping')) rate = 0;
    st.spin.updatePlaybackRate(rate);
  }
  new MutationObserver(spin).observe(svg, { attributes: true, attributeFilter: ['data-zone', 'class'] });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', spin);
  // A wardrobe change in «Premios»: a head item or hairstyle takes the cap off, the scar the plaster.
  // rewards.js repaints only .rw-front, so the study's groups stay; the crown lift is re-applied.
  function syncWardrobe() {
    let ch = false;
    if (st.on.gorro && HEAD.some((k) => R.state.acc.has(k))) { st.on.gorro = false; ch = true; }
    if (st.on.tirita && MARK.some((k) => R.state.acc.has(k))) { st.on.tirita = false; ch = true; }
    if (ch) { paint(); syncUi(); } else lift();
  }
  document.getElementById('panel').addEventListener('click', () => setTimeout(syncWardrobe, 0));
  /** Putting a study item on takes off what it clashes with in the lab wardrobe. */
  function wear(k, on) {
    E.play('peques');
    st.on[k] = on;
    if (on) {
      const off = k === 'gorro' ? HEAD : k === 'tirita' ? MARK : [];
      const acc = [...R.state.acc];
      if (acc.some((a) => off.includes(a))) R.set(R.state.skin, acc.filter((a) => !off.includes(a)));
    }
    paint(on ? k : null);
    syncUi();
  }

  // ------------------------------------------------------------------ fieldset
  const { body, set } = E.add('peques', 'Premios para peques');
  set('stop', () => {});
  body.append(el('p', 'note', 'Tres premios nuevos en los primeros niveles para que los peques reciban algo pronto: nivel 2 «Tirita», nivel 3 «Pecas» y nivel 5 «Gorro con hélice». El resto no se mueve. Elige A o B de cada uno: se ven en el escenario con el Tapomo del lab y se combinan con la ropa de «Premios».'));

  const rows = {};
  const uiSyncs = [];
  for (const k of ['tirita', 'pecas', 'gorro']) {
    const box = el('div', 'pq-item');
    const s = seg(LABEL[k], Object.entries(ITEMS[k]).map(([v, it]) => [v, it.name]), () => st.v[k], (v) => { st.v[k] = v; if (!st.on[k]) wear(k, true); else paint(k); show(); });
    const b = btn('');
    b.addEventListener('click', () => wear(k, !st.on[k]));
    const desc = el('p', 'note');
    const show = () => { desc.textContent = ITEMS[k][st.v[k]].desc; };
    show();
    s.box.append(b);
    box.append(s.box, desc);
    rows[k] = { b, show };
    uiSyncs.push(() => { b.textContent = st.on[k] ? 'Quitar' : 'Probar'; b.setAttribute('aria-pressed', String(st.on[k])); b.className = st.on[k] ? 'ghost' : ''; });
    body.append(box);
  }
  function syncUi() { uiSyncs.forEach((f) => f()); }
  syncUi();
  body.append(el('p', 'note', 'Sitios: la tirita va en la mejilla derecha (hueco «marca», como la cicatriz: una marca cada vez); las pecas tienen hueco propio de la cara, así que van con la tirita (que tapa alguna peca) y con los disfraces; el gorro va en la cabeza y quita lacito, gorros y peinados, como el gorrito de lana.'));

  // Combos and the propeller.
  const bs = el('div', 'btns');
  const all = btn('Las tres a la vez');
  all.addEventListener('click', () => { E.play('peques'); for (const k of ['pecas', 'tirita', 'gorro']) wear(k, true); });
  const shades = btn('Gorro + gafas de sol');
  shades.addEventListener('click', () => {
    const acc = [...R.state.acc].filter((a) => !['gafas', 'parche', 'superheroe', 'gafassol', ...HEAD].includes(a));
    R.set(R.state.skin, [...acc, 'gafassol']);
    wear('gorro', true);
  });
  const none = btn('Quitar los tres', 'ghost');
  none.addEventListener('click', () => { for (const k of ['pecas', 'tirita', 'gorro']) st.on[k] = false; paint(); syncUi(); });
  bs.append(all, shades, none);
  // The propeller's speed follows the zone: these set it on the lab Tapomo (pet.js may change it again).
  const ZONES = { idle: 'En reposo', good: 'Escribiendo', fire: '🔥 ¡En racha!' };
  const zoneNow = () => (fastZone() ? 'fire' : svg.dataset.zone === 'idle' || !svg.dataset.zone ? 'idle' : 'good');
  const zs = seg('Hélice', Object.entries(ZONES), zoneNow, (z) => {
    if (!st.on.gorro) wear('gorro', true);
    Mascot.setZone(svg, z);
    Mascot.setFace(svg, z === 'idle' ? {} : { eyes: 'round', mouth: 'big', cheeks: true });
  });
  new MutationObserver(() => zs.sync()).observe(svg, { attributes: true, attributeFilter: ['data-zone'] });
  const rest = seg('En reposo', [['slow', 'gira despacio'], ['still', 'quieta']], () => st.rest, (v) => { st.rest = v; spin(); });
  body.append(bs, zs.box, rest.box, E.list([
    'La hélice gira despacio en reposo, más rápido al escribir y a toda pastilla «¡En racha!» y por encima (con un disco borroso). Dormido, quieta.',
    'Con «reducir movimiento» la hélice no gira nunca.',
    'También reacciona a las zonas reales del lab (herramienta «Rachas»), no solo a estos botones.',
    'La corona del récord y las «z» de dormir suben por encima de la hélice.',
  ]));

  // Nuevo reparto (read-only).
  const tblWrap = el('div', 'tbl-wrap');
  const tbl = el('table', 'pack pq-reparto');
  tbl.innerHTML = '<caption class="rw-sub">Nuevo reparto</caption><thead><tr><th>Nivel</th><th>Premio</th></tr></thead>';
  const tb = el('tbody');
  for (const [lv, name, isNew] of [[2, 'Tirita', true], [3, 'Pecas', true], [4, 'Gafas de sol de chulito'], [5, 'Gorro con hélice', true], [7, 'Lacito'], [10, 'Skin fresa']]) {
    const tr = el('tr');
    if (isNew) tr.className = 'new';
    const td = el('td', '', name);
    if (isNew) td.append(' ', el('span', 'pq-new', 'nuevo'));
    tr.append(el('td', 'num', String(lv)), td);
    tb.append(tr);
  }
  tbl.append(tb);
  tblWrap.append(tbl);
  body.append(tblWrap, el('p', 'note', 'Los premios que ya existen siguen en su nivel; los tres nuevos ocupan niveles que hoy no dan nada.'));

  // Ajustes mockup: «Objetivo diario» (no logic).
  const mock = el('div', 'pq-settings');
  mock.setAttribute('role', 'group');
  mock.setAttribute('aria-label', 'Maqueta del ajuste «Objetivo diario»');
  const lbl = el('label', 'pq-field');
  lbl.append(el('span', 'pq-field-l', 'Objetivo diario'));
  const sel = el('select');
  for (const [v, t] of [['auto', 'Automático (recomendado)'], ['5', '5 min'], ['10', '10 min'], ['20', '20 min'], ['30', '30 min']]) {
    const o = el('option', '', t);
    o.value = v;
    sel.append(o);
  }
  lbl.append(sel);
  mock.append(el('p', 'pq-mock-h', 'Ajustes · maqueta'), lbl, el('p', 'pq-field-help', 'Empieza en 10 min y se ajusta cada semana según cómo te va (entre 5 y 30). Las lecciones también cuentan.'));
  body.append(mock);

  window.PequesLab = { wear, paint, st, spin };
})();
