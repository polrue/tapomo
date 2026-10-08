const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);

let range = localStorage.getItem('tapomo.range') || 'today';
let settings = null;
let refreshTimer = null;
let lastKeyRefresh = 0;

// ---------------------------------------------------------------- helpers

function fmt(n, digits = 0) {
  return Number(n).toLocaleString(document.documentElement.lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function withUnit(value, unitKey) {
  return `${value}<span class="unit">${t(unitKey)}</span>`;
}

function formatMinutes(min) {
  if (min < 1) return withUnit('<1', 'unit.min');
  if (min < 60) return withUnit(fmt(Math.round(min)), 'unit.min');
  const h = Math.floor(min / 60);
  return `${fmt(h)}<span class="unit">${t('unit.h')}</span> ${fmt(Math.round(min - h * 60))}<span class="unit">${t('unit.min')}</span>`;
}

function showError(err) {
  console.error(err);
}

// ----------------------------------------------------------------- render

async function renderSummary() {
  const s = await invoke('get_summary', { range });
  $('empty').hidden = s.bursts > 0;
  $('data').hidden = s.bursts === 0;
  if (s.bursts === 0) return s;

  speeds.avg = s.avg_wpm;
  speeds.peak = s.peak_wpm;
  $('t-avg').innerHTML = withUnit(fmt(s.avg_wpm), 'unit.wpm');
  $('t-net').textContent = t('tile.net', { n: fmt(s.avg_net_wpm) });
  $('t-peak').innerHTML = s.peak_wpm > 0 ? withUnit(fmt(s.peak_wpm), 'unit.wpm') : '–';
  $('t-best').innerHTML = withUnit(fmt(s.best_streak), 'unit.chars');
  $('t-current').innerHTML = withUnit(fmt(s.current_streak), 'unit.chars');
  $('t-time').innerHTML = formatMinutes(s.active_minutes);
  $('t-chars').textContent = fmt(s.chars_total);
  return s;
}

async function renderHeatmap() {
  const cells = await invoke('get_heatmap', { range });
  const max = Math.max(1, ...cells.map((c) => c.avg_wpm));
  const grid = $('heatmap');
  grid.replaceChildren();

  grid.append(document.createElement('span'));
  for (let h = 0; h < 24; h++) {
    const el = document.createElement('span');
    el.className = 'hlabel';
    el.textContent = h % 3 === 0 ? h : '';
    grid.append(el);
  }
  for (let d = 0; d < 7; d++) {
    const label = document.createElement('span');
    label.className = 'dlabel';
    label.textContent = t(`day.${d}`);
    grid.append(label);
    for (let h = 0; h < 24; h++) {
      const c = cells[d * 24 + h];
      const el = document.createElement('span');
      el.className = 'cell';
      if (c && c.bursts > 0) {
        // Keep a visible floor so slow-but-present hours don't look empty.
        el.style.setProperty('--lvl', (0.2 + 0.8 * (c.avg_wpm / max)).toFixed(2));
        el.title = t('heatmap.tip', { day: t(`day.${d}`), hour: String(h).padStart(2, '0'), wpm: fmt(c.avg_wpm), bursts: c.bursts });
      } else {
        el.title = `${t(`day.${d}`)} ${String(h).padStart(2, '0')}:00 — ${t('heatmap.none')}`;
      }
      grid.append(el);
    }
  }
}

async function renderApps() {
  const apps = await invoke('get_apps', { range });
  const body = $('apps-body');
  body.replaceChildren();
  $('apps-empty').hidden = apps.length > 0;
  for (const a of apps) {
    const tr = document.createElement('tr');

    const name = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'alias';
    input.value = a.alias || '';
    input.placeholder = a.exe.replace(/\.exe$/i, '');
    input.setAttribute('aria-label', a.exe);
    input.addEventListener('change', () => invoke('set_alias', { exe: a.exe, alias: input.value }).catch(showError));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    const exe = document.createElement('span');
    exe.className = 'exe';
    exe.textContent = a.exe;
    name.append(input, exe);

    const wpm = document.createElement('td');
    wpm.className = 'num';
    wpm.textContent = fmt(a.avg_wpm);
    const chars = document.createElement('td');
    chars.className = 'num';
    chars.textContent = fmt(a.chars);

    tr.append(name, wpm, chars);
    body.append(tr);
  }
}

async function renderExclusions() {
  const list = await invoke('list_exclusions');
  const ul = $('exclusions');
  ul.replaceChildren();
  for (const exe of list) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = exe;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = t('settings.exclusions.remove');
    btn.setAttribute('aria-label', `${t('settings.exclusions.remove')} ${exe}`);
    btn.addEventListener('click', async () => {
      await invoke('remove_exclusion', { exe }).catch(showError);
      renderExclusions().catch(showError);
    });
    li.append(label, btn);
    ul.append(li);
  }
}

function renderSettings() {
  $('s-pause').value = settings.pause_ms / 1000;
  $('s-pause-out').textContent = `${fmt(settings.pause_ms / 1000, 1)} s`;
  $('s-language').value = settings.language;
  $('s-autostart').checked = settings.autostart;
  $('s-fullscreen').checked = settings.ignore_fullscreen;
  $('s-paused').checked = settings.paused;
  $('s-pet').checked = settings.show_pet;
  $('paused-banner').hidden = !settings.paused;
}

function renderTabs() {
  document.querySelectorAll('#range-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === range)));
}

function renderLanguageSelect() {
  const select = $('s-language');
  select.replaceChildren();
  const auto = new Option(t('settings.language.auto'), '');
  select.append(auto);
  for (const code of LANGUAGES) select.append(new Option(dictionaries[code].name || code, code));
}

async function refreshAll() {
  renderTabs();
  try {
    const s = await renderSummary();
    if (s.bursts > 0) await Promise.all([renderHeatmap(), renderApps()]);
  } catch (e) {
    showError(e);
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshAll, 400);
}

// ----------------------------------------------------------------- settings

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    await invoke('set_settings', { settings });
  } catch (e) {
    showError(e);
  }
}

