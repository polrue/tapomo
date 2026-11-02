// Sticky header + section bar (0.7.0): the header stays on top, a little smaller once you scroll, and a
// bar of chips jumps to any card. Only cards that are visible right now get a chip; the one you're
// looking at is highlighted.
// Pages: the window is split by topic (Hoy, Progreso, Aprender, Tapomo, plus Ajustes and Apoya behind two
// icons). Every card in <main> says its page in data-page ("all" = every page); the chips only list the
// cards of the page you're on.
const SectionNav = (() => {
  const $ = (id) => document.getElementById(id);
  // [element id, i18n key of its chip]
  const SECTIONS = [
    ['live', 'nav.live'], ['goal', 'goal.title'], ['level', 'nav.level'], ['league', 'nav.league'], ['challenges', 'ch.title'],
    ['shortcuts', 'nav.shortcuts'], ['data', 'nav.stats'], ['records', 'records.title'], ['badges', 'badges.title'],
    ['lessons', 'lessons.button'], ['corrections', 'corrections.title'], ['album', 'album.title'],
    ['friends', 'social.leagues'], ['wardrobe', 'wd.title'], ['support', 'support.title'],
    ['settings', 'settings.title'], ['glossary', 'gloss.title'], ['about', 'about.title'],
  ];
  const PAGES = ['hoy', 'progreso', 'aprender', 'tapomo', 'ajustes', 'apoya'];
  const PAGE_KEY = 'tapomo.page';
  let page = 'hoy';
  let current = null;
  let shown = [];

  const visible = (el) => el && !el.hidden && el.offsetParent !== null;

  function render() {
    if (!document.body.classList.contains('scrolled')) syncOffset(); // labels may have changed its height
    const bar = $('section-nav');
    const list = $('sn-list');
    list.replaceChildren();
    // Chips follow the page's own order, so the highlight and the bar always agree.
    shown = SECTIONS.filter(([id]) => visible($(id)))
      .sort(([a], [b]) => ($(a).compareDocumentPosition($(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    // A page with a single card needs no bar.
    bar.hidden = shown.length < 2;
    if (bar.hidden) shown = [];
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

  /** Shows one page: the others' cards are hidden by CSS (body[data-page]). Lessons run only on theirs. */
  function show(next, { remember = true } = {}) {
    if (!PAGES.includes(next)) next = 'hoy';
    const was = page;
    page = next;
    document.body.dataset.page = next;
    document.querySelectorAll('#page-nav [data-page]').forEach((b) => {
      const on = b.dataset.page === next;
      if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', String(on));
      else b.toggleAttribute('aria-current', on);
    });
    if (remember) { try { localStorage.setItem(PAGE_KEY, next); } catch (_) { /* storage can be unavailable */ } }
    if (typeof Lessons !== 'undefined') {
      if (next === 'aprender' && document.body.dataset.view !== 'lessons') Lessons.open();
      else if (next !== 'aprender' && was === 'aprender') Lessons.close();
    }
    // Folded cards (wardrobe, leagues, album) open on their own page: there's little else on it.
    // The glossary stays folded: it's reference, below the settings.
    document.querySelectorAll(`main > details[data-page="${next}"]:not(#glossary)`).forEach((d) => { d.open = true; });
    window.scrollTo({ top: 0 });
    render();
  }

  /** Scrolls so the card's top sits just under the header (compact, unless it's the first card). */
  function jump(id) {
    const el = $(id);
    const home = el.closest('main > [data-page]');
    if (home && home.dataset.page !== 'all' && home.dataset.page !== page) show(home.dataset.page);
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
    document.querySelectorAll('#page-nav [data-page]').forEach((b) => b.addEventListener('click', () => show(b.dataset.page)));
    // A mouse wheel has no sideways scroll: turn it into one while over the chips.
    $('sn-list').addEventListener('wheel', (e) => {
      const list = e.currentTarget;
      if (list.scrollWidth <= list.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      list.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }, { passive: false });
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
    // The header grows back with a transition, and its chip bar comes and goes with the page: measuring
    // only when the class flips caught it half-grown, and the full header then covered the first card.
    new ResizeObserver(() => syncOffset()).observe($('sticky-head'));
    syncOffset();
    let saved = null;
    try { saved = localStorage.getItem(PAGE_KEY); } catch (_) { /* storage can be unavailable */ }
    show(saved || 'hoy', { remember: false });
  }

  return { bind, render, jump, show };
})();
