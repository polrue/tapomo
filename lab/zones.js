// Proposed live zones for the lab (lab-only; pet.js keeps the current set).
// pet.js still computes its own 4 zones; in "propuesta" mode this file re-labels them from the value
// pet.js is displaying (TapomoPet.display), right after pet.js writes them (a MutationObserver runs
// before the frame is painted), so the bar colour, speed lines and face follow the proposed thresholds.
//   Current:   warming <60 · good 60–85 · fire 85–100 · beating >100
//   Proposed:  Calentando <40 · Cogiendo ritmo 40–60 · Buen ritmo 60–80 · ¡En racha! 80–100 ·
//              ¡Superándote! 100–115 · ¡Modo Supermochi! >115 (a temporary power-up effect).
(() => {
  const INK = '#23202b';
  const NS = 'http://www.w3.org/2000/svg';
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
    { id: 'beating', name: '¡Superándote!', from: 100.0001, color: '#ffc93c' },
    { id: 'super', name: '¡Modo Supermochi!', from: 115.0001, color: '#ffb81c', svgZone: 'super' },
  ];
  let mode = 'prop';
  try { if (localStorage.getItem('zn-set') === 'cur') mode = 'cur'; } catch (_) { /* storage off */ }
  const set = () => (mode === 'prop' ? PROP : CUR);
  const zoneAt = (p, list = set()) => [...list].reverse().find((z) => p >= z.from) || list[0];

  // ------------------------------------------------------------- Supermochi drawing
  const aura = (k, extra) => {
    const N = 26;
    let d = '';
    for (let i = 0; i <= N * 2; i++) {
      const a = (i / (N * 2)) * Math.PI * 2;
      const up = Math.max(0, -Math.sin(a));
      const tip = i % 2 === 1;
      const r = tip ? 1 + (extra + 16 * up) / 62 : 1;
      let x = 80 + Math.cos(a) * 62 * k * r;
      let y = 92 + Math.sin(a) * 60 * k * r;
      if (tip) y -= 7 * (0.4 + up); // flames lean upward
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d + 'Z';
  };
  const bolt = (x, y, s, dl) => `<g class="sm-spark" style="--dl:${dl}s"><path transform="translate(${x} ${y}) scale(${s})" d="M1 -7 L-4 1 L0 1 L-2 7 L5 -1.5 L1 -1.5 L3 -7 Z" fill="#fff1a6" stroke="${INK}" stroke-width="${(1.3 / s).toFixed(2)}" stroke-linejoin="round"/></g>`;
  const BACK = `
    <g class="sm-aura">
      <path class="sm-a1" d="${aura(1.02, 12)}" fill="url(#sm-aura-g)" opacity=".8"/>
      <path class="sm-a2" d="${aura(0.93, 8)}" fill="#fff3a0" opacity=".55"/>
    </g>
    <g class="sm-tuft" stroke-linejoin="round">
      <path d="M42 58 L33 22 L52 36 L53 0 L69 26 L80 -14 L91 26 L107 0 L108 36 L127 22 L118 58 Z" fill="url(#sm-tuft-g)" stroke="${INK}" stroke-width="2.4"/>
      <path d="M48 46 L44 32 L55 41 M66 34 L60 17 L71 30 M80 26 V4 M94 34 L100 17 L89 30 M112 46 L116 32 L105 41" fill="none" stroke="#fffbe0" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
    </g>`;
  // ¡En racha! / ¡Superándote!: little flames trailing behind the lower back, plus sparks.
  const flame = (x, y, s, dl) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="zn-fl" style="--dl:${dl}s"><path d="M0 0 C-7 -3 -8 -13 -2 -22 C-1 -15 5 -13 6 -6 C7 -1 4 1 0 0 Z" fill="url(#zn-flame-g)" stroke="${INK}" stroke-width="${(1.8 / s).toFixed(2)}" stroke-linejoin="round"/></g></g>`;
  const FLAMES = `${flame(30, 138, 1.4, 0)}${flame(19, 125, 1.1, 0.12)}${flame(24, 110, 0.85, 0.25)}${flame(44, 143, 0.95, 0.18)}
    <g class="zn-dot" style="--dl:0s"><circle cx="14" cy="104" r="1.8" fill="#ffd23f" stroke="${INK}" stroke-width=".9"/></g><g class="zn-dot" style="--dl:.3s"><circle cx="10" cy="128" r="1.5" fill="#ffd23f" stroke="${INK}" stroke-width=".9"/></g>`;
  const FRONT = `<g class="sm-sparks">${bolt(16, 62, 1.1, 0)}${bolt(145, 74, 1.25, 0.25)}${bolt(20, 124, 0.95, 0.5)}${bolt(140, 128, 1, 0.15)}${bolt(134, 34, 0.85, 0.4)}${bolt(26, 34, 0.85, 0.6)}</g>`;

  const css = document.createElement('style');
  css.textContent = `
    .sm-layer { opacity: 0; visibility: hidden; transition: opacity calc(260ms / var(--speed)) ease, visibility 0s linear calc(260ms / var(--speed)); }
    .mascot[data-super="on"] .sm-layer { opacity: 1; visibility: visible; transition: opacity calc(200ms / var(--speed)) ease; }
    .sm-a1, .sm-a2, .sm-tuft { transform-box: fill-box; transform-origin: 50% 100%; }
    .mascot[data-super="on"] .sm-a1 { animation: sm-flick calc(240ms / var(--speed)) steps(2) infinite; }
    .mascot[data-super="on"] .sm-a2 { animation: sm-flick2 calc(300ms / var(--speed)) steps(2) infinite; }
    .mascot[data-super="on"] .sm-tuft { animation: sm-tuft calc(360ms / var(--speed)) ease-in-out infinite; }
    @keyframes sm-flick { 0% { transform: scale(1, 1); opacity: .8; } 50% { transform: scale(1.03, 1.07); opacity: .62; } }
    @keyframes sm-flick2 { 0% { transform: scale(1.02, 1.04); opacity: .5; } 50% { transform: scale(.98, .97); opacity: .7; } }
    @keyframes sm-tuft { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(1.06) skewX(-1.5deg); } }
    .sm-spark { opacity: 0; }
    .mascot[data-super="on"] .sm-spark { animation: sm-spark calc(900ms / var(--speed)) steps(1) infinite; animation-delay: calc(var(--dl) / var(--speed)); }
    @keyframes sm-spark { 0% { opacity: 1; } 22% { opacity: 0; } 55% { opacity: 1; } 70% { opacity: 0; } }
    .mascot[data-zone="super"] .m-lines, .mascot[data-zone="super"] .m-glow { opacity: 1; }
    .mascot[data-zone="super"] .m-lines .ln { stroke: #ffc93c; }
    .mascot.rw-head-on .sm-tuft { display: none; } /* a hat or helmet is on: only the aura stays */
    /* Proposed zones, growing step by step (data-pz = proposed zone id). */
    .mascot[data-pz="good"] .m-lines .ln { stroke: #ff9e7a; }
    .mascot[data-pz="fire"] .m-lines .ln { animation-duration: calc(var(--d, .45s) * .62 / var(--speed)); }
    .mascot[data-pz="beating"] .m-lines .ln { animation-duration: calc(var(--d, .45s) * .55 / var(--speed)); }
    .zn-flames { opacity: 0; transition: opacity calc(260ms / var(--speed)) ease; }
    .mascot[data-pz="fire"] .zn-flames, .mascot[data-pz="beating"] .zn-flames { opacity: 1; }
    .zn-fl > path { transform-box: fill-box; transform-origin: 50% 100%; }
    .mascot[data-pz="fire"] .zn-fl > path, .mascot[data-pz="beating"] .zn-fl > path { animation: zn-fl calc(260ms / var(--speed)) ease-in-out infinite alternate; animation-delay: calc(var(--dl) / var(--speed)); }
    @keyframes zn-fl { from { transform: scale(.9, .82) rotate(-4deg); } to { transform: scale(1.06, 1.14) rotate(5deg); } }
    .zn-dot { opacity: 0; }
    .mascot[data-pz="fire"] .zn-dot, .mascot[data-pz="beating"] .zn-dot { animation: sm-spark calc(700ms / var(--speed)) steps(1) infinite; animation-delay: calc(var(--dl) / var(--speed)); }
    .pet.pz .livebar i::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; right: -20px; opacity: 0; transition: opacity 300ms ease; }
    .pet.pz[data-zone="rhythm"] .livebar i::after { opacity: 1; right: auto; width: 45%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent); animation: zn-sheen calc(2.6s / var(--speed, 1)) ease-in-out infinite; }
    .pet.pz[data-zone="good"] .livebar i::after { opacity: 1; background: repeating-linear-gradient(-45deg, rgba(255,255,255,.34) 0 5px, transparent 5px 10px); animation: zn-flow calc(900ms / var(--speed, 1)) linear infinite; }
    .pet.pz[data-zone="fire"] .livebar i::after { opacity: 1; background: repeating-linear-gradient(-45deg, rgba(255,230,160,.55) 0 5px, transparent 5px 10px); animation: zn-flow calc(420ms / var(--speed, 1)) linear infinite; }
    .pet.pz[data-zone="beating"] .livebar i::after { opacity: 1; background: repeating-linear-gradient(-45deg, rgba(255,255,255,.6) 0 5px, transparent 5px 10px); animation: zn-flow calc(320ms / var(--speed, 1)) linear infinite; }
    .pet.pz[data-zone="fire"] .livebar { box-shadow: 0 0 0 1px rgba(35,32,43,.28), 0 0 7px rgba(240,85,58,.65); }
    .pet.pz[data-zone="beating"] .livebar { box-shadow: 0 0 0 1px rgba(35,32,43,.28), 0 0 9px rgba(255,201,60,.85); }
    @keyframes zn-sheen { from { transform: translateX(-110%); } to { transform: translateX(240%); } }
    @keyframes zn-flow { to { transform: translateX(-14.14px); } }
    @media (prefers-reduced-motion: reduce) { .sm-a1, .sm-a2, .sm-tuft, .sm-spark, .zn-fl > path, .zn-dot, .pet.pz .livebar i::after { animation: none !important; } .mascot[data-super="on"] .sm-spark { opacity: 1; } }
  `;
  document.head.append(css);

  function decorate(svg) {
    if (svg.id !== 'mascot' || svg.__sm) return;
    const body = svg.querySelector('.mascot-body');
    if (!body) return;
    svg.querySelector('defs').insertAdjacentHTML('beforeend', `
      <radialGradient id="sm-aura-g" cx=".5" cy=".55" r=".55"><stop offset=".55" stop-color="#fff3a0"/><stop offset=".8" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9f1c" stop-opacity=".7"/></radialGradient>
      <linearGradient id="zn-flame-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a3c"/><stop offset=".55" stop-color="#ff9a2e"/><stop offset="1" stop-color="#ffd23f"/></linearGradient>
      <linearGradient id="sm-tuft-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b8"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ffab1c"/></linearGradient>`);
    const g = (html, cls = 'sm-layer') => { const el = document.createElementNS(NS, 'g'); el.setAttribute('class', cls); el.setAttribute('aria-hidden', 'true'); el.innerHTML = html; return el; };
    body.insertBefore(g(BACK), body.firstChild);
    body.insertBefore(g(FLAMES, 'zn-flames'), body.firstChild);
    const front = g(FRONT);
    const crown = body.querySelector('.rw-crown-lift');
    body.insertBefore(front, crown || null);
    svg.__sm = true;
  }
  const prevMount = Mascot.mount;
  Mascot.mount = (svg) => { const r = prevMount(svg); decorate(svg); return r; };

  // ------------------------------------------------------------- applying the proposed zones
  let superOn = false;
  let applying = false;
  function apply() {
    const pet = $('pet');
    const svg = $('mascot');
    if (!pet || !svg || !window.TapomoPet) return;
    const pct = window.TapomoPet.display;
    const active = pet.dataset.zone && pet.dataset.zone !== 'idle';
    pet.classList.toggle('pz', mode === 'prop');
    readout(active ? pct : null);
    if (mode !== 'prop' || !active) { delete svg.dataset.pz; return setSuper(false); }
    const z = zoneAt(pct);
    applying = true;
    if (pet.dataset.zone !== z.id) pet.dataset.zone = z.id;
    const svgZone = svg.classList.contains('sleeping') ? svg.dataset.zone : z.svgZone || z.id;
    if (svg.dataset.zone !== svgZone) svg.dataset.zone = svgZone;
    if (svg.dataset.pz !== z.id) svg.dataset.pz = z.id;
    applying = false;
    setSuper(z.id === 'super' && !svg.classList.contains('sleeping'));
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
  if (!$('zn-slider')) return;
  function readout(pct) {
    const name = $('zn-name');
    const out = $('zn-pct');
    if (pct == null) {
      if (name.textContent !== 'Sin escribir') { name.textContent = 'Sin escribir'; name.style.background = ''; }
      out.textContent = '–';
      return;
    }
    const z = zoneAt(pct);
    if (name.textContent !== z.name) { name.textContent = z.name; name.style.background = z.color; name.style.color = '#23202b'; }
    out.textContent = `${Math.round(pct)} % de tu referencia`;
  }
  function renderScale() {
    const sc = $('zn-scale');
    const list = set();
    sc.innerHTML = list.map((z, i) => {
      const to = list[i + 1] ? list[i + 1].from : 140;
      return `<i style="left:${(z.from / 140) * 100}%;width:calc(${((Math.min(to, 140) - z.from) / 140) * 100}% - 2px);background:${z.color}"></i>`;
    }).join('') + list.slice(1).map((z) => `<span style="left:${(z.from / 140) * 100}%">${Math.round(z.from)}</span>`).join('');
    $('zn-legend').textContent = list.map((z, i) => `${z.name} ${i ? (list[i + 1] ? `${Math.round(z.from)}–${Math.round(list[i + 1].from)}` : `>${Math.round(z.from)}`) : `<${Math.round(list[1].from)}`} %`).join(' · ');
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
    document.querySelectorAll('.seg-z').forEach((b) => {
      b.classList.toggle('on', b.dataset.set === mode);
      b.setAttribute('aria-pressed', String(b.dataset.set === mode));
    });
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
  document.querySelectorAll('.seg-z').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.set;
    try { localStorage.setItem('zn-set', mode); } catch (_) { /* storage off */ }
    if (mode === 'cur') setSuper(false);
    renderScale();
    // Let pet.js repaint its own zone, then re-apply.
    if (window.Lab) window.Lab.pushLive();
  }));
  renderScale();
})();
