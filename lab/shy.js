// Lab only: «Modo vergonzoso» proposal. A quiet-hours schedule during which Tapomo hides itself
// (under the ground, A peeking over its edge, C still), can be called out for a minute or two
// minutes, and comes back at the end with something useful to say. Runs on top of the real pet.js:
// while shy, the pet's reactions are switched off by wrapping the Mascot calls pet.js makes.
(() => {
  const $ = (id) => document.getElementById(id);
  const svg = $('mascot');
  const pet = $('pet');
  const stage = $('stage');
  const box = $('stage-box');

  // ---------------------------------------------------------------- state
  const TEMPLATES = {
    cole: { days: [1, 2, 3, 4, 5], slots: [[540, 810], [900, 1020]] },
    trabajo: { days: [1, 2, 3, 4, 5], slots: [[540, 840], [900, 1080]] },
  };
  const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const LAB_MIN_MS = 4000; // one minute outside, sped up for the lab
  const s = {
    tpl: 'cole', days: new Set(TEMPLATES.cole.days), slots: TEMPLATES.cole.slots.map((x) => [...x]), vac: '',
    mode: 'under', fx: 'ripple', outMin: 2, strict: false, gender: 'chica', talk: 'normal',
    day: 1, min: 510,
    shy: false, out: false, outUntil: 0, backTurn: 0, hideTurn: 0,
  };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const toMin = (v) => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const TODAY = '2026-10-23';
  const onHoliday = () => !!s.vac && s.vac >= TODAY;
  const slotNow = () => (onHoliday() || !s.days.has(s.day) ? null : s.slots.find(([a, b]) => a <= s.min && s.min < b) || null);

  // ---------------------------------------------------------------- phrases
  const place = () => (s.tpl === 'trabajo' ? 'trabajo' : 'clase');
  const conc = () => (s.gender === 'chico' ? 'concentrado' : 'concentrada');
  const HIDE = [
    () => `Me escondo para que estés más ${conc()}. ¡Búscame luego!`,
    () => (place() === 'clase' ? 'Shhh… ahora toca clase. Te espero aquí detrás.' : 'Shhh… ahora toca trabajar. Te espero aquí detrás.'),
    () => 'No quiero molestar. Cuando acabes, aprendemos juntos.',
  ];
  const BACK = [
    () => `¡Ya estoy! Hoy has escrito 1.240 teclas en ${place()}. ¿Hacemos el texto del día?`,
    () => '¡Ya estoy! Te queda el reto de hoy: 3 min sin borrar. ¿Vamos?',
    () => '¡Ya estoy! ¿Una lección cortita? La fila superior te espera.',
  ];
  const PEEK = '¿Solo un ratito, vale?';
  const STRICT = 'Ahora no puedo salir… ¡luego jugamos!';
  const REHIDE = '¡Me vuelvo a esconder! Tú puedes.';

  // ---------------------------------------------------------------- muting pet.js
  // pet.js looks these up on the Mascot object at every call, so wrapping them here is enough.
  const MUTE = ['keyTick', 'jump', 'squish', 'tilt', 'burstStars', 'crownFlyOff', 'setFace', 'setZone', 'setShades', 'setCrown', 'wake', 'setSleeping', 'setHover', 'setHeld'];
  const O = {};
  let muted = false;
  for (const k of MUTE) {
    O[k] = Mascot[k];
    Mascot[k] = (...a) => (muted && a[0] === svg ? undefined : O[k](...a));
  }
  function mute(on) {
    muted = on;
    pet.classList.toggle('shy-mute', on);
    if (!on) {
      O.setZone(svg, null);
      O.setFace(svg, {});
      // A bubble pet.js queued while shy (an «¡ups!» from typing) must not pop up on the way out.
      if (!$('bubble').classList.contains('shy-say')) $('bubble').hidden = true;
    }
  }

  let sayTimer = null;
  function say(text, ms = 3200) {
    if (s.talk === 'silencioso') return;
    const el = $('bubble');
    clearTimeout(sayTimer);
    el.textContent = text;
    el.classList.remove('big');
    el.classList.add('tip', 'shy-say');
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    sayTimer = setTimeout(() => { el.hidden = true; el.classList.remove('shy-say'); }, ms);
  }

  // ---------------------------------------------------------------- hiding and coming out
  let seqTimer = null;
  // Under the ground: Tapomo sinks below its ground line, the line shrinks to its centre and a soft
  // effect marks the spot; then nothing is left on screen (in the app the window hides). Coming out
  // plays it backwards: the line grows from the centre and Tapomo pops up through it.
  const ground = Object.assign(document.createElement('div'), { className: 'shy-ground' });
  const fxLayer = Object.assign(document.createElement('div'), { className: 'shy-fxl' });
  stage.append(ground);
  pet.append(fxLayer); // outside the stage, so its bottom clip doesn't cut the effect in half
  let underTimers = [];
  const later = (ms, fn) => underTimers.push(setTimeout(fn, ms));
  function clearUnder() { underTimers.forEach(clearTimeout); underTimers = []; }

  function puff(kind) {
    fxLayer.replaceChildren();
    if (kind === 'none' || Mascot.reduced()) return;
    const n = { ripple: 2, dust: 5, glint: 1, stars: 3 }[kind];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = `fx-${kind}`;
      el.style.setProperty('--i', String(i));
      el.style.setProperty('--n', String(n));
      fxLayer.append(el);
    }
    later(1600, () => fxLayer.replaceChildren());
  }

  function under(on) {
    clearUnder();
    if (on) {
      ground.classList.add('show');
      stage.classList.add('shy-under');
      later(650, () => ground.classList.add('shrink'));
      later(1050, () => puff(s.fx));
      later(1150, () => $('shy-tray').hidden = false);
    } else {
      fxLayer.replaceChildren();
      ground.classList.add('show');
      ground.classList.remove('shrink');
      later(330, () => { stage.classList.remove('shy-under'); });
      later(900, () => ground.classList.remove('show'));
      $('shy-tray').hidden = true;
    }
  }

  function applyHidden(on) {
    const m = on ? s.mode : null;
    const wasUnder = stage.classList.contains('shy-under');
    Mascot.setHiding(svg, m === 'peek');
    pet.classList.toggle('shy-peek', m === 'peek');
    pet.classList.toggle('shy-still', m === 'still');
    if (m === 'under') under(true);
    else if (wasUnder) under(false);
    else $('shy-tray').hidden = true;
    if (m === 'still') O.setFace(svg, { eyes: 'round', mouth: 'small' });
  }

  /** The schedule starts: a shy face and a line, then the chosen way of hiding. */
  function goShy(reason) {
    clearTimeout(seqTimer);
    s.shy = true;
    s.out = false;
    mute(true);
    O.setFace(svg, { eyes: 'closed', mouth: 'small', cheeks: true });
    O.squish(svg);
    const line = HIDE[s.hideTurn++ % HIDE.length]();
    say(line, 2800);
    log(`${reason}: se esconde${s.talk === 'silencioso' ? ' sin decir nada' : ` («${line}»)`}`);
    seqTimer = setTimeout(() => applyHidden(true), s.talk === 'silencioso' ? 900 : 2400);
    render();
  }

  /** Called out during quiet hours: out for a minute or two (unless strict), then back into hiding. */
  function callOut() {
    if (!s.shy) return void log('Fuera de horario: el clic normal (dice algo)');
    if (s.out) return void log('Ya está fuera un ratito');
    if (s.strict) {
      // A quick peek to say it can't, then straight back.
      applyHidden(false);
      O.setFace(svg, { eyes: 'round', mouth: 'wavy', cheeks: true });
      say(STRICT, 2600);
      log('Lo llamas, pero está marcado «No dejarme salir»: asoma, lo dice y se queda');
      clearTimeout(seqTimer);
      seqTimer = setTimeout(() => applyHidden(true), 2400);
      return;
    }
    clearTimeout(seqTimer);
    s.out = true;
    s.outUntil = Date.now() + s.outMin * LAB_MIN_MS;
    applyHidden(false);
    mute(false);
    O.setFace(svg, { eyes: 'round', mouth: 'smile', cheeks: true });
    setTimeout(() => say(PEEK, 2600), 350);
    log(`Lo llamas: sale tímido ${s.outMin} min`);
    render();
  }

  function backIntoHiding() {
    if (!s.shy || !s.out) return;
    s.out = false;
    mute(true);
    if (s.talk !== 'silencioso') say(REHIDE, 2200);
    O.setFace(svg, { eyes: 'closed', mouth: 'small', cheeks: true });
    log('Se acaba el ratito: se vuelve a esconder solo');
    clearTimeout(seqTimer);
    seqTimer = setTimeout(() => applyHidden(true), s.talk === 'silencioso' ? 600 : 1800);
    render();
  }

  /** The schedule ends: out with a hop, stars and something useful. */
  function endShy() {
    clearTimeout(seqTimer);
    s.shy = false;
    s.out = false;
    applyHidden(false);
    mute(false);
    const line = BACK[s.backTurn++ % BACK.length]();
    setTimeout(() => {
      O.jump(svg, { big: false });
      O.burstStars(svg, 7, 0.75);
      if (s.talk !== 'silencioso') say(line, 4500);
    }, 450);
    log(`Acaba la franja: sale${s.talk === 'silencioso' ? ' con un saltito' : ` («${line}»)`}`);
    render();
  }

  function evaluate(reason) {
    const want = !!slotNow();
    if (want && !s.shy) goShy(reason || 'Empieza la franja');
    else if (!want && s.shy) endShy();
    else render();
  }

  // Clicks on Tapomo while shy never reach pet.js (no tip, no double-click).
  box.addEventListener('pointerdown', (e) => {
    if (!s.shy || s.out || !pet.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    callOut();
  }, true);
  $('shy-tray-btn').addEventListener('click', callOut);
  $('shy-hdr-btn').addEventListener('click', callOut);

  setInterval(() => {
    if (s.out && Date.now() >= s.outUntil) backIntoHiding();
    else if (s.out) render();
  }, 250);

  // ---------------------------------------------------------------- log
  const logs = [];
  function log(msg) {
    logs.unshift(`${DAYS[s.day - 1]} ${hhmm(s.min)} · ${msg}`);
    logs.length = Math.min(logs.length, 12);
    $('shy-log').replaceChildren(...logs.map((x) => Object.assign(document.createElement('li'), { textContent: x })));
  }

  // ---------------------------------------------------------------- panel
  const MODE_NOTES = {
    peek: 'Para comparar. Solo asoman la cabeza y los ojos sobre una rayita. Clic en él para sacarlo.',
    under: 'Se mete bajo tierra, la rayita se encoge hasta el centro y desaparece con un efecto suave. No queda nada a la vista: se saca desde el icono de la bandeja o la ventana principal.',
    still: 'Se queda a la vista, quieto y un poco transparente, sin bocadillos ni reacciones.',
  };
  function segOn(groupId, attr, val) {
    $(groupId).querySelectorAll(`[data-${attr}]`).forEach((b) => {
      const on = b.dataset[attr] === val;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderSchedule() {
    segOn('shy-tpl', 'tpl', s.tpl);
    $('shy-days').replaceChildren(...['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: d, title: DAYS[i] });
      b.classList.toggle('on', s.days.has(i + 1));
      b.setAttribute('aria-pressed', String(s.days.has(i + 1)));
      b.onclick = () => { s.days.has(i + 1) ? s.days.delete(i + 1) : s.days.add(i + 1); s.tpl = 'custom'; renderSchedule(); evaluate(); };
      return b;
    }));
    $('shy-slots').replaceChildren(...s.slots.map((slot, i) => {
      const row = document.createElement('div');
      row.className = 'shy-slot';
      const mk = (j) => {
        const inp = Object.assign(document.createElement('input'), { type: 'time', value: hhmm(slot[j]), step: 300 });
        inp.setAttribute('aria-label', j ? 'Hasta' : 'Desde');
        inp.onchange = () => { if (!inp.value) return; slot[j] = toMin(inp.value); s.tpl = 'custom'; segOn('shy-tpl', 'tpl', s.tpl); evaluate(); };
        return inp;
      };
      const del = Object.assign(document.createElement('button'), { type: 'button', className: 'ghost', textContent: 'Quitar' });
      del.onclick = () => { s.slots.splice(i, 1); s.tpl = 'custom'; renderSchedule(); evaluate(); };
      row.append('De', mk(0), 'a', mk(1), del);
      return row;
    }));
  }

  function render() {
    $('shy-clock').textContent = hhmm(s.min);
    $('shy-time').value = s.min;
    $('shy-day').value = String(s.day);
    const st = $('shy-state');
    const slot = slotNow();
    let txt = 'Libre';
    if (onHoliday()) txt = `De vacaciones hasta el ${s.vac.split('-').reverse().join('/')}`;
    else if (s.out) {
      const secs = Math.max(0, Math.ceil(((s.outUntil - Date.now()) / LAB_MIN_MS) * 60));
      txt = `Fuera un ratito · se esconde en ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }
    else if (slot) txt = `Horario tranquilo · hasta las ${hhmm(slot[1])}`;
    else {
      const next = s.days.has(s.day) ? s.slots.map((x) => x[0]).filter((a) => a > s.min).sort((a, b) => a - b)[0] : null;
      if (next != null) txt = `Libre · próxima franja a las ${hhmm(next)}`;
    }
    st.textContent = txt;
    st.classList.toggle('on', s.shy && !s.out);
    st.classList.toggle('out', s.out);
    // Main window header: Tapomo hides there too, with a way out.
    const sm = $('mascot-s');
    Mascot.setHiding(sm, s.shy && !s.out);
    $('shy-hdr-note').hidden = !(s.shy && !s.out);
    if (slot) $('shy-hdr-text').textContent = `Horario tranquilo hasta las ${hhmm(slot[1])} 🙈`;
    $('shy-hdr-btn').hidden = s.strict;
    $('shy-mode-note').textContent = MODE_NOTES[s.mode];
  }

  // Template, days, slots, holidays
  $('shy-tpl').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tpl]');
    if (!t) return;
    s.tpl = t.dataset.tpl;
    if (TEMPLATES[s.tpl]) { s.days = new Set(TEMPLATES[s.tpl].days); s.slots = TEMPLATES[s.tpl].slots.map((x) => [...x]); }
    renderSchedule();
    evaluate();
  });
  $('shy-add').addEventListener('click', () => {
    const last = s.slots[s.slots.length - 1];
    const a = last ? Math.min(1200, last[1] + 60) : 540;
    s.slots.push([a, Math.min(1260, a + 60)]);
    s.tpl = 'custom';
    renderSchedule();
    evaluate();
  });
  $('shy-vac').addEventListener('change', () => { s.vac = $('shy-vac').value; evaluate(); });
  $('shy-vac-clear').addEventListener('click', () => { s.vac = ''; $('shy-vac').value = ''; evaluate(); });

  // Hiding style, strict, about you
  $('shy-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    s.mode = b.dataset.mode;
    segOn('shy-mode', 'mode', s.mode);
  segOn('shy-fx', 'fx', s.fx);
  segOn('shy-out', 'out', String(s.outMin));
    if (s.shy && !s.out) { applyHidden(false); setTimeout(() => applyHidden(true), s.mode === 'under' ? 1100 : 60); }
    render();
  });
  $('shy-fx').addEventListener('click', (e) => { const b = e.target.closest('[data-fx]'); if (!b) return; s.fx = b.dataset.fx; segOn('shy-fx', 'fx', s.fx); replay(); });
  $('shy-out').addEventListener('click', (e) => { const b = e.target.closest('[data-out]'); if (b) { s.outMin = Number(b.dataset.out); segOn('shy-out', 'out', String(s.outMin)); } });
  /** Plays the going-under animation again without touching the schedule. */
  function replay() {
    if (s.mode !== 'under') return;
    if (s.shy && !s.out) { under(false); setTimeout(() => under(true), 1100); return; }
    under(true);
    setTimeout(() => { if (!s.shy || s.out) under(false); }, 2600);
  }
  $('shy-replay').addEventListener('click', replay);
  $('shy-strict').addEventListener('change', () => { s.strict = $('shy-strict').checked; render(); });
  $('shy-gender').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { s.gender = b.dataset.g; segOn('shy-gender', 'g', s.gender); } });
  $('shy-talk').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { s.talk = b.dataset.t; segOn('shy-talk', 't', s.talk); } });

  // Simulated clock
  $('shy-day').replaceChildren(...DAYS.map((d, i) => Object.assign(document.createElement('option'), { value: String(i + 1), textContent: d })));
  $('shy-day').addEventListener('change', () => { s.day = Number($('shy-day').value); evaluate('Cambias de día'); });
  $('shy-time').addEventListener('input', () => { s.min = Number($('shy-time').value); evaluate(); });
  $('shy-go-start').addEventListener('click', () => {
    if (onHoliday()) return void log('De vacaciones: no hay franjas');
    if (!s.slots.length) return void log('No hay franjas en el horario');
    if (!s.days.has(s.day)) s.day = [...s.days].sort()[0] || 1;
    const starts = s.slots.map((x) => x[0]).sort((a, b) => a - b);
    s.min = starts.find((a) => a > s.min) ?? starts[0];
    if (slotNow() && s.shy) return void render();
    evaluate();
  });
  $('shy-go-end').addEventListener('click', () => {
    const slot = slotNow();
    if (!slot) return void log('Ahora no hay ninguna franja');
    s.min = slot[1];
    evaluate();
  });
  $('shy-click').addEventListener('click', callOut);
  $('shy-skip').addEventListener('click', () => { if (s.out) backIntoHiding(); else log('No está fuera'); });

  Mascot.mount($('mascot-s'));
  segOn('shy-mode', 'mode', s.mode);
  segOn('shy-gender', 'g', s.gender);
  segOn('shy-talk', 't', s.talk);
  renderSchedule();
  render();
})();
