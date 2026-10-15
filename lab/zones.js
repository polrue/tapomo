// Proposed live zones for the lab (lab-only; pet.js keeps the current set).
// pet.js still computes its own 4 zones; in "propuesta" mode this file re-labels them from the value
// pet.js is displaying (TapomoPet.display), right after pet.js writes them (a MutationObserver runs
// before the frame is painted), so the bar colour, speed lines and face follow the proposed thresholds.
//   Current:   warming <60 · good 60–85 · fire 85–100 · beating >100
//   Proposed:  Calentando <40 · Cogiendo ritmo 40–60 · Buen ritmo 60–80 · ¡En racha! 80–95 ·
//              ¡Superándote! 95–108 · ¡Modo Supermochi! ≥108 (a power-up that lasts at least 35 s and
//              ignores backspaces meanwhile; only the pet's reaction, the stats stay honest).
// Speed reads through motion, not fire: straight round-capped speed lines (more, longer and faster per zone),
// a stronger forward lean per zone, and faint afterimages at the top two zones.
(() => {
  const INK = '#23202b';
  const NS = 'http://www.w3.org/2000/svg';
  const IMMUNE_MS = 35000;
  const $ = (id) => document.getElementById(id);
  const CUR = [
    { id: 'warming', name: 'Calentando', from: 0, color: '#b7b0c4' },
    { id: 'good', name: 'Buen ritmo', from: 60, color: '#ff9e7a' },
    { id: 'fire', name: 'En racha', from: 85, color: '#f0553a' },
    { id: 'beating', name: 'Superándote', from: 100.0001, color: '#ffc93c' },
  ];
  const PROP = [
    { id: 'warming', name: 'Calentando', from: 0, color: '#b7b0c4' },
    { id: 'rhythm', name: 'Cogiendo ritmo', from: 40, color: '#e7a29a', svgZone: 'warming' },
    { id: 'good', name: 'Buen ritmo', from: 60, color: '#ff9e7a', svgZone: 'fire' },
    { id: 'fire', name: '¡En racha!', from: 80, color: '#f0553a' },
    { id: 'beating', name: '¡Superándote!', from: 95, color: '#ffc93c' },
    { id: 'super', name: '¡Modo Supermochi!', from: 108, color: '#ffb81c', svgZone: 'super' },
  ];
  let mode = 'prop';
  try { if (localStorage.getItem('zn-set') === 'cur') mode = 'cur'; } catch (_) { /* storage off */ }
  const set = () => (mode === 'prop' ? PROP : CUR);
  const zoneAt = (p, list = set()) => [...list].reverse().find((z) => p >= z.from) || list[0];

  // ------------------------------------------------------------- Supermochi drawing
  const aura = (k, extra, swell = 1) => {
    const N = 26;
    let d = '';
    for (let i = 0; i <= N * 2; i++) {
      const a = (i / (N * 2)) * Math.PI * 2;
      const up = Math.max(0, -Math.sin(a)) * swell;
      const tip = i % 2 === 1;
      // The top half swells (up to +25 %) so the glow wraps the flame-hair too, tips included.
      const r = (1 + 0.25 * up ** 1.5) * (tip ? 1 + (extra + 8 * up) / 62 : 1);
      const x = 80 + Math.cos(a) * 62 * k * r;
      let y = 92 + Math.sin(a) * 60 * k * r;
      if (tip) y -= 7 * (0.4 + up); // flames lean upward
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d + 'Z';
  };
  // Flame-hair: a few chunky locks rooted behind the top of the head (y 60, hidden by the body) that
  // sweep up and back and end in a soft curled tip, never a point. Back locks deep amber, front locks
  // bright gold with a pale inner streak; each lock sways at its own phase (mascot.css, sm-lock).
  // [base x, half width, height, sweep back, delay s]
  const LOCKS_BACK = [[50, 13, 36, -16, -0.25], [80, 15, 52, -20, -0.5], [110, 13, 40, -15, -0.1]];
  const LOCKS_FRONT = [[64, 14, 44, -18, -0.35], [96, 14, 46, -18, 0], [121, 10, 28, -11, -0.6]];
  // A flame lock: round body bulging well above the head line, then an S-curve that flicks the tip
  // back, ending in a small round cap that curls down a touch (never a point).
  const lock = (bx, w, h, s, Y0 = 60, r = 1.6) => {
    const ax = bx + s, ay = Y0 - h;
    const f = (n) => n.toFixed(1);
    return `M${f(bx + w)} ${Y0} C${f(bx + w * 1.5)} ${f(Y0 - h * 0.6)} ${f(ax + w * 0.8)} ${f(ay + h * 0.28)} ${f(ax + r * 0.5)} ${f(ay)} `
      + `A${r} ${r} 0 0 0 ${f(ax - r * 0.6)} ${f(ay + r * 1.8)} `
      + `C${f(ax + w * 0.3)} ${f(ay + h * 0.4)} ${f(bx - w * 1.6)} ${f(Y0 - h * 0.45)} ${f(bx - w)} ${Y0} Z`;
  };
  const lockG = ([bx, w, h, s, dl], fill, streak) =>
    `<g class="sm-lock" style="--dl:${dl}s"><path d="${lock(bx, w, h, s)}" fill="${fill}" stroke="${INK}" stroke-width="2.2"/>`
    + (streak ? `<path d="${lock(bx - w * 0.1, w * 0.3, h * 0.62, s * 0.8, 54, 1.4)}" fill="#fff6c2" opacity=".9"/>` : '') + '</g>';
  // Rising embers: tiny upright flame drops (a droplet with a round bottom).
  const ember = (x, y, k, dl) =>
    `<g class="sm-ember" style="--dl:${dl}s"><path transform="translate(${x} ${y}) scale(${k})" d="M0 -4.5 C2.2 -1.8 3 0 3 1.4 A3 3 0 0 1 -3 1.4 C-3 0 -2.2 -1.8 0 -4.5 Z" fill="#ffe066" stroke="${INK}" stroke-width="${(1.2 / k).toFixed(2)}"/></g>`;
  const bolt = (x, y, s, dl) => `<g class="sm-spark" style="--dl:${dl}s"><path transform="translate(${x} ${y}) scale(${s})" d="M1 -7 L-4 1 L0 1 L-2 7 L5 -1.5 L1 -1.5 L3 -7 Z" fill="#fff1a6" stroke="${INK}" stroke-width="${(1.3 / s).toFixed(2)}" stroke-linejoin="round"/></g>`;
  const BACK = `
    <g class="sm-aura">
      <path class="sm-a1 sm-with-hair" d="${aura(1.02, 12)}" fill="url(#sm-aura-g)" opacity=".8"/><path class="sm-a1 sm-no-hair" d="${aura(1.02, 12, 0)}" fill="url(#sm-aura-g)" opacity=".8"/>
    </g>
    <g class="sm-tuft" stroke-linejoin="round" stroke-linecap="round">
      ${LOCKS_BACK.map((l) => lockG(l, 'url(#sm-tuft-b)')).join('')}
      ${LOCKS_FRONT.map((l) => lockG(l, 'url(#sm-tuft-g)', true)).join('')}
      ${ember(58, 18, 1.4, 0)}${ember(102, 12, 1.2, -0.45)}${ember(124, 28, 1.05, -0.8)}
    </g>
    <g class="sm-aura sm-aura-over" opacity=".3">
      <path class="sm-a2 sm-with-hair" d="${aura(0.93, 8)}" fill="#fff3a0" opacity=".55"/><path class="sm-a2 sm-no-hair" d="${aura(0.93, 8, 0)}" fill="#fff3a0" opacity=".55"/>
    </g>
`;
  const FRONT = `<g class="sm-sparks">${bolt(16, 62, 1.1, 0)}${bolt(145, 74, 1.25, 0.25)}${bolt(20, 124, 0.95, 0.5)}${bolt(140, 128, 1, 0.15)}${bolt(134, 34, 0.85, 0.4)}${bolt(26, 34, 0.85, 0.6)}</g>`;

  // Speed lines: straight bars with round caps. Tier 1 shows from Buen ritmo,
  // tier 2 from ¡En racha!, tier 3 from ¡Superándote!.
  const LINES = [
    [1, 26, 64, 30, 0.5, 0], [1, 22, 88, 38, 0.44, -0.2], [1, 26, 112, 32, 0.52, -0.33], [1, 30, 130, 26, 0.46, -0.1],
    [2, 18, 74, 44, 0.4, -0.27], [2, 16, 100, 48, 0.38, -0.05], [2, 22, 122, 40, 0.42, -0.4],
    [3, 20, 52, 54, 0.34, -0.15], [3, 12, 94, 60, 0.32, -0.3], [3, 18, 138, 50, 0.36, -0.08],
  ];
  const SPEED = `<g class="zn-speed" aria-hidden="true" fill="none" stroke-width="4" stroke-linecap="round">${LINES.map(([tier, x, y, len, d, dl]) =>
    `<path class="zl t${tier}" style="--d:${d}s;--dl:${dl}s" d="M${x - 4} ${y}h-${len - 4}"/>`).join('')}</g>`;

  const css = document.createElement('style');
  css.textContent = `
    .sm-layer { opacity: 0; visibility: hidden; transition: opacity calc(260ms / var(--speed)) ease, visibility 0s linear calc(260ms / var(--speed)); }
    .mascot[data-super="on"] .sm-layer { opacity: 1; visibility: visible; transition: opacity calc(200ms / var(--speed)) ease; }
    .sm-a1, .sm-a2, .sm-lock, .sm-ember { transform-box: fill-box; transform-origin: 50% 100%; }
    .mascot[data-super="on"] .sm-a1 { animation: sm-flick calc(240ms / var(--speed)) steps(2) infinite; }
    .mascot[data-super="on"] .sm-a2 { animation: sm-flick2 calc(300ms / var(--speed)) steps(2) infinite; }
    .mascot[data-super="on"] .sm-lock { animation: sm-lock calc(620ms / var(--speed)) ease-in-out infinite; animation-delay: calc(var(--dl) / var(--speed)); }
    .sm-ember { opacity: 0; }
    .mascot[data-super="on"] .sm-ember { animation: sm-ember calc(1100ms / var(--speed)) ease-out infinite; animation-delay: calc(var(--dl) / var(--speed)); }
    @keyframes sm-flick { 0% { transform: scale(1, 1); opacity: .8; } 50% { transform: scale(1.03, 1.07); opacity: .62; } }
    @keyframes sm-flick2 { 0% { transform: scale(1.02, 1.04); opacity: .5; } 50% { transform: scale(.98, .97); opacity: .7; } }
    @keyframes sm-lock { 0%, 100% { transform: rotate(0deg) scale(1, 1); } 50% { transform: rotate(-5deg) scale(.97, 1.07); } }
    @keyframes sm-ember { 0% { transform: translate(0, 8px) scale(.6); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(-6px, -16px) scale(.3); opacity: 0; } }
    .sm-spark { opacity: 0; }
    .mascot[data-super="on"] .sm-spark { animation: sm-spark calc(900ms / var(--speed)) steps(1) infinite; animation-delay: calc(var(--dl) / var(--speed)); }
    @keyframes sm-spark { 0% { opacity: 1; } 22% { opacity: 0; } 55% { opacity: 1; } 70% { opacity: 0; } }
    .mascot[data-zone="super"] .m-glow { opacity: 1; }
    .mascot.sm-nohair .sm-tuft { display: none; } /* lab toggle: Supermochi without the flame-hair */
    #mascot .sm-no-hair { display: none; }
    #mascot.sm-nohair .sm-with-hair, #mascot.rw-head-on .sm-with-hair { display: none; }
    #mascot.sm-nohair .sm-no-hair, #mascot.rw-head-on .sm-no-hair { display: inline; }
    .mascot.rw-head-on .sm-tuft { display: none; } /* a hat or helmet is on: only the aura stays */

    /* Proposed zones: our own speed lines replace the built-in ones. */
    .mascot[data-pz] .m-lines { opacity: 0 !important; }
    .zn-speed .zl { opacity: 0; stroke: var(--zl, #ff9e7a); transform-box: fill-box; transform-origin: 100% 50%; }
    .mascot[data-pz="good"] { --zl: #ff9e7a; --zk: 1; }
    .mascot[data-pz="fire"] { --zl: #f0553a; --zk: .7; }
    .mascot[data-pz="beating"] { --zl: #ffb81c; --zk: .55; }
    .mascot[data-pz="super"] { --zl: #ffc93c; --zk: .48; }
    .mascot[data-pz="good"] .zl.t1,
    .mascot[data-pz="fire"] .zl.t1, .mascot[data-pz="fire"] .zl.t2,
    .mascot[data-pz="beating"] .zl, .mascot[data-pz="super"] .zl {
      animation: zn-streak calc(var(--d) * var(--zk, 1) / var(--speed)) linear infinite; animation-delay: calc(var(--dl) / var(--speed)); }
    @keyframes zn-streak { 0% { transform: translateX(12px) scaleX(.35); opacity: 0; } 25% { opacity: .95; } 100% { transform: translateX(-26px) scaleX(1.2); opacity: 0; } }
    /* Forward lean grows with the zone (on top of mascot.js's own small lean). */
    .zn-lean { transform-box: view-box; transform-origin: 80px 140px; transition: transform calc(320ms / var(--speed)) cubic-bezier(.34,1.45,.64,1); }
    .mascot[data-pz="good"] .zn-lean { transform: rotate(2deg); }
    .mascot[data-pz="fire"] .zn-lean { transform: rotate(4.5deg); }
    .mascot[data-pz="beating"] .zn-lean { transform: rotate(7deg); }
    .mascot[data-pz="super"] .zn-lean { transform: rotate(8deg); }
    /* Afterimages trailing behind at the top two zones. */
    .zn-ghost { opacity: 0; pointer-events: none; transition: opacity calc(220ms / var(--speed)) ease; }
    .mascot[data-pz="beating"] .zn-ghost.g1 { opacity: .2; }
    .mascot[data-pz="super"] .zn-ghost.g1 { opacity: .24; }
    .mascot[data-pz="super"] .zn-ghost.g2 { opacity: .11; }
    /* Wind: the ninja band's tails flap faster as the zone rises. */
    .mascot[data-pz="fire"] .rw-flutter { animation-duration: calc(450ms / var(--speed)); }
    .mascot[data-pz="beating"] .rw-flutter, .mascot[data-pz="super"] .rw-flutter { animation-duration: calc(300ms / var(--speed)); }
    /* Supermochi shield: it absorbs backspaces for 35 s (no ring drawn); the aura pulses on each one. */
    .mascot.zn-absorb .sm-a1 { animation: zn-aura-pulse calc(420ms / var(--speed)) ease-out; }
    @keyframes zn-aura-pulse { 0% { transform: scale(1); opacity: .8; } 40% { transform: scale(1.12, 1.16); opacity: 1; } 100% { transform: scale(1); opacity: .8; } }

    /* The bar grows with the zone too. */
    .pet.pz .livebar i::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; right: -20px; opacity: 0; transition: opacity 300ms ease; }
    .pet.pz[data-zone="rhythm"] .livebar i::after { opacity: 1; right: auto; width: 45%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent); animation: zn-sheen calc(2.6s / var(--speed, 1)) ease-in-out infinite; }
    .pet.pz[data-zone="good"] .livebar i::after { opacity: 1; background: repeating-linear-gradient(-45deg, rgba(255,255,255,.34) 0 5px, transparent 5px 10px); animation: zn-flow calc(900ms / var(--speed, 1)) linear infinite; }
    .pet.pz[data-zone="fire"] .livebar i::after { opacity: 1; background: repeating-linear-gradient(-45deg, rgba(255,230,160,.55) 0 5px, transparent 5px 10px); animation: zn-flow calc(420ms / var(--speed, 1)) linear infinite; }
    .pet.pz[data-zone="beating"] .livebar i::after { opacity: 1; background: repeating-linear-gradient(-45deg, rgba(255,255,255,.6) 0 5px, transparent 5px 10px); animation: zn-flow calc(320ms / var(--speed, 1)) linear infinite; }
    .pet.pz[data-zone="fire"] .livebar { box-shadow: 0 0 0 1px rgba(35,32,43,.28), 0 0 7px rgba(240,85,58,.65); }
    .pet.pz[data-zone="beating"] .livebar { box-shadow: 0 0 0 1px rgba(35,32,43,.28), 0 0 9px rgba(255,201,60,.85); }
    @keyframes zn-sheen { from { transform: translateX(-110%); } to { transform: translateX(240%); } }
    @keyframes zn-flow { to { transform: translateX(-14.14px); } }
    @media (prefers-reduced-motion: reduce) {
      .sm-a1, .sm-a2, .sm-lock, .sm-ember, .sm-spark, .zl, .pet.pz .livebar i::after, .rw-flutter { animation: none !important; }
      .zn-lean { transition: none; }
      .mascot[data-super="on"] .sm-spark { opacity: 1; }
      .mascot[data-pz="good"] .zl.t1, .mascot[data-pz="fire"] .zl.t1, .mascot[data-pz="fire"] .zl.t2, .mascot[data-pz="beating"] .zl, .mascot[data-pz="super"] .zl { opacity: .8; }
    }
  `;
  document.head.append(css);

  function decorate(svg) {
    if (svg.id !== 'mascot' || svg.__sm) return;
    const body = svg.querySelector('.mascot-body');
    const hop = svg.querySelector('.m-hop');
    if (!body || !hop) return;
    svg.querySelector('defs').insertAdjacentHTML('beforeend', `
      <radialGradient id="sm-aura-g" cx=".5" cy=".55" r=".55"><stop offset=".55" stop-color="#fff3a0"/><stop offset=".8" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9f1c" stop-opacity=".7"/></radialGradient>
      <linearGradient id="sm-tuft-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe98a"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ffb52e"/></linearGradient>
      <linearGradient id="sm-tuft-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc53d"/><stop offset="1" stop-color="#f08a1c"/></linearGradient>`);
    const g = (html, cls = 'sm-layer') => { const el = document.createElementNS(NS, 'g'); el.setAttribute('class', cls); el.setAttribute('aria-hidden', 'true'); el.innerHTML = html; return el; };
    body.insertBefore(g(BACK), body.firstChild);
    body.insertBefore(g(FRONT), body.querySelector('.rw-crown-lift') || null);
    // Lean wrapper around the whole body stack (hop > bob > lift > breath > body), plus the speed
    // lines and two afterimages behind it.
    const lean = document.createElementNS(NS, 'g');
    lean.setAttribute('class', 'zn-lean');
    lean.id = 'zn-body-main';
    hop.before(lean);
    lean.append(hop);
    lean.insertAdjacentHTML('beforebegin', `${SPEED}<use class="zn-ghost g2" href="#zn-body-main" transform="translate(-26 0)"/><use class="zn-ghost g1" href="#zn-body-main" transform="translate(-13 0)"/>`);
    svg.__sm = true;
  }
  const prevMount = Mascot.mount;
  Mascot.mount = (svg) => { const r = prevMount(svg); decorate(svg); return r; };

  // ------------------------------------------------------------- Supermochi immunity
  // While the shield is up, a backspace reaches pet.js as an ordinary key: no "ups" face, bubble or
  // tilt, the crown stays, and Supermochi carries on. pet.js subscribes after this file loads, so the
  // filter is installed on the mocked event API it will use.
  let superOn = false;
  let superStart = 0;
  const immune = () => superOn && performance.now() - superStart < IMMUNE_MS;
  const realListen = window.__TAURI__.event.listen;
  window.__TAURI__.event.listen = (name, cb) => realListen(name, name !== 'tapomo://key' ? cb : (e) => {
    if (immune() && (e.payload === 'delete' || e.payload === 'word_delete')) {
      absorb();
      return cb({ ...e, payload: 'char' });
    }
    return cb(e);
  });
  function absorb() {
    const svg = $('mascot');
    if (!svg) return;
    svg.classList.remove('zn-absorb');
    void svg.getBoundingClientRect();
    svg.classList.add('zn-absorb');
    clearTimeout(absorb.t);
    absorb.t = setTimeout(() => svg.classList.remove('zn-absorb'), 450);
    const log = $('zn-log');
    if (log) log.textContent = 'Backspace absorbido por el escudo: sin «¡ups!», la corona se queda y sigue el Modo Supermochi.';
  }

  // ------------------------------------------------------------- applying the proposed zones
  let applying = false;
  function apply() {
    const pet = $('pet');
    const svg = $('mascot');
    if (!pet || !svg || !window.TapomoPet) return;
    const pct = window.TapomoPet.display;
    const active = pet.dataset.zone && pet.dataset.zone !== 'idle';
    pet.classList.toggle('pz', mode === 'prop');
    if (mode !== 'prop' || !active) { delete svg.dataset.pz; readout(active ? pct : null); return setSuper(false); }
    let z = zoneAt(pct);
    if (immune()) z = PROP[PROP.length - 1]; // the power-up holds for its whole window
    readout(pct, z);
    applying = true;
    if (pet.dataset.zone !== z.id) pet.dataset.zone = z.id;
    const svgZone = svg.classList.contains('sleeping') ? svg.dataset.zone : z.svgZone || z.id;
    if (svg.dataset.zone !== svgZone) svg.dataset.zone = svgZone;
    if (svg.dataset.pz !== z.id) svg.dataset.pz = z.id;
    applying = false;
    setSuper(z.id === 'super' && !svg.classList.contains('sleeping'));
    // pet.js redraws the face from the streak on every key; while Supermochi lasts, keep its own face
    // (an "ups" after the shield has run out still shows).
    if (superOn && !['sparkle', 'dots', 'closed'].includes(svg.dataset.eyes)) Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'open', cheeks: true });
  }
  function setSuper(on) {
    const pet = $('pet');
    const svg = $('mascot');
    if (!pet || !svg) return;
    if (on) {
      pet.dataset.super = 'on';
      svg.dataset.super = 'on';
      if (svg.__shades) Mascot.setShades(svg, false); // the face must show: no sunglasses in Supermochi
      if (!superOn) {
        superStart = performance.now();
        Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'open', cheeks: true });
        bubble('¡Modo Supermochi!');
      }
    } else {
      delete pet.dataset.super;
      delete svg.dataset.super;
      if (superOn) {
        if (svg.dataset.zone === 'super') svg.dataset.zone = 'beating';
        if (svg.dataset.zone === 'beating' && !svg.classList.contains('sleeping')) Mascot.setShades(svg, true);
        // pet.js only redraws the face on its own triggers; one key event hands the face back to it.
        if (window.Lab && !svg.classList.contains('sleeping')) setTimeout(() => window.Lab.emit('tapomo://key', 'char'), 0);
      }
    }
    superOn = on;
  }
  function bubble(text) {
    const el = $('bubble');
    if (!el) return;
    el.textContent = text;
    el.classList.add('big');
    el.classList.remove('tip');
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(bubble.t);
    bubble.t = setTimeout(() => (el.hidden = true), 1800);
  }
  const obs = new MutationObserver(() => { if (!applying) apply(); });
  const watch = () => {
    if (!$('mascot') || !$('mascot').querySelector('.mascot-body')) return setTimeout(watch, 100);
    obs.observe($('pet'), { attributes: true, attributeFilter: ['data-zone'] });
    obs.observe($('mascot'), { attributes: true, attributeFilter: ['data-zone', 'class'] });
    apply();
  };
  watch();
  // While the value glides between two zone labels pet.js does not change its own zone; re-check each frame.
  const tick = () => { apply(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  // ------------------------------------------------------------- panel
  function readout(pct, zone) {
    const name = $('zn-name');
    const out = $('zn-pct');
    const sh = $('zn-shield');
    if (!name) return;
    if (pct == null) {
      if (name.textContent !== 'Sin escribir') { name.textContent = 'Sin escribir'; name.style.background = ''; }
      out.textContent = '–';
      if (sh) sh.hidden = true;
      return;
    }
    const z = zone || zoneAt(pct);
    if (name.textContent !== z.name) { name.textContent = z.name; name.style.background = z.color; name.style.color = '#23202b'; }
    out.textContent = `${Math.round(pct)} % de tu referencia`;
    if (sh) {
      const left = immune() ? Math.ceil((IMMUNE_MS - (performance.now() - superStart)) / 1000) : 0;
      sh.hidden = !left;
      if (left) sh.textContent = `Escudo: ${left} s`;
    }
  }
  if (!$('zn-slider')) return;
  function renderScale() {
    const sc = $('zn-scale');
    const list = set();
    const lbl = (v) => (Number.isInteger(v) ? v : Math.round(v));
    sc.innerHTML = list.map((z, i) => {
      const to = list[i + 1] ? list[i + 1].from : 140;
      return `<i style="left:${(z.from / 140) * 100}%;width:calc(${((Math.min(to, 140) - z.from) / 140) * 100}% - 2px);background:${z.color}"></i>`;
    }).join('') + list.slice(1).map((z) => `<span style="left:${(z.from / 140) * 100}%">${lbl(z.from)}</span>`).join('');
    $('zn-legend').textContent = list.map((z, i) => `${z.name} ${i ? (list[i + 1] ? `${lbl(z.from)}–${lbl(list[i + 1].from)}` : `≥${lbl(z.from)}`) : `<${lbl(list[1].from)}`} %`).join(' · ');
    const pre = $('zn-presets');
    pre.replaceChildren(...list.map((z, i) => {
      const to = list[i + 1] ? list[i + 1].from : 140;
      const v = Math.round(i === list.length - 1 ? Math.min(130, z.from + 10) : (z.from + to) / 2);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${z.name} (${v} %)`;
      b.addEventListener('click', () => { $('zn-slider').value = v; drive(v); });
      return b;
    }));
    document.querySelectorAll('.seg-z[data-set]').forEach((b) => {
      b.classList.toggle('on', b.dataset.set === mode);
      b.setAttribute('aria-pressed', String(b.dataset.set === mode));
    });
    $('zn-immune').hidden = mode !== 'prop';
  }
  function drive(v) {
    if (!window.Lab) return;
    const { model, pushLive } = window.Lab;
    model.calibrating = null;
    model.wpm = v > 0 ? v : null; // the mock's reference is 100, so wpm = % of the reference
    pushLive();
    if (v > 0) window.Lab.emit('tapomo://key', 'char'); // wakes Tapomo up if it was asleep
  }
  $('zn-slider').addEventListener('input', () => drive(parseInt($('zn-slider').value, 10)));
  document.querySelectorAll('.seg-z[data-set]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.set;
    try { localStorage.setItem('zn-set', mode); } catch (_) { /* storage off */ }
    if (mode === 'cur') setSuper(false);
    renderScale();
    // Let pet.js repaint its own zone, then re-apply.
    if (window.Lab) window.Lab.pushLive();
  }));
  // Flame-hair toggle: compare Supermochi with and without the tuft (aura, bolts and glow stay).
  document.querySelectorAll('.seg-z[data-hair]').forEach((b) => b.addEventListener('click', () => {
    const on = b.dataset.hair === 'on';
    const m = $('mascot');
    if (m) {
      m.classList.toggle('sm-nohair', !on);
      // Also as attributes: the afterimages are <use> clones that page CSS can't reach.
      const set = (sel, visible) => m.querySelectorAll(sel).forEach((el) => (visible ? el.removeAttribute('display') : el.setAttribute('display', 'none')));
      set('.sm-tuft', on);
      set('.sm-with-hair', on);
      set('.sm-no-hair', !on);
    }
    document.querySelectorAll('.seg-z[data-hair]').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
  }));
  $('zn-go-super').addEventListener('click', () => { $('zn-slider').value = 120; drive(120); });
  $('zn-backspace').addEventListener('click', () => {
    if (!window.Lab) return;
    if (!immune()) { const log = $('zn-log'); if (log) log.textContent = 'Fuera del escudo: el backspace hace lo de siempre («¡ups!»).'; }
    window.Lab.emit('tapomo://key', 'delete');
  });
  renderScale();
})();
