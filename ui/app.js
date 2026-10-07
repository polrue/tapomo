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
  renderLanguageSelect();
  renderSettings();
  renderLive(null);
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
let liveStale = null;

let lastLive = null;

function renderLive(p) {
  // `null` means idle: keep what we know about the reference and the record.
  if (p) lastLive = p;
  else p = { ...(lastLive || {}), wpm: null, percent: null, zone: null };
  const card = $('live');
  const wpm = p.wpm != null ? p.wpm : null;
  const calibrating = !!p.calibrating;
  const pct = p.percent != null ? Math.max(0, Math.min(BAR_MAX, p.percent)) : 0;

  card.dataset.zone = p.zone && wpm != null ? p.zone : 'idle';
  card.toggleAttribute('data-calibrating', calibrating);
  card.style.setProperty('--pct', `${(pct / BAR_MAX) * 100}%`);
  $('live-bar').setAttribute('aria-valuenow', String(Math.round(pct)));
  $('live-wpm').textContent = wpm != null ? fmt(wpm) : '–';
  $('live-zone').textContent = wpm != null && p.zone ? t(`zone.${p.zone}`) : '';

  if (calibrating && wpm != null) {
    $('live-text').textContent = t('live.calibrating', { have: p.calibrating.have, need: p.calibrating.need });
  } else {
    $('live-text').textContent = wpm == null ? t('live.idle') : '';
  }

  // Record marker: only once there is a reference to compare against.
  const rec = $('live-record');
  const recLabel = $('live-record-label');
  const showRec = !calibrating && p.record_percent != null;
  rec.hidden = recLabel.hidden = !showRec;
  if (showRec) {
    const pinned = p.record_percent > BAR_MAX;
    const left = `${(Math.min(p.record_percent, BAR_MAX) / BAR_MAX) * 100}%`;
    rec.style.left = recLabel.style.left = left;
    rec.toggleAttribute('data-pinned', pinned);
    recLabel.toggleAttribute('data-pinned', pinned);
    recLabel.textContent = pinned ? `${t('live.record')} →` : t('live.record');
  }

  clearTimeout(liveStale);
  if (wpm != null) liveStale = setTimeout(() => renderLive(null), LIVE_STALE_MS);
}

// ------------------------------------------------------------------ mascot

function squish() {
  const body = $('mascot-body');
  body.classList.remove('squish');
  void body.getBoundingClientRect(); // restart the animation
  body.classList.add('squish');
}

function blush() {
  const m = $('mascot');
  m.classList.add('blush');
  setTimeout(() => m.classList.remove('blush'), 2500);
}

async function bindEvents() {
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

// -------------------------------------------------------------------- init

async function init() {
  await loadAll();
  Mascot.mount($('mascot'));
  settings = await invoke('get_settings');
  setLanguage(resolveLanguage(settings.language));
  applyI18n();
  renderLanguageSelect();
  renderSettings();
  renderLive(null);
  bindControls();
  await bindEvents();
  try {
    $('about-version').textContent = t('about.version', { v: await window.__TAURI__.app.getVersion() });
  } catch (e) {
    showError(e);
  }
  renderExclusions().catch(showError);
  refreshAll();
  document.addEventListener('visibilitychange', () => !document.hidden && refreshAll());
}

init().catch(showError);
