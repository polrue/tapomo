// Animation lab driver. Loaded between i18n.js and pet.js: it installs a mocked
// window.__TAURI__ (so the real pet.js runs unchanged) and builds the control panel.
(() => {
  const handlers = {};
  const emit = (name, payload) => (handlers[name] || []).forEach((cb) => cb({ event: name, payload }));
  const settings = { pause_ms: 2000, language: 'es', autostart: false, ignore_fullscreen: true, paused: false, show_pet: true };

  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        if (cmd === 'get_settings') return { ...settings };
        if (cmd === 'get_pet_state') return petPayload();
        if (cmd === 'pet_cancel_snooze') setHide('visible');
        if (cmd === 'get_pet_tip') return nextSampleTip(args && args.lang);
        if (cmd === 'pet_hint') return hintOn;
        if (cmd === 'pet_open_main') logMouse('double-click: the main window would open');
        if (cmd === 'pet_menu') showMenuMock();
        return null;
      },
    },
    event: {
      listen: async (name, cb) => {
        (handlers[name] ||= []).push(cb);
        return () => {};
      },
    },
  };

  // Opened from disk, fetch('locales/..') is blocked: fall back to the few strings the pet uses.
  const fallback = {
    es: { 'pet.record': '¡Nuevo récord!', 'pet.oops': '¡ups!', 'pet.oops_big': '¡uuups!', 'pet.hi': '¡hola!', 'pet.here': '¡aquí estoy!', 'pet.hide.setting': 'Estoy escondido 🙈', 'pet.hide.setting.btn': '¡Sal!', 'pet.hide.hour': 'Vuelvo en {m} min', 'pet.hide.hour.btn': '¡Sal ya!', 'pet.hide.fullscreen': 'Me he escondido mientras ves algo a pantalla completa' },
    en: { 'pet.record': 'New record!', 'pet.oops': 'oops!', 'pet.oops_big': 'ooooops!', 'pet.hi': 'hi!', 'pet.here': 'here I am!', 'pet.hide.setting': "I'm hiding 🙈", 'pet.hide.setting.btn': 'Come out!', 'pet.hide.hour': 'Back in {m} min', 'pet.hide.hour.btn': 'Come out now!', 'pet.hide.fullscreen': "I'm hiding while you watch something fullscreen" },
  };
  const realLoadAll = loadAll; // eslint-disable-line no-undef
  loadAll = async () => { // eslint-disable-line no-global-assign, no-undef
    if (location.protocol !== 'file:') await realLoadAll();
    for (const code of Object.keys(fallback)) if (!dictionaries[code] || !dictionaries[code]['pet.oops']) dictionaries[code] = { ...(dictionaries[code] || {}), ...fallback[code] }; // eslint-disable-line no-undef
  };

  // ---------------------------------------------- tips and mouse (mocks of the Rust side)
  const SAMPLE_TIPS = [
    ['tip.hello_empty', {}], ['tip.streak_today', { n: '48' }], ['tip.faster_than_usual', { p: '12' }],
    ['tip.low_corrections', { p: '0,8' }], ['tip.near_record', { w: '86', d: '7', u: 'ppm' }],
    ['tip.record_today', { w: '94', u: 'ppm' }], ['tip.best_hour', { h: '10' }],
    ['tip.volume_today', { n: '5.400', pages: '3' }], ['tip.top_app', { app: 'WINWORD' }],
    ['tip.calibrating', { have: '7', need: '20' }], ['tip.generic_1', {}], ['tip.generic_2', {}], ['tip.generic_3', {}],
  ];
  let tipIndex = 0;
  let hintOn = false;
  function nextSampleTip(lang) {
    const [key, vars] = SAMPLE_TIPS[tipIndex++ % SAMPLE_TIPS.length];
    const u = lang === 'en' ? 'WPM' : 'ppm';
    return { key, vars: { ...vars, ...(vars.u ? { u } : {}) } };
  }
  const logMouse = (msg) => { const el = document.getElementById('mouse-log'); if (el) el.textContent = msg; };
  function showMenuMock() {
    const ul = document.getElementById('menu-mock');
    const es = settings.language === 'es';
    const items = es
      ? ['Abrir Tapomo', 'Dime algo', 'Esconderte 1 hora', 'Ocultar a Tapomo', '☐ Pausar medición']
      : ['Open Tapomo', 'Say something', 'Hide for 1 hour', 'Hide Tapomo', '☐ Pause measuring'];
    ul.replaceChildren(...items.map((x, i) => Object.assign(document.createElement('li'), { textContent: x, onclick: () => { ul.hidden = true; if (i === 1) emit('tapomo://pet-say'); else logMouse('menu: ' + x); } })));
    ul.hidden = false;
  }

  // ------------------------------------------------------------ live state
  const REF = 100;
  const BEST = 40;
  const model = { wpm: null, calibrating: null, streak: 0 };
  const zoneOf = (p) => (p > 100 ? 'beating' : p >= 85 ? 'fire' : p >= 60 ? 'good' : 'warming');
  function pushLive() {
    const wpm = model.wpm;
    const percent = wpm != null && !model.calibrating ? (wpm / REF) * 100 : null;
    emit('tapomo://live', {
      wpm,
      reference: model.calibrating ? null : REF,
      percent,
      zone: percent != null ? zoneOf(percent) : null,
      record_percent: model.calibrating ? null : 140,
      calibrating: model.calibrating,
      streak: { current: Math.round(BEST * model.streak), best: BEST },
    });
  }

  // ------------------------------------------------------------ controls
  const $ = (id) => document.getElementById(id);
  let lastReaction = null;
  let loopTimer = null;
  const speed = () => parseFloat(document.documentElement.style.getPropertyValue('--speed')) || 1;

  /** Adds a button; `remember` makes it the reaction the loop toggle repeats. */
  function button(group, label, fn, remember = true) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      fn();
      if (remember) { lastReaction = fn; restartLoop(); }
      group.querySelectorAll('button.on').forEach((x) => x.classList.remove('on'));
    });
    group.append(b);
    return b;
  }
  function restartLoop() {
    clearInterval(loopTimer);
    if ($('loop').checked && lastReaction) loopTimer = setInterval(lastReaction, 1700 / speed());
  }

  const key = (cls) => () => emit('tapomo://key', cls);
  const keys = $('g-keys');
  button(keys, 'Type key', key('char'));
  button(keys, 'Space', key('space'));
  button(keys, 'Enter', key('enter'));
  button(keys, 'Backspace', key('delete'));
  button(keys, 'Word delete', key('word_delete'));

  // Typing at a chosen WPM: keys at jittered intervals (with the odd longer thinking pause), and a
  // `live` payload every 250 ms like the Rust tracker. "Stop" sends the final null live event.
  let typeTimer = null;
  let liveTimer = null;
  const wpmOut = () => ($('wpm-out').textContent = `${$('wpm').value} ${settings.language === 'es' ? 'ppm' : 'WPM'}`);
  $('wpm').addEventListener('input', () => { wpmOut(); if (typeTimer) startTyping(); });
  wpmOut();
  function stopTyping(sendNull = true) {
    clearTimeout(typeTimer);
    clearInterval(liveTimer);
    typeTimer = liveTimer = null;
    if (sendNull) { model.wpm = null; pushLive(); }
  }
  function startTyping() {
    stopTyping(false);
    const wpm = parseFloat($('wpm').value);
    const mean = 1000 / ((wpm * 5) / 60); // ms between keys
    model.calibrating = null;
    const tick = () => {
      emit('tapomo://key', Math.random() < 0.06 ? 'delete' : 'char');
      const think = Math.random() < 0.05 ? 3 : 1;
      typeTimer = setTimeout(tick, mean * (0.55 + Math.random() * 0.9) * think);
    };
    tick();
    const live = () => { model.wpm = wpm * (0.93 + Math.random() * 0.14); pushLive(); };
    live();
    liveTimer = setInterval(live, 250);
  }
  $('burst').addEventListener('click', startTyping);
  $('stopburst').addEventListener('click', () => stopTyping(true));

  const streak = $('g-streak');
  for (const [label, v] of [['0 %', 0], ['25 %', 0.3], ['50 %', 0.55], ['75 %', 0.8], ['100 %', 1]]) button(streak, label, () => { model.streak = v; pushLive(); }, false);

  const zones = $('g-zone');
  button(zones, 'Idle', () => { model.wpm = null; model.calibrating = null; pushLive(); }, false);
  button(zones, 'Warming up', () => { model.wpm = 40; model.calibrating = null; pushLive(); }, false);
  button(zones, 'Good', () => { model.wpm = 72; model.calibrating = null; pushLive(); }, false);
  button(zones, 'On fire', () => { model.wpm = 92; model.calibrating = null; pushLive(); }, false);
  button(zones, 'Beating yourself', () => { model.wpm = 125; model.calibrating = null; pushLive(); }, false);
  button(zones, 'Calibrating (7/20)', () => { model.wpm = 48; model.calibrating = { have: 7, need: 20 }; pushLive(); }, false);

  const react = $('g-react');
  const mouse = $('g-mouse');
  button(mouse, 'Click Tapomo (next tip)', () => window.TapomoPet.click());
  button(mouse, 'Double-click', () => logMouse('double-click: the main window would open'), false);
  button(mouse, 'Right-click (menu)', showMenuMock, false);
  button(mouse, 'Hover hint (first 3 times)', () => { hintOn = true; emit('tapomo://pet-hover', false); emit('tapomo://pet-hover', true); setTimeout(() => (hintOn = false), 100); }, false);
  button(react, 'New record', () => emit('tapomo://record'));
  button(react, 'Sleep', () => window.TapomoPet.sleep(), false);
  button(react, 'Wake', key('char'));
  button(react, 'Sunglasses on', () => { model.wpm = 125; model.calibrating = null; pushLive(); }, false);
  button(react, 'Sunglasses off', () => { model.wpm = 72; model.calibrating = null; pushLive(); }, false);
  button(react, 'Hover on', () => emit('tapomo://pet-hover', true), false);
  button(react, 'Hover off', () => emit('tapomo://pet-hover', false), false);
  button(react, 'Blink', () => Mascot.blink($('mascot')));
  button(react, 'Squish', () => Mascot.squish($('mascot')));

  // ------------------------------------------- header: Tapomo hiding (mock of get_pet_state)
  // Same states as the main window: visible | setting | hour | fullscreen.
  let hideMode = 'visible';
  const hideUntil = () => Date.now() + 47 * 60000;
  function petPayload() {
    return { visible: hideMode === 'visible', reason: hideMode === 'visible' ? null : hideMode, until_ms: hideMode === 'hour' ? hideUntil() : null };
  }
  function renderHeader() {
    const hidden = hideMode !== 'visible';
    Mascot.setHiding($('mascot-h'), hidden);
    $('stage-box').classList.toggle('away', hidden);
    $('hdr-note').hidden = !hidden;
    if (!hidden) return;
    $('hdr-text').textContent = t(`pet.hide.${hideMode}`, { m: 47 });
    const hasBtn = hideMode !== 'fullscreen';
    $('hdr-btn').hidden = !hasBtn;
    if (hasBtn) $('hdr-btn').textContent = t(`pet.hide.${hideMode}.btn`);
  }
  function setHide(mode) {
    hideMode = mode;
    renderHeader();
    emit('tapomo://pet-state', petPayload());
    const log = $('hide-log');
    if (log) log.textContent = `pet-state: ${JSON.stringify(petPayload())}`;
  }
  Mascot.mount($('mascot-h'));
  const hide = $('g-hide');
  const cycle = ['setting', 'hour', 'fullscreen', 'visible'];
  button(hide, 'Header: hiding (cycle)', () => setHide(cycle[(cycle.indexOf(hideMode) + 1) % cycle.length]), false);
  for (const [label, mode] of [['Hidden by setting', 'setting'], ['Hidden for 1 hour', 'hour'], ['Fullscreen app', 'fullscreen'], ['Visible (come out)', 'visible']]) button(hide, label, () => setHide(mode), false);
  $('hdr-btn').addEventListener('click', () => setHide('visible')); // "Come out!" / "Come out now!"
  (handlers['tapomo://settings'] ||= []).push(() => setTimeout(renderHeader, 0));
  renderHeader();

  // ------------------------------------------------------------ globals
  $('speed').addEventListener('input', () => {
    const v = parseFloat($('speed').value);
    document.documentElement.style.setProperty('--speed', String(v));
    $('speed-out').textContent = `${v.toFixed(2)}×`;
    restartLoop();
  });
  $('loop').addEventListener('change', restartLoop);
  $('bg-dark').addEventListener('change', () => $('stage-box').classList.toggle('dark', $('bg-dark').checked));
  $('lang').addEventListener('change', () => { settings.language = $('lang').value; emit('tapomo://settings'); wpmOut(); });

  // Eyes follow the mouse; being over the body is "hover" (the Rust side does this in the app).
  let hovering = false;
  document.addEventListener('pointermove', (e) => {
    const svg = $('mascot');
    Mascot.lookAtPoint(svg, e.clientX, e.clientY);
    const r = $('stage').getBoundingClientRect();
    const s = r.width / 160;
    const inside = e.clientX >= r.left + 30 * s && e.clientX <= r.left + 130 * s && e.clientY >= r.top + 40 * s && e.clientY <= r.top + 138 * s;
    if (inside !== hovering) { hovering = inside; emit('tapomo://pet-hover', inside); }
  });
})();