async function onLanguageChange() {
  await saveSettings({ language: $('s-language').value });
  setLanguage(resolveLanguage(settings.language));
  applyI18n();
  glueInfo();
  renderLanguageSelect();
  renderSettings();
  renderGlossary();
  paintLive(lastLive || {});
  renderPetState();
  renderExclusions().catch(showError);
  refreshAll();
}

function bindControls() {
  document.querySelectorAll('#range-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      range = b.dataset.range;
      try { localStorage.setItem('tapomo.range', range); } catch (_) { /* storage can be unavailable */ }
      refreshAll();
    })
  );

  $('s-pause').addEventListener('input', () => {
    $('s-pause-out').textContent = `${fmt(Number($('s-pause').value), 1)} s`;
  });
  $('s-pause').addEventListener('change', () => saveSettings({ pause_ms: Math.round(Number($('s-pause').value) * 1000) }));
  $('s-language').addEventListener('change', onLanguageChange);
  $('s-autostart').addEventListener('change', () => saveSettings({ autostart: $('s-autostart').checked }));
  $('s-fullscreen').addEventListener('change', () => saveSettings({ ignore_fullscreen: $('s-fullscreen').checked }));
  $('s-pet').addEventListener('change', () => saveSettings({ show_pet: $('s-pet').checked }));
  $('s-paused').addEventListener('change', async () => {
    await saveSettings({ paused: $('s-paused').checked });
    renderSettings();
  });

  $('open-logs').addEventListener('click', () => invoke('open_logs_dir').catch(showError));

  $('exclusion-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const exe = $('exclusion-input').value.trim();
    if (!exe) return;
    await invoke('add_exclusion', { exe }).catch(showError);
    $('exclusion-input').value = '';
    renderExclusions().catch(showError);
  });
}

