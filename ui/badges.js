// Badges card and the "new badge" reveal (0.3.3). The app decides what is earned (src-tauri/src/badges.rs);
// the medals are drawn by badges-art.js. Tone: earned badges in colour, pending ones as soft silhouettes
// with a friendly hint, never a cold "0 of 18".
const Badges = (() => {
  const $ = (id) => document.getElementById(id);
  let list = [];
  let revealing = false;

  const name = (id) => t(`badge.${id}`);
  const dateOf = (ms) => new Date(ms).toLocaleDateString(document.documentElement.lang, { day: 'numeric', month: 'long', year: 'numeric' });
  /** Badges whose hint shows "have of need" (counts, not yes/no). */
  const counted = (b) => b.need > 1;

  function render() {
    const earned = list.filter((b) => b.earned_ms != null).sort((a, b) => b.earned_ms - a.earned_ms);
    const pending = list.filter((b) => b.earned_ms == null).sort((a, b) => b.have / b.need - a.have / a.need);
    $('bd-count').textContent = earned.length ? tn('badges.count', earned.length, { n: fmt(earned.length) }) : t('badges.none');
    const grid = $('bd-grid');
    grid.replaceChildren();
    for (const b of [...earned, ...pending]) {
      const got = b.earned_ms != null;
      const li = document.createElement('li');
      li.className = 'bd';
      li.toggleAttribute('data-earned', got);
      li.toggleAttribute('data-new', got && b.unseen);
      const art = document.createElement('span');
      art.className = 'bd-art';
      art.innerHTML = BadgeArt.medal(b.id, b.rarity, got);
      const title = document.createElement('strong');
      title.textContent = name(b.id);
      const sub = document.createElement('span');
      sub.className = 'bd-sub';
      if (got) {
        sub.textContent = t(`badges.rarity.${b.rarity}`);
        li.title = t('badges.earned_on', { date: dateOf(b.earned_ms) });
      } else {
        sub.textContent = t(`badge.${b.id}.hint`);
        if (counted(b) && b.have > 0) {
          const p = document.createElement('span');
          p.className = 'bd-progress';
          p.textContent = t('ch.progress', { p: fmt(b.have), t: fmt(b.need) });
          sub.append(document.createElement('br'), p);
        }
      }
      li.setAttribute('aria-label', `${name(b.id)}. ${got ? t('badges.earned_on', { date: dateOf(b.earned_ms) }) : sub.textContent}`);
      li.append(art, title, sub);
      grid.append(li);
    }
  }

  async function refresh() {
    list = await invoke('get_badges');
    render();
    maybeReveal();
  }

  /** Unseen badges get one small dialog (the history ones together), after any level reveal. */
  function maybeReveal() {
    const unseen = list.filter((b) => b.unseen);
    const busy = !$('level-dialog').hidden || !$('welcome').hidden || !$('update-dialog').hidden;
    if (!unseen.length || revealing || busy || document.hidden) return;
    revealing = true;
    const retro = unseen.every((b) => b.retro);
    $('bdup-title').textContent = retro ? tn('badges.retro.title', unseen.length, { n: fmt(unseen.length) }) : tn('badges.new.title', unseen.length);
    $('bdup-text').textContent = retro ? t('badges.retro.text') : '';
    $('bdup-text').hidden = !retro;
    const box = $('bdup-items');
    box.replaceChildren();
    for (const b of unseen.slice(0, 6)) {
      const fig = document.createElement('figure');
      fig.className = 'bdup-item';
      const art = document.createElement('span');
      art.className = 'bd-art';
      art.innerHTML = BadgeArt.medal(b.id, b.rarity, true);
      const cap = document.createElement('figcaption');
      cap.textContent = name(b.id);
      const xp = document.createElement('small');
      xp.textContent = t('badges.xp', { n: fmt(b.xp) });
      fig.append(art, cap, xp);
      box.append(fig);
    }
    $('bdup-more').hidden = unseen.length <= 6;
    $('bdup-more').textContent = t('badges.more', { n: fmt(unseen.length - 6) });
    const close = () => {
      $('badge-dialog').hidden = true;
      document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
      revealing = false;
      invoke('mark_badges_seen').then(refresh).then(() => League.maybeReveal()).catch(showError);
    };
    $('bdup-ok').onclick = close;
    $('badge-dialog').onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    $('badge-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    $('bdup-ok').focus();
    Mascot.jump($('mascot'), { big: true });
  }

  return { refresh, render, maybeReveal };
})();
