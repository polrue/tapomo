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

  let allOpen = false; // the folded "all done" list in the level card is open
  let cardWasHidden = null;

  /** One row per challenge into `list` (shared by the card and the folded list). */
  function fillChallenges(list, fresh, now) {
    list.replaceChildren();
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
  }

  /**
   * While something is pending: the big card. Once all of today's are done it folds into one line in
   * the level card («✓ Retos del día completados · 3 de 3») that opens the same list again.
   */
  function renderChallenges(fresh = []) {
    clearTimeout(expiryTimer);
    const today = !!st && range === 'today';
    const all = today && st.challenges.length > 0 && st.challenges.every((c) => c.done);
    const card = $('challenges');
    card.hidden = !today || all;
    $('lv-ch').hidden = !all;
    if (cardWasHidden !== card.hidden) {
      cardWasHidden = card.hidden;
      if (typeof SectionNav !== 'undefined') SectionNav.render(); // the chip follows the card
    }
    if (!today) return;
    const now = new Date();
    fillChallenges(all ? $('lv-ch-list') : $('ch-list'), fresh, now);
    if (all) {
      const n = st.challenges.length;
      $('lv-ch-text').textContent = t('ch.all_done', { n: fmt(n) });
      $('ch-full').textContent = t('ch.full');
      $('lv-ch-toggle').setAttribute('aria-expanded', String(allOpen));
      $('lv-ch-list-wrap').hidden = !allOpen;
    }
    renderAsk(all);
    // Re-draw the moment an open deadline runs out, so the row turns into «Se acabó el tiempo» by itself.
    const next = st.challenges.filter((c) => c.deadline_min != null && !c.done && !expired(c, now))[0];
    if (next) {
      const ms = ((next.deadline_min - (now.getHours() * 60 + now.getMinutes())) * 60 - now.getSeconds()) * 1000 + 500;
      expiryTimer = setTimeout(() => renderChallenges(), Math.min(ms, 2_000_000_000));
    }
  }

  /** The one-time question about Windows notifications, once a first challenge is done. */
  function renderAsk(all) {
    const ask = $('ch-ask');
    const due = typeof settings !== 'undefined' && settings && !settings.notify_asked && !settings.notify_challenges && st.challenges.some((c) => c.done);
    ask.hidden = !due;
    if (!due) return;
    const host = all ? $('lv-ch') : $('challenges');
    if (ask.parentElement !== host) host.append(ask);
  }

  function answerAsk(yes) {
    saveSettings({ notify_asked: true, ...(yes ? { notify_challenges: true } : {}) })
      .then(() => { renderChallenges(); if (typeof renderSettings === 'function') renderSettings(); })
      .catch(showError);
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
  // 0.9: a level that brings rewards opens the dialog (Tapomo on a stage, already wearing the reward as a
  // preview, confetti once, golden rays on levels 10, 25 and 50). A level without rewards, or any level
  // reached while the window is visible but not focused (you're typing elsewhere), gets a corner card that
  // never takes the focus. While the window is hidden nothing shows: showing it fires visibilitychange ->
  // refreshAll -> refresh() -> maybeReveal(), so the reveal simply waits for the window.

  /** Rewards unlocked in levels (from, to]. */
  function rewardsBetween(from, to) {
    return Wardrobe.REWARD_LEVELS.filter((lv) => lv > from && lv <= to).flatMap((lv) => Wardrobe.itemsAt(lv));
  }

  const MAX_SHOWN = 4;
  const ROUND_LEVELS = new Set([10, 25, 50]);
  const CONFETTI = ['#ff9e7a', '#ffc93c', '#74d6bf', '#8ccbf0', '#c4a8f0', '#f0764a'];
  const fullDialogOpen = () => !$('level-dialog').hidden;
  const toastOpen = () => !!$('level-toast').firstChild;
  let onToastKey = null;

  /** The current look with `id` on (the same rules as wearing it from the wardrobe). */
  function lookWith(id) {
    const look = Wardrobe.get();
    return kindOf(id) === 'skin' ? { ...look, skin: id } : { ...look, acc: Wardrobe.wear(look.acc, id).acc };
  }
  function putOn(id) {
    const now = Wardrobe.get();
    if (kindOf(id) === 'skin') now.skin = id;
    else now.acc = Wardrobe.wear(now.acc, id).acc;
    saveLook(now).catch(showError);
  }
  /** "1.197 XP to level 11" and how full the bar of the new level is. */
  function xpInfo() {
    const span = Math.max(1, st.next_level_at - st.level_start);
    const into = Math.max(0, st.xp - st.level_start);
    return { pct: Math.min(100, (into / span) * 100), text: t('lvup.next_xp', { n: fmt(Math.max(0, span - into)), lv: fmt(st.level + 1) }) };
  }
  const worn = () => {
    const tick = document.createElement('span');
    tick.setAttribute('aria-hidden', 'true');
    tick.textContent = '✓ ';
    return [tick, t('lvup.worn')];
  };
  function wearButton(id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t('lvup.wear');
    b.addEventListener('click', () => {
      putOn(id);
      b.replaceChildren(...worn());
      b.disabled = true;
    });
    return b;
  }

  /** Marks the level as seen, then lets the next reveals (badges, the support note) have their turn. */
  function acknowledge(level) {
    revealing = false;
    invoke('ack_xp', { level }).then(() => {
      st.seen_level = Math.max(st.seen_level, level);
      Badges.maybeReveal();
      if (level >= 4) setTimeout(() => Support.happyMoment(level * 2), 600); // a level ≥ 4 means a week or more of use
    }).catch(showError);
  }

  function closeReveal(level) {
    $('level-dialog').hidden = true;
    $('lvb-confetti').replaceChildren();
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    acknowledge(level);
  }

  function confetti() {
    const box = $('lvb-confetti');
    box.replaceChildren();
    if (Mascot.reduced()) return;
    for (let i = 0; i < 22; i++) {
      const c = document.createElement('i');
      if (i % 4 === 3) c.className = 'dot';
      c.style.cssText = `--x:${(4 + Math.random() * 92).toFixed(1)}%;--s:${6 + Math.round(Math.random() * 5)}px;--c:${CONFETTI[i % CONFETTI.length]};`
        + `--d:${(1500 + Math.random() * 1100) | 0}ms;--w:${(150 + Math.random() * 500) | 0}ms;--dx:${((Math.random() - 0.5) * 60) | 0}px;--r:${((Math.random() - 0.5) * 720) | 0}deg`;
      box.append(c);
    }
  }

  /** The big reveal: one reward previewed on Tapomo, or (several at once / history) a row per reward. */
  function showDialog(ids, retro) {
    const level = st.level;
    const one = !retro && ids.length === 1 ? ids[0] : null;
    const card = $('level-dialog').querySelector('.lvb');
    card.classList.toggle('lvb-many', !one);
    $('lvb-stage').classList.toggle('lvb-round', !retro && ROUND_LEVELS.has(level));
    $('lvb-pill').textContent = `${t('level.title')} ${fmt(level)}`;
    const hero = $('lvb-hero');
    if (!hero.classList.contains('mascot')) Mascot.mount(hero);
    Wardrobe.preview(hero, one ? lookWith(one) : Wardrobe.get());
    Mascot.setFace(hero, { eyes: 'sparkle', mouth: 'big', cheeks: true });
    $('lvb-tag').hidden = !one;
    $('lvup-title').textContent = retro ? t('lvup.retro.title', { lv: fmt(level) }) : t('lvup.title', { lv: fmt(level) });
    const text = $('lvup-text');
    if (retro) text.textContent = t('lvup.retro.text');
    else if (one) {
      const [before, after = ''] = t('lvup.new', { item: '\u0000' }).split('\u0000');
      const name = document.createElement('strong');
      name.textContent = itemName(one);
      text.replaceChildren(before, name, after);
    } else text.textContent = t('lvup.rewards');
    const box = $('lvup-items');
    box.replaceChildren();
    box.hidden = !!one;
    if (!one) {
      for (const id of ids.slice(-MAX_SHOWN)) {
        const fig = document.createElement('figure');
        fig.className = 'lvup-item';
        const pic = document.createElement('div');
        pic.className = 'lvb-thumb';
        pic.append(thumb(lookWith(id), true));
        const cap = document.createElement('figcaption');
        cap.textContent = itemName(id);
        fig.append(pic, cap, wearButton(id));
        box.append(fig);
      }
    }
    $('lvup-more').hidden = !!one || ids.length <= MAX_SHOWN;
    $('lvup-more').textContent = t('lvup.more', { n: fmt(ids.length - MAX_SHOWN) });
    const xp = xpInfo();
    $('lvb-fill').style.width = '0';
    $('lvb-xp').textContent = xp.text;

    const ok = $('lvup-ok');
    const later = $('lvup-later');
    ok.disabled = false;
    later.hidden = !one;
    if (one) {
      ok.textContent = t('lvup.wear');
      later.textContent = t('lvup.later');
      ok.onclick = () => {
        putOn(one);
        ok.replaceChildren(...worn());
        ok.disabled = true;
        later.textContent = t('lvup.close');
        later.focus();
        Mascot.jump(hero, { big: false });
      };
      later.onclick = () => closeReveal(level);
    } else {
      ok.textContent = t('lvup.ok');
      ok.onclick = () => closeReveal(level);
    }
    $('lvup-x').onclick = () => closeReveal(level);
    confetti();
    $('level-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    $('level-dialog').onkeydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeReveal(level); return; }
      if (e.key !== 'Tab') return; // keep Tab inside: a few controls live outside .top/main
      const f = [...card.querySelectorAll('button:not([disabled])')].filter((n) => !n.hidden);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    ok.focus();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('lvb-fill').style.width = `${xp.pct.toFixed(1)}%`;
      setTimeout(() => { if (fullDialogOpen()) Mascot.jump(hero, { big: true }); }, 250);
    }));
  }

  function closeToast(level) {
    $('level-toast').replaceChildren(); // a focused button inside leaves the focus on <body>
    document.removeEventListener('keydown', onToastKey, true);
    onToastKey = null;
    acknowledge(level);
  }

  /** The corner card: no veil, no focus taken, read out by screen readers (role="status"). */
  function showToast(ids, retro) {
    const level = st.level;
    const one = ids.length === 1 ? ids[0] : null;
    const make = (tag, cls, txt) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt !== undefined) n.textContent = txt;
      return n;
    };
    const card = make('div', 'lvt');
    const pic = make('div', 'lvt-pic');
    pic.append(thumb(one ? lookWith(one) : Wardrobe.get(), true));
    const body = make('div', 'lvt-body');
    const title = retro ? t('lvup.retro.title', { lv: fmt(level) }) : t('lvup.title', { lv: fmt(level) });
    if (ids.length) {
      body.append(make('p', 'lvt-eyebrow', title), make('h2', '', one ? t('lvup.toast.new', { item: itemName(one) }) : t('lvup.toast.many', { n: fmt(ids.length) })));
    } else {
      const next = Wardrobe.nextReward(level);
      body.append(make('h2', '', title), make('p', 'lvt-text', retro ? t('lvup.retro.text') : next ? t('level.next', { lv: fmt(next.level), items: joinNames(next.ids) }) : t('level.next_none')));
    }
    const xp = xpInfo();
    const bar = make('div', 'lvt-bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = make('i');
    bar.append(fill);
    body.append(bar, make('p', 'lvt-xp', xp.text));
    const x = make('button', 'lvt-x');
    x.type = 'button';
    x.setAttribute('aria-label', t('lvup.close'));
    x.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    x.addEventListener('click', () => closeToast(level));
    const nav = make('div', 'lvt-nav');
    const look = make('button', 'ghost', t('lvup.wardrobe'));
    look.type = 'button';
    look.addEventListener('click', () => {
      closeToast(level);
      if (document.body.dataset.view === 'lessons') Lessons.close();
      SectionNav.jump('wardrobe');
    });
    nav.append(look);
    if (one) nav.append(wearButton(one));
    card.append(x, pic, body, nav);
    $('level-toast').replaceChildren(card); // new content in the live region: announced, focus untouched
    onToastKey = (e) => {
      if (e.key !== 'Escape' || fullDialogOpen()) return;
      const a = document.activeElement;
      if (a && a !== document.body && !card.contains(a)) return; // Esc belongs to whatever has the focus
      e.preventDefault();
      closeToast(level);
    };
    document.addEventListener('keydown', onToastKey, true);
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${xp.pct.toFixed(1)}%`)));
    Mascot.jump($('mascot'), { big: true });
  }

  /** Shows the level reached (or the history message) once, with its rewards and "put it on" buttons. */
  function maybeReveal() {
    if (!st || revealing || toastOpen() || document.hidden || !$('welcome').hidden) return;
    const retro = st.retro_level;
    if (st.level <= st.seen_level && !retro) return;
    revealing = true;
    const from = Math.min(st.seen_level, retro ? 1 : st.seen_level);
    const ids = rewardsBetween(from, st.level);
    if (ids.length && document.hasFocus()) showDialog(ids, retro);
    else showToast(ids, retro);
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
    $('lv-ch-toggle').addEventListener('click', () => {
      allOpen = !allOpen;
      $('lv-ch-toggle').setAttribute('aria-expanded', String(allOpen));
      $('lv-ch-list-wrap').hidden = !allOpen;
    });
    $('ch-ask-yes').addEventListener('click', () => answerAsk(true));
    $('ch-ask-no').addEventListener('click', () => answerAsk(false));
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
