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
    useGrouping: 'always', // "1.000" in Spanish too, like the texts
  });
}

function withUnit(value, unitKey) {
  return `${value}<span class="unit">${t(unitKey)}</span>`;
}

/** Characters per minute: a "word" is 5 characters, so cpm = wpm × 5 (gross). */
function cpm(wpm) {
  return Math.round(wpm * 5);
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
  speeds.reference = s.reference || 0; // the bar's 100 %, also when nothing is being typed
  paintLive(lastLive || {});
  $('t-avg').innerHTML = withUnit(fmt(s.avg_wpm), 'unit.wpm');
  $('t-cpm').textContent = t('tile.cpm', { n: fmt(cpm(s.avg_wpm)) });
  $('t-net').textContent = t('tile.net', { n: fmt(s.avg_net_wpm) });
  $('t-peak').innerHTML = s.peak_wpm > 0 ? withUnit(fmt(s.peak_wpm), 'unit.wpm') : '–';
  $('t-peak-cpm').textContent = s.peak_wpm > 0 ? t('tile.cpm', { n: fmt(cpm(s.peak_wpm)) }) : '';
  $('t-best').innerHTML = withUnit(fmt(s.best_streak), 'unit.chars');
  $('t-current').innerHTML = withUnit(fmt(s.current_streak), 'unit.chars');
  $('t-time').innerHTML = formatMinutes(s.active_minutes);
  // Big totals go compact ("1,2 M") so they fit a tile; the exact figure stays in the tooltip.
  const chars = s.chars_total >= 100000
    ? Number(s.chars_total).toLocaleString(document.documentElement.lang, { notation: 'compact', maximumFractionDigits: 1 })
    : fmt(s.chars_total);
  $('t-chars').textContent = chars;
  $('t-chars').title = fmt(s.chars_total);
  return s;
}

/** Muted line under the live card (Today view only): yesterday's average and characters, if any. */
async function renderYesterday() {
  const el = $('yesterday');
  const y = range === 'today' ? await invoke('get_summary', { range: 'yesterday' }) : null;
  el.hidden = !y || y.bursts === 0;
  if (el.hidden) return;
  el.textContent = tn('yesterday.line', y.chars_total, { wpm: fmt(y.avg_wpm), n: fmt(y.chars_total) });
}

// -------------------------------------------------------------- daily goal

const RING_LEN = 2 * Math.PI * 42; // matches stroke-dasharray in style.css
let lastGoal = null;

/** Daily-goal card (Today view only, and only while a goal is set): ring, minutes, streak. */
async function renderGoal() {
  const card = $('goal');
  const g = range === 'today' ? await invoke('get_daily_goal') : null;
  lastGoal = g;
  card.hidden = !g || g.goal_min === 0;
  if (card.hidden) return;
  const goalMs = g.goal_min * 60000;
  const frac = Math.min(1, g.today_ms / goalMs);
  const minutes = Math.floor(g.today_ms / 60000);
  card.toggleAttribute('data-met', g.met_today);
  // Set on the next frame so the arc animates from where it was (or from empty on first show).
  requestAnimationFrame(() => $('goal-arc').style.strokeDashoffset = String(RING_LEN * (1 - frac)));
  $('goal-pct').textContent = `${Math.round(frac * 100)}%`;
  const label = t('goal.progress', { m: fmt(minutes), goal: fmt(g.goal_min) });
  $('goal-progress').textContent = label;
  $('goal-progress').setAttribute('aria-valuemax', String(g.goal_min));
  $('goal-progress').setAttribute('aria-valuenow', String(Math.min(minutes, g.goal_min)));
  $('goal-progress').setAttribute('aria-valuetext', t('goal.progress_aria', { m: fmt(minutes), goal: fmt(g.goal_min) }));
  $('goal-sub').textContent = t(g.met_today ? 'goal.done' : 'goal.sub');
  const streak = document.querySelector('.goal-streak');
  streak.toggleAttribute('data-zero', g.streak_days === 0);
  $('goal-days').textContent = g.streak_days > 0 ? tn('goal.streak', g.streak_days, { n: fmt(g.streak_days) }) : t('goal.streak_start');
  const saved = $('goal-saved');
  saved.hidden = !g.freeze_saved_streak_recently || g.streak_days === 0;
  if (!saved.hidden) saved.textContent = t('goal.saved');
  // Streak protectors: filled shields in the bank, faded ones for the empty slots.
  const shields = $('goal-shields');
  const n = g.protectors || 0;
  shields.hidden = g.protectors === undefined;
  shields.replaceChildren(...[0, 1].map((i) => {
    const s = document.createElement('span');
    s.textContent = '🛡️';
    s.toggleAttribute('data-empty', i >= n);
    s.setAttribute('aria-hidden', 'true');
    return s;
  }));
  shields.setAttribute('aria-label', t('goal.protectors', { n: fmt(n) }));
  shields.title = `${t('goal.protectors', { n: fmt(n) })}\n${t('goal.protectors_tip')}`;
}

