// Floating Tapomo. Reacts to events from the Rust side; it never sees which key was
// pressed, only its class (char/space/enter/delete/word_delete), and receives nothing
// at all while a password field has focus.
//
// The window is click-through except over Tapomo's body (Rust compares the cursor with the
// rectangle reported by `reportHit`). Dragging is manual: this page only says "grab / move /
// release"; Rust reads the cursor and moves the window, so no window API is exposed here.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const SLEEP_AFTER_MS = 3 * 60 * 1000;
const OOPS_MS = 900;
const BAR_MAX = 130;
const TIP_MS = 4500;
const CLICK_MS = 350; // a press shorter than this that barely moves is a click
const CLICK_PX = 4;
const DBLCLICK_MS = 250; // a second click within this opens the main window instead of showing a tip
const HINT_MS = 3500;
const RECORD_JUMP_MS = 900; // length of the new-record jump; the crown appears right after it
// When typing stops the bar eases down to 0 (exponential, tau 2.5 s, ~8 s in all), and the
// zone, colour, face and effects follow the falling value.
const DECAY_TAU = 2.5;
const BLEND_TAU = 0.15;

const $ = (id) => document.getElementById(id);
const pet = $('pet');
const svg = $('mascot');

const state = {
  paused: false,
  asleep: false,
  lastKeyAt: Date.now(),
  zone: null,
  streak: { current: 0, best: 0 },
  oopsUntil: 0,
  crownHoldUntil: 0, // the crown waits for the new-record jump to finish
  // Live value shown (percent of the personal reference) and how it moves.
  display: 0,
  target: 0,
  mode: 'idle', // idle | live | decay
  decayFrom: 0,
  calibrating: null,
};
let bubbleTimer = null;
let oopsTimer = null;

// ------------------------------------------------------------------ face

/** Picks the face from sleep state, the "oops" flash and the streak (current / all-time best). */
function renderFace() {
  const sleeping = state.asleep || state.paused;
  Mascot.setSleeping(svg, sleeping);
  Mascot.setZone(svg, state.zone);
  if (sleeping) {
    Mascot.setCrown(svg, false);
    return Mascot.setFace(svg, { eyes: 'closed', mouth: 'small' });
  }
  if (Date.now() < state.oopsUntil) return Mascot.setFace(svg, { eyes: 'dots', mouth: 'wavy' });
  const level = faceLevel();
  Mascot.setCrown(svg, level === 5);
  if (level === 0) Mascot.setFace(svg, { eyes: 'round', mouth: 'smile' });
  else if (level === 1) Mascot.setFace(svg, { eyes: 'round', mouth: 'big' });
  else if (level === 2) Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big' });
  else if (level === 3) Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'open', cheeks: true });
  else if (level === 4) Mascot.setFace(svg, { eyes: 'wide', mouth: 'o', brows: true, tense: true });
  else Mascot.setFace(svg, { eyes: 'star', mouth: 'open', cheeks: true });
}

/**
 * 0-5 from the streak (current / all-time best); while the value decays the face calms down with it.
 *   0 <25 %  1 25-50 %  2 50-75 %  3 75-90 %  4 90-<100 % ("don't lose it!")  5 >=100 % (extending the record: crown).
 * With no record yet (best 0) the absolute streak decides, capped at 2: 0-30, 30-80, 80+ characters.
 */
function faceLevel() {
  const { current, best } = state.streak;
  const calm = state.mode === 'decay' && state.decayFrom > 0 ? Math.min(1, state.display / state.decayFrom) : 1;
  if (!(best > 0)) {
    const c = current * calm;
    return c < 30 ? 0 : c < 80 ? 1 : 2;
  }
  const ratio = (current / best) * calm;
  if (ratio >= 1) return Date.now() < state.crownHoldUntil ? 4 : 5; // the record jump plays first
  return ratio < 0.25 ? 0 : ratio < 0.5 ? 1 : ratio < 0.75 ? 2 : ratio < 0.9 ? 3 : 4;
}

function say(key, ms, big = false) {
  sayText(t(key), ms, big);
}