// ---------------------------------------------------------------- live bar

const BAR_MAX = 130; // the bar spans 0-130 % of the personal reference
const LIVE_STALE_MS = 1500;
const DECAY_TAU = 2.5; // s: when typing stops the bar eases to 0 in about 8 s
const BLEND_TAU = 0.15; // s: blending to a new live value
let liveStale = null;
let lastLive = null;
// What the live card shows right now, and how it is moving.
const disp = { pct: 0, wpm: 0, tpct: 0, twpm: 0, mode: 'idle', raf: 0, last: 0 };
const speeds = { avg: 0, peak: 0, live: 0 }; // for the keystroke equivalents in the tooltips

const zoneOfPct = (p) => (p > 100 ? 'beating' : p >= 85 ? 'fire' : p >= 60 ? 'good' : 'warming');

/** A `tapomo://live` payload, or `null` when the burst ended (and as a watchdog). */
function renderLive(p) {
  if (p) lastLive = p;
  const cur = p || lastLive || {};
  if (p && p.wpm != null) {
    disp.twpm = p.wpm;
    disp.tpct = p.percent != null ? Math.max(0, p.percent) : 0;
    disp.mode = 'live';
    speeds.live = p.wpm;
  } else if (disp.mode === 'live') {
    disp.mode = 'decay'; // keep the last value and let it fall
  }
  paintLive(cur);
  ensureLiveFrames();
  clearTimeout(liveStale);
  if (p && p.wpm != null) liveStale = setTimeout(() => renderLive(null), LIVE_STALE_MS);
}

function ensureLiveFrames() {
  if (!disp.raf && disp.mode !== 'idle') {
    disp.last = performance.now();
    disp.raf = requestAnimationFrame(liveFrame);
  }
}

function liveFrame(now) {
  disp.raf = 0;
  const dt = Math.min(0.1, Math.max(0.001, (now - disp.last) / 1000));
  disp.last = now;
  if (disp.mode === 'live') {
    const k = 1 - Math.exp(-dt / BLEND_TAU);
    disp.pct += (disp.tpct - disp.pct) * k;
    disp.wpm += (disp.twpm - disp.wpm) * k;
    if (Math.abs(disp.tpct - disp.pct) < 0.05 && Math.abs(disp.twpm - disp.wpm) < 0.05) {
      disp.pct = disp.tpct;
      disp.wpm = disp.twpm;
      paintLive(lastLive || {});
      return; // settled; the next live event restarts the loop
    }
  } else if (disp.mode === 'decay') {
    const f = Math.exp(-dt / (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.5 : DECAY_TAU));
    disp.pct *= f;
    disp.wpm *= f;
    if (disp.wpm < 2 && disp.pct < 4) {
      disp.pct = disp.wpm = 0;
      disp.mode = 'idle';
    }
  }
  paintLive(lastLive || {});
  if (disp.mode !== 'idle') disp.raf = requestAnimationFrame(liveFrame);
}

