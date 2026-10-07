// Floating Tapomo. Reacts to events from the Rust side; it never sees which key was
// pressed, only its class (char/space/enter/delete/word_delete), and receives nothing
// at all while a password field has focus.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const SLEEP_AFTER_MS = 3 * 60 * 1000;
const OOPS_MS = 900;
const BAR_MAX = 130;

const $ = (id) => document.getElementById(id);
const pet = $('pet');
const svg = $('mascot');
const body = () => $('mascot-body');

const state = {
  paused: false,
  asleep: false,
  lastKeyAt: Date.now(),
  zone: null,
  streak: { current: 0, best: 0 },
  oopsUntil: 0,
};
let bubbleTimer = null;
let oopsTimer = null;

// ------------------------------------------------------------------ face

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Picks the face from sleep state, the "oops" flash and the streak (current / all-time best). */
function renderFace() {
  pet.classList.toggle('sleeping', state.asleep || state.paused);
  if (state.asleep || state.paused) return Mascot.setFace(svg, { eyes: 'closed', mouth: 'small' });
  if (Date.now() < state.oopsUntil) return Mascot.setFace(svg, { eyes: 'dots', mouth: 'wavy' });
  const { current, best } = state.streak;
  const ratio = best > 0 ? current / best : 0;
  if (ratio < 0.25) Mascot.setFace(svg, { eyes: 'round', mouth: 'smile' });
  else if (ratio < 0.5) Mascot.setFace(svg, { eyes: 'round', mouth: 'big' });
  else if (ratio < 0.75) Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big' });
  else Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'open', cheeks: true });
}

function say(key, ms, big = false) {
  const el = $('bubble');
  clearTimeout(bubbleTimer);
  el.textContent = t(key);
  el.classList.toggle('big', big);
  el.hidden = false;
  // Restart the pop animation so the newest bubble always "arrives".
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  bubbleTimer = setTimeout(() => (el.hidden = true), ms);
}

function squish() {
  const b = body();
  b.classList.remove('squish');
  void b.getBoundingClientRect();
  b.classList.add('squish');
}

function hop() {
  pet.classList.remove('hop');
  void pet.offsetWidth;
  pet.classList.add('hop');
  setTimeout(() => pet.classList.remove('hop'), 700);
}

function starBurst() {
  if (reducedMotion()) return;
  const stage = $('stage');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
    const r = 42 + Math.random() * 14;
    const s = document.createElement('span');
    s.className = 'spark';
    s.textContent = i % 2 ? '★' : '✦';
    s.style.setProperty('--dx', `${Math.cos(a) * r}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * r - 10}px`);
    stage.append(s);
    setTimeout(() => s.remove(), 950);
  }
}

// --------------------------------------------------------------- handlers

function onKey(cls) {
  const wasAsleep = state.asleep;
  state.lastKeyAt = Date.now();
  if (state.asleep) {
    state.asleep = false;
    if (!state.paused) say('pet.hi', 1000);
  }
  if (state.paused) return;
  squish();
  if (cls === 'delete' || cls === 'word_delete') {
    const big = cls === 'word_delete';
    say(big ? 'pet.oops_big' : 'pet.oops', OOPS_MS, big);
    state.oopsUntil = Date.now() + OOPS_MS;
    clearTimeout(oopsTimer);
    oopsTimer = setTimeout(renderFace, OOPS_MS + 20);
  }
  if (wasAsleep || cls) renderFace();
}

function onLive(p) {
  state.streak = p.streak || state.streak;
  state.zone = p.wpm != null && p.zone ? p.zone : null;
  pet.dataset.zone = state.zone || 'idle';
  const bar = $('livebar');
  const show = p.wpm != null && p.percent != null && !state.paused;
  bar.hidden = !show;
  if (show) $('livefill').style.width = `${(Math.max(0, Math.min(BAR_MAX, p.percent)) / BAR_MAX) * 100}%`;
  renderFace();
}

function onRecord() {
  if (state.paused || state.asleep) return;
  hop();
  starBurst();
  say('pet.record', 2200, true);
}

async function loadSettings() {
  const settings = await invoke('get_settings');
  setLanguage(resolveLanguage(settings.language));
  applyI18n();
  $('move-hint').textContent = t('pet.drag');
  $('move-done').title = t('pet.done');
  $('move-done').setAttribute('aria-label', t('pet.done'));
  const wasPaused = state.paused;
  state.paused = settings.paused;
  if (wasPaused && !state.paused) {
    state.asleep = false;
    state.lastKeyAt = Date.now();
  }
  if (state.paused) $('livebar').hidden = true;
  renderFace();
}

function setMoveMode(on) {
  $('move').hidden = !on;
}

// ------------------------------------------------------------------ init

async function init() {
  await loadAll();
  Mascot.mount(svg);
  renderFace();
  $('move-done').addEventListener('click', () => invoke('pet_move_done').catch(console.error));
  await Promise.all([
    listen('tapomo://key', (e) => onKey(e.payload)),
    listen('tapomo://live', (e) => onLive(e.payload)),
    listen('tapomo://record', onRecord),
    listen('tapomo://settings', () => loadSettings().catch(console.error)),
    listen('tapomo://pet-move', (e) => setMoveMode(!!e.payload)),
  ]);
  await loadSettings();
  setInterval(() => {
    if (!state.asleep && !state.paused && Date.now() - state.lastKeyAt > SLEEP_AFTER_MS) {
      state.asleep = true;
      $('livebar').hidden = true;
      renderFace();
    }
  }, 5000);
}

init().catch(console.error);