/** Goal reached: the ring pulses and Tapomo throws stars. */
function goalReached() {
  renderGoal().then(() => {
    const ring = $('goal-ring');
    if (ring.offsetParent && !Mascot.reduced()) {
      ring.classList.remove('pop');
      void ring.offsetWidth;
      ring.classList.add('pop');
    }
  }).catch(showError);
  Mascot.jump($('mascot'), { big: true }); // the big hop throws the star burst
}

/** Long weekday name (0 = Monday) in the current language. */
function longDay(d) {
  const name = new Date(2024, 0, 1 + d).toLocaleDateString(document.documentElement.lang, { weekday: 'long' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

let heatTipBound = false;
let heatCells = [];
let heatFocus = 0; // index of the cell that holds the single tab stop
function bindHeatTip(grid) {
  if (heatTipBound) return;
  heatTipBound = true;
  const cell = (e) => e.target.closest?.('.cell[data-tip]');
  grid.addEventListener('mouseover', (e) => cell(e) && Tips.showText(cell(e), cell(e).dataset.tip));
  grid.addEventListener('mouseout', (e) => cell(e) && Tips.hide());
  // Keyboard: one tab stop, arrows move between cells, the tooltip follows the focus.
  grid.addEventListener('focusin', (e) => {
    const c = cell(e);
    if (!c) return;
    heatCells[heatFocus]?.setAttribute('tabindex', '-1');
    heatFocus = heatCells.indexOf(c);
    c.setAttribute('tabindex', '0');
    Tips.showText(c, c.dataset.tip);
  });
  grid.addEventListener('focusout', (e) => cell(e) && Tips.hide());
  grid.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -24, ArrowDown: 24 }[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? heatCells.length - 1 : heatFocus + (step || 0);
    if ((!step && e.key !== 'Home' && e.key !== 'End') || !heatCells[to]) return;
    e.preventDefault();
    heatCells[to].focus();
  });
}

async function renderHeatmap(reference) {
  const cells = await invoke('get_heatmap', { range });
  // Hue = zone of the cell's average against the personal reference; intensity = how much was typed
  // (bursts relative to the busiest cell). While calibrating there is no reference: one hue by speed.
  const calibrated = reference > 0;
  const max = Math.max(1, ...cells.map((c) => c.avg_wpm));
  const maxBursts = Math.max(1, ...cells.map((c) => c.bursts));
  $('heatmap-legend').hidden = !calibrated;
  $('heatmap-note').hidden = calibrated;
  const grid = $('heatmap');
  bindHeatTip(grid);
  const hadFocus = grid.contains(document.activeElement) && document.activeElement.classList.contains('cell');
  grid.replaceChildren();
  heatCells = [];

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
      const hour = String(h).padStart(2, '0');
      let text;
      if (c && c.bursts > 0) {
        const pct = calibrated ? (c.avg_wpm / reference) * 100 : 0;
        // Keep a visible floor so slow-but-present hours don't look empty.
        const lvl = calibrated ? 0.25 + 0.75 * (c.bursts / maxBursts) : 0.2 + 0.8 * (c.avg_wpm / max);
        el.style.setProperty('--lvl', lvl.toFixed(2));
        el.dataset.lvl = lvl.toFixed(2);
        if (calibrated) el.dataset.zone = zoneOfPct(pct);
        const vars = { day: longDay(d), hour, wpm: fmt(c.avg_wpm), unit: t('unit.wpm'), pct: fmt(pct), bursts: fmt(c.bursts) };
        text = tn(calibrated ? 'heatmap.tip.zone' : 'heatmap.tip', c.bursts, vars);
      } else {
        text = `${longDay(d)} ${hour}:00 — ${t('heatmap.none')}`;
      }
      el.dataset.tip = text;
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', text);
      el.tabIndex = -1;
      heatCells.push(el);
      grid.append(el);
    }
  }
  heatFocus = Math.min(heatFocus, heatCells.length - 1);
  heatCells[heatFocus].tabIndex = 0;
  if (hadFocus) heatCells[heatFocus].focus({ preventScroll: true });
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
  $('s-goal').value = String(settings.daily_goal_min);
  $('s-weekend').checked = settings.weekend_rest;
  $('s-shortcuts').checked = settings.count_shortcuts;
  $('s-lessons-goal').checked = settings.lessons_in_goal;
  $('s-sc-tips').checked = settings.shortcut_tips;
  $('s-sc-tips').disabled = !settings.count_shortcuts;
  $('s-updates').checked = settings.check_updates;
  $('s-auto-update').checked = settings.auto_update;
  $('s-auto-update').disabled = !settings.check_updates;
  $('paused-banner').hidden = !settings.paused;
  invoke('get_encrypted').then((on) => {
    $('crypt-status').textContent = t(on ? 'crypt.on' : 'crypt.off');
    $('crypt-btn').hidden = on;
  }).catch(showError);
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

