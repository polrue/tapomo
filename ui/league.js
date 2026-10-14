// League with yourself (0.3.4): this week's XP against your own recent average. You only ever go up
// or stay. The Monday result is shown once, in a small dialog.
const League = (() => {
  const $ = (id) => document.getElementById(id);
  const COLORS = { bronze: '#d99a6c', silver: '#c9d1dc', gold: '#ffcc4d', diamond: '#8fd6f0', legend: '#ff9e7a' };
  let st = null;
  let revealing = false;

  /** A little shield in the league colour; the top league gets a crown. */
  function emblem(league) {
    const c = COLORS[league] || COLORS.bronze;
    const crown = league === 'legend'
      ? '<path d="M21 13 L20 5 L26 9 L32 3 L38 9 L44 5 L43 13 Z" fill="#ffcc4d" stroke="#23202b" stroke-width="2" stroke-linejoin="round"/>'
      : '';
    const gem = league === 'diamond'
      ? '<path d="M32 26 L39 33 L32 44 L25 33 Z" fill="#fff" fill-opacity=".75" stroke="#23202b" stroke-width="1.8" stroke-linejoin="round"/>'
      : '<rect x="24" y="26" width="16" height="15" rx="5" fill="#fff" fill-opacity=".55" stroke="#23202b" stroke-width="1.8"/><circle cx="29" cy="33" r="1.6" fill="#23202b"/><circle cx="35" cy="33" r="1.6" fill="#23202b"/>';
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${crown}<path d="M32 12 L52 19 V33 C52 46 42 54 32 58 C22 54 12 46 12 33 V19 Z" fill="${c}" stroke="#23202b" stroke-width="2.6" stroke-linejoin="round"/><path d="M32 17 L47 22.5 V33 C47 43 40 49.5 32 53" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>${gem}</svg>`;
  }

  const next = (i) => ['bronze', 'silver', 'gold', 'diamond', 'legend'][i + 1];

  function render() {
    const card = $('league');
    card.hidden = !st;
    if (!st) return;
    $('lg-emblem').innerHTML = emblem(st.league);
    $('lg-name').textContent = t('league.name', { league: t(`league.${st.league}`) });
    const bar = $('lg-bar');
    let text;
    if (st.target == null && st.league === 'legend') text = t('league.top');
    else if (st.target == null) text = t('league.first_week', { xp: fmt(st.week_xp) });
    else if (st.week_xp > st.target) text = t('league.on_track', { xp: fmt(st.week_xp), next: t(`league.${next(st.index)}`) });
    else text = t('league.to_go', { xp: fmt(st.week_xp), target: fmt(st.target + 1), next: t(`league.${next(st.index)}`) });
    $('lg-text').textContent = text;
    bar.hidden = st.target == null;
    if (st.target != null) {
      const goal = st.target + 1;
      $('lg-fill').style.width = `${Math.min(100, (st.week_xp / Math.max(1, goal)) * 100).toFixed(1)}%`;
      bar.setAttribute('aria-valuemax', String(goal));
      bar.setAttribute('aria-valuenow', String(Math.min(st.week_xp, goal)));
    }
    $('lg-days').textContent = tn('league.days_left', st.days_left);
    $('lg-letter').onclick = () => WeeklyCard.open(st.last_week).catch(showError);
  }

  async function refresh() {
    st = await invoke('get_league');
    render();
    maybeReveal();
  }

  /** The finished week's result, once (after the level and badge dialogs). */
  function maybeReveal() {
    const busy = ['level-dialog', 'badge-dialog', 'welcome', 'update-dialog', 'weekly-dialog'].some((id) => !$(id).hidden);
    if (!st || !st.result || revealing || busy || document.hidden) return;
    revealing = true;
    const r = st.result;
    $('lgup-emblem').innerHTML = emblem(r.league);
    $('lgup-title').textContent = r.up ? t('league.up.title', { league: t(`league.${r.league}`) }) : t('league.stay.title', { league: t(`league.${r.league}`) });
    $('lgup-text').textContent = t(r.up ? 'league.up.text' : 'league.stay.text', { xp: fmt(r.xp) });
    WeeklyCard.fill($('lgup-letter'), r.week).catch(showError);
    const close = () => {
      $('league-dialog').hidden = true;
      document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
      revealing = false;
      invoke('ack_league', { week: r.week }).then(refresh).catch(showError);
    };
    $('lgup-ok').onclick = close;
    $('league-dialog').onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    $('league-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    $('lgup-ok').focus();
    if (r.up) Mascot.jump($('mascot'), { big: true });
  }

  return { refresh, render, maybeReveal };
})();
