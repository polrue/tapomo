// Optional online features (0.5): anonymous weekly stats and leagues with friends. Both are OFF until
// the user turns them on (stats) or creates/joins a league. Only the numbers shown in Settings ever
// leave the computer, and only to api.tapomo.app. If the server can't be reached, nothing breaks.
const Social = (() => {
  const API = 'https://api.tapomo.app/v1';
  const $ = (id) => document.getElementById(id);
  const SCORE_EVERY_MS = 30 * 60 * 1000;

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

  // The server only knows 'es' and 'en': Catalan typists share the Spanish keyboard, so they count as 'es';
  // French and German (and anything else) count as 'en'.
  const lang = () => (['es', 'ca'].includes(document.documentElement.lang) ? 'es' : 'en');

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
  // Up to MAX_LEAGUES leagues with friends, drawn inside the «Hoy» league card (#lg-friends). Each one has its
  // own nickname. `leagues` is what is stored; everything else here is only memory for the current session.

  const MAX_LEAGUES = 5;
  const BOARD_EVERY_MS = 60 * 1000; // the Today view refreshes often: don't ask the server every time
  const GONE = ['http_401', 'not_found', 'unauthorized'];
  const CODE_ALPHABET = /[^23456789ABCDEFGHJKMNPQRSTVWXYZ]/g; // same alphabet as the server
  let leagues = []; // [{ code, name, member_id, member_secret, nickname }]
  let lastNick = '';
  const boards = new Map(); // code -> { b } (the last board) or { offline: true }
  const scoreAt = new Map(); // code -> when we last sent our XP
  const fetchedAt = new Map(); // code -> when we last asked for the board
  const inflight = new Set();
  const again = new Set(); // codes that asked for a forced refresh while a sync was running
  let loaded = null; // the one-time load from storage: after it `leagues` (in memory) is the source of truth
  let creating = false; // a create/join request is running (a double click must not send two)
  const open = new Set(); // codes whose table is expanded
  let picking = false; // «+ Crear o unirme» is open
  let notice = ''; // e.g. «you are no longer in that league»

  async function saveLeagues() {
    await kv.set('social_leagues', leagues.length ? JSON.stringify(leagues) : null);
  }

  async function loadLeagues() {
    try { leagues = JSON.parse((await kv.get('social_leagues')) || '[]'); } catch (_) { leagues = []; }
    if (!Array.isArray(leagues)) leagues = [];
    // 1.0 kept a single league under another key: move it into the list once.
    const old = await kv.get('social_league');
    if (old) {
      try {
        const o = JSON.parse(old);
        if (o && o.code && !leagues.some((l) => l.code === o.code)) leagues.push(o);
      } catch (_) { /* unreadable: drop it */ }
      await saveLeagues();
      await kv.set('social_league', null);
    }
    leagues = leagues.slice(0, MAX_LEAGUES);
    lastNick = (await kv.get('social_last_nick')) || (leagues.length ? leagues[leagues.length - 1].nickname : '');
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = (text, cls, onClick) => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  const known = ['nickname_taken', 'league_full', 'not_found', 'http_429'];
  const mine = (l, m) => String(m.nickname).toLowerCase() === String(l.nickname).toLowerCase();

  /** Where you stand: { idx, total } (idx is -1 until the board has loaded). */
  function standing(l) {
    const b = (boards.get(l.code) || {}).b;
    if (!b) return null;
    return { idx: b.members.findIndex((m) => mine(l, m)), total: b.members.length, members: b.members };
  }

  function table(l, members, from, to) {
    const ol = el('ol', 'lg-list');
    members.slice(from, to).forEach((m, i) => {
      const me = mine(l, m);
      const li = el('li', me ? 'me' : '');
      li.append(el('span', 'lg-pos', t('social.rank', { n: from + i + 1 })), el('span', 'lg-who', me ? t('social.you') : m.nickname), el('span', 'lg-xp', `${fmt(m.xp)} XP`));
      if (m.up) {
        const up = el('span', 'lg-up', '↑');
        up.setAttribute('aria-label', t('social.improved'));
        up.title = t('social.improved');
        li.append(up);
      }
      ol.append(li);
    });
    return ol;
  }

  function copyButton(l) {
    const b = btn(t('social.copy'), 'lg-btn pill ghost', () => {
      navigator.clipboard.writeText(l.code).then(() => {
        b.textContent = t('social.copied_btn');
        setTimeout(() => { b.textContent = t('social.copy'); }, 1400);
      }).catch(() => {});
    });
    return b;
  }

  /** Full table (or an offline line), the invite code and the way out. */
  function details(l, withTable) {
    const wrap = el('div', 'lg-more');
    const st = standing(l);
    if (withTable && st) wrap.append(table(l, st.members, 0, st.members.length));
    if ((boards.get(l.code) || {}).offline) wrap.append(el('p', 'lg-note', t('social.offline')));
    const code = el('p', 'lg-hint');
    code.append(`${t('social.invite_code')} `, el('strong', 'lg-code', l.code), copyButton(l));
    wrap.append(code, btn(t('social.leave'), 'lg-btn ghost leave', () => leave(l).catch(showError)));
    return wrap;
  }

  /** «🏆 Cole · 3.º de 12»: the name, plus where you stand once the board is known. */
  function title(l) {
    const st = standing(l);
    const name = l.name || l.code;
    return st && st.idx >= 0 ? `🏆 ${name} · ${t('social.pos', { n: st.idx + 1, total: st.total })}` : `🏆 ${name}`;
  }

  function toggle(l) {
    if (open.has(l.code)) open.delete(l.code);
    else open.add(l.code);
    renderLines();
    if (open.has(l.code)) syncOne(l, true).catch(() => {});
  }

  function singleLeague(l, box) {
    const st = standing(l);
    const isOpen = open.has(l.code);
    const wrap = el('div', 'lg-league');
    wrap.append(el('h4', 'lg-lname', title(l)));
    if (st && st.idx >= 0 && !isOpen) wrap.append(table(l, st.members, Math.max(0, st.idx - 1), st.idx + 2));
    else if (st && st.idx < 0 && !isOpen) wrap.append(table(l, st.members, 0, 3));
    if (isOpen ? false : (boards.get(l.code) || {}).offline) wrap.append(el('p', 'lg-note', t('social.offline')));
    const tog = btn(t(isOpen ? 'social.see_less' : 'social.see_all'), 'lg-link', () => toggle(l));
    tog.setAttribute('aria-expanded', String(isOpen));
    wrap.append(tog);
    if (isOpen) wrap.append(details(l, true));
    box.append(wrap);
  }

  function manyLeagues(box) {
    const wrap = el('div', 'lg-league');
    for (const l of leagues) {
      const isOpen = open.has(l.code);
      const row = btn(title(l), 'lg-row', () => toggle(l));
      row.setAttribute('aria-expanded', String(isOpen));
      const st = standing(l);
      if (st && st.idx >= 0 && st.members[st.idx].up) {
        const up = el('span', 'lg-up', '↑');
        up.setAttribute('aria-label', t('social.improved'));
        row.append(up);
      }
      row.append(el('span', 'lg-chev', '›'));
      wrap.append(row);
      if (isOpen) {
        const panel = el('div', 'lg-panel');
        panel.append(details(l, true));
        wrap.append(panel);
      }
    }
    box.append(wrap);
  }

  /** «Crear liga» / «Tengo un código»: each opens its own form (with its own nickname field). */
  function pickButtons() {
    return [
      btn(t('social.create'), 'lg-btn', () => showForm('create')),
      btn(t('social.have_code'), 'lg-btn ghost', () => showForm('join')),
    ];
  }

  function renderLines() {
    const box = $('lg-lines');
    if (!box) return;
    box.replaceChildren();
    if (notice) {
      const n = el('p', 'lg-note', notice);
      n.setAttribute('role', 'status');
      box.append(n);
    }
    if (!leagues.length) {
      const inv = el('div', 'lg-invite');
      inv.append(el('strong', '', `🏆 ${t('social.invite')}`), ...pickButtons());
      box.append(inv);
      return;
    }
    if (leagues.length === 1) singleLeague(leagues[0], box);
    else manyLeagues(box);
    const full = leagues.length >= MAX_LEAGUES;
    const add = el('div', 'lg-league');
    const b = btn(t('social.add', { n: leagues.length, max: MAX_LEAGUES }), 'lg-link', () => {
      picking = !picking;
      if (!picking) $('lg-forms').replaceChildren();
      renderLines();
    });
    b.disabled = full;
    add.append(b);
    if (full) {
      const n = el('p', 'lg-note', t('social.max', { max: MAX_LEAGUES }));
      n.id = 'lg-max';
      b.setAttribute('aria-describedby', 'lg-max');
      add.append(n);
    } else if (picking) {
      const pick = el('div', 'lg-invite');
      pick.append(...pickButtons());
      add.append(pick);
    }
    box.append(add);
  }

  function field(label, input) {
    const l = el('label');
    l.append(el('span', '', label), input);
    return l;
  }
  const input = (max, extra) => {
    const i = el('input');
    i.type = 'text';
    i.maxLength = max;
    i.autocomplete = 'off';
    if (extra) i.spellcheck = false;
    return i;
  };

  /** A pasted «k7m2-qx9p» must not be cut by maxlength before we can clean it: strip first, then cap at 8. */
  function cleanCode(raw) {
    return String(raw).toUpperCase().replace(CODE_ALPHABET, '').slice(0, 8);
  }

  function formError(form, msg) {
    let p = form.querySelector('.lg-error');
    if (!p) {
      p = el('p', 'lg-error');
      p.setAttribute('role', 'alert');
      form.append(p);
    }
    p.textContent = msg;
    p.hidden = false;
  }

  function missing(form, field, key) {
    formError(form, t(key));
    field.focus();
  }

  function showForm(kind) {
    const box = $('lg-forms');
    const was = box.dataset.kind;
    box.replaceChildren();
    delete box.dataset.kind;
    if (was === kind) return; // the same button again closes it
    box.dataset.kind = kind;
    const form = el('div', 'lg-form');
    const nick = input(24);
    nick.value = lastNick;
    if (kind === 'create') {
      const name = input(40);
      const go = btn(t('social.create_go'), 'lg-btn', () => create(form, nick, name, go).catch(showError));
      form.append(field(t('social.nickname'), nick), field(t('social.league_name'), name), go);
      for (const i of [nick, name]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      (lastNick ? name : nick).focus();
    } else {
      const code = input(40, true); // roomy on purpose: see cleanCode
      code.addEventListener('input', () => { const c = cleanCode(code.value); if (c !== code.value) code.value = c; });
      const go = btn(t('social.join'), 'lg-btn', () => join(form, code, nick, go).catch(showError));
      form.append(field(t('social.code'), code), field(t('social.nickname'), nick), go);
      for (const i of [code, nick]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      code.focus();
    }
    form.append(el('p', 'lg-note', t('social.leagues.hint')));
    box.append(form);
  }

  function closeForms() {
    const box = $('lg-forms');
    box.replaceChildren();
    delete box.dataset.kind;
    picking = false;
  }

  async function added(l) {
    leagues.push(l);
    lastNick = l.nickname;
    notice = '';
    open.clear(); // only the new league opens: with several, the compact rows stay compact
    open.add(l.code);
    await kv.set('social_last_nick', l.nickname);
    await saveLeagues();
    closeForms();
    renderLines();
    syncOne(l, true).catch(() => {});
  }

  async function create(form, nickEl, nameEl, go) {
    if (creating) return; // a double click or Enter+click: one request at a time
    const nickname = nickEl.value.trim();
    const name = nameEl.value.trim();
    if (!nickname) return missing(form, nickEl, 'social.need.nickname');
    if (!name) return missing(form, nameEl, 'social.need.name');
    creating = true;
    go.disabled = true;
    try {
      if (leagues.length >= MAX_LEAGUES) return formError(form, t('social.max', { max: MAX_LEAGUES }));
      const r = await api('POST', '/leagues', { name, nickname });
      await added({ code: r.code, name, member_id: r.member_id, member_secret: r.member_secret, nickname });
    } catch (e) { leagueError(form, e); } finally {
      creating = false;
      go.disabled = false;
    }
  }

  async function join(form, codeEl, nickEl, go) {
    if (creating) return;
    const code = cleanCode(codeEl.value);
    const nickname = nickEl.value.trim();
    if (!code) return missing(form, codeEl, 'social.need.code');
    if (!nickname) return missing(form, nickEl, 'social.need.nickname');
    creating = true;
    go.disabled = true;
    try {
      if (leagues.some((l) => l.code === code)) return formError(form, t('social.err.already'));
      if (leagues.length >= MAX_LEAGUES) return formError(form, t('social.max', { max: MAX_LEAGUES }));
      const r = await api('POST', `/leagues/${encodeURIComponent(code)}/join`, { nickname });
      await added({ code, name: '', member_id: r.member_id, member_secret: r.member_secret, nickname });
    } catch (e) { leagueError(form, e); } finally {
      creating = false;
      go.disabled = false;
    }
  }

  function leagueError(form, e) {
    const code = String(e && e.message);
    formError(form, t(known.includes(code) ? `social.err.${code}` : 'social.offline'));
  }

  async function forget(l) {
    leagues = leagues.filter((x) => x.code !== l.code);
    for (const m of [boards, scoreAt, fetchedAt]) m.delete(l.code);
    open.delete(l.code);
    await saveLeagues();
  }

  /** It can't be undone (the nickname and XP are deleted on the server), so ask first. */
  async function leave(l) {
    if (!confirm(t('social.leave.confirm', { name: l.name || l.code }))) return;
    try {
      await api('DELETE', `/leagues/${l.code}/members/me`, null, l);
    } catch (e) {
      if (!GONE.includes(String(e.message))) {
        notice = t('social.offline');
        renderLines();
        return;
      }
    }
    notice = '';
    await forget(l);
    renderLines();
  }

  /** Sends this week's XP (league XP: no history or badge XP) at most every half hour per league. */
  async function pushScore(l) {
    if (Date.now() - (scoreAt.get(l.code) || 0) < SCORE_EVERY_MS) return;
    const st = await invoke('get_league');
    await api('POST', `/leagues/${l.code}/score`, { member_id: l.member_id, member_secret: l.member_secret, week: isoWeek(), xp: Math.min(5600, st.week_xp) });
    scoreAt.set(l.code, Date.now());
  }

  /** One league: send our XP if it is due, then (if shown or forced) fetch its board. A failure only marks that league. */
  async function syncOne(l, force) {
    if (inflight.has(l.code)) {
      if (force) again.add(l.code); // run once more when this one ends, so a freshly opened table fills
      return;
    }
    inflight.add(l.code);
    try {
      try {
        await pushScore(l);
      } catch (e) {
        if (GONE.includes(String(e && e.message))) throw e;
        // e.g. 429: the board below is still worth fetching
      }
      if (!force && (document.hidden || Date.now() - (fetchedAt.get(l.code) || 0) < BOARD_EVERY_MS)) return;
      const b = await api('GET', `/leagues/${l.code}`, null, l);
      fetchedAt.set(l.code, Date.now());
      boards.set(l.code, { b });
      const cur = leagues.find((x) => x.code === l.code); // the entry now in memory (it may have been replaced)
      if (cur && b.name && b.name !== cur.name) {
        cur.name = b.name;
        await saveLeagues();
      }
    } catch (e) {
      if (GONE.includes(String(e && e.message))) {
        // No longer a member (removed, or the league expired): forget it and say so.
        const name = l.name || l.code;
        await forget(l);
        notice = t('social.gone', { name });
      } else {
        boards.set(l.code, { ...(boards.get(l.code) || {}), offline: true }); // keep the last good board
      }
    } finally {
      inflight.delete(l.code);
    }
    renderLines();
    if (again.delete(l.code)) {
      const cur = leagues.find((x) => x.code === l.code);
      if (cur) await syncOne(cur, true);
    }
  }

  async function renderLeagues() {
    if (!loaded) loaded = loadLeagues();
    await loaded;
    renderLines();
    await Promise.all(leagues.map((l) => syncOne(l, false)));
  }

  function bind() {
    $('s-social-stats').addEventListener('change', () => setStats($('s-social-stats').checked).catch(showError));
    $('social-delete').addEventListener('click', () => deleteMyData().catch(showError));
  }

  /** On start and on every refresh of the Today view: cheap when everything is off. */
  async function refresh() {
    await renderSettings();
    syncStats().catch(() => {});
    renderLeagues().catch(() => {});
  }

  return { bind, refresh, isoWeek };
})();