/** The four small speeds under the live bar. */
async function renderSpeedStats() {
  const s = await invoke('speed_summary');
  const show = (id, v) => { $(id).textContent = v == null ? '–' : `${fmt(v)} ${t('unit.wpm')}`; };
  show('stat-week', s.week_record);
  show('stat-today', s.today_avg);
  show('stat-last', s.last_burst);
  show('stat-best', s.all_time);
}

/** Settings: forget the top speed peak (e.g. one made by mashing the keyboard) after confirming it. */
async function resetTopPeak() {
  const top = await invoke('top_peak');
  if (!top) {
    alert(t('settings.peak_reset.none'));
    return;
  }
  const date = new Date(top.at_ms).toLocaleDateString(document.documentElement.lang, { weekday: 'long', day: 'numeric', month: 'long' });
  const vars = { wpm: fmt(top.value), date, app: top.app.replace(/\.exe$/i, ''), next: top.next == null ? '' : fmt(top.next) };
  if (!confirm(t(top.next == null ? 'settings.peak_reset.confirm_last' : 'settings.peak_reset.confirm', vars))) return;
  await invoke('discard_top_peak', { burstId: top.burst_id });
  renderSpeedStats().catch(showError);
}

async function refreshAll() {
  renderTabs();
  try {
    renderSpeedStats().catch(showError);
    renderYesterday().catch(showError);
    renderGoal().catch(showError);
    Progress.refresh(range).then(() => Badges.refresh()).then(() => League.refresh()).catch(showError);
    Shortcuts.refresh(range).catch(showError);
    Album.refreshTip(range).catch(showError);
    Social.refresh().catch(() => {});
    Support.refresh().catch(() => {});
    Records.refresh().catch(showError);
    const s = await renderSummary();
    if (s.bursts > 0) await Promise.all([renderHeatmap(s.reference), renderApps()]);
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
  renderGoal().catch(showError);
  Progress.relabel();
  SectionNav.render();
  Badges.render();
  League.render();
  Records.render();
  if (document.body.dataset.view === 'lessons') Lessons.refresh().catch(showError);
  paintLive(lastLive || {});
  renderPetState();
  renderVersion();
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
  $('s-goal').addEventListener('change', () => saveSettings({ daily_goal_min: Number($('s-goal').value) }).then(() => renderGoal()).catch(showError));
  $('s-weekend').addEventListener('change', () => saveSettings({ weekend_rest: $('s-weekend').checked }).then(() => renderGoal()).catch(showError));
  $('s-pet').addEventListener('change', () => saveSettings({ show_pet: $('s-pet').checked }));
  $('s-sc-tips').addEventListener('change', () => saveSettings({ shortcut_tips: $('s-sc-tips').checked }).then(() => Album.refreshTip()).catch(showError));
  $('s-lessons-goal').addEventListener('change', () => saveSettings({ lessons_in_goal: $('s-lessons-goal').checked }).then(() => renderGoal()).catch(showError));
  $('s-shortcuts').addEventListener('change', () => saveSettings({ count_shortcuts: $('s-shortcuts').checked }).then(() => { renderSettings(); Shortcuts.refresh(); Album.refreshTip(); }).catch(showError));
  $('s-updates').addEventListener('change', async () => {
    await saveSettings({ check_updates: $('s-updates').checked });
    renderSettings();
    checkForUpdate();
  });
  $('s-auto-update').addEventListener('change', () => saveSettings({ auto_update: $('s-auto-update').checked }));
  $('update-pill').addEventListener('click', () => UpdateDialog.open());
  $('welcome-again').addEventListener('click', () => Welcome.open());
  $('s-paused').addEventListener('change', async () => {
    await saveSettings({ paused: $('s-paused').checked });
    renderSettings();
  });

  $('open-logs').addEventListener('click', () => invoke('open_logs_dir').catch(showError));
  $('peak-reset').addEventListener('click', () => resetTopPeak().catch(showError));
  $('crypt-btn').addEventListener('click', async () => {
    if (!confirm(t('crypt.confirm'))) return;
    $('crypt-btn').disabled = true;
    $('crypt-status').textContent = t('crypt.working');
    try {
      await invoke('encrypt_database'); // Tapomo restarts itself when it is done
    } catch (e) {
      showError(e);
      $('crypt-status').textContent = t('crypt.failed');
      $('crypt-btn').disabled = false;
    }
  });

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
const speeds = { avg: 0, peak: 0, live: 0, reference: 0 }; // for the keystroke equivalents in the tooltips

// Same thresholds as `Zone::of` in tapomo-core.
const zoneOfPct = (p) =>
  p >= 108 ? 'super' : p >= 95 ? 'beating' : p >= 80 ? 'fire' : p >= 60 ? 'good' : p >= 40 ? 'rhythm' : 'warming';

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

  // The two marks carry their value: "tu ritmo · 62 ppm", "récord · 84 ppm".
  const ref = p.reference || speeds.reference || null;
  $('live-pace-label').textContent = ref && !cal ? `${t('live.pace')} · ${fmt(ref)} ${t('unit.wpm')}` : t('live.pace');

  // Record marker: only once there is a reference to compare against.
  const rec = $('live-record');
  const recLabel = $('live-record-label');
  const recPercent = p.week_record_percent;
  const showRec = !cal && recPercent != null;
  rec.hidden = recLabel.hidden = !showRec;
  if (showRec) {
    const pinned = recPercent > BAR_MAX;
    const left = `${(Math.min(recPercent, BAR_MAX) / BAR_MAX) * 100}%`;
    rec.style.left = recLabel.style.left = left;
    rec.toggleAttribute('data-pinned', pinned);
    recLabel.toggleAttribute('data-pinned', pinned);
    const recWpm = ref ? (recPercent * ref) / 100 : null;
    const recText = recWpm ? `${t('live.week_record')} · ${fmt(recWpm)} ${t('unit.wpm')}` : t('live.week_record');
    recLabel.textContent = pinned ? `${recText} →` : recText;
    // Near the end of a narrow bar the centred label would spill out of the card: keep it inside.
    const wrapW = recLabel.parentElement.clientWidth;
    const half = recLabel.offsetWidth / 2;
    if (!pinned && wrapW > 0) {
      const x = (Math.min(recPercent, BAR_MAX) / BAR_MAX) * wrapW;
      recLabel.style.left = `${Math.min(Math.max(x, half), wrapW - half)}px`;
    }
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
    // Once glued, the button sits inside the .nw wrapper: the label span is the wrapper's sibling.
    const wrapped = btn.parentElement.classList.contains('nw');
    let sp = wrapped ? btn.parentElement.previousElementSibling : btn.previousElementSibling;
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

// ------------------------------------------------------- version & updates

const RELEASE_PAGE = 'https://github.com/polrue/tapomo/releases/tag/v';
const UPDATE_EVERY_MS = 24 * 60 * 60 * 1000;
const UPDATE_CACHE_KEY = 'tapomo.update';
const NOTES_MAX = 300;
let installed = null; // e.g. "0.2.3"
let latest = null; // { v, notes } of the newer version, once known (null: none)

/** "v1.2.3" -> [1, 2, 3]; anything else (pre-release suffixes included) -> null. */
function parseSemver(tag) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** > 0 when a is newer than b. */
function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function renderVersion() {
  const link = $('version-link');
  const pill = $('update-pill');
  link.hidden = !installed;
  if (installed) {
    link.textContent = t('version.label', { v: installed });
    link.href = RELEASE_PAGE + installed;
  }
  const mine = installed && parseSemver(installed);
  const theirs = latest && parseSemver(latest.v);
  const newer = settings && settings.check_updates && mine && theirs && compareSemver(theirs, mine) > 0;
  pill.hidden = !newer;
  if (newer) pill.textContent = t('update.available', { v: latest.v });
}

/**
 * Asks the app (not the network from here) for a newer version: at most once per 24 h (the answer is
 * cached in localStorage), and none at all when the setting is off. Fails silently.
 */
async function checkForUpdate() {
  if (!settings || !settings.check_updates) {
    renderVersion();
    return;
  }
  let cache = null;
  try { cache = JSON.parse(localStorage.getItem(UPDATE_CACHE_KEY)); } catch (_) { /* storage can be unavailable */ }
  const age = cache ? Date.now() - cache.at : Infinity;
  if (cache && age >= 0 && age < UPDATE_EVERY_MS) {
    latest = cache.latest || null;
    renderVersion();
    return;
  }
  try {
    const info = await invoke('check_update');
    latest = info && parseSemver(info.version) ? { v: info.version, notes: info.notes || '' } : null;
    try { localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ at: Date.now(), latest })); } catch (_) { /* optional */ }
    renderVersion();
  } catch (_) { /* offline or blocked: stay quiet */ }
}