function sayText(text, ms, big = false, tip = false) {
  const el = $('bubble');
  clearTimeout(bubbleTimer);
  el.textContent = text;
  el.classList.toggle('big', big);
  el.classList.toggle('tip', tip);
  el.hidden = false;
  // Restart the pop animation so the newest bubble always "arrives".
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  bubbleTimer = setTimeout(() => (el.hidden = true), ms);
}

// --------------------------------------------------------------- handlers

function onKey(cls) {
  state.lastKeyAt = Date.now();
  if (state.asleep) {
    state.asleep = false;
    if (!state.paused) {
      renderFace();
      Mascot.wake(svg);
      say('pet.hi', 1000);
    }
  }
  if (state.paused) return;
  Mascot.keyTick(svg);
  if (cls === 'delete' || cls === 'word_delete') {
    const big = cls === 'word_delete';
    // Backspace breaks the streak: the crown (if any) flies off before the face goes back to level 1.
    Mascot.crownFlyOff(svg);
    state.streak = { ...state.streak, current: 0 };
    say(big ? 'pet.oops_big' : 'pet.oops', OOPS_MS, big);
    Mascot.tilt(svg);
    state.oopsUntil = Date.now() + OOPS_MS;
    clearTimeout(oopsTimer);
    oopsTimer = setTimeout(renderFace, OOPS_MS + 20);
  }
  renderFace();
}

const zoneOfPct = (p) => (p > 100 ? 'beating' : p >= 85 ? 'fire' : p >= 60 ? 'good' : 'warming');
let rafId = 0;
let lastFrame = 0;
let lastSig = '';

function onLive(p) {
  state.streak = p.streak || state.streak;
  state.calibrating = p.wpm != null && p.percent == null ? p.calibrating || null : null;
  if (p.wpm != null && p.percent != null) {
    state.target = Math.max(0, p.percent);
    if (state.mode !== 'live') state.mode = 'live';
  } else if (p.wpm != null) {
    // Calibrating: no percentage to show, progress is drawn as stripes.
    state.mode = 'idle';
    state.display = 0;
  } else if (state.mode === 'live' || (state.mode === 'idle' && state.display > 0)) {
    state.mode = 'decay';
    state.decayFrom = Math.max(1, state.display);
  }
  paintBar();
  ensureFrames();
}