/** Draws the live card from the displayed (possibly decaying) value plus the static payload parts. */
function paintLive(p) {
  const card = $('live');
  const bar = $('live-bar');
  const cal = p.calibrating || null;
  const active = disp.wpm >= 2;
  const pct = Math.max(0, Math.min(BAR_MAX, disp.pct));
  const zone = active && !cal ? zoneOfPct(disp.pct) : null;

  card.dataset.zone = zone || 'idle';
  card.toggleAttribute('data-calibrating', !!cal);
  $('live-wpm').textContent = active ? fmt(disp.wpm) : '–';

  if (cal) {
    // The bar shows calibration progress (long bursts so far), not speed.
    const have = Math.min(cal.have, cal.need);
    card.style.setProperty('--pct', `${Math.max(3, (have / Math.max(1, cal.need)) * 100)}%`);
    const label = t('live.calibrating.bar', { have: cal.have, need: cal.need });
    bar.setAttribute('aria-valuemax', String(cal.need));
    bar.setAttribute('aria-valuenow', String(have));
    bar.setAttribute('aria-valuetext', label);
    bar.setAttribute('aria-label', label);
    $('live-zone').textContent = '';
    $('live-text').textContent = t('live.calibrating', { have: cal.have, need: cal.need });
  } else {
    card.style.setProperty('--pct', `${((pct / BAR_MAX) * 100).toFixed(2)}%`);
    bar.setAttribute('aria-valuemax', String(BAR_MAX));
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    bar.removeAttribute('aria-valuetext');
    bar.setAttribute('aria-label', t('live.bar'));
    $('live-zone').textContent = zone ? t(`zone.${zone}`) : '';
    $('live-text').textContent = active ? '' : t('live.idle');
  }
  $('live-burst-info').hidden = !cal;

  // Record marker: only once there is a reference to compare against.
  const rec = $('live-record');
  const recLabel = $('live-record-label');
  const showRec = !cal && p.record_percent != null;
  rec.hidden = recLabel.hidden = !showRec;
  if (showRec) {
    const pinned = p.record_percent > BAR_MAX;
    const left = `${(Math.min(p.record_percent, BAR_MAX) / BAR_MAX) * 100}%`;
    rec.style.left = recLabel.style.left = left;
    rec.toggleAttribute('data-pinned', pinned);
    recLabel.toggleAttribute('data-pinned', pinned);
    recLabel.textContent = pinned ? `${t('live.record')} →` : t('live.record');
  }
}

// ------------------------------------------------------------------ mascot

function squish() {
  Mascot.keyTick($('mascot'));
}

function blush() {
  const m = $('mascot');
  m.classList.add('blush');
  Mascot.jump(m, { big: true });
  setTimeout(() => m.classList.remove('blush'), 2500);
}

/**
 * Keeps every ⓘ attached to the last word of its label, so it can never wrap onto a line of its
 * own: the last word and the button go in one nowrap span. Run it after every `applyI18n()`.
 */
function glueInfo() {
  document.querySelectorAll('.info').forEach((btn) => {
    let sp = btn.previousElementSibling;
    if (sp && sp.classList.contains('nw')) sp = sp.previousElementSibling;
    if (!sp || !(sp.dataset.i18n || sp.dataset.i18nGlue)) return;
    if (sp.dataset.i18n) { sp.dataset.i18nGlue = sp.dataset.i18n; delete sp.dataset.i18n; }
    let nw = btn.parentElement.classList.contains('nw') ? btn.parentElement : null;
    if (!nw) {
      nw = document.createElement('span');
      nw.className = 'nw';
      nw.append(document.createElement('span'), btn);
      sp.after(nw);
    }
    const text = t(sp.dataset.i18nGlue);
    const i = text.lastIndexOf(' ');
    sp.textContent = i < 0 ? '' : text.slice(0, i + 1);
    nw.firstElementChild.textContent = i < 0 ? text : text.slice(i + 1);
  });
}

// ----------------------------------------------------------- hiding header

let petState = { visible: true, reason: null, until_ms: null };
let hourTimer = null;

function hourMinutes() {
  return Math.max(1, Math.ceil(((petState.until_ms || Date.now()) - Date.now()) / 60000));
}

/** Header: Tapomo peeks from behind the edge while the floating one is not on screen. */
function renderPetState() {
  const { reason } = petState;
  const hidden = !petState.visible && !!reason;
  Mascot.setHiding($('mascot'), hidden);
  const note = $('hide-note');
  const btn = $('hide-btn');
  note.hidden = !hidden;
  clearInterval(hourTimer);
  if (!hidden) return;
  const hasBtn = reason === 'setting' || reason === 'hour';
  $('hide-text').textContent = t(`pet.hide.${reason}`, { m: reason === 'hour' ? hourMinutes() : '' });
  btn.hidden = !hasBtn;
  if (hasBtn) btn.textContent = t(`pet.hide.${reason}.btn`);
  if (reason === 'hour') hourTimer = setInterval(renderPetState, 30000);
}