/** Friendly confirm for the update: release notes, "update now" (download + install) or "later". */
const UpdateDialog = (() => {
  let busy = false;
  let opener = null;
  let mounted = false;
  const el = (id) => document.getElementById(id);

  function setStatus(key, vars) {
    const s = el('update-status');
    s.hidden = !key;
    if (key) s.textContent = t(key, vars);
  }

  function close() {
    if (busy) return;
    el('update-dialog').hidden = true;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const items = [el('update-notes-link'), el('update-later'), el('update-now')].filter((b) => !b.disabled);
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    }
  }

  async function install() {
    busy = true;
    el('update-now').disabled = true;
    el('update-later').disabled = true;
    setStatus('update.downloading_plain');
    const unlisten = await listen('tapomo://update-progress', (e) => {
      const { downloaded, total } = e.payload;
      if (!total) return;
      const p = Math.min(100, Math.floor((downloaded / total) * 100));
      setStatus(p >= 100 ? 'update.installing' : 'update.downloading', { p });
    });
    try {
      await invoke('install_update');
      setStatus('update.installing'); // the installer closes Tapomo and starts the new one
    } catch (_) {
      busy = false;
      el('update-now').disabled = false;
      el('update-later').disabled = false;
      setStatus('update.failed');
    } finally {
      unlisten();
    }
  }

  function open() {
    if (!latest) return;
    opener = document.activeElement;
    if (!mounted) {
      mounted = true;
      el('update-dialog').addEventListener('keydown', onKey);
      el('update-later').addEventListener('click', close);
      el('update-now').addEventListener('click', install);
    }
    el('update-title').textContent = t('update.title', { v: latest.v });
    el('update-text').textContent = t('update.text');
    const notes = (latest.notes || '').trim();
    el('update-notes').hidden = !notes;
    el('update-notes').textContent = notes.length > NOTES_MAX ? `${notes.slice(0, NOTES_MAX).trimEnd()}…` : notes;
    el('update-notes-link').href = RELEASE_PAGE + latest.v;
    setStatus(null);
    el('update-now').disabled = false;
    el('update-later').disabled = false;
    el('update-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    el('update-now').focus();
  }

  return { open };
})();

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
      renderGoal().catch(showError);
    }
  });
  await listen('tapomo://live', (e) => renderLive(e.payload));
  await listen('tapomo://burst', scheduleRefresh);
  await listen('tapomo://record', blush);
  await listen('tapomo://peak-record', (e) => { if (e.payload && e.payload.all_time) blush(); });
  await listen('tapomo://goal', goalReached);
  await listen('tapomo://xp', (e) => Progress.onXp(e.payload).catch(showError));
  await listen('tapomo://shortcut', () => Shortcuts.bump());
  await listen('tapomo://shortcut-learnt', () => Album.onUsed());
  await listen('tapomo://settings', async () => {
    settings = await invoke('get_settings');
    renderSettings();
    renderGoal().catch(showError);
    Progress.applyLook();
  });
}