function ensureFrames() {
  if (!rafId && state.mode !== 'idle') {
    lastFrame = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

function frame(now) {
  rafId = 0;
  const dt = Math.min(0.1, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  const calm = Mascot.reduced();
  if (state.mode === 'live') {
    state.display += (state.target - state.display) * (1 - Math.exp(-dt / BLEND_TAU));
    if (Math.abs(state.target - state.display) < 0.05) {
      state.display = state.target;
      paintBar();
      return; // settled: the next live event wakes the loop again
    }
  } else if (state.mode === 'decay') {
    state.display *= Math.exp(-dt / (calm ? 0.5 : DECAY_TAU));
    if (state.display < 4) {
      state.display = 0;
      state.mode = 'idle';
    }
  }
  paintBar();
  if (state.mode !== 'idle') rafId = requestAnimationFrame(frame);
}

/** Draws the mini bar, zone and face from the value currently displayed. */
function paintBar() {
  const bar = $('livebar');
  const cal = state.calibrating;
  const active = state.display > 0 && !state.paused;
  state.zone = active ? zoneOfPct(state.display) : null;
  pet.dataset.zone = state.zone || 'idle';
  const show = !state.paused && (active || !!cal);
  bar.hidden = !show;
  bar.classList.toggle('calibrating', !!cal);
  if (show) {
    const pct = cal ? (cal.have / Math.max(1, cal.need)) * 100 : (Math.min(BAR_MAX, state.display) / BAR_MAX) * 100;
    $('livefill').style.width = `${Math.max(cal ? 6 : 0, Math.min(100, pct)).toFixed(2)}%`;
  }
  const level = faceLevel();
  const zr = ZONE_RANK[state.zone] ?? -1;
  // Positive change only (level or zone going up) earns a burst, sized by importance; the biggest wins.
  const rank = Math.max(level > prevLevel ? LEVEL_BURST[level] : 0, zr > prevZoneRank ? ZONE_BURST[zr] : 0);
  prevLevel = level;
  prevZoneRank = zr;
  if (rank && !state.asleep && !state.paused) celebrate(rank);
  const sig = `${state.zone}|${state.asleep}|${state.paused}|${level}`;
  if (sig !== lastSig) {
    lastSig = sig;
    renderFace();
  }
}

// Star bursts on upgrades: 1 small (4-5 tiny stars), 2 medium, 3 full. At most one per BURST_GAP_MS.
const ZONE_RANK = { warming: 0, good: 1, fire: 2, beating: 3 };
const ZONE_BURST = [0, 1, 2, 3];
const LEVEL_BURST = [0, 1, 1, 2, 2, 3]; // by face level 0-5 (levels 2-3 small, 4-5 medium, 6 full)
const BURST_GAP_MS = 1500;
const BURSTS = [null, [5, 0.45], [7, 0.75], [10, 1]];
let prevLevel = 0;
let prevZoneRank = -1;
let lastBurstAt = 0;
function celebrate(rank, force = false) {
  const now = Date.now();
  if (!force && now - lastBurstAt < BURST_GAP_MS) return;
  lastBurstAt = now;
  Mascot.burstStars(svg, ...BURSTS[rank]);
}

function onRecord() {
  if (state.paused || state.asleep) return;
  if (!svg.__crown) {
    state.crownHoldUntil = Date.now() + RECORD_JUMP_MS;
    setTimeout(paintBar, RECORD_JUMP_MS + 20);
  }
  lastBurstAt = Date.now(); // the jump throws its own full burst
  Mascot.jump(svg, { big: true });
  say('pet.record', 2200, true);
}

function goToSleep() {
  if (state.asleep || state.paused) return;
  state.asleep = true;
  state.mode = 'idle';
  state.display = 0;
  paintBar();
  renderFace();
}

async function loadSettings() {
  const settings = await invoke('get_settings');
  setLanguage(resolveLanguage(settings.language));
  applyI18n();
  const wasPaused = state.paused;
  state.paused = settings.paused;
  if (wasPaused && !state.paused) {
    state.asleep = false;
    state.lastKeyAt = Date.now();
  }
  if (state.paused) {
    state.mode = 'idle';
    state.display = 0;
  }
  paintBar();
  renderFace();
}

// ------------------------------------------------- hover, eyes and dragging

let hitRect = null;
let lastDpr = 0;

/** Tells Rust where Tapomo's body is (CSS px in the window) so it can switch click-through on and off. */
function reportHit() {
  const r = $('stage').getBoundingClientRect();
  const s = r.width / 160; // the SVG viewBox is 160 wide; the body rect inside it is x 30-130, y 40-138
  const pad = 4;
  const lift = 5; // room for the hover lift
  hitRect = { x: r.left + 30 * s - pad, y: r.top + 40 * s - pad - lift, w: 100 * s + pad * 2, h: 98 * s + pad * 2 + lift };
  lastDpr = window.devicePixelRatio || 1;
  invoke('pet_set_hit', { ...hitRect, dpr: lastDpr }).catch(console.error);
}

function inHit(x, y) {
  return !!hitRect && x >= hitRect.x && x <= hitRect.x + hitRect.w && y >= hitRect.y && y <= hitRect.y + hitRect.h;
}

let hintAsked = 0;
function setHover(on) {
  pet.classList.toggle('hover', on);
  Mascot.setHover(svg, on);
  // The first three times only, a tiny hint about the mouse actions.
  if (on && !state.paused && !state.asleep && $('bubble').hidden && Date.now() - hintAsked > 30000) {
    hintAsked = Date.now();
    invoke('pet_hint')
      .then((show) => show && $('bubble').hidden && sayText(t('pet.hint'), HINT_MS, false, true))
      .catch(console.error);
  }
}

// A press is a click until it moves CLICK_PX or lasts CLICK_MS; only then does it become a drag
// (Rust learns about it at that point, so a click never moves or saves the window).
let press = null; // { id, x, y, t }
let dragging = false;
let movePending = false;
let moveDirty = false;
let clickTimer = null;

function sendMove() {
  if (movePending) {
    moveDirty = true;
    return;
  }
  movePending = true;
  invoke('pet_drag_move')
    .catch(console.error)
    .finally(() => {
      movePending = false;
      if (moveDirty) {
        moveDirty = false;
        sendMove();
      }
    });
}

function startDrag() {
  dragging = true;
  pet.classList.add('dragging');
  Mascot.setHeld(svg, true);
  invoke('pet_drag_start').catch(console.error);
}

/** Click on Tapomo: a small happy hop and a personalised, always positive tip. */
async function onClick() {
  if (state.paused) return;
  if (state.asleep) {
    state.asleep = false;
    renderFace();
    Mascot.wake(svg);
    state.lastKeyAt = Date.now();
  } else {
    Mascot.jump(svg, { big: false });
    celebrate(1); // small burst with the happy hop (rate-limited)
  }
  try {
    const tip = await invoke('get_pet_tip', { lang: current });
    if (tip && tip.key) sayText(t(tip.key, tip.vars), TIP_MS, false, true);
  } catch (e) {
    console.error(e);
  }
}

function bindDrag() {
  pet.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || press || !inHit(e.clientX, e.clientY)) return;
    e.preventDefault();
    pet.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, x: e.screenX, y: e.screenY, t: performance.now() };
  });
  pet.addEventListener('pointermove', (e) => {
    if (!press) return;
    if (!dragging) {
      if (Math.hypot(e.screenX - press.x, e.screenY - press.y) < CLICK_PX) return;
      startDrag();
    }
    sendMove();
  });
  const end = (e) => {
    if (!press || (e.pointerId !== undefined && e.pointerId !== press.id)) return;
    const wasClick = !dragging && e.type === 'pointerup' && performance.now() - press.t < CLICK_MS;
    press = null;
    try { pet.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    if (dragging) {
      dragging = false;
      pet.classList.remove('dragging');
      Mascot.setHeld(svg, false);
      invoke('pet_drag_end').catch(console.error);
    } else if (wasClick) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        invoke('pet_open_main').catch(console.error);
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          onClick();
        }, DBLCLICK_MS);
      }
    }
  };
  pet.addEventListener('pointerup', end);
  pet.addEventListener('pointercancel', end);
  pet.addEventListener('lostpointercapture', end);
  // Right-click on Tapomo: native menu (built and shown by Rust).
  pet.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (inHit(e.clientX, e.clientY)) invoke('pet_menu').catch(console.error);
  });
}

