// Lab only: shared helpers for the open studies (repaso.js, gafas.js, avisos.js, actualiza.js).
// Each study is a fieldset in the right panel, built like «Premios» / «Modo vergonzoso» (fieldset.prop,
// legend + .pend badge, .rw grid, .seg/.seg-z controls), placed at the top of the panel under
// «Pendiente de decidir». The preview plays on the lab's main stage, with the real mascot (#mascot) and
// whatever it wears in «Premios». Studies that need a desktop (Avisos, Actualización) take the stage
// over with a mock while active (E.takeStage), and give it back when another study plays or on
// «Volver al escenario». Anchors: each fieldset has the study's id (#repaso, #gafas-racha, …).
(() => {
  const R = window.TapomoRewards;
  const panel = document.getElementById('panel');
  const box = document.getElementById('stage-box');
  if (typeof Mascot === 'undefined' || !R || !panel || !box) return;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ dom helpers
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function btn(text, cls = '') {
    const b = el('button', cls, text);
    b.type = 'button';
    return b;
  }
  /** Segmented control in the lab's style (.seg + .seg-z.on), as levelup.js builds it. */
  function seg(label, values, get, set) {
    const s = el('div', 'seg');
    s.setAttribute('role', 'group');
    s.setAttribute('aria-label', label);
    s.append(el('span', 'seg-l', label));
    const bs = values.map(([v, text]) => {
      const b = btn(text, 'seg-z');
      b.addEventListener('click', () => { set(v); sync(); });
      s.append(b);
      return [v, b];
    });
    const sync = () => bs.forEach(([v, b]) => { const on = get() === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    sync();
    return { box: s, sync };
  }
  const list = (items) => { const ul = el('ul', 'rules-ex'); items.forEach((t) => ul.append(el('li', '', t))); return ul; };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--speed')) || 1;
  const dur = (ms) => ms / speed();
  const later = (ms, fn) => setTimeout(fn, dur(ms));

  // ------------------------------------------------------------------ mascots
  const mascot = $('mascot'); // the lab's real Tapomo (pet.js drives it)
  const current = () => ({ skin: R.state.skin, acc: [...R.state.acc] });
  let src = null;
  let uid = 0;
  const uidOf = (svg) => (svg.__uid ||= ++uid);
  /**
   * A live copy of Tapomo wearing `look` (for the desktop mocks and thumbnails). Its ids are made
   * unique: with copies sharing ids, a gradient found first in a hidden copy paints nothing (that is
   * what left the «de sol de chulito» lenses empty in v30).
   */
  function tapomo(look = current(), face = {}) {
    const keep = current();
    R.set(look.skin, look.acc);
    if (!src) {
      src = document.createElementNS(NS, 'svg');
      src.setAttribute('viewBox', '0 0 160 160');
      Mascot.mount(src);
    }
    const c = src.cloneNode(true);
    R.set(keep.skin, keep.acc);
    const n = uidOf(c);
    const map = {};
    c.querySelectorAll('[id]').forEach((x) => { map[x.id] = `${x.id}-c${n}`; x.id = map[x.id]; });
    const fix = (v) => v.replace(/#([\w-]+)/g, (m, id) => (map[id] ? `#${map[id]}` : m));
    c.querySelectorAll('*').forEach((x) => {
      for (const a of ['fill', 'stroke', 'clip-path', 'mask', 'filter', 'href']) { const v = x.getAttribute(a); if (v && v.includes('#')) x.setAttribute(a, fix(v)); }
    });
    c.removeAttribute('id');
    c.classList.add('st-mascot');
    c.setAttribute('aria-hidden', 'true');
    c.__anim = {};
    Mascot.setFace(c, face);
    blinkLoop(c);
    return c;
  }
  function blinkLoop(svg) {
    let seen = false;
    const next = () => {
      svg.__blink = later(2500 + Math.random() * 3500, () => {
        if (svg.isConnected) seen = true;
        else if (seen) return;
        Mascot.blink(svg);
        next();
      });
    };
    next();
  }
  /** Adds a drawing on Tapomo, inside .mascot-body (so it hops, bobs and squishes with it). */
  function overlay(svg, html, cls, where = 'front') {
    const body = svg.querySelector('.mascot-body');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `st-ov ${cls || ''}`);
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = html.replaceAll('__BODY__', bodyFill(svg)).replaceAll('__N__', String(uidOf(svg)));
    if (where === 'back') body.insertBefore(g, body.firstChild);
    else body.append(g);
    return g;
  }
  /** Adds <defs> content (gradients, clips) with per-mascot ids (__N__). */
  function defs(svg, html) {
    const d = svg.querySelector('defs');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'st-defs');
    g.innerHTML = html.replaceAll('__N__', String(uidOf(svg)));
    d.append(...g.childNodes);
  }
  /** Removes every study drawing from a mascot (overlays and their defs). */
  function clearOverlays(svg) {
    svg.querySelectorAll('.st-ov, [id^="gs-"]').forEach((n) => n.remove());
  }
  const bodyFill = (svg) => (svg.querySelector('.rw-skin-base') || svg.querySelector('.mascot-body rect')).getAttribute('fill') || '#ff9e7a';

  /** A speech bubble in the pet's style (pet.css .bubble) inside `host` (a 210 px pet box). */
  function bubble(host, text, ms = 2600) {
    let b = host.querySelector(':scope > .st-bubble');
    if (!b) { b = el('div', 'bubble st-bubble'); b.setAttribute('role', 'status'); host.append(b); }
    clearTimeout(b.__t);
    b.hidden = false;
    b.onclick = null;
    b.classList.remove('up-hi');
    b.textContent = text;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    if (ms) b.__t = later(ms, () => { b.hidden = true; });
    return b;
  }
  const hush = (host) => { const b = host.querySelector(':scope > .st-bubble'); if (b) b.hidden = true; };

  // ------------------------------------------------------------------ glasses (wardrobe shortcut)
  // Tries the study with each glasses item: changes the lab's wardrobe (the «Premios» chips follow).
  const EYES = ['gafas', 'gafassol', 'parche', 'superheroe'];
  const eyesNow = () => (R.state.acc.has('gafassol') ? 'gafassol' : R.state.acc.has('gafas') ? 'gafas' : 'none');
  const glassSubs = [];
  function glassesSeg(onChange) {
    const s = seg('Gafas', [['gafassol', 'de sol de chulito'], ['gafas', 'redondas'], ['none', 'sin gafas']], eyesNow, (v) => {
      const acc = [...R.state.acc].filter((k) => !EYES.includes(k));
      if (v !== 'none') acc.push(v);
      R.set(R.state.skin, acc);
      glassSubs.forEach((f) => f());
      if (onChange) onChange(v);
    });
    glassSubs.push(s.sync);
    return s.box;
  }
  // Wardrobe changes made in «Premios» also update these controls.
  panel.addEventListener('click', () => setTimeout(() => glassSubs.forEach((f) => f()), 0));

  // ------------------------------------------------------------------ talk mode (shared)
  const talk = { v: 'normal', subs: [] };
  function talkSeg() {
    const s = seg('Habla', [['silencioso', 'silencioso'], ['normal', 'normal'], ['parlanchin', 'parlanchín']], () => talk.v, (v) => {
      talk.v = v;
      talk.subs.forEach((f) => f(v));
    });
    talk.subs.push(() => s.sync());
    return s.box;
  }

  // ------------------------------------------------------------------ the stage
  // Desktop mocks are drawn at 450 × 450 and scaled to the stage box, like the pet's .scaler.
  const MOCK = 450;
  let owner = null; // { id, el, release }
  let active = null; // id of the study that last played
  const fit = () => { if (owner) owner.el.style.transform = `scale(${box.clientWidth / MOCK})`; };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(box); else window.addEventListener('resize', fit);
  /** A study shows `node` in place of the pet while it is active. */
  function takeStage(id, node, release) {
    if (owner && owner.el === node) return;
    releaseStage();
    owner = { id, el: node, release };
    node.classList.add('st-mock');
    box.classList.add('st-taken');
    box.append(node);
    fit();
    syncBack();
  }
  function releaseStage() {
    if (!owner) return;
    const o = owner;
    owner = null;
    o.el.remove();
    box.classList.remove('st-taken');
    if (o.release) o.release();
    syncBack();
  }
  /** Called by a study when it plays: the other studies stop (and give the stage back). */
  function play(id) {
    if (active && active !== id) studies[active]?.stop?.();
    active = id;
    if (owner && owner.id !== id) releaseStage();
  }
  const backs = [];
  function backBtn() {
    const b = btn('Volver al escenario', 'ghost');
    b.addEventListener('click', releaseStage);
    backs.push(b);
    syncBack();
    return b;
  }
  function syncBack() { backs.forEach((b) => { b.disabled = !owner; }); }

  // ------------------------------------------------------------------ fieldsets
  // «Pendiente de decidir»: a small heading at the top of the panel, then one fieldset per study.
  const slot = $('st-links-slot');
  const wrap = el('div', 'st-pending');
  wrap.id = 'pendiente';
  const head = el('p', 'rw-sub', 'Pendiente de decidir');
  const none = el('p', 'note', 'Nada pendiente por ahora: todos los estudios están decididos (abajo, en «Ya decidido»).');
  wrap.append(head, none);
  if (slot) slot.replaceWith(wrap); else panel.prepend(wrap);
  const studies = {};
  /** Registers a study: returns { fs, body } (body = the .rw grid of its fieldset). */
  function add(id, title, extra = {}) {
    const fs = el('fieldset', 'prop');
    fs.id = id;
    const lg = el('legend', '', `${title} `);
    lg.append(el('span', 'pend', 'Pendiente de decidir'));
    const body = el('div', 'rw');
    fs.append(lg, body);
    none.remove();
    wrap.append(fs);
    studies[id] = { fs, ...extra };
    return { fs, body, set: (k, v) => { studies[id][k] = v; } };
  }
  /** Registers a decided study in «Ya decidido»: only the chosen option, with what was decided and when. */
  function addDecided(id, title, date, caption) {
    const fs = el('fieldset', 'done');
    fs.id = id;
    const lg = el('legend', '', `${title} `);
    lg.append(el('span', 'ok', `Decidido ${date}`));
    const body = el('div', 'rw');
    body.append(el('p', 'decided-cap', caption));
    fs.append(lg, body);
    ($('ya-decidido-body') || panel).append(fs);
    studies[id] = { fs };
    return { fs, body, set: (k, v) => { studies[id][k] = v; } };
  }
  /** The corner of a Windows screen: a notepad, the taskbar and the desktop pet's 210 px window. */
  function desktop() {
    const s = el('div', 'av-screen');
    const app = el('div', 'av-app');
    app.setAttribute('aria-hidden', 'true');
    const bar = el('div', 'av-app-bar');
    bar.append(el('i'), el('span', '', 'carta.txt — Bloc de notas'));
    const txt = el('div', 'av-app-body');
    txt.append(el('p', '', 'Querida Marta: te escribo para contarte que por fin he aprendido a escribir sin mirar el teclado'), el('p', 'av-caret', 'y ahora voy el doble de rápido'));
    app.append(bar, txt);
    const pet = el('div', 'av-win av-pet');
    const core = el('div', 'av-core');
    const stage = el('div', 'av-stage');
    core.append(stage);
    pet.append(core);
    const task = el('div', 'av-taskbar');
    task.setAttribute('aria-hidden', 'true');
    const apps = el('div', 'av-tb-apps');
    for (let i = 0; i < 4; i++) apps.append(el('i'));
    const tray = el('div', 'av-tray');
    tray.append(el('span', 'av-tray-ic'), el('span', '', 'ESP'), el('span', 'av-clock', '17:42'));
    task.append(apps, tray);
    s.append(app, pet, task);
    return { s, pet, core, stage };
  }
  // A deep link opens «Ya decidido» if the study is in there, and a desktop mock shows on the stage.
  function fromHash() {
    const s = studies[location.hash.slice(1)];
    if (!s) return;
    const fold = s.fs.closest('details');
    if (fold && !fold.open) { fold.open = true; s.fs.scrollIntoView(); }
    if (s.onAnchor) s.onAnchor();
  }
  window.addEventListener('hashchange', fromHash);
  setTimeout(fromHash, 0);

  window.Estudios = { el, btn, seg, list, calm, dur, later, mascot, tapomo, overlay, defs, clearOverlays, bodyFill, bubble, hush, current, talk, talkSeg, glassesSeg, eyesNow, add, addDecided, desktop, takeStage, releaseStage, play, backBtn, NS, R, MOCK };
})();
