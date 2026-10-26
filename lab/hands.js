// Lab only: review of «Manos en las lecciones» (setting lessons.hands_tip: «Mostrar u ocultar las manos bajo el teclado»).
// Uses the app's own keyboard.js/keyboard.css (copied unchanged): the hands are drawn by Keyboard.render and lit by
// kb.highlight(char), exactly as ui/lessons.js does for the next character of a lesson. This file only drives it.
(() => {
  const panel = document.getElementById('panel');
  if (!panel || typeof Keyboard === 'undefined') return;

  const DRILLS = [
    { id: 'mix', name: 'Toda la mano', text: '¿Vienes mañana? Cómprate 3 zumos, ¡ya!' },
    { id: 'home', name: 'Fila base', text: 'asdf jklñ asdf jklñ' },
    { id: 'word', name: 'Una palabra', text: 'mañana' },
    { id: 'sent', name: 'Frase con mayúscula y coma', text: 'Hola, Tapomo.' },
    { id: 'acc', name: 'Acentos y símbolos', text: 'Qué día más bonito, ¿no?' },
  ];
  const LAYOUTS = [['es', 'Español (ES)'], ['us', 'Inglés (US)'], ['fr', 'Francés'], ['de', 'Alemán']];
  const SPEEDS = [['lenta', 900], ['normal', 500], ['rápida', 220]];

  // Strings the app takes from es.json (keyboard.aria, finger.*), copied here so the lab needs no locale edit.
  const KB_STR = { 'keyboard.aria': 'Teclado', 'finger.0': 'Meñique izquierdo', 'finger.1': 'Anular izquierdo', 'finger.2': 'Corazón izquierdo', 'finger.3': 'Índice izquierdo', 'finger.thumbs': 'Pulgares', 'finger.6': 'Índice derecho', 'finger.7': 'Corazón derecho', 'finger.8': 'Anular derecho', 'finger.9': 'Meñique derecho' };

  const st = { drill: 0, layout: 'es', speed: 1, text: DRILLS[0].text, pos: 0, playing: false, timer: 0, own: false, style: 'ilu', op: 0.3 };
  let kb = null;
  let sil = null; // hands2.js proposal (silhouette over the keyboard), if loaded
  let ilu = null; // hands3.js proposal (drawn hands + ghost finger), if loaded
  const $ = {};

  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    n.append(...kids);
    return n;
  };
  const seg = (label, items, get, set) => {
    const wrap = h('div', { class: 'seg' }, h('span', { class: 'seg-l' }, label));
    const btns = items.map(([val, text]) => {
      const b = h('button', { type: 'button', class: 'seg-z', onclick: () => { set(val); paint(); } }, text);
      b._val = val;
      wrap.append(b);
      return b;
    });
    wrap._paint = () => btns.forEach((b) => b.classList.toggle('on', b._val === get()));
    return wrap;
  };

  // ---- text line
  function buildText() {
    $.text.textContent = '';
    for (const ch of st.text) $.text.append(h('span', { class: 'hn-ch' }, ch === ' ' ? ' ' : ch));
  }
  function paint() {
    const spans = $.text.children;
    for (let i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('done', i < st.pos);
      spans[i].classList.toggle('cur', i === st.pos);
    }
    // Same call as the lesson runner: the next character, or nothing at the end.
    const next = [...st.text][st.pos];
    if (next !== undefined) kb.highlight(next); else kb.clear();
    $.pos.textContent = `${Math.min(st.pos, [...st.text].length)}/${[...st.text].length}`;
    $.play.textContent = st.playing ? '⏸ Pausa' : '▶ Reproducir';
    $.play.classList.toggle('on', st.playing);
    $.hands.classList.toggle('on', Keyboard.handsOn());
    $.hands.setAttribute('aria-pressed', String(Keyboard.handsOn()));
    $.hands.textContent = Keyboard.handsOn() ? 'Manos: sí' : 'Manos: no';
    for (const s of root.querySelectorAll('.seg')) if (s._paint) s._paint();
  }

  // ---- driving
  const len = () => [...st.text].length;
  function stop() { st.playing = false; clearTimeout(st.timer); }
  function tick() {
    if (!st.playing) return;
    st.timer = setTimeout(() => {
      if (!st.playing) return;
      if (st.pos >= len()) { st.pos = 0; paint(); tick(); return; } // loop
      press(true);
      tick();
    }, st.pos >= len() ? 1000 : SPEEDS[st.speed][1]);
  }
  /** One correct keystroke: green flash like a right letter in a lesson, then light the next. */
  function press(ok, ch) {
    const want = [...st.text][st.pos];
    if (want === undefined) return;
    const strokes = Keyboard.strokesFor(st.layout, want);
    if (strokes[0]) kb.flash(strokes[0].code, ok);
    if (ok) st.pos++;
    paint();
  }
  function play() { if (st.playing) stop(); else { st.playing = true; if (st.pos >= len()) st.pos = 0; paint(); tick(); } paint(); }
  function reset() { st.pos = 0; paint(); }
  function setText(text) { st.text = text; st.pos = 0; buildText(); paint(); }

  // ---- own keyboard: typing into the field plays the same highlight/flash as a lesson
  function onOwnKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); st.pos = Math.max(0, st.pos - 1); paint(); return; }
    if (e.key.length !== 1 && !e.isComposing) return;
    if (e.key === 'Dead') return;
    e.preventDefault();
    stop();
    const want = [...st.text][st.pos];
    if (want === undefined) { st.pos = 0; paint(); return; }
    const ok = e.key === want;
    const strokes = Keyboard.strokesFor(st.layout, want);
    if (strokes[0]) kb.flash(strokes[0].code, ok);
    if (ok) st.pos++;
    paint();
  }

  // ---- build the fieldset
  const root = h('fieldset', { id: 'hn' }, h('legend', {}, 'Manos en las lecciones'));
  const box = h('div', { class: 'hn' });
  root.append(box);

  box.append(h('p', { class: 'note' }, 'Así se ven las manos bajo el teclado en las lecciones (ajuste «Mostrar u ocultar las manos bajo el teclado»). El dedo naranja es el que toca ahora; si la tecla siguiente lleva Mayús o AltGr, también se enciende ese dedo (con borde discontinuo el de la tecla después). Es el teclado de la app, sin cambios.'));

  box.append(seg('Ejercicio', DRILLS.map((d, i) => [i, d.name]), () => st.drill, (v) => { st.drill = v; $.own.value = ''; setText(DRILLS[v].text); }));
  box.append(seg('Teclado', LAYOUTS, () => st.layout, (v) => { st.layout = v; kb.setLayout(v); }));
  box.append(seg('Velocidad', SPEEDS.map(([n], i) => [i, n]), () => st.speed, (v) => { st.speed = v; }));
  if (typeof Hands2 !== 'undefined') {
    const styleSeg = seg('Estilo de manos', [['cur', 'Actuales'], ['ilu', 'Ilustradas (propuesta)'], ['sil', 'Silueta (aparcada)']], () => st.style, (v) => {
      st.style = v;
      if (sil) sil.setEnabled(v === 'sil');
      if (ilu) ilu.setEnabled(v === 'ilu');
      $.opRow.hidden = v === 'cur';
    });
    styleSeg.append(h('span', { class: 'pend' }, 'Propuesta, pendiente de Pol'));
    box.append(styleSeg);
    $.opOut = h('output', {}, `${Math.round(st.op * 100)} %`);
    $.op = h('input', { type: 'range', min: '0.08', max: '0.5', step: '0.01', value: String(st.op), 'aria-label': 'Opacidad de la silueta' });
    $.op.addEventListener('input', () => { st.op = Number($.op.value); $.opOut.textContent = `${Math.round(st.op * 100)} %`; if (sil) sil.setOpacity(st.op); if (ilu) ilu.setOpacity(st.op); });
    $.opRow = h('div', { class: 'hn-row' }, h('label', {}, 'Opacidad de la silueta ', $.op), $.opOut);
    box.append($.opRow);
    box.append(h('p', { class: 'note' }, 'Ilustradas (como typing.com): un dibujo de las dos manos, translúcido y quieto, con los dedos en la fila base. Para cada tecla sale un «dedo fantasma» naranja desde el nudillo hasta la tecla; en las teclas de la fila base solo se ilumina la yema, y en el espacio los dos pulgares. Silueta: el intento anterior con manos que se mueven, aparcado.'));
  }

  $.text = h('div', { class: 'hn-text', 'aria-live': 'off' });
  $.pos = h('output', {}, '0/0');
  $.play = h('button', { type: 'button', onclick: play }, '▶ Reproducir');
  $.hands = h('button', { type: 'button', class: 'seg-z', 'aria-pressed': 'true', title: 'Mostrar u ocultar las manos bajo el teclado', onclick: () => { Keyboard.setHands(!Keyboard.handsOn()); paint(); } }, 'Manos');
  box.append(h('div', { class: 'btns' },
    $.play,
    h('button', { type: 'button', onclick: () => { stop(); if (st.pos >= len()) st.pos = 0; else press(true); paint(); } }, '⏭ Paso'),
    h('button', { type: 'button', onclick: () => { stop(); reset(); } }, '↺ Reiniciar'),
    $.hands, $.pos));
  box.append($.text);

  $.stage = h('div', { class: 'hn-stage' });
  box.append($.stage);

  $.own = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Escribe aquí con tu teclado…', 'aria-label': 'Escribe el ejercicio con tu teclado' });
  $.own.addEventListener('keydown', onOwnKey);
  $.own.addEventListener('input', () => { $.own.value = ''; });
  $.own.addEventListener('focus', () => { stop(); paint(); });
  box.append(h('div', { class: 'hn-row' }, h('label', {}, 'Tu turno: ', $.own)));
  box.append(h('p', { class: 'note' }, 'Con el cursor en el campo, escribe el ejercicio: acierto = destello verde en la tecla; fallo = rojo y no avanza. Retroceso vuelve atrás. Las tildes se escriben con la tecla muerta en teclados que la tienen.'));

  const anchor = [...panel.querySelectorAll('fieldset')].find((f) => /Modo vergonzoso/.test((f.querySelector('legend') || {}).textContent || ''));
  if (anchor) anchor.after(root); else panel.append(root);

  kb = Keyboard.render($.stage, st.layout, { t: (k) => KB_STR[k] || k, legend: true });
  if (typeof Hands2 !== 'undefined') sil = Hands2.attach(kb, { opacity: st.op, enabled: st.style === 'sil' });
  if (typeof Hands3 !== 'undefined') ilu = Hands3.attach(kb, { opacity: st.op, enabled: st.style === 'ilu' });
  window.__labKb = kb; // lab screenshots drive it directly
  buildText();
  paint();
})();
