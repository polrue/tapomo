// Floating Tapomo's «after an update» moment (approved in the lab's «Reinicio» study, lab/reinicio.js).
// The first time Tapomo shows up on a new version it turns to stone and the stone bursts, either as
// A · Estallido (cracks, tremble, shards flying with spin and gravity, dust, squash-pop) or as
// D · ¡Pof! (a comic star and a dust cloud), picked at random. The clothes go on AFTER the burst, one by
// one; the only trace of the old «Tapomo dorado» is a brief shine (never a gold colour). Then a bubble
// links to the news. With reduced motion there is no stone: just the bubble.
// pet.js owns the pet; this file only draws. Kept as close to the lab's code as the pet allows.
const PetUpdate = (() => {
  const INK = '#23202b';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('mascot');
  let host = null; // { renderFace, pre(text), news(), done() } given by pet.js

  // ------------------------------------------------------------------ geometry (Tapomo's 160 × 160 box)
  const BODY = 'x="30" y="40" width="100" height="98" rx="30"';
  const P = [82, 90]; // where the cracks start
  // Points on the body's outline, by distance along it (clockwise from the top-left corner).
  const perim = (s) => {
    s = ((s % 396) + 396) % 396;
    if (s < 100) return [30 + s, 40];
    if (s < 198) return [130, 40 + (s - 100)];
    if (s < 298) return [130 - (s - 198), 138];
    return [30, 138 - (s - 298)];
  };
  const CORNERS = [[0, [30, 40]], [100, [130, 40]], [198, [130, 138]], [298, [30, 138]]];
  const S = [14, 64, 118, 170, 222, 262, 318, 362];
  const EDGE = S.map(perim);
  const jag = (b, i) => {
    const t = i % 3 === 0 ? 0.45 : 0.58;
    const mx = P[0] + (b[0] - P[0]) * t;
    const my = P[1] + (b[1] - P[1]) * t;
    const k = i % 2 ? 5 : -5;
    const dx = b[1] - P[1];
    const dy = P[0] - b[0];
    const n = Math.hypot(dx, dy) || 1;
    return [mx + (dx / n) * k, my + (dy / n) * k];
  };
  const J = EDGE.map(jag);
  const f1 = (v) => v.toFixed(1);
  const pts = (a) => a.map((p) => p.map(f1).join(',')).join(' ');
  const SHARDS = S.map((s0, i) => {
    const n = (i + 1) % S.length;
    const s1 = n === 0 ? S[0] + 396 : S[n];
    const mid = [];
    for (const [c, xy] of CORNERS) for (const c2 of [c, c + 396]) if (c2 > s0 && c2 < s1) mid.push(xy);
    const poly = [P, J[i], EDGE[i], ...mid, EDGE[n], J[n]];
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
    const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    return { pts: pts(poly), c: [cx, cy] };
  });
  // One crack per edge point (centre → jag → edge) and a little branch at each jag.
  const CRACKS = EDGE.map((b, i) => {
    const j = J[i];
    const bx = j[0] + (i % 2 ? 7 : -7) * Math.sign(b[1] - P[1] || 1);
    const by = j[1] + (i % 2 ? -5 : 6);
    return `M${P[0]} ${P[1]} L${f1(j[0])} ${f1(j[1])} L${b[0]} ${b[1]} M${f1(j[0])} ${f1(j[1])} L${f1(bx)} ${f1(by)}`;
  });

  // ------------------------------------------------------------------ drawings
  const STONE_DEFS = `<pattern id="rn-stone-__N__" patternUnits="userSpaceOnUse" width="16" height="16">
      <rect width="16" height="16" fill="#aaa5b0"/><circle cx="3" cy="4" r="1.1" fill="#8d8894"/><circle cx="11" cy="9" r="1.4" fill="#96919d"/>
      <circle cx="6" cy="13" r=".9" fill="#c4c0ca"/><circle cx="13" cy="2" r=".8" fill="#c4c0ca"/><circle cx="9" cy="5" r=".6" fill="#7f7a86"/></pattern>
    <linearGradient id="rn-shade-__N__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".2"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#2b2733" stop-opacity=".32"/></linearGradient>
    <clipPath id="rn-body-__N__"><rect ${BODY}/></clipPath>
    ${SHARDS.map((s, i) => `<clipPath id="rn-sh${i}-__N__"><polygon points="${s.pts}"/></clipPath>`).join('')}`;
  // The whole stone Tapomo (each shard shows its own piece of it): texture, shading, rim, a carved face.
  const STONE_ART = `<rect ${BODY} fill="url(#rn-stone-__N__)"/><rect ${BODY} fill="url(#rn-shade-__N__)"/>
      <rect ${BODY} fill="none" stroke="#6f6a77" stroke-width="5" opacity=".55"/>
      <ellipse cx="66" cy="51" rx="24" ry="5" fill="#fff" opacity=".22"/>
      <g fill="none" stroke-linecap="round">
        <path d="M55 86.2 Q62 80.2 69 86.2 M91 86.2 Q98 80.2 105 86.2 M75 103.2 Q80 106.2 85 103.2" stroke="#dcd8e0" stroke-width="1.8" opacity=".9"/>
        <path d="M55 85 Q62 79 69 85 M91 85 Q98 79 105 85 M75 102 Q80 105 85 102" stroke="#4c4754" stroke-width="3.4"/>
      </g>`;
  const SHELL = () => `<g class="rn-shell">
      ${SHARDS.map((s, i) => `<g class="rn-shard" data-i="${i}"><g clip-path="url(#rn-body-__N__)"><g clip-path="url(#rn-sh${i}-__N__)">${STONE_ART}</g></g></g>`).join('')}
      <g class="rn-cracks" clip-path="url(#rn-body-__N__)" fill="none" stroke="#35313c" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        ${CRACKS.map((d, i) => `<path class="rn-crack" data-i="${i}" d="${d}" pathLength="1"/>`).join('')}</g>
    </g>`;
  // The brand-new glint (only the reflection of the «Tapomo dorado» look: no gold colour).
  const GLINT = `<g clip-path="url(#rn-body-__N__)"><g class="rn-glint" opacity="0">
      <path d="M22 30 L44 30 L4 150 L-18 150 Z" fill="#fff" opacity=".62"/><path d="M52 30 L58 30 L18 150 L12 150 Z" fill="#fff" opacity=".45"/></g></g>`;
  const SPARK = 'M0 -7 L1.7 -1.7 L7 0 L1.7 1.7 L0 7 L-1.7 1.7 L-7 0 L-1.7 -1.7Z';
  const POF = (() => {
    const p = [];
    for (let i = 0; i < 24; i++) { const r = i % 2 ? 22 : 40 + (i % 4 === 0 ? 4 : 0); const a = (i / 24) * Math.PI * 2 - Math.PI / 2; p.push([80 + Math.cos(a) * r * 1.12, 88 + Math.sin(a) * r]); }
    const q = p.map(([x, y]) => [80 + (x - 80) * 0.72, 88 + (y - 88) * 0.72]);
    return `<g class="rn-pof"><polygon points="${pts(p)}" fill="#ffd23f" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
      <polygon points="${pts(q)}" fill="#fff6c9"/>
      <text x="80" y="95" text-anchor="middle" font-size="19" font-weight="900" fill="${INK}" font-family="inherit" transform="rotate(-8 80 90)">¡POF!</text></g>`;
  })();

  // ------------------------------------------------------------------ runtime helpers
  const st = { gen: 0, busy: false, shown: 'a' };
  const speed = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--speed')) || 1;
  const dur = (ms) => ms / speed();
  const later = (ms, fn) => setTimeout(fn, dur(ms));
  const shake = () => svg.querySelector('.m-shake');
  const live = (g) => g === st.gen;
  const at = (g, ms, fn) => later(ms, () => { if (live(g)) fn(); });
  const shellOf = () => svg.querySelector('.rn-shellwrap');
  function anim(node, frames, ms, opts = {}) {
    if (!node) return null;
    return node.animate(frames, { duration: dur(ms), fill: 'forwards', easing: 'ease-in-out', ...opts });
  }
  /** Adds a drawing on Tapomo, inside .mascot-body (so it hops, bobs and squishes with it). */
  function overlay(html, cls) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `st-ov ${cls || ''}`);
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = html.replaceAll('__N__', '1');
    svg.querySelector('.mascot-body').append(g);
    return g;
  }
  /** Adds <defs> content (gradients, clips) under the ids "rn-…-1". */
  function defs(html) {
    const g = document.createElementNS(NS, 'g');
    g.innerHTML = html.replaceAll('__N__', '1');
    svg.querySelector('defs').append(...g.childNodes);
  }
  /** A drawing in the svg's own coordinates (not inside the body), under the mascot's effects layer. */
  function rootOverlay(html, cls) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `st-ov ${cls}`);
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = html.replaceAll('__N__', '1');
    svg.querySelector('.m-fx').before(g);
    return g;
  }
  /** The stone shell: next to .m-shake (inside the breathing/bobbing wrappers), drawn over the whole body. */
  function buildShell() {
    defs(STONE_DEFS);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'st-ov rn-shellwrap');
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = SHELL().replaceAll('__N__', '1');
    g.style.transformOrigin = '80px 140px';
    shake().after(g);
    // While the stone is whole, Tapomo under it is hidden (no colour can leak through its anti-aliased edge).
    shake().style.opacity = '0';
    g.querySelectorAll('.rn-shard').forEach((s) => { const c = SHARDS[+s.dataset.i].c; s.style.transformOrigin = `${f1(c[0])}px ${f1(c[1])}px`; });
    return g;
  }
  /** What Tapomo wears, grouped by item and in dressing order (body first, hats last). */
  const RANK = { superheroe: 0, dino: 5, astronauta: 5, capa: 0, rockero: 0, musculitos: 0, pesa: 0, bufanda: 1, pajarita: 1, cicatriz: 2, barba: 2, hipster: 2, bigote: 2, cejas: 2,
    gafas: 3, gafassol: 3, parche: 3, flequillo: 4, tupe: 4, melenita: 4, _: 4, lacito: 5, gorrito: 5, chef: 5, flores: 5, gorra: 5, ninja: 5, vikingo: 5, auris: 6, gamer: 6, aureola: 7 };
  const KIND = (k) => ((RANK[k] ?? 2) >= 4 && k !== '_' ? 'drop' : RANK[k] === 3 ? 'slide' : 'pop');
  function wardrobe() {
    const m = new Map();
    svg.querySelectorAll('.rw-back > *, .rw-front > *').forEach((n) => {
      const k = n.getAttribute('data-acc') || '_';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(n);
    });
    return [...m.entries()].sort((a, b) => (RANK[a[0]] ?? 2) - (RANK[b[0]] ?? 2));
  }
  /** The stone breaks: Tapomo (under it) shows again. */
  const reveal = () => { shake().style.opacity = ''; };
  const undress = () => wardrobe().forEach(([, ns]) => ns.forEach((n) => { n.style.opacity = '0'; }));
  /**
   * Puts the clothes on one by one. `how`: 'pop' (hats and hair fall onto the head, glasses slide down,
   * the rest pops), 'pof' (everything pops in place with a little
   * burst). Returns how long it takes (ms).
   */
  function dressOn(g, how, gap, start = 0) {
    const items = wardrobe();
    items.forEach(([k, ns], i) => at(g, start + i * gap, () => {
      const kind = how === 'pof' ? 'pop' : KIND(k);
      let land = 0;
      ns.forEach((n) => {
        const bb = n.getBBox();
        const cx = bb.x + bb.width / 2;
        const cy = bb.y + bb.height / 2;
        n.style.transformBox = 'view-box';
        n.style.opacity = '';
        if (kind === 'drop') {
          const h = 72;
          n.style.transformOrigin = `${f1(cx)}px ${f1(bb.y + bb.height)}px`;
          anim(n, [{ transform: `translateY(${-h}px)`, opacity: 0 }, { transform: `translateY(${-h * 0.8}px)`, opacity: 1, offset: 0.12 },
            { transform: 'translateY(2px) scale(1.06,.9)', offset: 0.68 }, { transform: 'translateY(-3px) scale(.98,1.03)', offset: 0.84 }, { transform: 'none', opacity: 1 }],
          500, { easing: 'cubic-bezier(.45,0,.7,1)', fill: 'none' });
          land = 340;
        } else if (kind === 'slide') {
          n.style.transformOrigin = `${f1(cx)}px ${f1(cy)}px`;
          anim(n, [{ transform: 'translateY(-30px) rotate(-12deg)', opacity: 0 }, { transform: 'translateY(-22px) rotate(-9deg)', opacity: 1, offset: 0.2 },
            { transform: 'translateY(2px) rotate(3deg)', offset: 0.72 }, { transform: 'none', opacity: 1 }], 460, { easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'none' });
        } else {
          n.style.transformOrigin = `${f1(cx)}px ${f1(cy)}px`;
          anim(n, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.16)', opacity: 1, offset: 0.58 }, { transform: 'scale(.95)', offset: 0.8 }, { transform: 'none', opacity: 1 }],
            380, { easing: 'ease-out', fill: 'none' });
          if (how === 'pof') popLines(cx, cy, Math.max(bb.width, bb.height) / 2);
        }
      });
      if (land) at(g, land, () => anim(shake(), [{ transform: 'none' }, { transform: 'scale(1.04,.95)', offset: 0.4 }, { transform: 'none' }], 220, { fill: 'none' }));
    }));
    return start + Math.max(0, items.length - 1) * gap + (items.length ? 640 : 0);
  }
  /** A thrown piece: velocity in units/s, gravity, spin; fades out near the end. */
  function fly(node, { vx, vy, grav = 420, w = 0, T = 900, fade = 0.55, delay = 0 }) {
    const fr = [];
    const N = 12;
    for (let k = 0; k <= N; k++) {
      const t = ((k / N) * T) / 1000;
      const o = k / N < fade ? 1 : Math.max(0, 1 - (k / N - fade) / (1 - fade));
      fr.push({ transform: `translate(${f1(vx * t)}px, ${f1(vy * t + 0.5 * grav * t * t)}px) rotate(${f1(w * t)}deg)`, opacity: o, offset: k / N });
    }
    return anim(node, fr, T, { delay: dur(delay), easing: 'linear' });
  }
  /** Small stone crumbs that fall from the shell. */
  function crumbs(n, area = [40, 120, 60, 130]) {
    const g = rootOverlay('', 'rn-crumbs');
    for (let i = 0; i < n; i++) {
      const x = area[0] + Math.random() * (area[1] - area[0]);
      const y = area[2] + Math.random() * (area[3] - area[2]);
      const s = 1.6 + Math.random() * 1.8;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${f1(x)} ${f1(y - s)} L${f1(x + s)} ${f1(y + s * 0.7)} L${f1(x - s)} ${f1(y + s * 0.6)} Z`);
      p.setAttribute('fill', i % 3 ? '#9a95a1' : '#7f7a86');
      p.style.transformOrigin = `${f1(x)}px ${f1(y)}px`;
      g.append(p);
      const T = 520 + Math.random() * 300;
      fly(p, { vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 25, grav: 520, w: (Math.random() - 0.5) * 500, T, fade: 0.6, delay: Math.random() * 120 });
    }
    later(1400, () => g.remove());
  }
  /** Dust puffs: soft round clouds that grow and fade. `spots`: [x, y, dx, dy, r]. */
  function dust(spots, ms = 750) {
    const g = rootOverlay('', 'rn-dust');
    spots.forEach(([x, y, dx, dy, r], i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', f1(x));
      c.setAttribute('cy', f1(y));
      c.setAttribute('r', f1(r));
      c.setAttribute('fill', i % 2 ? '#d9d3ca' : '#c9c2b8');
      c.style.transformBox = 'fill-box';
      c.style.transformOrigin = 'center';
      g.append(c);
      anim(c, [{ transform: 'translate(0,0) scale(.35)', opacity: 0.95 }, { transform: `translate(${f1(dx * 0.7)}px, ${f1(dy * 0.7)}px) scale(1.25)`, opacity: 0.75, offset: 0.45 },
        { transform: `translate(${f1(dx)}px, ${f1(dy)}px) scale(1.6)`, opacity: 0 }], ms + (i % 3) * 80, { easing: 'ease-out' });
    });
    later(ms + 400, () => g.remove());
    return g;
  }
  const ring = (n, rx, ry, out, r) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.3;
    return [80 + Math.cos(a) * rx, 90 + Math.sin(a) * ry, Math.cos(a) * out, Math.sin(a) * out - 6, r + (i % 3) * 2];
  });
  const groundPuffs = () => [[46, 138, -22, -4, 9], [62, 142, -10, -6, 7], [98, 142, 10, -6, 7], [114, 138, 22, -4, 9]];
  function screenShake(px = 2.2) {
    anim(document.getElementById('stage'), [{ transform: 'none' }, { transform: `translate(${px}px, ${-px * 0.6}px)` }, { transform: `translate(${-px}px, ${px * 0.5}px)` }, { transform: `translate(${px * 0.6}px, ${px * 0.4}px)` }, { transform: 'none' }], 240, { fill: 'none', easing: 'linear' });
  }
  /** The brand-new glint: a white band crosses the body and two sparkles twinkle. */
  function glint() {
    const gl = overlay(GLINT, 'rn-gl');
    svg.querySelector('.rw-tex').after(gl); // over the skin, under the face and the clothes
    const band = gl.querySelector('.rn-glint');
    band.setAttribute('opacity', '1');
    anim(band, [{ transform: 'translateX(-20px)' }, { transform: 'translateX(160px)' }], 700, { easing: 'ease-in-out' });
    sparkles([[48, 56, 1], [116, 70, 0.75], [104, 50, 0.55]], 160);
  }
  function sparkles(list, step = 140) {
    const g = overlay(list.map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="rn-spark" d="${SPARK}" fill="#fff" stroke="#fff" stroke-width=".8" stroke-linejoin="round" opacity="0"/></g>`).join(''), 'rn-sp');
    g.querySelectorAll('.rn-spark').forEach((p, i) => {
      p.style.transformBox = 'fill-box';
      p.style.transformOrigin = 'center';
      anim(p, [{ transform: 'scale(0) rotate(0deg)', opacity: 1 }, { transform: 'scale(1.15) rotate(45deg)', opacity: 1, offset: 0.45 }, { transform: 'scale(0) rotate(90deg)', opacity: 1 }], 620, { delay: dur(i * step) });
    });
  }
  /** Comic pop lines around an item that appears (D). */
  function popLines(cx, cy, r) {
    const g = rootOverlay('', 'rn-popl');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const p = document.createElementNS(NS, 'path');
      const r0 = r * 0.7 + 4;
      p.setAttribute('d', `M${f1(cx + Math.cos(a) * r0)} ${f1(cy + Math.sin(a) * r0)} l${f1(Math.cos(a) * 6)} ${f1(Math.sin(a) * 6)}`);
      p.setAttribute('stroke', INK);
      p.setAttribute('stroke-width', '2.2');
      p.setAttribute('stroke-linecap', 'round');
      g.append(p);
      anim(p, [{ transform: 'translate(0,0)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `translate(${f1(Math.cos(a) * 6)}px, ${f1(Math.sin(a) * 6)}px)`, opacity: 0 }], 360, { easing: 'ease-out' });
    }
    later(600, () => g.remove());
  }
  const cracksOf = (ids) => ids.map((i) => svg.querySelector(`.rn-crack[data-i="${i}"]`));
  function growCracks(ids, ms, step = 40) {
    cracksOf(ids).forEach((c, k) => anim(c, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], ms, { easing: 'ease-out', delay: dur(k * step) }));
  }
  /** Both the body and the shell over it, with the same keyframes (so the stone moves as one piece). */
  function both(frames, ms, opts) { [shake(), shellOf()].forEach((n) => anim(n, frames, ms, { fill: 'none', ...opts })); }
  const tremble = (ms, a = 1.6) => both([{ transform: 'none' }, { transform: `translateX(${-a}px)` }, { transform: `translateX(${a}px) rotate(1deg)` }, { transform: `translateX(${-a}px) rotate(-1deg)` },
    { transform: `translateX(${a}px)` }, { transform: `translateX(${-a * 0.6}px) scale(1.02)` }, { transform: `translateX(${a * 0.6}px) scale(1.03)` }, { transform: 'scale(1.03)' }], ms, { easing: 'linear' });
  const shellIn = () => {
    both([{ transform: 'translateY(-6px) scale(.94)' }, { transform: 'translateY(1px) scale(1.01,.98)', offset: 0.7 }, { transform: 'none' }], 320, { easing: 'ease-out' });
    anim(shellOf(), [{ opacity: 0 }, { opacity: 1 }], 200, { fill: 'none' });
  };
  const fadeCracks = (ms = 160) => anim(svg.querySelector('.rn-cracks'), [{ opacity: 1 }, { opacity: 0 }], ms);
  const squashPop = () => anim(shake(), [{ transform: 'none' }, { transform: 'scale(1.14,.84)', offset: 0.22 }, { transform: 'translateY(-9px) scale(.9,1.12)', offset: 0.55 },
    { transform: 'translateY(1px) scale(1.04,.96)', offset: 0.8 }, { transform: 'none' }], 560, { fill: 'none', easing: 'ease-out' });

  /** Puts everything back as it was: no stone, no shine, the clothes on, no pending timers. */
  function clean() {
    st.gen++;
    shake().getAnimations().forEach((a) => a.cancel());
    shake().style.opacity = '';
    shake().style.transformBox = '';
    shake().style.transformOrigin = '';
    svg.querySelectorAll('.rw-back > *, .rw-front > *').forEach((n) => {
      n.getAnimations().forEach((a) => a.cancel());
      n.style.opacity = '';
      n.style.transformBox = '';
      n.style.transformOrigin = '';
    });
    svg.querySelectorAll('.st-ov').forEach((n) => n.remove());
    svg.querySelectorAll('[id^="rn-"]').forEach((n) => n.remove());
  }
  /** The ending: the pre-line («¡Ta-chán!», «¡Pof!») and then the bubble that opens the news. */
  function talkEnd(g) {
    // Everything has landed: drop the stone's leftovers (the shards are invisible by now) and give the face back.
    svg.querySelectorAll('.st-ov').forEach((n) => n.remove());
    svg.querySelectorAll('[id^="rn-"]').forEach((n) => n.remove());
    shake().style.transformBox = '';
    shake().style.transformOrigin = '';
    st.busy = false;
    host.pre(PRE[st.shown]);
    at(g, 1600, () => host.news());
  }

  // ------------------------------------------------------------------ the variants
  const ALL = SHARDS.map((_, i) => i);
  const V = {
    a: {
      play(g) {
        buildShell();
        undress();
        Mascot.setFace(svg, { eyes: 'closed', mouth: 'small' });
        shellIn();
        at(g, 380, () => { growCracks(ALL, 520, 45); crumbs(5); });
        at(g, 950, () => tremble(380));
        at(g, 1330, () => {
          reveal();
          fadeCracks();
          svg.querySelectorAll('.rn-shard').forEach((s, i) => {
            const c = SHARDS[i].c;
            const dx = c[0] - P[0];
            const dy = c[1] - P[1];
            const n = Math.hypot(dx, dy) || 1;
            const sp = 120 + Math.random() * 50;
            fly(s, { vx: (dx / n) * sp, vy: (dy / n) * sp - 95, grav: 520, w: (i % 2 ? 1 : -1) * (220 + Math.random() * 260), T: 950, fade: 0.5 });
          });
          dust([...ring(10, 50, 46, 26, 8), ...groundPuffs()], 780);
          crumbs(12, [36, 124, 50, 134]);
          screenShake();
          squashPop();
          Mascot.setFace(svg, { eyes: 'wide', mouth: 'o' });
        });
        at(g, 1900, () => { Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big', cheeks: true }); glint(); });
        const end = dressOn(g, 'pop', 280, 2550);
        at(g, end, () => { host.renderFace(); talkEnd(g); });
      },
    },
    d: {
      play(g) {
        const sh = buildShell();
        undress();
        Mascot.setFace(svg, { eyes: 'closed', mouth: 'small' });
        shellIn();
        at(g, 420, () => { growCracks(ALL, 360, 25); both([{ transform: 'none' }, { transform: 'scale(1.05,1.06)', offset: 0.8 }, { transform: 'scale(1.03)' }], 480, { easing: 'ease-in', fill: 'forwards' }); });
        at(g, 900, () => {
          shake().getAnimations().forEach((a) => a.cancel());
          sh.getAnimations().forEach((a) => a.cancel());
          const cloud = rootOverlay([[80, 92, 36], [50, 64, 22], [110, 64, 22], [80, 50, 20], [44, 92, 22], [116, 92, 22], [50, 122, 22], [110, 122, 22], [80, 132, 20], [30, 74, 13], [132, 76, 14], [28, 118, 13], [134, 116, 13]]
            .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ebe6de" stroke="#b7afa3" stroke-width="1.6"/>`).join(''), 'rn-cloud');
          const pof = rootOverlay(POF, 'rn-pofw');
          const star = pof.querySelector('.rn-pof');
          star.style.transformOrigin = '80px 88px';
          anim(star, [{ transform: 'scale(.2) rotate(-20deg)', opacity: 1 }, { transform: 'scale(1.38) rotate(4deg)', opacity: 1, offset: 0.3 }, { transform: 'scale(1.2) rotate(0deg)', opacity: 1, offset: 0.5 },
            { transform: 'scale(1.2) rotate(0deg)', opacity: 1, offset: 0.8 }, { transform: 'scale(1.3)', opacity: 0 }], 700, { easing: 'ease-out' });
          cloud.querySelectorAll('circle').forEach((c, i) => {
            c.style.transformBox = 'fill-box';
            c.style.transformOrigin = 'center';
            const a = Math.atan2(+c.getAttribute('cy') - 92, +c.getAttribute('cx') - 80 || 0.01);
            anim(c, [{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.12 }, { transform: 'scale(1)', opacity: 1, offset: 0.55 },
              { transform: `translate(${f1(Math.cos(a) * 26)}px, ${f1(Math.sin(a) * 18 - 14)}px) scale(1.25)`, opacity: 0 }], 1500, { easing: 'ease-out', delay: dur(i * 12) });
          });
          anim(sh, [{ opacity: 1 }, { opacity: 0 }], 60, { delay: dur(200) });
          later(220, () => live(g) && reveal());
          later(1700, () => { cloud.remove(); pof.remove(); });
          screenShake(1.6);
          Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big', cheeks: true });
        });
        at(g, 1750, () => glint());
        const end = dressOn(g, 'pof', 300, 2450);
        at(g, end, () => { host.renderFace(); talkEnd(g); });
      },
    },
  };

  const PRE = { a: 'pet.update.pre_a', d: 'pet.update.pre_d' };

  /** Plays the moment; `h` = { renderFace(), pre(key), news() } (pet.js). */
  function play(h) {
    host = h;
    clean();
    const g = st.gen;
    if (Mascot.reduced()) {
      // «Reducir movimiento»: no stone, no motion; just the bubble.
      host.news();
      return;
    }
    st.busy = true;
    shake().style.transformBox = 'view-box';
    shake().style.transformOrigin = '80px 140px';
    st.shown = Math.random() < 0.5 ? 'a' : 'd';
    V[st.shown].play(g);
  }
  return { play, get busy() { return st.busy; } };
})();
