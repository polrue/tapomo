// Weekly card (0.3.5): the best of last week, inside the Monday league dialog and on demand from the
// league card. Positive facts only: anything zero or missing is simply left out.
const WeeklyCard = (() => {
  const $ = (id) => document.getElementById(id);
  const CHARS_PER_PAGE = 1800;

  function line(icon, text) {
    const li = document.createElement('li');
    const i = document.createElement('span');
    i.className = 'wk-icon';
    i.setAttribute('aria-hidden', 'true');
    i.textContent = icon;
    const s = document.createElement('span');
    s.textContent = text;
    li.append(i, s);
    return li;
  }

  /** Fills `el` with the card of the week starting on Monday `week`. Resolves to false if it was empty. */
  async function fill(el, week, title = true) {
    const l = await invoke('get_weekly_letter', { week });
    el.replaceChildren();
    if (!l.days_typed) return false;
    const h = document.createElement('h3');
    h.textContent = t('weekly.title');
    const ul = document.createElement('ul');
    ul.className = 'wk-list';
    const pages = Math.round(l.chars / CHARS_PER_PAGE);
    ul.append(line('⌨️', tn('weekly.typed', l.days_typed, { n: fmt(l.days_typed), min: fmt(Math.round(l.active_ms / 60000)) })));
    if (pages >= 1) ul.append(line('📄', tn('weekly.pages', pages, { n: fmt(pages), chars: fmt(l.chars) })));
    if (l.goal_days) ul.append(line('🎯', tn('weekly.goal', l.goal_days, { n: fmt(l.goal_days) })));
    if (l.best_peak) ul.append(line('⚡', t(l.peak_record ? 'weekly.peak_record' : 'weekly.peak', { wpm: fmt(l.best_peak) })));
    if (l.best_hour) ul.append(line('🕘', t('weekly.hour', { h: String(l.best_hour[0]).padStart(2, '0'), wpm: fmt(l.best_hour[1]) })));
    if (l.top_app) ul.append(line('🗂️', t('weekly.app', { app: l.top_app.replace(/\.exe$/i, '') })));
    if (l.best_clean_run >= 50) ul.append(line('✨', t('weekly.clean', { n: fmt(l.best_clean_run) })));
    if (l.challenges_done) ul.append(line('🏅', tn('weekly.challenges', l.challenges_done, { n: fmt(l.challenges_done), full: fmt(l.full_houses) })));
    if (l.badges.length) ul.append(line('🎖️', t('weekly.badges', { list: l.badges.map((b) => t(`badge.${b}`)).join(', ') })));
    if (title) el.append(h);
    el.append(ul);
    return true;
  }

  /** "Ver la carta de la semana pasada" from the league card. */
  async function open(week) {
    const box = $('wk-dialog-body');
    const ok = await fill(box, week, false);
    if (!ok) {
      box.replaceChildren(Object.assign(document.createElement('p'), { textContent: t('weekly.empty') }));
    }
    const close = () => {
      $('weekly-dialog').hidden = true;
      document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    };
    $('wk-ok').onclick = close;
    $('weekly-dialog').onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    $('weekly-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    $('wk-ok').focus();
  }

  return { fill, open };
})();