// Coming back after being hidden (setting, one hour, fullscreen): a hop and a greeting.
let wasVisible = false;
function onPetState(p) {
  const visible = !!(p && p.visible);
  const appeared = visible && !wasVisible;
  wasVisible = visible;
  if (!appeared) return;
  // The window has only just been shown; give the webview a beat to paint before the greeting.
  setTimeout(() => {
    say('pet.here', 2500);
    Mascot.jump(svg, { big: false });
  }, 200);
}

// ------------------------------------------------------------------ init

async function init() {
  await loadAll();
  Mascot.mount(svg);
  renderFace();
  bindDrag();
  reportHit();
  window.addEventListener('resize', reportHit);
  await Promise.all([
    listen('tapomo://key', (e) => onKey(e.payload)),
    listen('tapomo://live', (e) => onLive(e.payload)),
    listen('tapomo://record', onRecord),
    listen('tapomo://settings', () => loadSettings().catch(console.error)),
    listen('tapomo://pet-say', () => onClick()),
    listen('tapomo://pet-state', (e) => onPetState(e.payload)),
    listen('tapomo://pet-hover', (e) => setHover(!!e.payload)),
    listen('tapomo://cursor', (e) => Mascot.lookAtPoint(svg, e.payload.x, e.payload.y)),
  ]);
  await loadSettings();
  // Know whether we are already on screen, so only a real reappearance gets the greeting.
  wasVisible = !!(await invoke('get_pet_state').catch(() => ({ visible: true }))).visible;
  setInterval(() => {
    if (Date.now() - state.lastKeyAt > SLEEP_AFTER_MS) goToSleep();
    if ((window.devicePixelRatio || 1) !== lastDpr) reportHit(); // moved to another monitor
  }, 5000);
}

// Used by the animation lab (lab.html) to force sleep without waiting three minutes.
window.TapomoPet = { celebrate: (r) => celebrate(r, true), sleep: goToSleep, click: onClick, appear: () => onPetState({ visible: false }) || onPetState({ visible: true }), get asleep() { return state.asleep; }, get display() { return state.display; }, get mode() { return state.mode; } };

init().catch(console.error);
