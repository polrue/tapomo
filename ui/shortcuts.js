// "Atajos hoy" (0.3.6): today's shortcuts by kind. Tapomo never knows which shortcut it was: the
// keyboard hook reduces each one to a kind and drops the key.
const Shortcuts = (() => {
  const $ = (id) => document.getElementById(id);
  const ICONS = { clipboard: '📋', undo: '↩️', save: '💾', windows: '🪟', other: '⚡' };
  let range = 'today';
  let timer = null;

  async function refresh(r = range) {
    range = r;
    const s = await invoke('get_shortcuts');
    const card = $('shortcuts');
    card.hidden = range !== 'today' || !s.enabled;
    if (card.hidden) return;
    $('sc-total').textContent = fmt(s.total);
    $('sc-line').textContent = s.total ? tn('shortcuts.today', s.total, { n: fmt(s.total) }) : t('shortcuts.none');
    const ul = $('sc-kinds');
    ul.replaceChildren();
    for (const [id, n] of s.kinds) {
      if (!n) continue;
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = `${ICONS[id] || ''} ${t(`shortcuts.kind.${id}`)} · ${fmt(n)}`;
      ul.append(li);
    }
  }

  /** `tapomo://shortcut`: refresh soon (a burst of Alt+Tab does not hammer the database). */
  function bump() {
    clearTimeout(timer);
    timer = setTimeout(() => refresh().catch(showError), 500);
  }

  return { refresh, bump };
})();
