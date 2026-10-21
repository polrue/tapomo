// Sticky header + section bar (0.7.0): the main window is long, so the header (Tapomo, Lessons and the
// range tabs) stays on top, a little smaller once you scroll, and a bar of chips jumps to any card.
// Only cards that are visible right now get a chip; the one you're looking at is highlighted.
const SectionNav = (() => {
  const $ = (id) => document.getElementById(id);
  // [element id, i18n key of its chip]
  const SECTIONS = [
    ['live', 'nav.live'], ['goal', 'goal.title'], ['level', 'nav.level'], ['league', 'nav.league'], ['challenges', 'ch.title'],
    ['shortcuts', 'nav.shortcuts'], ['data', 'nav.stats'], ['records', 'records.title'], ['badges', 'badges.title'],
    ['album', 'album.title'], ['friends', 'social.leagues'], ['wardrobe', 'wd.title'], ['support', 'support.title'],
    ['settings', 'settings.title'],
  ];
  let current = null;
  let shown = [];

  const visible = (el) => el && !el.hidden && el.offsetParent !== null;

  function render() {
    if (!document.body.classList.contains('scrolled')) syncOffset(); // labels may have changed its height
    const bar = $('section-nav');
    const list = $('sn-list');
    const lessons = document.body.dataset.view === 'lessons';
    bar.hidden = lessons;
    list.replaceChildren();
    shown = [];
    if (lessons) return;
    // Chips follow the page's own order, so the highlight and the bar always agree.
    shown = SECTIONS.filter(([id]) => visible($(id)))
      .sort(([a], [b]) => ($(a).compareDocumentPosition($(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const [id, key] of shown) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${id}`;
      a.textContent = t(key);
      a.dataset.target = id;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        jump(id);
      });
      li.append(a);
      list.append(li);
    }
    highlight();
  }

  /** Scrolls so the card's top sits just under the header (compact, unless it's the first card). */
  function jump(id) {
    const el = $(id);
    if (el.tagName === 'DETAILS') el.open = true; // wardrobe, album and leagues open when you jump to them
    const wasCompact = document.body.classList.contains('scrolled');
    // Measure the header as it will be where we land (compact), without waiting for its transition.
    document.body.classList.add('nav-measure');
    setCompact(true);
    const target = window.scrollY + el.getBoundingClientRect().top - headerHeight() - 10;
    if (!wasCompact) setCompact(false);
    void document.body.offsetHeight; // apply without animating, then let transitions run again
    document.body.classList.remove('nav-measure');
    const top = target <= COMPACT_AT ? 0 : target;
    window.scrollTo({ top, behavior: Mascot.reduced() ? 'auto' : 'smooth' });
    mark(id);
    locked = id; // keep this chip lit while the smooth scroll runs
    clearTimeout(jump.timer);
    jump.timer = setTimeout(() => { locked = null; highlight(); }, 700);
  }

  let locked = null;

  /** The card whose top is nearest above the header's bottom edge (the last one at the very bottom). */
  function highlight() {
    if (locked || !shown.length) return;
    const line = headerHeight() + 40;
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    let pick = shown[0][0];
    if (atBottom) pick = shown[shown.length - 1][0];
    else for (const [id] of shown) if ($(id).getBoundingClientRect().top <= line) pick = id;
    mark(pick);
  }

  function mark(id) {
    current = id;
    document.querySelectorAll('#sn-list a').forEach((a) => {
      const on = a.dataset.target === id;
      a.toggleAttribute('aria-current', on);
      if (on) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function headerHeight() {
    return Math.round($('sticky-head').getBoundingClientRect().height);
  }

  /**
   * The header is fixed on top and the page reserves the height of the FULL header, so shrinking it
   * never moves the content (no jump while scrolling). `--head-h` is the current height, for offsets.
   */
  function syncOffset() {
    const root = document.documentElement.style;
    root.setProperty('--head-h', `${headerHeight()}px`);
    if (!document.body.classList.contains('scrolled')) root.setProperty('--head-full', `${headerHeight()}px`);
  }

  // Compact past 40 px, full again under 10 px: the gap stops the header flickering between sizes.
  const COMPACT_AT = 40;
  const EXPAND_AT = 10;
  function setCompact(on) {
    if (on === document.body.classList.contains('scrolled')) return;
    document.body.classList.toggle('scrolled', on);
    syncOffset();
  }

  let rafPending = false;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const y = window.scrollY;
      if (y > COMPACT_AT) setCompact(true);
      else if (y < EXPAND_AT) setCompact(false);
      highlight();
    });
  }

  function bind() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      // Re-measure the full header at the new width.
      const compact = document.body.classList.contains('scrolled');
      if (compact) document.body.classList.remove('scrolled');
      syncOffset();
      if (compact) setCompact(true);
    });
    // Cards appear and disappear (range tabs, settings, empty state): rebuild the chips when they do.
    let pending = 0;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(render, 150);
    }).observe(document.querySelector('main'), { attributes: true, attributeFilter: ['hidden'], subtree: true });
    syncOffset();
    render();
  }

  return { bind, render, jump };
})();
