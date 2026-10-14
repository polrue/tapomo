// Optional online features (0.5): anonymous weekly stats and leagues with friends. Both are OFF until
// the user turns them on (stats) or creates/joins a league. Only the numbers shown in Settings ever
// leave the computer, and only to api.tapomo.app. If the server can't be reached, nothing breaks.
const Social = (() => {
  const API = 'https://api.tapomo.app/v1';
  const $ = (id) => document.getElementById(id);
  const SCORE_EVERY_MS = 30 * 60 * 1000;
  let league = null; // { code, name, member_id, member_secret, nickname }
  let lastScoreAt = 0;

  const kv = {
    get: (key) => invoke('social_get', { key }),
    set: (key, value) => invoke('social_set', { key, value }),
  };

  /** ISO week of a date, e.g. "2026-W42". */
  function isoWeek(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - jan1) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  }

  async function api(method, path, body, auth) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = `Bearer ${auth.member_id}.${auth.member_secret}`;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      let code = `http_${res.status}`;
      try { code = (await res.json()).error || code; } catch (_) { /* no body */ }
      throw new Error(code);
    }
    return res.status === 204 ? null : res.json();
  }

  const lang = () => (document.documentElement.lang === 'es' ? 'es' : 'en');

  // ------------------------------------------------------- anonymous stats

  async function installId() {
    let id = await kv.get('social_install_id');
    if (!id) {
      id = crypto.randomUUID();
      await kv.set('social_install_id', id);
    }
    return id;
  }

  /** Once a week, last week's summary; then the percentile, shown only when it is favourable. */
  async function syncStats() {
    const line = $('social-percentile');
    line.hidden = true;
    if ((await kv.get('social_stats_on')) !== '1') return;
    const s = await invoke('get_week_summary', { weeksAgo: 1 });
    if (!s) return;
    const body = {
      install_id: await installId(),
      week: s.week,
      lang: lang(),
      avg_wpm: s.avg_wpm,
      peak_wpm: Math.max(s.peak_wpm, s.avg_wpm),
      accuracy: s.accuracy,
      active_min: Math.round(s.active_min),
    };
    if ((await kv.get('social_last_sent')) !== s.week) {
      await api('POST', '/stats', body);
      await kv.set('social_last_sent', s.week);
    }
    // The percentile of a finished week is asked once (the server rebuilds it hourly; later is fine).
    let p = null;
    const cached = await kv.get('social_percentile');
    if (cached && cached.startsWith(`${s.week}:`)) p = { percent: Number(cached.split(':')[1]) };
    else if (Date.now() - (Number(await kv.get('social_percentile_at')) || 0) > 6 * 3600 * 1000) {
      await kv.set('social_percentile_at', String(Date.now()));
      p = await api('GET', `/stats/percentile?lang=${body.lang}&week=${s.week}&avg_wpm=${s.avg_wpm}`);
      if (p && p.percent != null) await kv.set('social_percentile', `${s.week}:${p.percent}`);
    }
    // Positive only: below the middle we say nothing (the app already shows the user's own progress).
    if (p && p.percent != null && p.percent >= 50) {
      line.textContent = t('social.percentile', { p: fmt(p.percent), lang: t(`social.lang.${body.lang}`) });
      line.hidden = false;
    }
  }

  async function setStats(on) {
    await kv.set('social_stats_on', on ? '1' : null);
    renderSettings();
    if (on) syncStats().catch(() => note('social.offline'));
    else $('social-percentile').hidden = true;
  }

  async function deleteMyData() {
    const id = await kv.get('social_install_id');
    if (!id) return note('social.deleted');
    try {
      await api('DELETE', `/stats/${id}`);
      await kv.set('social_install_id', null);
      await kv.set('social_last_sent', null);
      note('social.deleted');
    } catch (_) {
      note('social.offline');
    }
  }

  function note(key) {
    const el = $('social-note');
    el.textContent = t(key);
    el.hidden = false;
  }

  async function renderSettings() {
    $('s-social-stats').checked = (await kv.get('social_stats_on')) === '1';
  }

  // --------------------------------------------------------------- leagues

  async function loadLeague() {
    try { league = JSON.parse((await kv.get('social_league')) || 'null'); } catch (_) { league = null; }
  }

  async function saveLeague(l) {
    league = l;
    await kv.set('social_league', l ? JSON.stringify(l) : null);
  }

  function leagueError(e) {
    const known = ['nickname_taken', 'league_full', 'not_found', 'http_429'];
    const code = String(e && e.message);
    $('lf-error').textContent = t(known.includes(code) ? `social.err.${code}` : 'social.offline');
    $('lf-error').hidden = false;
  }

  async function create() {
    $('lf-error').hidden = true;
    const name = $('lf-name').value.trim();
    const nickname = $('lf-nick').value.trim();
    if (!name || !nickname) return;
    try {
      const r = await api('POST', '/leagues', { name, nickname });
      await saveLeague({ code: r.code, name, member_id: r.member_id, member_secret: r.member_secret, nickname });
      lastScoreAt = 0;
      await renderLeague();
    } catch (e) { leagueError(e); }
  }

  async function join() {
    $('lf-error').hidden = true;
    const code = $('lf-code').value.trim().toUpperCase();
    const nickname = $('lf-nick').value.trim();
    if (!code || !nickname) return;
    try {
      const r = await api('POST', `/leagues/${encodeURIComponent(code)}/join`, { nickname });
      await saveLeague({ code, name: '', member_id: r.member_id, member_secret: r.member_secret, nickname });
      lastScoreAt = 0;
      await renderLeague();
    } catch (e) { leagueError(e); }
  }

  async function leave() {
    if (!league) return;
    try {
      await api('DELETE', `/leagues/${league.code}/members/me`, null, league);
    } catch (e) {
      // The board is showing: the join form's error line is hidden, so say it on the board.
      if (!['http_401', 'unauthorized', 'not_found'].includes(String(e.message))) {
        $('lf-offline').hidden = false;
        return;
      }
    }
    await saveLeague(null);
    renderLeague();
  }

  /** Sends this week's XP (league XP: no history or badge XP) at most every half hour. */
  async function pushScore() {
    if (!league || Date.now() - lastScoreAt < SCORE_EVERY_MS) return;
    const l = await invoke('get_league');
    await api('POST', `/leagues/${league.code}/score`, { member_id: league.member_id, member_secret: league.member_secret, week: isoWeek(), xp: Math.min(5600, l.week_xp) });
    lastScoreAt = Date.now();
  }

  async function renderLeague() {
    await loadLeague();
    $('lf-join').hidden = !!league;
    $('lf-board').hidden = !league;
    if (!league) return;
    $('lf-code-show').textContent = league.code;
    try {
      await pushScore();
      const b = await api('GET', `/leagues/${league.code}`, null, league);
      if (b.name && b.name !== league.name) await saveLeague({ ...league, name: b.name });
      $('lf-title').textContent = b.name;
      const ol = $('lf-list');
      ol.replaceChildren();
      for (const m of b.members) {
        const li = document.createElement('li');
        li.toggleAttribute('data-me', m.nickname === league.nickname);
        li.innerHTML = '<span class="lf-nick"></span><span class="lf-up" aria-hidden="true"></span><strong class="lf-xp"></strong>';
        li.querySelector('.lf-nick').textContent = m.nickname;
        li.querySelector('.lf-up').textContent = m.up ? '✨' : '';
        li.querySelector('.lf-xp').textContent = `${fmt(m.xp)} XP`;
        if (m.up) li.title = t('social.improved');
        ol.append(li);
      }
      $('lf-offline').hidden = true;
    } catch (e) {
      // No longer a member (removed, or the league expired): forget it and offer to join again.
      if (['http_401', 'not_found', 'unauthorized'].includes(String(e && e.message))) {
        await saveLeague(null);
        $('lf-join').hidden = false;
        $('lf-board').hidden = true;
        $('lf-error').textContent = t('social.gone');
        $('lf-error').hidden = false;
        return;
      }
      $('lf-offline').hidden = false;
    }
  }

  function bind() {
    $('s-social-stats').addEventListener('change', () => setStats($('s-social-stats').checked).catch(showError));
    $('social-delete').addEventListener('click', () => deleteMyData().catch(showError));
    $('lf-create').addEventListener('click', () => create().catch(showError));
    $('lf-join-btn').addEventListener('click', () => join().catch(showError));
    $('lf-leave').addEventListener('click', () => leave().catch(showError));
    $('lf-copy').addEventListener('click', () => navigator.clipboard.writeText(league ? league.code : '').then(() => note('social.copied')).catch(() => {}));
    $('friends').addEventListener('toggle', () => $('friends').open && renderLeague().catch(showError));
  }

  /** On start and on every refresh of the Today view: cheap when everything is off. */
  async function refresh() {
    await renderSettings();
    syncStats().catch(() => {});
    if ($('friends').open) renderLeague().catch(() => {});
    else {
      await loadLeague();
      if (league) pushScore().catch(() => {});
    }
  }

  return { bind, refresh, isoWeek };
})();