async function refreshPetState() {
  try {
    petState = await invoke('get_pet_state');
    renderPetState();
  } catch (e) {
    showError(e);
  }
}

function comeOut() {
  if (petState.reason === 'hour') invoke('pet_cancel_snooze').catch(showError);
  else if (petState.reason === 'setting') saveSettings({ show_pet: true }).then(renderSettings);
}

async function bindEvents() {
  await listen('tapomo://pet-state', (e) => {
    petState = e.payload;
    renderPetState();
  });
  await listen('tapomo://key', () => {
    squish();
    // Keep the "current streak" tile live without hammering the database.
    const now = Date.now();
    if (now - lastKeyRefresh > 700) {
      lastKeyRefresh = now;
      renderSummary().catch(showError);
    }
  });
  await listen('tapomo://live', (e) => renderLive(e.payload));
  await listen('tapomo://burst', scheduleRefresh);
  await listen('tapomo://record', blush);
  await listen('tapomo://settings', async () => {
    settings = await invoke('get_settings');
    renderSettings();
  });
}

// ----------------------------------------------------------------- glossary

const GLOSSARY = ['pet', 'wpm', 'burst', 'peak', 'streak', 'pace', 'calibration', 'net'];

function renderGlossary() {
  const dl = $('glossary-list');
  dl.replaceChildren();
  const vars = { pause: fmt((settings ? settings.pause_ms : 2000) / 1000, 1), need: 20 };
  for (const id of GLOSSARY) {
    const dt = document.createElement('dt');
    dt.textContent = t(`gloss.${id}.t`);
    const dd = document.createElement('dd');
    dd.textContent = t(`gloss.${id}.d`, vars);
    dl.append(dt, dd);
  }
}

function openGlossary() {
  const g = $('glossary');
  g.open = true;
  g.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  g.querySelector('summary').focus({ preventScroll: true });
}

// -------------------------------------------------------------------- init

async function init() {
  await loadAll();
  Mascot.mount($('mascot'));
  settings = await invoke('get_settings');
  setLanguage(resolveLanguage(settings.language));
  applyI18n();
  renderLanguageSelect();
  renderSettings();
  renderGlossary();
  paintLive({});
  bindControls();
  $('hide-btn').addEventListener('click', comeOut);
  Tips.init({
    vars: () => ({
      pause: fmt((settings ? settings.pause_ms : 2000) / 1000, 1),
      need: (lastLive && lastLive.calibrating && lastLive.calibrating.need) || 20,
    }),
    // Spanish speakers often know typing speed in keystrokes per minute: show it, subtly.
    extra: (btn) => {
      const v = speeds[btn.dataset.tipSpeed];
      return document.documentElement.lang === 'es' && v > 0 ? t('tip.keystrokes', { k: fmt(Math.round(v * 5)) }) : '';
    },
    onClick: openGlossary,
  });
  // The header mascot's eyes follow the pointer while it is over the window.
  let lookFrame = 0;
  document.addEventListener('pointermove', (e) => {
    if (lookFrame) return;
    lookFrame = requestAnimationFrame(() => {
      lookFrame = 0;
      if (!Mascot.isHiding($('mascot'))) Mascot.lookAtPoint($('mascot'), e.clientX, e.clientY);
    });
  });
  await bindEvents();
  await refreshPetState();
  glueInfo();
  try {
    $('about-version').textContent = t('about.version', { v: await window.__TAURI__.app.getVersion() });
  } catch (e) {
    showError(e);
  }
  renderExclusions().catch(showError);
  refreshAll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshAll(); refreshPetState(); } });
  window.addEventListener('focus', refreshPetState);
}

init().catch(showError);