// ----------------------------------------------------------------- glossary

const GLOSSARY = ['pet', 'wpm', 'cpm', 'burst', 'peak', 'streak', 'pace', 'calibration', 'net', 'goal', 'daystreak', 'xp', 'challenges', 'wardrobe', 'badges', 'league', 'shortcuts', 'records', 'lessons', 'album', 'social'];

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
  Progress.bind();
  Lessons.bind();
  Album.bind();
  Social.bind();
  Support.bind();
  SectionNav.bind();
  $('hide-btn').addEventListener('click', comeOut);
  Tips.init({
    vars: () => ({
      pause: fmt((settings ? settings.pause_ms : 2000) / 1000, 1),
      need: (lastLive && lastLive.calibrating && lastLive.calibrating.need) || 20,
    }),
    // Spanish and Catalan speakers often know typing speed in keystrokes per minute: show it, subtly.
    extra: (btn) => {
      const v = speeds[btn.dataset.tipSpeed];
      return ['es', 'ca'].includes(document.documentElement.lang) && v > 0 ? t('tip.keystrokes', { k: fmt(Math.round(v * 5)) }) : '';
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
    installed = await window.__TAURI__.app.getVersion();
    $('about-version').textContent = t('about.version', { v: installed });
  } catch (e) {
    showError(e);
  }
  renderVersion();
  checkForUpdate();
  // A window that stays open for days asks again once the cache is a day old.
  setInterval(checkForUpdate, 60 * 60 * 1000);
  // The level reveal waits for the welcome to close.
  if (!settings.welcome_done) Welcome.open(() => saveSettings({ welcome_done: true }).then(() => { Progress.maybeReveal(); Badges.maybeReveal(); League.maybeReveal(); }));
  renderExclusions().catch(showError);
  refreshAll();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshAll(); refreshPetState(); } });
  // XP changes while the window is closed are revealed when it opens (refreshAll -> Progress.refresh).
  window.addEventListener('focus', refreshPetState);
}

init().catch(showError);
