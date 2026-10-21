// Level, XP, "Retos del día", the wardrobe and the level-up reveal (0.3.2). The XP itself is computed
// by the app (src-tauri/src/xp.rs); this file only shows it. The catalogue of rewards lives in wardrobe.js.
const Progress = (() => {
  const $ = (id) => document.getElementById(id);
  let st = null; // last get_xp answer
  let range = 'today';
  let wardrobeBuilt = false;
  let revealing = false;
  let thumbStyle = null; // style the wardrobe thumbnails were last drawn in

  const itemName = (id) => t(`item.${id}`);
  /** "A and B", "A, B and C": reward packs hold up to three items. */
  const joinNames = (ids) => {
    const n = ids.map(itemName);
    return n.length > 2 ? `${n.slice(0, -1).join(', ')}${t('level.and')}${n[n.length - 1]}` : n.join(t('level.and'));
  };
  const kindOf = (id) => (Wardrobe.ITEMS.find((i) => i.id === id) || {}).kind;
  const levelOf = (id) => (Wardrobe.ITEMS.find((i) => i.id === id) || {}).level || 1;
  /** Locked items say how to get them: a level, or "for supporters". */
  const lockText = (id) => ((Wardrobe.ITEMS.find((i) => i.id === id) || {}).supporter ? t('wd.supporter') : t('wd.locked', { lv: fmt(levelOf(id)) }));

  // ------------------------------------------------------------------ look

  /** What Tapomo wears, from the settings, keeping only what the current level has unlocked. */
  function lookFrom(s, level) {
    const open = new Set(Wardrobe.unlocked(level));
    return {
      skin: open.has(s.skin) ? s.skin : 'clasico',
      acc: (s.accessories || []).filter((a) => open.has(a)),
      style: s.wear_style === 'subtle' ? 'subtle' : 'bold',
      hair: s.hair_color || 'castano',
    };
  }

  function applyLook() {
    if (!st || !settings) return;
    Wardrobe.set(lookFrom(settings, st.level));
    if (wardrobeBuilt) paintWardrobe();
  }

  async function saveLook(look) {
    await saveSettings({ skin: look.skin, accessories: look.acc, wear_style: look.style, hair_color: look.hair || 'castano' });
    applyLook();
  }

  // ------------------------------------------------------------ level card

  function renderLevel() {
    const card = $('level');
    card.hidden = !st;
    if (!st) return;
    const span = Math.max(1, st.next_level_at - st.level_start);
    const into = st.xp - st.level_start;
    $('lv-num').textContent = fmt(st.level);
    $('lv-fill').style.width = `${Math.min(100, (into / span) * 100).toFixed(1)}%`;
    $('lv-xp').textContent = t('level.xp', { xp: fmt(into), next: fmt(span) });
    const bar = $('lv-bar');
    bar.setAttribute('aria-valuemax', String(span));
    bar.setAttribute('aria-valuenow', String(into));
    bar.setAttribute('aria-valuetext', t('level.aria', { lv: fmt(st.level), xp: fmt(into), next: fmt(span) }));
    $('lv-today').hidden = st.today_xp === 0;
    $('lv-today').textContent = t('level.today', { n: fmt(st.today_xp) });
    const next = Wardrobe.nextReward(st.level);
    $('lv-next').textContent = next
      ? t('level.next', { lv: fmt(next.level), items: joinNames(next.ids) })
      : t('level.next_none');
  }

  // ------------------------------------------------------------ challenges

  /** "18:00" in the user's language (en: "06:00 PM"). */
  const clock = (min) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString(document.documentElement.lang, { hour: '2-digit', minute: '2-digit' });

  function challengeText(c) {
    if (c.id === 'beat_avg') return t('ch.beat_avg', { wpm: fmt(c.target) });
    if (c.id === 'early_goal') return t('ch.early_goal', { goal: fmt(c.target), time: clock(c.deadline_min ?? 0) });
    if (c.id === 'long_bursts' || c.id === 'bursts') return tn(`ch.${c.id}`, c.target, { n: fmt(c.target) });
    if (c.id === 'shortcuts') return t('ch.shortcuts', { n: fmt(c.target) });
    if (c.id === 'lesson') return t('ch.lesson');
    if (c.id === 'learnt') return t('ch.learnt');
    return t(`ch.${c.id}`, { n: fmt(c.target) });
  }

  /** Yes/no challenges have no counter; the others show "2 of 3". */
  const counted = (c) => !['beat_avg', 'lesson', 'learnt'].includes(c.id);

  /** A challenge with a deadline that is still open but whose time has run out: lost, no second chance. */
  function expired(c, now = new Date()) {
    return c.deadline_min != null && !c.done && now.getHours() * 60 + now.getMinutes() >= c.deadline_min;
  }

  /** The longer explanation shown when a row is opened, with real numbers. */
  function howText(c) {
    const baseline = { n: fmt(c.target), p: fmt(c.progress), m: fmt(c.progress), goal: fmt(c.target), wpm: fmt(c.target), time: c.deadline_min != null ? clock(c.deadline_min) : '' };
    return t(`ch.${c.id}.how`, baseline);
  }

  /** Where the explanation can send you: [label key, action]. */
  const GO = {
    early_goal: ['ch.go.goal', () => goToSetting('s-goal')],
    lesson: ['ch.go.lessons', () => { window.scrollTo({ top: 0 }); Lessons.open(); }],
    shortcuts: ['ch.go.shortcuts', () => SectionNav.jump('shortcuts')],
    learnt: ['ch.go.shortcuts', () => SectionNav.jump('shortcuts')],
  };

  /** Opens Settings (leaving the lessons view if needed), scrolls to a field and highlights it briefly. */
  function goToSetting(id) {
    if (document.body.dataset.view === 'lessons') Lessons.close();
    SectionNav.jump('settings');
    const el = $(id);
    const target = el.closest('.row, label, div') || el;
    target.classList.add('flash');
    setTimeout(() => { el.focus({ preventScroll: true }); }, Mascot.reduced() ? 0 : 500);
    setTimeout(() => target.classList.remove('flash'), 2600);
  }

  let openChallenge = null; // id of the row whose explanation is open (one at a time)
  let expiryTimer = null;

  function renderChallenges(fresh = []) {
    const card = $('challenges');
    card.hidden = !st || range !== 'today';
    if (card.hidden) return;
    const list = $('ch-list');
    list.replaceChildren();
    clearTimeout(expiryTimer);
    const now = new Date();
    for (const c of st.challenges) {
      const lost = expired(c, now);
      const li = document.createElement('li');
      li.className = 'ch';
      li.toggleAttribute('data-done', c.done);
      li.toggleAttribute('data-expired', lost);
      if (fresh.includes(c.id) && !Mascot.reduced()) li.classList.add('ch-new');
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'ch-head';
      const isOpen = openChallenge === c.id;
      head.setAttribute('aria-expanded', String(isOpen));
      head.setAttribute('aria-controls', `ch-how-${c.id}`);
      const text = document.createElement('span');
      text.className = 'ch-text';
      text.textContent = challengeText(c);
      const meta = document.createElement('span');
      meta.className = 'ch-meta';
      const progressKey = c.id === 'early_goal' ? 'ch.progress_min' : 'ch.progress';
      meta.textContent = c.done ? t('ch.done') : lost ? t('ch.expired') : counted(c) ? t(progressKey, { p: fmt(c.progress), t: fmt(c.target) }) : t('ch.xp');
      const stamp = document.createElement('span');
      stamp.className = 'ch-stamp';
      stamp.setAttribute('aria-hidden', 'true');
      head.append(stamp, text, meta);
      if (counted(c) && !c.done && !lost) {
        const bar = document.createElement('i');
        bar.className = 'ch-bar';
        bar.style.setProperty('--p', `${Math.min(100, (c.progress / Math.max(1, c.target)) * 100)}%`);
        head.append(bar);
      }
      const how = document.createElement('div');
      how.className = 'ch-how';
      how.id = `ch-how-${c.id}`;
      how.hidden = !isOpen;
      const p = document.createElement('p');
      p.textContent = howText(c);
      how.append(p);
      const go = GO[c.id];
      if (go) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ch-go';
        b.textContent = t(go[0]);
        b.addEventListener('click', go[1]);
        how.append(b);
      }
      head.addEventListener('click', () => {
        openChallenge = openChallenge === c.id ? null : c.id;
        list.querySelectorAll('.ch-head').forEach((h) => {
          const on = h.getAttribute('aria-controls') === `ch-how-${openChallenge}`;
          h.setAttribute('aria-expanded', String(on));
          $(h.getAttribute('aria-controls')).hidden = !on;
        });
      });
      li.append(head, how);
      list.append(li);
    }
    // Re-draw the moment an open deadline runs out, so the row turns into «Se acabó el tiempo» by itself.
    const next = st.challenges.filter((c) => c.deadline_min != null && !c.done && !expired(c, now))[0];
    if (next) {
      const ms = ((next.deadline_min - (now.getHours() * 60 + now.getMinutes())) * 60 - now.getSeconds()) * 1000 + 500;
      expiryTimer = setTimeout(() => renderChallenges(), Math.min(ms, 2_000_000_000));
    }
    const full = st.challenges.every((c) => c.done);
    $('ch-full').hidden = !full;
    $('ch-full').textContent = t('ch.full');
  }

  // --------------------------------------------------------------- wardrobe

  /** A still Tapomo wearing `look`. `tight` crops the empty margin (the wardrobe grid). */
  function thumb(look, tight = false) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', tight ? '12 16 136 136' : '0 0 160 160');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('wd-thumb');
    Mascot.mount(svg);
    Wardrobe.preview(svg, look);
    return svg;
  }

  function buildWardrobe() {
    wardrobeBuilt = true;
    for (const kind of ['skin', 'acc']) {
      const grid = $(kind === 'skin' ? 'wd-skins' : 'wd-accs');
      grid.replaceChildren();
      for (const item of Wardrobe.ITEMS.filter((i) => i.kind === kind)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wd-item';
        b.dataset.id = item.id;
        const label = document.createElement('span');
        label.className = 'wd-name';
        const lock = document.createElement('span');
        lock.className = 'wd-lock';
        b.append(thumb({ skin: kind === 'skin' ? item.id : 'clasico', acc: kind === 'acc' ? [item.id] : [] }, true), label, lock);
        b.addEventListener('click', () => onItem(item.id));
        grid.append(b);
      }
    }
    paintWardrobe();
  }

  function paintWardrobe() {
    if (!wardrobeBuilt || !st) return;
    const look = Wardrobe.get();
    const open = new Set(Wardrobe.unlocked(st.level));
    document.querySelectorAll('.wd-item').forEach((b) => {
      const id = b.dataset.id;
      const unlocked = open.has(id);
      const on = kindOf(id) === 'skin' ? look.skin === id : look.acc.includes(id);
      b.disabled = !unlocked;
      b.toggleAttribute('data-locked', !unlocked);
      b.setAttribute('aria-pressed', String(on && unlocked));
      b.querySelector('.wd-name').textContent = unlocked ? itemName(id) : '?';
      b.querySelector('.wd-lock').textContent = unlocked ? (on ? t('wd.wearing') : '') : lockText(id);
      b.setAttribute('aria-label', unlocked ? itemName(id) : lockText(id));
    });
    // Thumbnails follow the chosen style (redrawn only when it changes).
    if (thumbStyle === look.style) return syncStyle(look);
    thumbStyle = look.style;
    document.querySelectorAll('.wd-item').forEach((b) => {
      const id = b.dataset.id;
      const skin = kindOf(id) === 'skin';
      Wardrobe.preview(b.querySelector('.wd-thumb'), { skin: skin ? id : 'clasico', acc: skin ? [] : [id], style: look.style });
    });
    syncStyle(look);
  }

  function syncStyle(look) {
    document.querySelectorAll('input[name="wd-style"]').forEach((r) => (r.checked = r.value === look.style));
    // Hair colour: only once a hairstyle is unlocked.
    const box = $('wd-hair');
    const hairOpen = st && Wardrobe.unlocked(st.level).some((id) => ['flequillo', 'tupe', 'melenita'].includes(id));
    box.hidden = !hairOpen || !Wardrobe.HAIR_COLORS;
    if (box.hidden) return;
    const row = $('wd-hair-row');
    if (!row.childElementCount) {
      for (const c of Wardrobe.HAIR_COLORS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wd-swatch';
        b.dataset.hair = c;
        b.style.setProperty('--sw', Wardrobe.hairSwatch(c));
        b.addEventListener('click', () => saveLook({ ...Wardrobe.get(), hair: c }).catch(showError));
        row.append(b);
      }
    }
    for (const b of row.children) {
      b.setAttribute('aria-pressed', String(b.dataset.hair === (look.hair || 'castano')));
      b.setAttribute('aria-label', t(`wd.hair.${b.dataset.hair}`));
      b.title = t(`wd.hair.${b.dataset.hair}`);
    }
  }

  function onItem(id) {
    const look = Wardrobe.get();
    let removed = [];
    if (kindOf(id) === 'skin') {
      look.skin = id;
    } else if (look.acc.includes(id)) {
      look.acc = look.acc.filter((a) => a !== id);
    } else {
      ({ acc: look.acc, removed } = Wardrobe.wear(look.acc, id));
    }
    const note = $('wd-removed');
    note.hidden = removed.length === 0;
    if (removed.length) note.textContent = t('wd.removed', { items: removed.map(itemName).join(', ') });
    Mascot.jump($('mascot'));
    saveLook(look).catch(showError);
  }

  // ----------------------------------------------------------------- reveal

  /** Rewards unlocked in levels (from, to]. */
  function rewardsBetween(from, to) {
    return Wardrobe.REWARD_LEVELS.filter((lv) => lv > from && lv <= to).flatMap((lv) => Wardrobe.itemsAt(lv));
  }

  const MAX_SHOWN = 4;

  function closeReveal(level) {
    $('level-dialog').hidden = true;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    revealing = false;
    invoke('ack_xp', { level }).then(() => {
      st.seen_level = Math.max(st.seen_level, level);
      Badges.maybeReveal();
      if (level >= 4) setTimeout(() => Support.happyMoment(level * 2), 600); // a level ≥ 4 means a week or more of use
    }).catch(showError);
  }

  /** Shows the level reached (or the history message) once, with its rewards and "put it on" buttons. */
  function maybeReveal() {
    if (!st || revealing || document.hidden || !$('welcome').hidden) return;
    const retro = st.retro_level;
    if (st.level <= st.seen_level && !retro) return;
    revealing = true;
    const from = Math.min(st.seen_level, retro ? 1 : st.seen_level);
    const ids = rewardsBetween(from, st.level);
    $('lvup-title').textContent = retro ? t('lvup.retro.title', { lv: fmt(st.level) }) : t('lvup.title', { lv: fmt(st.level) });
    $('lvup-text').textContent = retro ? t('lvup.retro.text') : ids.length ? t('lvup.rewards') : t('lvup.text');
    const box = $('lvup-items');
    box.replaceChildren();
    const look = Wardrobe.get();
    for (const id of ids.slice(-MAX_SHOWN)) {
      const fig = document.createElement('figure');
      fig.className = 'lvup-item';
      const skin = kindOf(id) === 'skin';
      fig.append(thumb({ skin: skin ? id : look.skin, acc: skin ? look.acc : Wardrobe.wear(look.acc, id).acc, style: look.style }));
      const cap = document.createElement('figcaption');
      cap.textContent = itemName(id);
      const wear = document.createElement('button');
      wear.type = 'button';
      wear.className = 'ghost';
      wear.textContent = t('lvup.wear');
      wear.addEventListener('click', () => {
        const now = Wardrobe.get();
        if (skin) now.skin = id;
        else now.acc = Wardrobe.wear(now.acc, id).acc;
        saveLook(now).catch(showError);
        wear.textContent = t('lvup.worn');
        wear.disabled = true;
      });
      fig.append(cap, wear);
      box.append(fig);
    }
    $('lvup-more').hidden = ids.length <= MAX_SHOWN;
    $('lvup-more').textContent = t('lvup.more', { n: fmt(ids.length - MAX_SHOWN) });
    const next = Wardrobe.nextReward(st.level);
    $('lvup-next').hidden = ids.length > 0 || !next;
    if (next) $('lvup-next').textContent = t('level.next', { lv: fmt(next.level), items: joinNames(next.ids) });
    $('level-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    const level = st.level;
    $('lvup-ok').onclick = () => closeReveal(level);
    $('level-dialog').onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeReveal(level); } };
    $('lvup-ok').focus();
    Mascot.jump($('mascot'), { big: true });
  }

  // ------------------------------------------------------------------- api

  async function refresh(r = range) {
    range = r;
    st = await invoke('get_xp');
    Wardrobe.grandfather(st.level);
    applyLook();
    renderLevel();
    renderChallenges();
    paintWardrobe();
    maybeReveal();
  }

  /** `tapomo://xp`: XP changed; a level-up opens the reveal, a finished challenge gets its stamp. */
  async function onXp(p) {
    st = await invoke('get_xp');
    Wardrobe.grandfather(st.level);
    League.refresh().catch(showError);
    applyLook();
    renderLevel();
    renderChallenges(p.challenges || []);
    paintWardrobe();
    if ((p.badges || []).length) await Badges.refresh();
    if (p.level > p.prev_level) maybeReveal();
    else if ((p.challenges || []).length) Mascot.jump($('mascot'));
  }

  function bind() {
    $('wardrobe').addEventListener('toggle', () => {
      if ($('wardrobe').open && !wardrobeBuilt) buildWardrobe();
    });
    document.querySelectorAll('input[name="wd-style"]').forEach((r) =>
      r.addEventListener('change', () => r.checked && saveLook({ ...Wardrobe.get(), style: r.value }).catch(showError))
    );
  }

  /** Language changed: redraw the texts. */
  function relabel() {
    renderLevel();
    renderChallenges();
    paintWardrobe();
  }

  return { refresh, onXp, bind, relabel, applyLook, maybeReveal };
})();
