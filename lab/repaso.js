// Lab only: «Modo repaso» study. While the person reviews their own text (deletes after a pause,
// moves with the arrows, selects), Tapomo must not say «¡ups!» or look sorry: it reviews with them.
// A · Lupa de investigador (Pol's idea): glasses off, a detective magnifier over one eye.
// B · Detective: deerstalker cap, a small magnifier and a «hmm…» thought cloud; glasses stay on.
// C · Lápiz y libreta: a red pencil behind the ear, a tiny notepad getting ticks; glasses slide to the tip.
// Decided 2026-11-05: A is the default look from the start; B is unlocked at level 20 (that level has no
// wardrobe reward, so B is its prize) and from then on it is the default, with A still selectable.
// C is discarded: its code stays here but it is no longer shown.
(() => {
  const E = window.Estudios;
  if (!E) return;
  const INK = '#23202b';
  const { el, btn, seg, later, overlay, bubble, hush, talk } = E;

  // ------------------------------------------------------------------ drawings (160 × 160 Tapomo coords)
  const LUPA_A = `<g class="rp-scan">
      <path d="M110 97 L128 115" stroke="${INK}" stroke-width="9.5" stroke-linecap="round"/>
      <path d="M110 97 L128 115" stroke="#b5653a" stroke-width="5.4" stroke-linecap="round"/>
      <path d="M113 100 L116 103" stroke="#ffcc4d" stroke-width="5.4"/>
      <circle cx="98" cy="85" r="17" fill="#d8f1ff" fill-opacity=".4"/>
      <g class="st-blink"><circle cx="97.2" cy="85.6" r="10.6" fill="${INK}"/><circle cx="100.8" cy="81.6" r="3.8" fill="#fff"/><circle cx="93.6" cy="89.4" r="1.8" fill="#fff"/></g>
      <circle cx="98" cy="85" r="17" fill="none" stroke="${INK}" stroke-width="5.6"/>
      <circle cx="98" cy="85" r="17" fill="none" stroke="#ffcc4d" stroke-width="2.6"/>
      <path d="M86 79.5 Q88 73.5 94 72" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".9"/>
      <circle cx="129" cy="116" r="6.4" fill="__BODY__" stroke="${INK}" stroke-width="2.2"/>
      <path d="M126.5 113.5 Q128.5 112 130.5 113" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
    </g>`;

  const CAP_B = `<g stroke-linejoin="round">
      <path d="M112 47 Q130 45 136 56 Q122 58.5 110 54 Z" fill="#a8783f" stroke="${INK}" stroke-width="2.2"/>
      <path d="M42 50 Q42 20 80 20 Q118 20 118 50 Z" fill="#c99a5b" stroke="${INK}" stroke-width="2.4"/>
      <path d="M59 23.5 Q54 36 54 49 M80 20.5 V49 M101 23.5 Q106 36 106 49 M47 33.5 H113 M43.5 42 H116.5" fill="none" stroke="#9b6a35" stroke-width="1.7" stroke-linecap="round" opacity=".75"/>
      <path d="M50 31 Q55 24.5 63 22.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".5"/>
      <rect x="38" y="45" width="84" height="9" rx="4.5" fill="#8a5a2b" stroke="${INK}" stroke-width="2.2"/>
      <path d="M48 47 Q30 45 24 56 Q38 58.5 50 54 Z" fill="#b8884b" stroke="${INK}" stroke-width="2.2"/>
      <path d="M80 21 Q71 11 67 16.5 Q69 23 80 21 Q89 11 93 16.5 Q91 23 80 21 Z" fill="#8a5a2b" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="80" cy="20.6" r="2.7" fill="#a8783f" stroke="${INK}" stroke-width="1.6"/>
    </g>`;
  const LUPA_B = `<g class="rp-scan">
      <path d="M126 119 L138 131" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M126 119 L138 131" stroke="#b5653a" stroke-width="4.4" stroke-linecap="round"/>
      <circle cx="117" cy="110" r="12" fill="#d8f1ff" fill-opacity=".45" stroke="${INK}" stroke-width="4.6"/>
      <circle cx="117" cy="110" r="12" fill="none" stroke="#ffcc4d" stroke-width="2.2"/>
      <path d="M109.5 106 Q111 102 115 101" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
      <circle cx="139.5" cy="132.5" r="5.6" fill="__BODY__" stroke="${INK}" stroke-width="2.2"/>
    </g>`;
  const BROWS_B = `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M54 69 Q62 66.5 70 68.5"/><path d="M90 63 Q98 56 106 61.5"/></g>`;
  const CLOUD_B = `<g>
      <circle cx="44" cy="44" r="2.2" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
      <circle cx="38.5" cy="37" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1.6"/>
      <path d="M8 22 Q4 12 14 10 Q18 2 28 5 Q36 0 42 7 Q51 8 48 18 Q52 27 42 29 Q36 35 27 31 Q18 35 13 29 Q3 29 8 22 Z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <text class="rp-hmm" x="28" y="21.5" text-anchor="middle" font-size="9.5" font-weight="800" fill="${INK}" font-family="inherit">hmm…</text>
      <g class="rp-dots" fill="${INK}"><circle cx="20" cy="18" r="2.2"/><circle cx="28" cy="18" r="2.2"/><circle cx="36" cy="18" r="2.2"/></g>
    </g>`;

  // Pencil behind the ear: drawn BEHIND the body, so only the eraser end (over the head) and the tip
  // (right of the head) show, as if tucked behind an ear.
  const PENCIL_C = `<g transform="translate(127 47) rotate(40)" stroke-linejoin="round">
      <path d="M-18 -4.2 H17 V4.2 H-18 Z" fill="#e8384f" stroke="${INK}" stroke-width="2"/>
      <path d="M-18 -1.2 H17" stroke="#ff8a98" stroke-width="1.4"/>
      <path d="M17 -4.2 L26 0 L17 4.2 Z" fill="#f3d6a4" stroke="${INK}" stroke-width="2"/>
      <path d="M23 -1.4 L26.4 0 L23 1.4 Z" fill="${INK}"/>
      <rect x="-21.5" y="-4.4" width="4.2" height="8.8" fill="#c3c9d4" stroke="${INK}" stroke-width="1.6"/>
      <path d="M-21.5 -4.2 H-27 Q-29 -4.2 -29 -2 V2 Q-29 4.2 -27 4.2 H-21.5 Z" fill="#ff9fb5" stroke="${INK}" stroke-width="2"/>
    </g>`;
  const tick = (y, i) => `<path class="rp-tk" data-i="${i}" d="M14 ${y} l3.2 3.4 l6.6 -7.2" pathLength="1" fill="none" stroke="#e8384f" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const PAD_C = `<g transform="rotate(-8 26 118)" stroke-linejoin="round">
      <rect x="7" y="97" width="38" height="42" rx="4.5" fill="#fffdf6" stroke="${INK}" stroke-width="2.2"/>
      <path d="M13 109.5 H39 M13 117.5 H39 M13 125.5 H39 M13 133 H31" stroke="#b9cbea" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M26 108 H38 M26 116 H36 M26 124 H38" stroke="#8d97ab" stroke-width="1.8" stroke-linecap="round"/>
      ${tick(108, 0)}${tick(116, 1)}${tick(124, 2)}
      <g fill="#fffdf6" stroke="${INK}" stroke-width="1.4"><circle cx="13" cy="97" r="2"/><circle cx="20" cy="97" r="2"/><circle cx="27" cy="97" r="2"/><circle cx="34" cy="97" r="2"/><circle cx="41" cy="97" r="2"/></g>
      <circle cx="43" cy="135" r="5.8" fill="__BODY__" stroke="${INK}" stroke-width="2.2"/>
    </g>`;
  const TONGUE_C = `<path d="M80.6 103.6 Q80.8 109.4 84.6 109 Q88.2 108.4 86.6 102.6" fill="#ff8fa3" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;

  // ------------------------------------------------------------------ variants
  const SAY = {
    a: ['puliendo ✍️', 'A ver, a ver… 🔍', 'Buscando erratas 🔍', 'Sin prisa 🌿'],
    b: ['Hmm… 🧐', 'Interesante…', 'puliendo ✍️', 'Tras la pista 🔍'],
    c: ['puliendo ✍️', '✓ Así queda mejor', 'Repasito 📝', 'Revisar también es escribir'],
  };
  const BYE = { a: '¡Listo! ✨', b: 'Caso resuelto ✨', c: '¡Repasado! ✓' };
  const VARIANTS = [
    {
      id: 'a', title: 'A · Lupa de investigador', pol: true,
      desc: 'Se quita las gafas (si lleva) y saca una lupa de detective delante de un ojo, que se ve enorme a través del cristal. Mueve la lupa despacito, como quien lee.',
      notes: ['Con gafas: se las quita hacia arriba antes de sacar la lupa y se las vuelve a poner al salir.', 'Vale igual para las de sol de chulito y las redondas.', 'La lupa se queda quieta si «reducir movimiento» está activo.'],
      face: { eyes: 'round', mouth: 'small' }, look: [-0.25, 0.55],
      art(svg) { overlay(svg, LUPA_A, 'rp-lupa'); },
    },
    {
      id: 'b', title: 'B · Detective con gorra', unlock: 'Desbloqueo nivel 20',
      desc: 'Le cae una gorra de detective, levanta una ceja y mira por una lupa pequeña a un lado. Una nube de pensamiento dice «hmm…» (en silencioso solo puntitos).',
      notes: ['Con gafas: se las deja puestas; detective con gafas.', 'Si ya lleva algo en la cabeza (gorro, casco…), lo cambia un momento por la gorra.', 'La nube cuenta como «hablar»: en silencioso no lleva texto.'],
      face: { eyes: 'round', mouth: 'small' }, look: [0.55, 0.6],
      art(svg) {
        overlay(svg, CAP_B, 'rp-cap');
        overlay(svg, BROWS_B, 'rp-brows');
        overlay(svg, LUPA_B, 'rp-lupa-b');
        overlay(svg, CLOUD_B, 'rp-cloud');
      },
    },
    {
      id: 'c', title: 'C · Lápiz y libreta',
      desc: 'Asoma un lápiz rojo detrás de la oreja y saca una libretita donde va poniendo ✓. Saca la lengüita de concentración. La más tranquila.',
      notes: ['Con gafas: le resbalan a la punta, como gafas de leer.', 'Las ✓ solo decoran: no cuentan nada.', 'Si se quita el modo a medias, la libreta se guarda igual.'],
      face: { eyes: 'round', mouth: 'small' }, look: [-0.55, 0.5],
      art(svg) {
        overlay(svg, PENCIL_C, 'rp-pencil', 'back');
        overlay(svg, PAD_C, 'rp-pad');
        overlay(svg, TONGUE_C, 'rp-tongue');
      },
    },
  ];

  // ------------------------------------------------------------------ state (on the lab's real Tapomo)
  const box = document.getElementById('stage-box');
  const pet = document.getElementById('pet');
  const svg = E.mascot;
  const st = { v: 'a', on: false, timers: [], loop: 0 };
  const V = () => VARIANTS.find((x) => x.id === st.v);
  const hasGlasses = () => E.R.state.acc.has('gafas') || E.R.state.acc.has('gafassol');

  /** Puts the chosen variant's drawings on Tapomo (classes go on the stage box). */
  function dress() {
    E.clearOverlays(svg);
    box.classList.remove('rp-a', 'rp-b', 'rp-c');
    box.classList.add('rp-cell', `rp-${st.v}`);
    V().art(svg);
  }
  function enter() {
    E.play('repaso');
    if (st.on) return;
    dress();
    st.on = true;
    box.classList.toggle('has-g', hasGlasses());
    box.classList.toggle('st-quiet', talk.v === 'silencioso');
    // Let the drawings mount in their «off» pose first, so the way in animates.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!st.on) return;
      box.classList.add('st-on');
      Mascot.setFace(svg, V().face);
      Mascot.look(svg, ...V().look);
    }));
    if (talk.v !== 'silencioso') {
      // normal: once on entering (in the app, at most once every 15 min); parlanchín: now and then.
      st.timers.push(later(700, () => st.on && bubble(pet, SAY[st.v][0], 2400)));
      if (talk.v === 'parlanchin') {
        let i = 1;
        const more = () => st.timers.push(later(4200, () => { if (!st.on) return; bubble(pet, SAY[st.v][i++ % SAY[st.v].length], 2200); more(); }));
        more();
      }
    }
    if (st.v === 'c') ticks(0);
  }
  function ticks(n) {
    svg.querySelectorAll('.rp-tk').forEach((p, i) => p.classList.toggle('done', i < n));
    st.timers.push(later(n === 0 ? 900 : n >= 3 ? 1800 : 1100, () => { if (st.on) ticks(n >= 3 ? 0 : n + 1); }));
  }
  function exit(quiet = false) {
    if (!st.on) return;
    st.on = false;
    st.timers.forEach(clearTimeout);
    st.timers = [];
    box.classList.remove('st-on');
    svg.querySelectorAll('.rp-tk').forEach((p) => p.classList.remove('done'));
    Mascot.setFace(svg, {});
    Mascot.look(svg, 0, 0);
    hush(pet);
    if (!quiet && talk.v === 'parlanchin') st.timers.push(later(500, () => bubble(pet, BYE[st.v], 1800)));
  }
  /** Leaves the stage clean (another study plays). */
  function stop() {
    clearInterval(st.loop);
    exit(true);
    later(700, () => { if (!st.on) { E.clearOverlays(svg); box.classList.remove('rp-cell', 'rp-a', 'rp-b', 'rp-c', 'has-g', 'st-quiet'); } });
  }
  function cycle() { enter(); later(5200, () => exit()); }

  // ------------------------------------------------------------------ fieldset
  const SHOWN = ['a', 'b']; // C · Lápiz y libreta: discarded on 2026-11-05
  const { body, set } = E.addDecided('repaso', 'Modo repaso', '2026-11-05', 'A · Lupa de serie desde el principio. B · Detective se desbloquea en el nivel 20 (ese nivel no tiene premio de ropa, así que es su premio). C · Lápiz y libreta: descartada.');
  set('stop', stop);
  body.append(el('p', 'note', 'Cuando repasas tu propio texto (borras tras una pausa, te mueves con las flechas, seleccionas), Tapomo no dice «¡ups!» ni pone cara de pena: repasa contigo. Se ve en el escenario, con la ropa que lleve en «Premios».'));
  const desc = el('p', 'note');
  const notes = el('div');
  const SHORT = { a: 'A · Lupa', b: 'B · Detective (nivel 20)', c: 'C · Lápiz y libreta' };
  const vs = seg('Variante', VARIANTS.filter((v) => SHOWN.includes(v.id)).map((v) => [v.id, SHORT[v.id]]), () => st.v, (v) => {
    const was = st.on;
    exit(true);
    st.v = v;
    show();
    if (was) later(450, enter);
  });
  function show() {
    const v = V();
    desc.replaceChildren(el('b', '', `${v.title}. `), v.desc);
    if (v.pol) { desc.append(' '); desc.append(el('span', 'ok', 'De serie')); }
    if (v.unlock) { desc.append(' '); desc.append(el('span', 'ok', v.unlock)); }
    notes.replaceChildren(E.list(v.notes));
  }
  const bs = el('div', 'btns');
  const go = btn('▶ Entrar en repaso');
  const out = btn('◀ Salir', 'ghost');
  const cyc = btn('↻ Entrar y salir', 'ghost');
  const sample = btn('Muestra de bocadillo', 'ghost');
  go.addEventListener('click', enter);
  out.addEventListener('click', () => exit());
  cyc.addEventListener('click', () => { if (st.on) { exit(true); later(600, cycle); } else cycle(); });
  sample.addEventListener('click', () => bubble(pet, SAY[st.v][Math.floor(Date.now() / 2000) % SAY[st.v].length], 2600));
  bs.append(go, out, cyc, sample);
  const loop = el('label');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.addEventListener('change', () => { clearInterval(st.loop); if (cb.checked) { cycle(); st.loop = setInterval(cycle, E.dur(8000)); } });
  loop.append(cb, 'Repetir solo');
  bs.append(loop);
  const gl = E.glassesSeg(() => { if (st.on) { exit(true); later(500, enter); } });
  talk.subs.push(() => box.classList.toggle('st-quiet', st.on && talk.v === 'silencioso'));

  const rules = el('details', 'rules-d');
  rules.append(el('summary', '', 'Cuándo entra y sale; cómo es hoy'));
  const today = el('div', 'btns');
  const oops = btn('Hoy: ⌫ tras una pausa', 'ghost');
  oops.addEventListener('click', () => {
    exit(true);
    E.play('repaso');
    Mascot.setFace(svg, { eyes: 'dots', mouth: 'wavy' });
    Mascot.tilt(svg);
    bubble(pet, '¡ups!', 1100);
    later(1100, () => Mascot.setFace(svg, {}));
  });
  today.append(oops);
  rules.append(E.list([
    'Hoy: si borras después de una pausa, Tapomo dice «¡ups!», pone ojitos de pena y se inclina. Cuando repasas tu propio texto, suena a regañina.',
    'Entra: tras una pausa de 2 s o más, si borras (⌫ / Supr), te mueves con las flechas, Inicio / Fin, o seleccionas con Mayús.',
    'Mientras dura: ni «¡ups!», ni cara de pena, ni inclinación. La medición sigue igual; solo cambia la reacción de Tapomo (como en Supermochi).',
    'Sale: cuando vuelves a escribir de corrido (unas 8 teclas seguidas) o tras 20 s sin tocar nada.',
    'Bocadillos: silencioso nunca; normal como mucho uno cada 15 min, al entrar; parlanchín al entrar, de vez en cuando y uno al salir. En el lab todo va más rápido.',
  ]), today);
  body.append(el('p', 'note', 'Desde el nivel 20 el detective pasa a ser el de serie; la lupa sigue elegible.'));
  body.append(vs.box, desc, gl, E.talkSeg(), bs, notes, rules);
  show();

  window.RepasoLab = { enter, exit, cycle, set: (v) => { st.v = v; show(); vs.sync(); } };
})();
