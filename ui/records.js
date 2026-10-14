// "Tus récords" (0.3.7): each personal record in an envelope that opens with a click, then shows its
// context (day, time, app, how long) and a fun equivalence. A new record arrives as a closed envelope again.
// There is never text to show: Tapomo never stores what you type.
const Records = (() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'tapomo.records.opened'; // { id: value } of envelopes already opened (per viewer, optional)
  const TWEET = 280;
  const PAGE = 1800;
  let list = [];

  function opened() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; }
  }
  function remember(r) {
    const o = opened();
    o[r.id] = r.value;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* storage can be unavailable */ }
  }

  const when = (ms) => {
    const d = new Date(ms);
    const lang = document.documentElement.lang;
    return { date: d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }), time: d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) };
  };
  const mins = (ms) => Math.max(1, Math.round(ms / 60000));
  const app = (a) => (a || '').replace(/\.exe$/i, '');

  /** The big number, a context line and a fun equivalence. */
  function describe(r) {
    const w = when(r.at_ms);
    switch (r.id) {
      case 'peak': {
        const perSec = (r.value * 5) / 60;
        return { big: `${fmt(r.value)} ${t('unit.wpm')}`, ctx: t('records.ctx', { ...w, app: app(r.app) }), fun: t('records.fun.peak', { s: fmt(Math.max(1, Math.round(TWEET / perSec))) }) };
      }
      case 'clean': {
        const pages = r.value / PAGE;
        const fun = pages >= 1 ? tn('records.fun.pages', Math.round(pages), { n: fmt(Math.round(pages)) }) : tn('records.fun.tweets', Math.max(1, Math.round(r.value / TWEET)), { n: fmt(Math.max(1, Math.round(r.value / TWEET))) });
        return { big: `${fmt(r.value)} ${t('unit.chars')}`, ctx: t('records.ctx', { ...w, app: app(r.app) }), fun };
      }
      case 'long': {
        const m = r.duration_ms / 60000;
        const fun = m >= 3.5 ? tn('records.fun.songs', Math.floor(m / 3.5), { n: fmt(Math.floor(m / 3.5)) }) : tn('records.fun.ads', Math.max(1, Math.floor((r.duration_ms / 1000) / 30)), { n: fmt(Math.max(1, Math.floor((r.duration_ms / 1000) / 30))) });
        return { big: tn('records.minutes', mins(r.duration_ms), { n: fmt(mins(r.duration_ms)) }), ctx: t('records.ctx_chars', { ...w, app: app(r.app), n: fmt(r.chars) }), fun };
      }
      default: {
        const pages = Math.max(1, Math.round(r.chars / PAGE));
        return { big: `${fmt(r.chars)} ${t('unit.chars')}`, ctx: t('records.ctx_day', { date: w.date, m: fmt(mins(r.duration_ms)) }), fun: tn('records.fun.day', pages, { n: fmt(pages) }) };
      }
    }
  }

  function render() {
    const card = $('records');
    card.hidden = list.length === 0;
    const grid = $('rc-grid');
    grid.replaceChildren();
    const seen = opened();
    for (const r of list) {
      const li = document.createElement('li');
      li.className = 'rc';
      const isOpen = seen[r.id] === r.value;
      li.toggleAttribute('data-open', isOpen);
      const title = document.createElement('h3');
      title.textContent = t(`records.${r.id}`);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rc-envelope';
      btn.setAttribute('aria-expanded', String(isOpen));
      btn.innerHTML = '<svg viewBox="0 0 64 44" aria-hidden="true"><rect x="3" y="3" width="58" height="38" rx="6" fill="#fff3c4" stroke="#23202b" stroke-width="2.4"/><path d="M5 6 L32 26 L59 6" fill="none" stroke="#23202b" stroke-width="2.4" stroke-linejoin="round"/><circle cx="32" cy="26" r="6" fill="#ff6f61" stroke="#23202b" stroke-width="2"/></svg>';
      const label = document.createElement('span');
      label.textContent = t('records.open');
      btn.append(label);
      const body = document.createElement('div');
      body.className = 'rc-body';
      const d = describe(r);
      body.innerHTML = '<strong class="rc-big" tabindex="-1"></strong><p class="rc-ctx"></p><p class="rc-fun"></p>';
      body.querySelector('.rc-big').textContent = d.big;
      body.querySelector('.rc-ctx').textContent = d.ctx;
      body.querySelector('.rc-fun').textContent = d.fun;
      btn.addEventListener('click', () => {
        remember(r);
        li.setAttribute('data-open', '');
        btn.setAttribute('aria-expanded', 'true');
        if (!Mascot.reduced()) li.classList.add('rc-pop');
        body.querySelector('.rc-big').focus();
      });
      li.append(title, btn, body);
      grid.append(li);
    }
  }

  async function refresh() {
    list = await invoke('get_records');
    render();
  }

  return { refresh, render };
})();
