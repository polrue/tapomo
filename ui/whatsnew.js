// «Novedades» card: shown once, the first time the main window is visible after an update (never on a fresh
// install). Rust keeps the pending version (`whats_new_pending` / `whats_new_done`); the texts are the locale
// keys `wn.<version>.<line>.t|d`. A new version only needs an entry in NOTES (and its keys); a version
// without an entry never shows the card.
const WhatsNew = (() => {
  const $ = (id) => document.getElementById(id);
  const RELEASE_PAGE = 'https://github.com/polrue/tapomo/releases/tag/v';

  // line: [icon, key]; `rewards` marks the line that turns into «Ya son tuyos: …» when the user owns them;
  // `hero` is what the little Tapomo at the top wears.
  const NOTES = {
    '1.1.0': {
      hero: ['helice'],
      lines: [
        { ic: '🎯', key: 'goal' },
        { ic: '🎁', key: 'rewards', rewards: true },
        { ic: '🔔', key: 'notify' },
        { ic: '🧔', key: 'hair' },
      ],
    },
  };

  let pending = null; // version waiting for its card
  let open = false;
  let opener = null;

  const key = (v) => `wn.${v.replace(/\./g, '_')}`;
  const isOpen = () => open;
  const blocked = () => document.hidden || open || !$('welcome').hidden || !$('update-dialog').hidden || !$('level-dialog').hidden;

  function close() {
    if (!open) return;
    open = false;
    $('whatsnew-dialog').hidden = true;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    Progress.maybeReveal(); // a level reveal may have waited for the card
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const items = [$('wn-x'), $('wn-ok'), $('wn-all'), $('wn-cap')].filter((b) => b && !b.hidden);
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    }
  }

  let mounted = false;
  function mount() {
    mounted = true;
    $('whatsnew-dialog').addEventListener('keydown', onKey);
    $('wn-x').addEventListener('click', close);
    $('wn-ok').addEventListener('click', close);
    $('wn-cap').addEventListener('click', () => { close(); SectionNav.jump('wardrobe'); });
  }

  function line(v, l, owned) {
    const li = document.createElement('li');
    const ic = document.createElement('span');
    ic.className = 'wn-ic';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = l.ic;
    const tx = document.createElement('span');
    tx.className = 'wn-tx';
    const b = document.createElement('b');
    const showOwned = l.rewards && owned.length;
    b.textContent = showOwned ? t('wn.owned', { items: Progress.joinNames(owned) }) : t(`${key(v)}.${l.key}.t`);
    tx.append(b);
    if (showOwned) {
      const row = document.createElement('span');
      row.className = 'wn-thumbs';
      for (const id of owned) row.append(Progress.thumb({ skin: 'clasico', acc: [id] }, true));
      tx.append(row);
    } else {
      const d = document.createElement('span');
      d.textContent = t(`${key(v)}.${l.key}.d`);
      tx.append(d);
    }
    li.append(ic, tx);
    return li;
  }

  async function show(v, level) {
    const note = NOTES[v];
    if (!mounted) mount();
    opener = document.activeElement;
    const owned = Wardrobe.newRewardsFor(level);
    $('wn-title').textContent = t('wn.title', { v });
    const hero = $('wn-hero');
    hero.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-8 -24 176 192');
    svg.setAttribute('aria-hidden', 'true');
    Mascot.mount(svg);
    Wardrobe.preview(svg, { skin: 'clasico', acc: note.hero });
    Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big', cheeks: true });
    hero.append(svg);
    $('wn-list').replaceChildren(...note.lines.map((l) => line(v, l, owned)));
    $('wn-all').href = RELEASE_PAGE + v;
    $('wn-cap').hidden = !owned.includes('helice');
    Wardrobe.markNewRewardsSeen();
    open = true;
    $('whatsnew-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    $('wn-ok').focus();
    pending = null;
    invoke('whats_new_done').catch(() => {}); // once per update, even if the app dies with the card open
  }

  /** Shows the card if one is pending, the window is visible and nothing else is on screen. Safe to call often. */
  async function maybeShow() {
    if (!pending || blocked()) return;
    // 'replay' (TAPOMO_UPDATE_MOMENT=1): the newest card, so a test build without its own entry still shows one.
    const v = pending === 'replay' ? Object.keys(NOTES).pop() : pending;
    if (!NOTES[v]) { pending = null; invoke('whats_new_done').catch(() => {}); return; }
    pending = null; // no second call while the level is fetched
    try {
      const { level } = await invoke('get_xp');
      Wardrobe.grandfather(level);
      if (blocked()) { pending = v; return; } // something opened meanwhile: next trigger retries
      await show(v, level);
    } catch (_) { pending = v; }
  }

  /** Startup: asks Rust whether this run is the first after an update. */
  async function init() {
    try { pending = await invoke('whats_new_pending'); } catch (_) { pending = null; }
    return maybeShow();
  }

  return { init, maybeShow, isOpen };
})();
