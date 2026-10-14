// Badge medals ("insignias", 0.3.3): one round medal per badge, drawn as an SVG string in the
// mascot's ink style (ink outlines, soft pastel fills, rounded joins, white highlights).
//
// API: BadgeArt.medal(id, rarity, earned) -> '<svg viewBox="0 0 64 64">…</svg>'
//   rarity: 'bronze' | 'silver' | 'gold'. The rim shape tells them apart even in greyscale:
//           bronze = plain rim, silver = beaded rim, gold = star-point rim.
//   earned: false draws a soft monochrome silhouette (same shapes, no colour, low opacity).
// No ids, gradients or <defs>, so any number of medals can share a page. No width/height: size
// it with CSS. Unknown ids get a plain star so a missing drawing never breaks a grid.
(() => {
  'use strict';
  if (window.BadgeArt) return;

  const INK = '#23202b';
  const FONT = "'Nunito','Segoe UI Rounded','Segoe UI',system-ui,sans-serif";

  const RIMS = {
    bronze: { rim: '#dc9a62', body: '#f6cfa8', ring: '#c98551', shine: '#fff1e2' },
    silver: { rim: '#b4bdd2', body: '#e9edf6', ring: '#a3adc4', shine: '#ffffff' },
    gold: { rim: '#f7bc2f', body: '#ffe48a', ring: '#e9a723', shine: '#fff8d6' },
  };
  // Pictogram colours. In the silhouette every fill collapses to one muted tone.
  const COLOURS = {
    ink: INK, white: '#fff',
    peach: '#ff9e7a', peachDark: '#f07f5e', cream: '#fff8ee', gold: '#ffcc4d', goldDark: '#f2a93b',
    flame: '#ff8a5c', flameIn: '#ffd56b', mint: '#8fd49a', sky: '#9fc8ff', lilac: '#c9b8ff',
    night: '#5d5a8a', blush: '#ff6f61', track: '#ffffff',
  };
  const GHOST_FILL = '#b7b0c4';
  const GHOST_LINE = '#8d86a0';

  const f2 = (n) => +n.toFixed(2);
  const starPts = (cx, cy, R, r, n = 5, rot = -Math.PI / 2) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = rot + (i * Math.PI) / n;
      const k = i % 2 ? r : R;
      return `${f2(cx + Math.cos(a) * k)},${f2(cy + Math.sin(a) * k)}`;
    }).join(' ');

  // ---------------------------------------------------------------- pictogram parts
  // Every part takes the colour set `c` so the silhouette can reuse the same drawings.

  const spark = (c, x, y, s = 1) =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -4.4 L1.3 -1.3 L4.4 0 L1.3 1.3 L0 4.4 L-1.3 1.3 L-4.4 0 L-1.3 -1.3Z" fill="${c.gold}" stroke="${c.ink}" stroke-width="${f2(1.2 / s)}" stroke-linejoin="round"/>`;
  const star = (c, x, y, R = 4.2) =>
    `<polygon points="${starPts(x, y, R, R * 0.45)}" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.3" stroke-linejoin="round"/>`;
  const label = (c, x, y, text, size) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${size}" fill="${c.ink}" letter-spacing="-.3">${text}</text>`;

  /** A mochi keycap: darker skirt, lighter top face, optional tiny Tapomo face. */
  const key = (c, x, y, w, h, face = false) => {
    const r = Math.min(4, h * 0.38);
    const top = h * 0.72;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c.peachDark}" stroke="${c.ink}" stroke-width="1.7"/>`;
    s += `<rect x="${f2(x + w * 0.12)}" y="${f2(y + h * 0.1)}" width="${f2(w * 0.76)}" height="${f2(top - h * 0.06)}" rx="${f2(r * 0.8)}" fill="${c.peach}"/>`;
    s += `<path d="M${f2(x + w * 0.22)} ${f2(y + h * 0.24)} H${f2(x + w * 0.5)}" stroke="${c.white}" stroke-width="1.3" stroke-linecap="round" opacity=".75"/>`;
    if (face) {
      const cx = x + w / 2, ey = y + h * 0.46;
      s += `<circle cx="${f2(cx - w * 0.17)}" cy="${f2(ey)}" r="1.25" fill="${c.ink}"/><circle cx="${f2(cx + w * 0.17)}" cy="${f2(ey)}" r="1.25" fill="${c.ink}"/>`;
      s += `<path d="M${f2(cx - 1.7)} ${f2(ey + 2)} Q${f2(cx)} ${f2(ey + 3.4)} ${f2(cx + 1.7)} ${f2(ey + 2)}" fill="none" stroke="${c.ink}" stroke-width="1.1" stroke-linecap="round"/>`;
    }
    return s;
  };
  /** Keycaps stacked bottom-up, each a touch narrower; returns markup and the top y. */
  const stack = (c, n, cx, bottom, w, h, shrink) => {
    let s = '', y = bottom;
    const caps = [];
    for (let i = 0; i < n; i++) {
      const ww = w - i * shrink;
      y -= h;
      caps.push(key(c, f2(cx - ww / 2), f2(y), ww, h, i === n - 1));
      y += 1.2; // slight overlap so they sit on each other
    }
    return { svg: s + caps.join(''), top: y - 1.2 };
  };
  const crown = (c, cx, by, w) => {
    const k = w / 36;
    const P = (x, y) => `${f2(cx + (x - 80) * k)} ${f2(by + (y - 42) * k)}`;
    const dot = (x, y) => `<circle cx="${f2(cx + (x - 80) * k)}" cy="${f2(by + (y - 42) * k)}" r="${f2(2.6 * k)}" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.3"/>`;
    return `<path d="M${P(63, 42)} L${P(61, 26)} L${P(72, 34)} L${P(80, 22)} L${P(88, 34)} L${P(99, 26)} L${P(97, 42)} Z" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
      dot(61, 26) + dot(80, 22) + dot(99, 26) +
      `<path d="M${P(68, 37.5)} H${P(92, 37.5).split(' ')[0]}" stroke="${c.white}" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>`;
  };
  const flame = (c, cx, by, s, text, size) => {
    const P = (x, y) => `${f2(cx + x * s)} ${f2(by + y * s)}`;
    const outer = `M${P(0, 0)} C${P(-9, 0)} ${P(-12.5, -7)} ${P(-10, -14)} C${P(-8.5, -18)} ${P(-5, -19)} ${P(-4.5, -24)} C${P(-1, -21.5)} ${P(0, -19)} ${P(-0.5, -16)} C${P(1.5, -19.5)} ${P(4, -24)} ${P(3, -30)} C${P(10, -25)} ${P(13, -16)} ${P(11, -9)} C${P(9.5, -3)} ${P(5, 0)} ${P(0, 0)} Z`;
    const inner = `M${P(0, -1.8)} C${P(-5.6, -1.8)} ${P(-7.6, -6)} ${P(-6, -10.5)} C${P(-5, -13)} ${P(-2.5, -14)} ${P(-1.5, -16.5)} C${P(1.5, -14.5)} ${P(3, -16)} ${P(4, -18)} C${P(7.5, -14)} ${P(8, -9)} ${P(6.5, -6)} C${P(5, -3)} ${P(3, -1.8)} ${P(0, -1.8)} Z`;
    return `<path d="${outer}" fill="${c.flame}" stroke="${c.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
      `<path d="${inner}" fill="${c.flameIn}"/>` +
      label(c, f2(cx), f2(by - 3.2 * s), text, size);
  };
  const stamp = (c, x, y, r = 5) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c.mint}" stroke="${c.ink}" stroke-width="1.6"/>` +
    `<circle cx="${x}" cy="${y}" r="${f2(r - 1.7)}" fill="none" stroke="${c.white}" stroke-width=".9" stroke-dasharray="1.4 1.3" opacity=".9"/>` +
    `<path d="M${f2(x - r * 0.45)} ${f2(y + 0.1)} L${f2(x - r * 0.1)} ${f2(y + r * 0.42)} L${f2(x + r * 0.5)} ${f2(y - r * 0.4)}" fill="none" stroke="${c.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const pencil = (c, tipX, tipY, len, ang) => {
    // Drawn pointing right from the tip, then rotated: tip, wood cone, yellow body, pink cap.
    const L = len;
    return `<g transform="translate(${tipX} ${tipY}) rotate(${ang})">` +
      `<path d="M0 0 L6 -3.2 L6 3.2 Z" fill="${c.cream}" stroke="${c.ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M0 0 L2.2 -1.15 L2.2 1.15 Z" fill="${c.ink}"/>` +
      `<rect x="6" y="-3.2" width="${L - 10}" height="6.4" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M7.5 -1.2 H${L - 5.5}" stroke="${c.white}" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>` +
      `<rect x="${L - 4}" y="-3.2" width="4.4" height="6.4" rx="1.6" fill="${c.peach}" stroke="${c.ink}" stroke-width="1.5"/></g>`;
  };
  /** A smooth unbroken ribbon line, ink outline under a pastel core. */
  const ribbon = (c, d) =>
    `<path d="${d}" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${c.sky}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;

  const PICTOS = {
    first_burst: (c) => key(c, 22, 25, 20, 17, true) + spark(c, 43.5, 22, 1.05) + spark(c, 20, 21.5, 0.6),
    bursts_100: (c) => stack(c, 2, 32, 45, 22, 12.5, 3).svg,
    bursts_1000: (c) => stack(c, 3, 32, 46.5, 22, 10.2, 2.6).svg,
    bursts_10000: (c) => {
      const t = stack(c, 3, 32, 47, 19, 8.8, 2.2);
      return t.svg + crown(c, 32, t.top - 0.6, 15);
    },
    clean_1000: (c) => ribbon(c, 'M16.5 40 C21 33 25 33 29 38 S36 42 40 34') + pencil(c, 41, 33.5, 17, -55),
    clean_5000: (c) => ribbon(c, 'M14 42 C17 36 20 36 23 40 S29 44 32 39 S38 32 41 35') + pencil(c, 42, 34, 15, -55) +
      star(c, 21, 24, 3.6) + star(c, 31, 20.5, 2.6),
    day_10000: (c) =>
      `<path d="M21 17.5 H38 L44 23.5 V45 Q44 47 42 47 H23 Q21 47 21 45 Z" fill="${c.cream}" stroke="${c.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
      `<path d="M38 17.5 V22 Q38 23.5 39.5 23.5 H44" fill="${c.white}" stroke="${c.ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
      label(c, 32.4, 36.4, '10k', 10.5) +
      `<path d="M25 41.5 H40" stroke="${c.peach}" stroke-width="1.8" stroke-linecap="round"/><path d="M25 22.5 H33" stroke="${c.lilac}" stroke-width="1.8" stroke-linecap="round"/>`,
    first_record: (c) =>
      `<path d="M23 23 Q16 23 17 29 Q18 34 25 34" fill="none" stroke="${c.ink}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M23 23 Q16 23 17 29 Q18 34 25 34" fill="none" stroke="${c.gold}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M41 23 Q48 23 47 29 Q46 34 39 34" fill="none" stroke="${c.ink}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M41 23 Q48 23 47 29 Q46 34 39 34" fill="none" stroke="${c.gold}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M29.5 37 H34.5 L35.5 42 H28.5 Z" fill="${c.goldDark}" stroke="${c.ink}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<rect x="23.5" y="41.5" width="17" height="5" rx="1.8" fill="${c.peach}" stroke="${c.ink}" stroke-width="1.6"/>` +
      `<path d="M21.5 19.5 H42.5 V25 Q42.5 38 32 38 Q21.5 38 21.5 25 Z" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
      `<path d="M25 23 V27 Q25.5 31 28 33" fill="none" stroke="${c.white}" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>` +
      `<polygon points="${starPts(32, 27.6, 4, 1.8)}" fill="${c.white}" opacity=".9"/>`,
    beating_5: (c) =>
      `<g stroke="${c.ink}" stroke-width="1.8" stroke-linecap="round" opacity=".55"><path d="M15.5 27 H22"/><path d="M14 33 H21"/><path d="M16.5 39 H22"/></g>` +
      `<path d="M36 15.5 L24.5 33 H31.5 L28 48 L42.5 27.5 H35 L39.5 15.5 Z" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.8" stroke-linejoin="round"/>` +
      `<path d="M35.5 18.5 L29.5 28" stroke="${c.white}" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>`,
    streak_7: (c) => flame(c, 32, 47, 0.95, '7', 11.5),
    streak_30: (c) => flame(c, 32, 47, 0.97, '30', 10.5),
    streak_100: (c) => flame(c, 32, 48.5, 1.08, '100', 9.4) + spark(c, 18, 22, 0.6) + spark(c, 46.5, 27, 0.55),
    early_bird: (c) => {
      let rays = '';
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + ((i + 0.5) * Math.PI) / 5;
        rays += `<path d="M${f2(32 + Math.cos(a) * 12.5)} ${f2(38 + Math.sin(a) * 12.5)} L${f2(32 + Math.cos(a) * 16.5)} ${f2(38 + Math.sin(a) * 16.5)}" />`;
      }
      return `<g stroke="${c.ink}" stroke-width="1.8" stroke-linecap="round">${rays}</g>` +
        `<path d="M22 38 A10 10 0 0 1 42 38 Z" fill="${c.gold}" stroke="${c.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
        `<path d="M26 34.5 A6.5 6.5 0 0 1 30 30" fill="none" stroke="${c.white}" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M17 38 H47" stroke="${c.ink}" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="M21 43 H29 M35 43 H43" stroke="${c.ink}" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>` +
        // little bird
        `<path d="M40.5 25.5 Q42.5 22.6 44.6 25.2 Q46.8 22.4 48.8 25.2" fill="none" stroke="${c.ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
    night_owl: (c) =>
      `<path d="M36.5 17.5 A14 14 0 1 0 46 38 A11 11 0 1 1 36.5 17.5 Z" fill="${c.lilac}" stroke="${c.ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
      `<path d="M22.5 27 A10 10 0 0 1 28 21" fill="none" stroke="${c.white}" stroke-width="1.4" stroke-linecap="round" opacity=".85"/>` +
      // sleepy owl face on the moon
      `<g fill="none" stroke="${c.ink}" stroke-width="1.4" stroke-linecap="round"><path d="M22.5 33 Q24.5 34.8 26.5 33"/><path d="M29.5 34.5 Q31.5 36.3 33.5 34.5"/></g>` +
      `<path d="M27 37 L28.6 39.4 L30.2 37.3 Z" fill="${c.gold}" stroke="${c.ink}" stroke-width="1" stroke-linejoin="round"/>` +
      `<circle cx="22.5" cy="38" r="1.6" fill="${c.blush}" opacity=".6"/>` +
      star(c, 42, 22, 3.6) + spark(c, 46.5, 31, 0.5),
    goal_week: (c) => {
      const R = 12.5, C = 2 * Math.PI * R;
      return `<circle cx="32" cy="32" r="${R}" fill="none" stroke="${c.ink}" stroke-width="6.2"/>` +
        `<circle cx="32" cy="32" r="${R}" fill="none" stroke="${c.track}" stroke-width="3.4"/>` +
        `<circle cx="32" cy="32" r="${R}" fill="none" stroke="${c.mint}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="${f2(C * 0.86)} ${f2(C)}" transform="rotate(-90 32 32)"/>` +
        `<path d="M26.5 32.5 L30.5 36.5 L38 28" fill="none" stroke="${c.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
    first_full: (c) => stamp(c, 20.5, 33, 5.2) + stamp(c, 32, 33, 5.2) + stamp(c, 43.5, 33, 5.2),
    full_30: (c) => stamp(c, 20.5, 37, 5.2) + stamp(c, 32, 37, 5.2) + stamp(c, 43.5, 37, 5.2) + star(c, 32, 23.5, 5.6),
    crowned: (c) => crown(c, 32, 41, 26) + spark(c, 18.5, 22, 0.55) + spark(c, 46, 20, 0.6),
  };
  const fallback = (c) => star(c, 32, 32, 10);

  // ---------------------------------------------------------------- medal body

  const GOLD_POINTS = 16;
  const body = (rarity, m, line) => {
    let s = '';
    if (rarity === 'gold') {
      s += `<polygon points="${starPts(32, 32, 31, 26.4, GOLD_POINTS, -Math.PI / 2)}" fill="${m.ring}" stroke="${line}" stroke-width="1.8" stroke-linejoin="round"/>`;
    }
    s += `<circle cx="32" cy="32" r="${rarity === 'gold' ? 26.4 : 28}" fill="${m.rim}" stroke="${line}" stroke-width="2"/>`;
    if (rarity === 'silver') {
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        s += `<circle cx="${f2(32 + Math.cos(a) * 24.8)}" cy="${f2(32 + Math.sin(a) * 24.8)}" r="1.15" fill="${m.shine}" opacity=".9"/>`;
      }
    }
    const r = rarity === 'gold' ? 22 : 23;
    s += `<circle cx="32" cy="32" r="${r}" fill="${m.body}" stroke="${line}" stroke-width="1.6"/>`;
    s += `<circle cx="32" cy="32" r="${f2(r - 2.2)}" fill="none" stroke="${m.ring}" stroke-width="1" opacity=".7"/>`;
    return s;
  };
  const shine = (rarity, m) => {
    const R = rarity === 'gold' ? 24.2 : 25.6;
    const a0 = Math.PI * 1.08, a1 = Math.PI * 1.42;
    return `<path d="M${f2(32 + Math.cos(a0) * R)} ${f2(32 + Math.sin(a0) * R)} A${R} ${R} 0 0 1 ${f2(32 + Math.cos(a1) * R)} ${f2(32 + Math.sin(a1) * R)}" fill="none" stroke="${m.shine}" stroke-width="2" stroke-linecap="round" opacity=".95"/>` +
      `<circle cx="${f2(32 + Math.cos(Math.PI * 1.53) * R)}" cy="${f2(32 + Math.sin(Math.PI * 1.53) * R)}" r="1.1" fill="${m.shine}"/>`;
  };

  const ghostColours = Object.fromEntries(Object.keys(COLOURS).map((k) => [k, GHOST_FILL]));
  ghostColours.ink = GHOST_LINE;

  // Pictograms are drawn for a ~28 px box; nudge them up a little so they hold at 48 px.
  const picto = (draw, c) => `<g transform="translate(32 32) scale(1.07) translate(-32 -32)">${draw(c)}</g>`;

  function medal(id, rarity, earned = true) {
    const tier = RIMS[rarity] ? rarity : 'bronze';
    const draw = PICTOS[id] || fallback;
    const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">';
    if (earned === false) {
      const g = { rim: GHOST_FILL, body: GHOST_FILL, ring: GHOST_FILL, shine: GHOST_FILL };
      // Opacity on the group, so overlaps stay flat: one soft tone with faint engraved lines.
      return `${open}<g opacity=".4">${body(tier, g, GHOST_LINE)}<g opacity=".9">${picto(draw, ghostColours)}</g></g></svg>`;
    }
    const m = RIMS[tier];
    return `${open}${body(tier, m, INK)}${shine(tier, m)}${picto(draw, COLOURS)}</svg>`;
  }

  window.BadgeArt = { medal, ids: Object.keys(PICTOS) };
})();
