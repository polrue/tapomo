// Accessible ⓘ popovers. A button with `data-tip="key"` shows t(key) in one shared
// role="tooltip" element on hover and on keyboard focus; Escape or leaving closes it.
// (A plain `title` would be invisible to keyboard users and slow for everyone else.)
const Tips = (() => {
  let el = null;
  let current = null;
  let vars = () => ({});
  let extra = () => '';
  let onClick = () => {};

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tip';
    el.className = 'tip';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.append(el);
    return el;
  }

  function position(btn) {
    const r = btn.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const above = r.top - h - 8;
    el.style.left = `${left}px`;
    el.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
  }

  function show(btn) {
    ensure();
    if (current && current !== btn) current.removeAttribute('aria-describedby');
    current = btn;
    el.textContent = '';
    el.append(t(btn.dataset.tip, vars()));
    const more = extra(btn);
    if (more) el.append(Object.assign(document.createElement('span'), { className: 'tip-extra', textContent: more }));
    el.append(Object.assign(document.createElement('span'), { className: 'tip-more', textContent: t('tip.glossary') }));
    el.hidden = false;
    btn.setAttribute('aria-describedby', 'tip');
    position(btn);
  }

  function hide() {
    if (!el || el.hidden) return;
    el.hidden = true;
    current?.removeAttribute('aria-describedby');
    current = null;
  }

  /** `vars()` fills the {placeholders}; `extra(btn)` adds a subtle line; `onClick` opens the glossary. */
  function init(opts) {
    vars = opts.vars;
    extra = opts.extra || extra;
    onClick = opts.onClick || onClick;
    const target = (e) => e.target.closest?.('.info[data-tip]');
    document.addEventListener('mouseover', (e) => target(e) && show(target(e)));
    document.addEventListener('mouseout', (e) => target(e) && hide());
    document.addEventListener('focusin', (e) => target(e) && show(target(e)));
    document.addEventListener('focusout', (e) => target(e) && hide());
    document.addEventListener('click', (e) => {
      if (!target(e)) return;
      show(target(e));
      onClick();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
    // Scrolling (also the scroll a focus can cause) just re-anchors the open popover.
    window.addEventListener('scroll', () => current && !el.hidden && position(current), true);
    window.addEventListener('resize', hide);
  }

  return { init, show, hide };
})();
