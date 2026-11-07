// Lab only: «Compartir» study. A share card made on the user's PC (nothing is uploaded) that they can
// paste in a social network: «Mi semana», «¡Nivel N!», «¡Récord!» or a generic «Tapomo» card. Three
// designs that echo the «Avisos fuera de la app» notices (A Cartel, B Aviso, C Tarjeta), at the real
// social sizes (1200 × 630 and 1080 × 1080, scaled down), the in-app share panel, and the two entry
// points: a share icon next to ⚙ / ♥ in the main window header and a block on the ♥ (Apoya) page.
// The stage shows a mock of the app (drawn at 450 px and scaled, like the desktop mocks).
(() => {
  const E = window.Estudios;
  if (!E) return;
  const { el, btn, seg, later, tapomo, R } = E;
  const INK = '#23202b';

  // ------------------------------------------------------------------ options
  const opt = { view: 'share', kind: 'semana', reward: true, rec: 'speed', v: 'a', fmt: 'sq', name: false, who: 'Pol', lang: 'es', theme: 'auto', cta: 0 };
  // The design opens as the user last left it (A the first time).
  try { const v = localStorage.getItem('lab.share.design'); if (['a', 'b', 'c'].includes(v)) opt.v = v; } catch { /* no storage */ }

  // ------------------------------------------------------------------ sample data (believable numbers)
  // Grouped always (es-ES leaves 4-digit numbers ungrouped: «6153» would read odd next to «12.400»).
  const nf = (n, lang) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
  const rewardsUpTo = (lv) => R.REWARDS.filter((r) => r.level <= lv).length;
  const NAMES_EN = { auris: 'Headphones', matcha: 'Matcha skin' };
  /** The card's content for a kind, in the card's language. */
  function data(kind, lang) {
    const es = lang === 'es';
    const who = opt.name && opt.who.trim() ? opt.who.trim() : '';
    const T = (a, b) => (es ? a : b);
    if (kind === 'semana') {
      return {
        lv: 14, face: { eyes: 'sparkle', mouth: 'big', cheeks: true },
        eyebrow: who ? T(`La semana de ${who}`, `${who}'s week`) : T('Mi semana', 'My week'),
        title: T('Lo mejor de mi semana', 'The best of my week'),
        sub: T('Del 27 de octubre al 2 de noviembre', '27 October – 2 November'),
        type: T('Resumen semanal', 'Weekly summary'),
        stats: [
          ['clock', '186', T('minutos escribiendo', 'minutes typing')],
          ['keys', nf(12400, lang), T('palabras', 'words')],
          ['bolt', '78', T('ppm de mejor pico', 'wpm best peak')],
          ['flame', '6', T('días seguidos', 'days in a row')],
          ['star', '14', T('nivel', 'level')],
        ],
      };
    }
    if (kind === 'nivel') {
      const lv = opt.reward ? 16 : 17;
      const next = R.REWARDS.find((r) => r.level > lv);
      return {
        lv, reward: opt.reward ? 'auris' : null, face: { eyes: 'sparkle', mouth: 'big', cheeks: true },
        eyebrow: T('¡Subo de nivel!', 'Level up!'),
        title: opt.reward ? T('Estreno: Auriculares', 'New: Headphones') : T('¡Sigo subiendo!', 'Still climbing!'),
        sub: opt.reward ? T('Accesorio nuevo para mi Tapomo', 'A new accessory for my Tapomo')
          : T(`Próximo premio en el nivel ${next.level}: ${next.name}`, `Next reward at level ${next.level}: ${NAMES_EN[next.id] || next.name}`),
        hero: [String(lv), '', T('Nivel', 'Level')],
        type: T('Subida de nivel', 'Level up'),
        stats: [
          ['star', nf(R.xpFor(lv), lang), T('XP en total', 'XP in total')],
          ['gift', String(rewardsUpTo(lv)), T('premios conseguidos', 'rewards earned')],
          ['flame', '6', T('días seguidos', 'days in a row')],
        ],
      };
    }
    if (kind === 'record') {
      if (opt.rec === 'speed') {
        return {
          lv: 14, face: { eyes: 'star', mouth: 'open', cheeks: true },
          eyebrow: T('¡Récord de velocidad!', 'Speed record!'), title: T('¡Más rápido que nunca!', 'Faster than ever!'),
          hero: ['86', T('ppm', 'wpm')], sub: T('Mi mejor pico de 10 segundos · antes, 79 ppm', 'My best 10-second peak · was 79 wpm'),
          type: T('Récord de velocidad', 'Speed record'),
          stats: [
            ['up', '+7', T('ppm más que antes', 'wpm more than before')],
            ['clock', '39 s', T('para un tuit entero', 'for a whole tweet')],
            ['star', '14', T('nivel', 'level')],
          ],
        };
      }
      return {
        lv: 14, face: { eyes: 'star', mouth: 'open', cheeks: true },
        eyebrow: T('¡Récord de días seguidos!', 'Streak record!'), title: T('¡Un mes seguido!', 'A whole month in a row!'),
        hero: ['30', T('días seguidos', 'days in a row')], sub: T('Cumpliendo mi objetivo cada día', 'Hitting my daily goal every day'),
        type: T('Récord de días seguidos', 'Streak record'),
        stats: [
          ['clock', '19 h', T('escribiendo', 'typing')],
          ['keys', nf(48200, lang), T('palabras', 'words')],
          ['star', '14', T('nivel', 'level')],
        ],
      };
    }
    return {
      lv: 14, face: { eyes: 'round', mouth: 'big', cheeks: true }, app: true,
      eyebrow: who ? T(`${who} usa Tapomo`, `${who} uses Tapomo`) : T('Yo uso Tapomo', 'I use Tapomo'),
      title: 'Tapomo',
      sub: T('Mide lo rápido que escribes de verdad, mientras escribes como siempre.', 'See how fast you really type, while you type as usual.'),
      type: T('Tu mascota del teclado', 'Your keyboard buddy'),
      chips: es ? ['Gratis', 'Sin anuncios', 'Código abierto', 'Nunca guarda lo que escribes'] : ['Free', 'No ads', 'Open source', 'Never keeps what you type'],
      // Only the collectible card (C) lists these; A and B show the chips.
      stats: [
        ['gift', '✓', es ? 'Gratis, sin anuncios' : 'Free, no ads'],
        ['keys', '✓', es ? 'No guarda tu texto' : 'Never keeps your text'],
        ['heart', '✓', es ? 'Código abierto' : 'Open source'],
      ],
    };
  }
  /** Ready text for each kind (ES / EN): friendly, short, no hype. The ref param says which card brought people. */
  const URL_OF = (kind) => `https://tapomo.app?ref=${kind}`;
  function shareText(kind, lang) {
    const es = lang === 'es';
    const u = URL_OF(kind);
    if (kind === 'semana') return es ? `Esta semana he escrito 12.400 palabras con Tapomo y he subido al nivel 14 🐾 Es gratis: ${u}` : `This week I typed 12,400 words with Tapomo and reached level 14 🐾 It's free: ${u}`;
    if (kind === 'nivel') {
      if (opt.reward) return es ? `¡Nivel 16 en Tapomo! Mi Tapomo estrena auriculares 🎧 Es gratis: ${u}` : `Level 16 on Tapomo! My Tapomo got new headphones 🎧 It's free: ${u}`;
      return es ? `¡Nivel 17 en Tapomo! A por el siguiente premio 💪 Es gratis: ${u}` : `Level 17 on Tapomo! On to the next reward 💪 It's free: ${u}`;
    }
    if (kind === 'record') {
      if (opt.rec === 'speed') return es ? `Nuevo récord en Tapomo: 86 palabras por minuto ⚡ ¿Y tú, cuánto escribes? ${u}` : `New record on Tapomo: 86 words per minute ⚡ How fast do you type? ${u}`;
      return es ? `30 días seguidos cumpliendo mi objetivo con Tapomo 🔥 ${u}` : `30 days in a row hitting my goal with Tapomo 🔥 ${u}`;
    }
    return es ? `Uso Tapomo para ver lo rápido que escribo de verdad. Es gratis, sin anuncios y nunca guarda lo que escribes 🐾 ${u}`
      : `I use Tapomo to see how fast I really type. It's free, ad-free and never keeps what you type 🐾 ${u}`;
  }

  // ------------------------------------------------------------------ drawings (no ids: nothing to clash between copies)
  const B = (fill, glyph) => `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="${fill}" stroke="${INK}" stroke-width="2.4"/>${glyph}</svg>`;
  const S = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
  const ICON = {
    clock: B('#8ccbf0', `<circle cx="20" cy="20" r="9.5" fill="#fff8e0" ${S}/><path d="M20 14.5v6l4 2.6" fill="none" ${S}/>`),
    keys: B('#c4a8f0', `<rect x="10.5" y="12.5" width="19" height="15" rx="4" fill="#fff8e0" ${S}/><path d="M15 23h10" fill="none" ${S}/>`),
    bolt: B('#ffc93c', `<polygon points="22.5,9 13,22 19.5,22 17.5,31 27,17.5 20.5,17.5" fill="#fff8e0" ${S}/>`),
    flame: B('#ff9e7a', `<path d="M20 9.5c3 4.6 7.5 6.6 7.5 12.4a7.5 7.5 0 0 1-15 0c0-3.6 2.6-5.6 2.8-8.6 2 1.2 3 3 3 5 1.2-2.8 2-5.6 1.7-8.8z" fill="#fff8e0" ${S}/>`),
    star: B('#74d6bf', `<polygon points="20,9.5 23.2,16.2 30.5,17 25,22 26.5,29.3 20,25.7 13.5,29.3 15,22 9.5,17 16.8,16.2" fill="#fff8e0" ${S}/>`),
    up: B('#74d6bf', `<path d="M20 29V12.5M13 19l7-7 7 7" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
    gift: B('#c4a8f0', `<rect x="11.5" y="18" width="17" height="11" rx="2" fill="#fff8e0" ${S}/><rect x="10" y="13.5" width="20" height="5" rx="1.5" fill="#fff8e0" ${S}/><path d="M20 13.5V29" fill="none" ${S}/>`),
    heart: B('#ff8fb5', `<path d="M20 28s-7.5-4.4-8.6-8.6C10.6 16 12.6 13 15.6 13c1.9 0 3.4 1 4.4 2.6 1-1.6 2.5-2.6 4.4-2.6 3 0 5 3 4.2 6.4C27.5 23.6 20 28 20 28z" fill="#fff8e0" ${S}/>`),
  };
  const SHARE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.5V3.8M7.8 7.8 12 3.6l4.2 4.2"/><path d="M8.5 10.5H7A1.5 1.5 0 0 0 5.5 12v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5"/></svg>';
  const GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';
  const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.1C1.6 8.2 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.6 3.7 4.4 6.9-1.7 4.5-9.2 9.1-9.2 9.1Z"/></svg>';

  /** Keycap confetti, still (it's a picture): a fixed scatter so every render looks the same. */
  function confetti(n, W, H) {
    const c = el('div', 'sh-conf');
    c.setAttribute('aria-hidden', 'true');
    const cols = ['#ff9e7a', '#ffc93c', '#74d6bf', '#8ccbf0', '#c4a8f0', '#f0764a'];
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      const p = el('i', i % 4 === 3 ? 'dot' : '');
      const z = 16 + Math.round(rnd() * 12);
      p.style.cssText = `left:${Math.round(rnd() * (W - 30))}px;top:${Math.round(rnd() * (H - 30))}px;width:${z}px;height:${z}px;background:${cols[i % cols.length]};transform:rotate(${Math.round(rnd() * 90 - 45)}deg)`;
      c.append(p);
    }
    return c;
  }

  // ------------------------------------------------------------------ the card
  // A level card with a reward shows Tapomo bare, wearing only what it just won (with a full
  // outfit the new item gets lost). Its own skin stays, unless the reward is a skin.
  const lookFor = (d) => {
    const base = E.current();
    if (!d.reward) return base;
    const r = R.REWARDS.find((x) => x.id === d.reward);
    return r?.kind === 'skin' ? { skin: d.reward, acc: [] } : { skin: base.skin, acc: [d.reward] };
  };
  const darkNow = () => (opt.theme === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' : opt.theme === 'dark');
  function statsBox(d, cls = 'sh-stats') {
    const s = el('div', `${cls} sh-n${d.stats.length}`);
    for (const [ic, v, l] of d.stats) {
      const t = el('div', 'sh-stat');
      t.innerHTML = ICON[ic];
      t.append(el('b', '', v), el('span', '', l));
      s.append(t);
    }
    return s;
  }
  function chips(d) {
    const c = el('div', 'sh-chips');
    d.chips.forEach((t) => c.append(el('span', 'sh-chip', t)));
    return c;
  }
  function hero(d) {
    const h = el('div', 'sh-hero');
    if (d.hero[2]) h.append(el('span', '', d.hero[2]));
    h.append(el('b', '', d.hero[0]));
    if (d.hero[1]) h.append(el('span', '', d.hero[1]));
    return h;
  }
  function foot(cls = 'sh-foot') {
    const f = el('div', cls);
    f.append(el('i', 'sh-logo'), el('span', '', 'tapomo.app'));
    return f;
  }
  const W = { land: [1200, 630], sq: [1080, 1080] };
  /**
   * How far the outfit reaches, in the drawing's 160-unit box: `head` is the top of the tallest
   * thing on the head (40 bare, -20 with the chef's hat) and `half` the widest half-width from the
   * centre (50 bare, ~68 with headphones), `top` the half-width in the top 22 units (where A's hands
   * go) and `all` the box of everything drawn [x0, y0, x1, y1] (B and C fit it whole). Measured on a
   * hidden copy, so any outfit fits.
   */
  function reach(svg) {
    const h = document.createElement('div');
    h.style.cssText = 'position:absolute;left:-9999px;top:0;width:160px;height:160px;visibility:hidden';
    const home = svg.parentNode;
    const next = svg.nextSibling;
    svg.style.width = svg.style.height = '160px';
    h.append(svg);
    document.body.append(h);
    let head = 40, half = 50, top = 50, all = [27, 37, 133, 153];
    try {
      const body = svg.querySelector('.mascot-body');
      const b = body.getBBox();
      head = Math.min(40, b.y);
      half = Math.max(50, 80 - b.x, b.x + b.width - 80);
      // The half-width of what is drawn in the top 22 units (where the sign's hands sit beside it):
      // hit-test every visible shape along a few rows, so a headband counts but the cups under it do not.
      const toSvg = svg.getScreenCTM().inverse();
      const shapes = [...body.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line')]
        .filter((e) => !e.checkVisibility || e.checkVisibility())
        .map((e) => [e, toSvg.multiply(e.getScreenCTM()).inverse()]);
      const pt = svg.createSVGPoint();
      const hit = (x, y) => shapes.some(([e, m]) => {
        pt.x = x; pt.y = y;
        const q = pt.matrixTransform(m);
        return e.isPointInFill(q) || e.isPointInStroke(q);
      });
      let w = 0;
      for (let y = head; y <= head + 22; y += 2) {
        for (let d = 80; d > w; d--) if (hit(80 - d, y) || hit(80 + d, y)) { w = d; break; }
      }
      if (w) top = w;
      // Everything drawn, shadow and cape included (+3 units for the ink rim the boxes leave out).
      const parts = [...svg.querySelectorAll('.m-hop, .m-shadow-g')];
      const bs = (parts.length ? parts : [body]).map((e) => e.getBBox()).filter((r) => r.width && r.height);
      if (bs.length) {
        all = [Math.min(...bs.map((r) => r.x)) - 3, Math.min(...bs.map((r) => r.y)) - 3,
          Math.max(...bs.map((r) => r.x + r.width)) + 3, Math.max(...bs.map((r) => r.y + r.height)) + 3];
      }
    } catch { /* not drawn yet: the bare body */ }
    if (home) home.insertBefore(svg, next);
    h.remove();
    svg.style.width = svg.style.height = '';
    return { head, half, top, all };
  }
  /**
   * Square cards: Tapomo as big as the room allows. The body's bottom edge (unit 138) goes `crop` px
   * under the box's bottom, the top of the outfit stays `top` px under the box's top, never wider
   * than `max`, and the outfit's widest part (headphones) keeps `side` px from the box's sides. Returns the drawing size and the outfit's reach in px, for things placed around it (the sign's hands).
   */
  function place(svg, box, { top, crop = 0, max, side = 0 }) {
    const { head, half, top: band } = reach(svg);
    const s = Math.round(Math.min(max, ((box.h + crop - top) * 160) / (138 - head), ((box.w / 2 - side) * 160) / half));
    svg.style.cssText = `position:absolute;width:${s}px;height:${s}px;left:${Math.round((box.w - s) / 2)}px;top:${Math.round(box.h + crop - (138 / 160) * s)}px`;
    return { s, half: (half / 160) * s, head: (head / 160) * s, band: (band / 160) * s };
  }
  /**
   * B and C: the WHOLE Tapomo in its window (top of the outfit to the shadow, cape and scarf ends
   * included), as big as fits with `pad` px all round, standing on the window's bottom margin and
   * centred on what is drawn. Measured from the real outfit, so a beard, a bow tie or a chef's hat
   * never gets cut.
   */
  function frame(svg, box, { pad, max = Infinity }) {
    const [x0, y0, x1, y1] = reach(svg).all;
    const s = Math.floor(Math.min(max, ((box.w - 2 * pad) * 160) / (x1 - x0), ((box.h - 2 * pad) * 160) / (y1 - y0)));
    const k = s / 160;
    svg.style.cssText = `position:absolute;margin:0;width:${s}px;height:${s}px;left:${Math.round(box.w / 2 - ((x0 + x1) / 2) * k)}px;top:${Math.round(box.h - pad - y1 * k)}px`;
    return s;
  }
  /**
   * Tapomo's hands holding the sign (A · Cartel), Rayman-style: no arms, just two floating mitts sized
   * with the drawing (21 units across, 19 on the wide card, with a 2-unit ink rim), gripping the sign's
   * edge from below so a third of each hand overlaps it. Square: Tapomo's head sits just under the
   * sign and one hand goes each side of it, just outside what is drawn at that height (hat, headband),
   * so they read as its own. Wide: both on the sign's right edge, right beside Tapomo's left side.
   * `g`: drawing size `s` and position `x`/`y` on the card, `half` = outfit half-width in px, `band` = its half-width in the top 22 units,
   * `sign` = [left, top, width, height, rotation in degrees].
   */
  function mitts(c, g, fill, sq) {
    const k = g.s / 160;
    const hand = Math.round((sq ? 21 : 19) * k), ink = Math.max(4, Math.round(2 * k));
    const [sl, st, sw, shh, rot] = g.sign;
    const cx = sl + sw / 2, cy = st + shh / 2, a = (rot * Math.PI) / 180;
    // A point given in the sign's own (unrotated) frame, on the card.
    const onSign = (x, y) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
    const at = [];
    const mid = g.x + g.s / 2;
    if (sq) {
      const out = g.band + hand / 2 + 3 * k;
      for (const dir of [-1, 1]) {
        const hx = mid + dir * out;
        // where the rotated bottom edge is at that x (one pass is exact enough for 1 degree)
        const [, hy] = onSign(hx, st + shh);
        at.push([hx, hy + hand * 0.18]);
      }
    } else {
      const edge = mid - g.half - hand / 2 - 2 * k;
      for (const y of [385, 458]) {
        const [ex, hy] = onSign(sl + sw, st + y);
        at.push([Math.min(ex - 6, edge), hy]);
      }
    }
    for (const [hx, hy] of at) {
      const m = el('i', 'sh-mitt');
      m.style.cssText = `left:${hx - hand / 2}px;top:${hy - hand / 2}px;width:${hand}px;height:${hand}px;background:${fill};box-shadow:0 0 0 ${ink}px #23202b`;
      c.append(m);
    }
  }
  /** The figures a card shows: all five on the wide card, the best four (three on the collectible) in square. */
  function statsFor(d, kind, v, fmt) {
    if (fmt !== 'sq' || kind !== 'semana') return d.stats;
    const by = Object.fromEntries(d.stats.map((x) => [x[0], x]));
    return v === 'c' ? [by.keys, by.bolt, by.flame] : [by.keys, by.bolt, by.clock, by.flame];
  }
  // A · square: the sign's height per kind (its content is laid out for it) and where it starts.
  const SIGN = { top: 46, h: { semana: 590, nivel: 500, record: 500, tapomo: 480 } };
  /** Builds one card (real size: 1200 × 630 or 1080 × 1080). */
  function card(kind = opt.kind, v = opt.v, fmt = opt.fmt, lang = opt.lang) {
    const d0 = data(kind, lang);
    const d = { ...d0, stats: statsFor(d0, kind, v, fmt) };
    const [w, h] = W[fmt];
    const sq = fmt === 'sq';
    const c = el('div', `sh-card sh-${v} sh-${fmt} sh-k-${kind}`);
    c.dataset.theme = darkNow() ? 'dark' : 'light';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', `${d.eyebrow} · ${d.title}`);
    const svg = tapomo(lookFor(d), d.face);
    svg.classList.add('sh-snap');
    const who = opt.name && opt.who.trim() ? opt.who.trim() : '';
    if (v === 'a') {
      c.append(confetti(fmt === 'land' ? 26 : 30, w, h));
      const art = el('div', 'sh-art');
      art.append(el('div', 'sh-rays'), svg);
      const sign = el('div', 'sh-sign');
      sign.append(el('div', 'sh-eyebrow', d.eyebrow), el('div', 'sh-title', d.title));
      if (d.hero) sign.append(hero(d));
      sign.append(el('div', 'sh-sub', d.sub));
      sign.append(d.chips ? chips(d) : statsBox(d));
      const fill = E.bodyFill(svg);
      let g;
      if (sq) {
        // Tapomo right under the sign, as big as the room allows: the top of its outfit (hat, headphones)
        // stays GAP px under the sign's bottom edge, so the floating hands beside it read as its own.
        const sh = SIGN.h[kind], GAP = 8;
        sign.style.height = `${sh}px`;
        const p = place(svg, { w, h }, { top: SIGN.top + sh + GAP, crop: 26, max: 900 });
        g = { s: p.s, x: parseFloat(svg.style.left), y: SIGN.top + sh + GAP - p.head, half: p.half, band: p.band, sign: [70, SIGN.top, w - 140, sh, -1] };
        art.style.cssText = `left:${g.x}px;top:${g.y}px;width:${g.s}px;height:${g.s}px`;
        svg.style.left = svg.style.top = '0px';
      } else {
        // The wide card's drawing box and sign as compartir.css lays them out (the sign's height is its min-height).
        // A wide outfit (headphones) moves Tapomo up to 28 px right, so the hands on the sign's edge stay clear of it.
        const s = 400, half = reach(svg).half;
        const shift = Math.round(Math.min(28, ((half - 50) / 160) * s));
        art.style.right = `${18 - shift}px`;
        g = { s, x: w - 18 + shift - s, y: h + 14 - s, half: (half / 160) * s, sign: [52, 52, 760, 520, -1.6] };
      }
      mitts(c, g, fill, sq);
      c.append(art, sign, foot());
      c.querySelectorAll(':scope > .sh-mitt').forEach((m) => c.append(m));
    } else if (v === 'b') {
      const t = el('div', 'sh-toast');
      const head = el('div', 'sh-toast-head');
      head.append(el('i', 'sh-logo'), el('span', '', who ? `Tapomo · ${who}` : 'Tapomo'), el('span', 'sh-url', 'tapomo.app'));
      const row = el('div', 'sh-row');
      const pic = el('div', 'sh-pic');
      pic.append(svg);
      const txt = el('div', 'sh-txt');
      txt.append(el('div', 'sh-eyebrow', d.eyebrow), el('div', 'sh-title', d.title));
      if (d.hero) txt.append(hero(d));
      txt.append(el('div', 'sh-sub', d.sub));
      if (sq) {
        // Text on top; under it Tapomo big in its window, the big number and the figures beside it.
        const low = el('div', 'sh-low');
        const col = el('div', 'sh-col');
        if (d.hero) col.append(txt.querySelector('.sh-hero'));
        col.append(d.chips ? chips(d) : statsBox(d));
        const pw = 410, ph = d.hero ? 470 : 450;
        pic.style.cssText = `width:${pw}px;height:${ph}px`;
        frame(svg, { w: pw, h: ph }, { pad: 18 });
        low.append(pic, col);
        t.append(head, txt, low);
      } else {
        pic.style.position = 'relative';
        frame(svg, { w: 196, h: 196 }, { pad: 10 });
        row.append(pic, txt);
        t.append(head, row, d.chips ? chips(d) : statsBox(d));
      }
      c.append(t);
    } else {
      const tc = el('div', 'sh-tc');
      const inn = el('div', 'sh-tc-in');
      const name = el('div', 'sh-tc-name');
      name.append(el('b', '', who || 'Tapomo'), el('span', '', `${lang === 'es' ? 'Nv' : 'Lv'} ${d.lv}`));
      const art = el('div', 'sh-tc-art');
      art.append(el('div', 'sh-rays'), svg);
      const moves = el('div', 'sh-tc-moves');
      for (const [ic, val, l] of d.stats) {
        const r = el('div', 'sh-move');
        r.innerHTML = ICON[ic];
        r.append(el('span', '', l), el('b', '', val));
        moves.append(r);
      }
      const ft = el('div', 'sh-tc-foot');
      ft.append(el('span', 'sh-stars', '★★★'), el('span', '', 'tapomo.app'), el('span', '', kind === 'semana' ? '45/52' : kind === 'nivel' ? `${String(d.lv).padStart(3, '0')}/050` : kind === 'record' ? '★ 001' : '#001'));
      inn.append(name, art, el('div', 'sh-tc-type', d.type), moves, ft);
      tc.append(inn);
      if (!sq) frame(svg, { w: 324, h: 230 }, { pad: 10 }); // the wide card's window (.sh-tc 384 − frame and padding)
      if (sq) {
        const ah = d.stats.length > 3 ? 400 : 440;
        art.style.height = `${ah}px`;
        frame(svg, { w: 576, h: ah }, { pad: 16 });
        // The big number as a round sticker on the card's edge (the text above has no room for it).
        if (d.hero) {
          const st = el('div', 'sh-sticker');
          st.append(hero(d));
          tc.append(st);
        }
      }
      const side = el('div', 'sh-side');
      side.append(el('div', 'sh-eyebrow', d.eyebrow), el('div', 'sh-title', d.title));
      if (sq) {
        c.append(side, tc);
      } else {
        if (d.hero) side.append(hero(d));
        side.append(el('div', 'sh-sub', d.sub));
        if (d.chips) side.append(chips(d));
        side.append(foot());
        c.append(tc, side);
      }
    }
    return c;
  }
  /** A card scaled to `px` wide, in a box of the scaled size. */
  function fitted(px, ...a) {
    const c = card(...a);
    const [w, h] = W[a[2] || opt.fmt];
    const s = px / w;
    const box = el('div', 'sh-fit');
    box.style.width = `${px}px`;
    box.style.height = `${Math.round(h * s)}px`;
    c.style.transform = `scale(${s})`;
    box.append(c);
    return box;
  }

  // ------------------------------------------------------------------ the app mocks (450 px, scaled to the stage)
  const NETS = [['x', 'X', 'X', 'x.com'], ['in', 'in', 'LinkedIn', 'linkedin.com'], ['wa', 'W', 'WhatsApp', 'wa.me'], ['tg', 'T', 'Telegram', 't.me'], ['bs', 'B', 'Bluesky', 'bsky.app'], ['rd', 'R', 'Reddit', 'reddit.com']];
  let mock = null;
  let toastT = 0;
  let typed = { key: '', text: '' };
  function saveDesign(v) { try { localStorage.setItem('lab.share.design', v); } catch { /* no storage: just this session */ } }
  function toast(text) {
    if (!mock) return;
    let t = mock.querySelector('.sh-toastmsg');
    if (!t) { t = el('div', 'sh-toastmsg'); t.setAttribute('role', 'status'); mock.append(t); }
    t.textContent = text;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = later(2600, () => t.classList.remove('on'));
  }
  function shareDialog() {
    const dlg = el('div', `sh-dlg sh-dlg-${opt.fmt}`);
    const head = el('div', 'sh-dlg-head');
    head.append(el('b', '', 'Compartir'), el('span', 'sh-dlg-note', 'La imagen se crea en tu PC. No se sube nada.'));
    const x = btn('', 'sh-x');
    x.setAttribute('aria-label', 'Cerrar');
    x.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    x.addEventListener('click', () => { opt.view = 'header'; sync(); });
    head.append(x);
    const prev = el('div', 'sh-prev');
    prev.append(fitted(opt.fmt === 'land' ? 408 : 214));
    if (opt.fmt === 'sq') prev.append(el('p', 'sh-prev-cap', `${W.sq.join(' × ')} px · PNG · se ve entera en WhatsApp, Instagram, Telegram y en el móvil`));
    const side = el('div', 'sh-side-ctl');
    // Square first (it is the default): it shows whole everywhere; wide is the tapomo.app link preview size.
    const fmts = el('div', 'sh-fmts');
    fmts.setAttribute('role', 'group');
    fmts.setAttribute('aria-label', 'Formato');
    for (const [k, l] of [['sq', 'Cuadrado'], ['land', 'Horizontal']]) {
      const b = btn(l, `sh-fmt${opt.fmt === k ? ' on' : ''}`);
      b.setAttribute('aria-pressed', String(opt.fmt === k));
      b.addEventListener('click', () => { if (opt.fmt === k) return; opt.fmt = k; sync(); log(`Formato «${l}» (${W[k].join(' × ')} px). La app recuerda el último que elegiste.`); });
      fmts.append(b);
    }
    // The design, next to the format: the app opens the panel with the last one picked (A the first time).
    const designs = el('div', 'sh-fmts');
    designs.setAttribute('role', 'group');
    designs.setAttribute('aria-label', 'Diseño');
    for (const [k, l] of [['a', 'Cartel'], ['b', 'Aviso'], ['c', 'Tarjeta']]) {
      const b = btn(l, `sh-fmt${opt.v === k ? ' on' : ''}`);
      b.setAttribute('aria-pressed', String(opt.v === k));
      b.addEventListener('click', () => { if (opt.v === k) return; opt.v = k; saveDesign(k); sync(); log(`Diseño «${l}». La app recuerda el último que elegiste.`); });
      designs.append(b);
    }
    const pills = el('div', 'sh-pills');
    pills.append(fmts, designs);
    const acts = el('div', 'sh-acts');
    const copy = btn('Copiar imagen', 'sh-btn');
    const save = btn('Guardar imagen', 'sh-btn sh-ghost');
    const ctext = btn('Copiar texto', 'sh-btn sh-ghost');
    copy.addEventListener('click', () => { toast('Imagen copiada'); log('«Copiar imagen»: el PNG va al portapapeles (se pinta en el PC a partir del mismo dibujo).'); });
    save.addEventListener('click', () => { toast('Guardada en Imágenes › Tapomo'); log(`«Guardar imagen»: tapomo-${opt.kind}.png, ${W[opt.fmt].join(' × ')} px, con el diálogo de guardar de Windows.`); });
    ctext.addEventListener('click', () => { toast('Texto copiado'); log('«Copiar texto»: copia lo que hay en el cuadro, con el enlace.'); });
    acts.append(copy, save, ctext);
    const nets = el('div', 'sh-nets');
    for (const [k, letter, label, host] of NETS) {
      const b = btn('', `sh-net sh-net-${k}`);
      b.title = `Compartir en ${label}`;
      b.append(el('i', '', letter), el('span', '', label));
      b.addEventListener('click', () => { toast('Imagen copiada · pégala con Ctrl+V'); log(`${label}: se abre el navegador en ${host} con el texto y el enlace ya puestos. La imagen no viaja por la URL: está copiada para pegarla con Ctrl+V.`); });
      nets.append(b);
    }
    const ta = el('textarea', 'sh-ta');
    // What the user typed stays when the design or the format changes (same card, same language).
    const tkey = `${opt.kind}|${opt.lang}`;
    ta.value = typed.key === tkey ? typed.text : shareText(opt.kind, opt.lang);
    ta.addEventListener('input', () => { typed = { key: tkey, text: ta.value }; });
    ta.setAttribute('aria-label', 'Texto para compartir');
    ta.rows = opt.fmt === 'land' ? 2 : 4;
    side.append(pills, acts, el('p', 'sh-lbl', 'Compartir en'), nets, ta);
    dlg.append(head, prev, side);
    return dlg;
  }
  function headerMock() {
    const h = el('div', 'sh-hdr');
    const top = el('div', 'sh-hdr-top');
    const wrap = el('div', 'sh-hdr-mascot');
    wrap.append(tapomo());
    const brand = el('div', 'sh-brand');
    brand.append(el('b', '', 'Tapomo'), el('span', '', 'v1.0.2'));
    top.append(wrap, brand);
    const nav = el('div', 'sh-nav');
    const tabs = el('div', 'sh-tabs');
    ['Hoy', 'Progreso', 'Aprender', 'Tapomo'].forEach((t, i) => { const b = el('span', i === 0 ? 'on' : '', t); tabs.append(b); });
    const share = btn('', 'sh-icon sh-icon-share');
    share.innerHTML = SHARE_SVG;
    share.title = 'Compartir Tapomo';
    share.setAttribute('aria-label', 'Compartir Tapomo');
    share.addEventListener('click', () => { opt.kind = 'tapomo'; opt.view = 'share'; sync(); log('Icono de compartir: abre el panel con la tarjeta «Tapomo».'); });
    const tip = el('span', 'sh-tip', 'Compartir Tapomo');
    const sw = el('span', 'sh-icon-wrap');
    sw.append(share, tip);
    const gear = el('span', 'sh-icon');
    gear.innerHTML = GEAR_SVG;
    const heart = el('span', 'sh-icon heart');
    heart.innerHTML = HEART_SVG;
    nav.append(tabs, sw, gear, heart);
    const body = el('div', 'sh-hdr-body');
    const c1 = el('div', 'sh-fake');
    c1.append(el('b', '', 'Ahora mismo'), el('i'), el('i', 'short'));
    const c2 = el('div', 'sh-fake');
    c2.append(el('b', '', 'Retos del día'), el('i'), el('i', 'short'));
    body.append(c1, c2);
    h.append(top, nav, body);
    return h;
  }
  const CTA = [
    ['¿Te gusta Tapomo? Compártelo con tus amigos y ayúdanos a crecer', 'Compartir Tapomo'],
    ['¿No puedes apoyar con dinero? Compartirlo también ayuda muchísimo', 'Compartir Tapomo'],
    ['Cuéntaselo a alguien: cada persona que llega ayuda a que Tapomo siga creciendo', 'Compartir Tapomo'],
  ];
  function supportMock() {
    const p = el('div', 'sh-hdr sh-sup-page');
    const nav = el('div', 'sh-nav');
    const tabs = el('div', 'sh-tabs');
    ['Hoy', 'Progreso', 'Aprender', 'Tapomo'].forEach((t) => tabs.append(el('span', '', t)));
    const s = el('span', 'sh-icon');
    s.innerHTML = SHARE_SVG;
    const g = el('span', 'sh-icon');
    g.innerHTML = GEAR_SVG;
    const hh = el('span', 'sh-icon heart on');
    hh.innerHTML = HEART_SVG;
    nav.append(tabs, s, g, hh);
    const cardEl = el('div', 'sh-sup');
    const art = el('div', 'sh-sup-art');
    art.append(tapomo(E.current(), { eyes: 'round', mouth: 'big', cheeks: true }), el('span', 'sh-sup-heart', '💗'));
    const bd = el('div', 'sh-sup-body');
    bd.append(el('b', 'sh-sup-title', 'Apoya a Tapomo'), el('p', '', 'Tapomo es gratis, de código abierto y sin anuncios. Detrás hay muchas horas de trabajo y mucho cariño. Si te está ayudando, tu apoyo es lo que hace que siga mejorando.'));
    const bs = el('div', 'sh-sup-btns');
    bs.append(el('span', 'sh-sp-btn', '☕ Invitar a un café en Ko-fi'), el('span', 'sh-sp-btn ghost', '💜 GitHub Sponsors'));
    bd.append(bs);
    const share = el('div', 'sh-sup-share');
    const [q, b] = CTA[opt.cta];
    const go = btn('', 'sh-sp-btn sh-sp-share');
    go.innerHTML = SHARE_SVG;
    go.append(b);
    go.addEventListener('click', () => { opt.kind = 'tapomo'; opt.view = 'share'; sync(); log('Botón de la página ♥: abre el panel con la tarjeta «Tapomo».'); });
    share.append(el('p', '', q), go);
    cardEl.append(art, bd, share);
    p.append(nav, cardEl);
    return p;
  }
  function render() {
    if (!mock) { mock = el('div', 'sh-mock'); }
    // The toast stays while the panel repaints, not when another view takes its place.
    const keepToast = mock.dataset.view === opt.view ? mock.querySelector('.sh-toastmsg') : null;
    mock.dataset.view = opt.view;
    mock.replaceChildren(opt.view === 'share' ? shareDialog() : opt.view === 'header' ? headerMock() : supportMock());
    if (keepToast) mock.append(keepToast);
    E.takeStage('compartir', mock, () => {});
  }
  function run() { E.play('compartir'); render(); }

  // ------------------------------------------------------------------ fieldset
  const { body, set } = E.add('compartir', 'Compartir');
  set('stop', () => {});
  set('onAnchor', () => run());
  body.append(el('p', 'note', 'Una imagen para enseñar tu semana, una subida de nivel o un récord (o Tapomo sin más) en una red social. Se crea en tu PC con la ropa de «Premios»; nunca sale nada de lo que escribes. Al tocar un control, el escenario muestra la app (el panel de compartir o los dos sitios desde donde se abre).'));
  const NAMES = { a: 'A · Cartel', b: 'B · Aviso', c: 'C · Tarjeta' };
  const DESC = {
    a: 'Como el cartel de los avisos: Tapomo levanta un cartel grande con las manitas, con rayos detrás y confeti de teclas. El más de fiesta: para niveles y récords.',
    b: 'Como el aviso B: una tarjeta limpia sobre el fondo del escritorio, con el mini-Tapomo y las cifras en casillas. El más sobrio: queda bien en LinkedIn.',
    c: 'Como una carta coleccionable: marco de colores, Tapomo en su ventanita con rayos, «nivel» arriba y las cifras como si fueran ataques. El texto grande va al lado (en cuadrado, encima, y la cifra grande como pegatina en el borde de la carta).',
  };
  const segs = [];
  const mk = (label, values, key, after) => { const s = seg(label, values, () => opt[key], (v) => { opt[key] = v; if (after) after(v); sync(); }); segs.push(s); return s.box; };
  const viewSeg = mk('Vista', [['share', 'Panel de compartir'], ['header', 'Cabecera'], ['support', 'Página ♥']], 'view');
  const kindSeg = mk('Tarjeta', [['semana', 'Mi semana'], ['nivel', '¡Nivel N!'], ['record', '¡Récord!'], ['tapomo', 'Tapomo']], 'kind', () => { opt.view = 'share'; });
  const rewSeg = mk('Nivel', [[true, 'con premio (16)'], [false, 'sin premio (17)']], 'reward');
  const recSeg = mk('Récord', [['speed', 'de velocidad'], ['days', 'de días seguidos']], 'rec');
  const vSeg = mk('Diseño', [['a', NAMES.a], ['b', NAMES.b], ['c', NAMES.c]], 'v', (v) => { opt.view = 'share'; saveDesign(v); });
  const fSeg = mk('Formato', [['sq', 'Cuadrado (recomendado)'], ['land', 'Horizontal']], 'fmt', () => { opt.view = 'share'; });
  const fNote = el('p', 'note', 'Cuadrado de serie: se ve entero en WhatsApp, Instagram, Telegram y en el móvil en LinkedIn/X. El horizontal sirve también como vista previa de tapomo.app (1200 × 630).');
  const lSeg = mk('Idioma de la imagen', [['es', 'ES'], ['en', 'EN']], 'lang', () => { opt.view = 'share'; });
  const tSeg = mk('Colores', [['auto', 'como la app'], ['light', 'claros'], ['dark', 'oscuros']], 'theme', () => { opt.view = 'share'; });
  const ctaSeg = mk('Texto del bloque', [[0, '1'], [1, '2'], [2, '3']], 'cta', () => { opt.view = 'support'; });
  const nameRow = el('label');
  const cb = el('input');
  cb.type = 'checkbox';
  const nin = el('input', 'sh-name-in');
  nin.type = 'text';
  nin.value = opt.who;
  nin.maxLength = 20;
  nin.setAttribute('aria-label', 'Nombre');
  cb.addEventListener('change', () => { opt.name = cb.checked; opt.view = 'share'; sync(); });
  nin.addEventListener('input', () => { opt.who = nin.value; if (opt.name) { opt.view = 'share'; sync(); } });
  nameRow.append(cb, 'Poner mi nombre', nin);
  const desc = el('p', 'note');
  const logEl = el('p', 'note');
  logEl.setAttribute('role', 'status');
  const log = (t) => { logEl.textContent = t; };
  const bs = el('div', 'btns');
  const go = btn('▶ Ver en el escenario');
  go.addEventListener('click', run);
  bs.append(go, E.backBtn());
  const notes = el('details', 'rules-d');
  notes.append(el('summary', '', 'Notas'), E.list([
    'La imagen se crea en el PC del usuario, con el mismo dibujo que la app (SVG pintado en un canvas). No se sube nada a ningún servidor y nunca sale texto escrito: solo cifras, el nivel y la ropa de Tapomo.',
    'Compartir siempre es un gesto del usuario: nada se publica solo y no se pide ninguna cuenta. El nombre es opcional y viene desmarcado.',
    'Los botones de red abren el navegador con el texto y el enlace ya puestos (x.com/intent/post, linkedin.com/sharing, wa.me, t.me/share, bsky.app/intent/compose, reddit.com/submit). Una URL no puede llevar una imagen: por eso la app la copia antes y avisa «Imagen copiada · pégala con Ctrl+V».',
    'Formato: cuadrado de serie (1080 × 1080): se ve entero en WhatsApp, Instagram, Telegram y en el móvil en LinkedIn/X. El horizontal (1200 × 630) sirve también como vista previa de tapomo.app. En cuadrado el texto va arriba y Tapomo grande abajo; en el móvil del feed (≈ 360 px) el título queda a ≥ 20 px y las cifras con separador de miles; como mucho 4 cifras (3 en la carta).',
    'El enlace lleva ?ref=semana, nivel, record o tapomo (igual en ES y EN) para saber qué tarjeta trae gente a tapomo.app, sin cookies ni datos de nadie.',
    'Más adelante: el panel nativo de compartir de Windows (DataTransferManager), que sí puede pasar la imagen a las apps instaladas. Los botones de red se quedarían como atajo.',
    'Entradas: icono de compartir junto a ⚙ y ♥ en la cabecera («Compartir Tapomo», abre la tarjeta «Tapomo»), bloque en la página ♥, y un botón «Compartir» en el resumen semanal, en el popup de nivel y en los récords (abre su tarjeta).',
    'Texto del bloque en la página ♥ (propuesta 1, con dos alternativas): «¿Te gusta Tapomo? Compártelo con tus amigos y ayúdanos a crecer» · «¿No puedes apoyar con dinero? Compartirlo también ayuda muchísimo» · «Cuéntaselo a alguien: cada persona que llega ayuda a que Tapomo siga creciendo».',
  ]));
  body.append(viewSeg, kindSeg, rewSeg, recSeg, vSeg, desc, fSeg, fNote, nameRow, lSeg, tSeg, ctaSeg, bs, logEl, notes);
  function sync() {
    segs.forEach((s) => s.sync());
    rewSeg.hidden = opt.kind !== 'nivel';
    recSeg.hidden = opt.kind !== 'record';
    ctaSeg.hidden = opt.view !== 'support';
    desc.replaceChildren(el('b', '', `${NAMES[opt.v]}. `), DESC[opt.v]);
    run();
  }
  segs.forEach((s) => s.sync());
  rewSeg.hidden = true;
  recSeg.hidden = true;
  ctaSeg.hidden = true;
  desc.replaceChildren(el('b', '', `${NAMES[opt.v]}. `), DESC[opt.v]);
  // Theme changes repaint the card when it follows the app.
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (mock?.isConnected) render(); });

  window.CompartirLab = { opt, run, card, sync: () => sync(), toast };
})();
