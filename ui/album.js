// Shortcut trainer, phase B (0.4.3): the tip of the day and the album of shortcuts. Levels come only
// from using a shortcut on different days; "Ya lo sé" just stops suggesting it.
const Album = (() => {
  const $ = (id) => document.getElementById(id);
  const LEVELS = ['undiscovered', 'learning', 'getting', 'almost', 'mastered'];
  let built = false;

  // The catalogue only has Spanish and English text; Catalan users get Spanish (same keyboard and Office labels),
  // French and German users get English.
  const lang = () => (['es', 'ca'].includes(document.documentElement.lang) ? 'es' : 'en');

  async function refreshTip(range = 'today') {
    const card = $('sc-tip');
    if (!settings || !settings.count_shortcuts || !settings.shortcut_tips || range !== 'today') {
      card.hidden = true;
      return;
    }
    const tip = await invoke('get_shortcut_tip', { lang: lang() });
    card.hidden = !tip;
    if (!tip) return;
    $('sc-tip-keys').textContent = tip.label;
    $('sc-tip-text').textContent = tip.app ? t('album.tip_in', { app: tip.app, text: tip.text }) : tip.text;
    $('sc-tip-known').onclick = async () => {
      await invoke('mark_shortcut_known', { id: tip.id }).catch(showError);
      card.hidden = true;
    };
    $('sc-tip-ok').onclick = () => (card.hidden = true);
  }

  async function renderAlbum() {
    const items = await invoke('get_shortcut_album', { lang: lang() });
    const known = items.filter((i) => i.level > 0).length;
    $('al-count').textContent = known ? tn('album.count', known, { n: fmt(known), total: fmt(items.length) }) : t('album.none');
    const grid = $('al-grid');
    grid.replaceChildren();
    for (const cat of ['edit', 'windows', 'browser', 'files', 'code', 'design', 'chat'].filter((c) => items.some((i) => i.category === c))) {
      const h = document.createElement('h3');
      h.textContent = t(`album.cat.${cat}`);
      const ul = document.createElement('ul');
      ul.className = 'al-list';
      for (const i of items.filter((x) => x.category === cat).sort((a, b) => b.level - a.level)) {
        const li = document.createElement('li');
        li.className = 'al-item';
        li.dataset.level = String(i.level);
        const k = document.createElement('kbd');
        k.textContent = i.label;
        const txt = document.createElement('span');
        txt.className = 'al-text';
        txt.textContent = i.text;
        const lv = document.createElement('span');
        lv.className = 'al-level';
        lv.textContent = i.level ? t(`album.level.${LEVELS[i.level]}`) : t('album.level.undiscovered');
        const dots = document.createElement('span');
        dots.className = 'al-dots';
        dots.setAttribute('aria-hidden', 'true');
        dots.innerHTML = [1, 2, 3, 4].map((n) => `<i class="${n <= i.level ? 'on' : ''}"></i>`).join('');
        li.append(k, txt, lv, dots);
        ul.append(li);
      }
      grid.append(h, ul);
    }
  }

  function bind() {
    $('album').addEventListener('toggle', () => {
      if ($('album').open) renderAlbum().catch(showError);
      built = true;
    });
  }

  /** `tapomo://shortcut-learnt`: refresh the album if it is open. */
  function onUsed() {
    if (built && $('album').open) renderAlbum().catch(showError);
  }

  return { bind, refreshTip, renderAlbum, onUsed };
})();
