// The Tapomo mascot, shared by the main window, the floating pet and the animation lab.
//
// Structure (outside in), each layer owns one kind of motion so they never fight over a transform
// (.m-run wraps them all so the zone afterimages can clone the whole body):
//   .m-hop     jump / tilt (Web Animations)          .m-bob    typing bounce (rAF springs, see Motion)
//   .m-lift    hover / held offset (CSS transition)
//   .m-breath  idle breathing loop (CSS)             .mascot-body  key-press squish (Web Animations)
// The face is split into parts (eyes, mouth, cheeks); each part has several variants and
// `setFace` picks one through data attributes that mascot.css reads.
// Everything moves with transform/opacity only. Durations go through `--speed` (see mascot.css).
const Mascot = (() => {
  const INK = '#23202b';
  const star = (x, y, s = 1) =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -4 L1.1 -1.1 L4 0 L1.1 1.1 L0 4 L-1.1 1.1 L-4 0 L-1.1 -1.1Z" fill="#fff"/>`;

  /** 5-point star polygon points, centred on (cx, cy), one point straight up. */
  const starPoints = (cx, cy, R, r) =>
    Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 ? r : R;
      return `${(cx + Math.cos(a) * k).toFixed(2)},${(cy + Math.sin(a) * k).toFixed(2)}`;
    }).join(' ');
  const goldStar = (cx, cy) =>
    `<polygon points="${starPoints(cx, cy, 11.5, 4.9)}" fill="#ffcc4d" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;

  // Supermochi: a spiky golden aura behind the body that swells upward to wrap soft golden flame-hair
  // (below), its pale inner glow drawn over the hair so both read as one silhouette, and little bolts around. Drawn once, shown by data-zone="super".
  // `swell` = 1: the top half grows to wrap the flame-hair; 0: a compact aura when there is no hair.
  const aura = (k, extra, swell = 1) => {
    const N = 26;
    let d = '';
    for (let i = 0; i <= N * 2; i++) {
      const a = (i / (N * 2)) * Math.PI * 2;
      const up = Math.max(0, -Math.sin(a)) * swell;
      // The top half swells (up to +25 %) so the glow wraps the flame-hair too, tips included.
      const r = 1 + 0.25 * up ** 1.5;
      let x = 80 + Math.cos(a) * 62 * k * r;
      let y = 92 + Math.sin(a) * 60 * k * r;
      if (i % 2) {
        // Flames rise and Supermochi runs to the right, so each spike is the sum of three pushes: out
        // from the body, up (fading toward the bottom) and back to the left, the wind of the run. Top
        // spikes lean back ~25°, trailing (left) ones stream back long, leading (right) ones stay short
        // and hug the body pointing up, bottom ones open downward and trail back. Never forward.
        const nx = Math.cos(a), ny = Math.sin(a);
        const lift = 1.2 * (1 - 0.8 * Math.max(0, ny));
        const wind = 1 - 0.3 * Math.max(0, nx);
        const dx = nx - wind, dy = ny - lift, dl = Math.hypot(dx, dy) || 1;
        // Dead bottom stays a bit shorter; trailing side longer, leading side shorter.
        const nub = ny > 0 ? Math.min(1, 0.6 + Math.abs(nx) * 2) : 1;
        const len = (62 * k * r * (extra + 8 * up) / 62 + 7 * (0.4 + up)) * nub * (1 - 0.35 * nx);
        x += dx / dl * len;
        y += dy / dl * len;
      }
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d + 'Z';
  };
  // Flame-hair: a few chunky locks rooted behind the top of the head (y 60, hidden by the body) that
  // sweep up and back and end in a soft curled tip, never a point. Back locks deep amber, front locks
  // bright gold with a pale inner streak; each lock sways at its own phase (mascot.css, sm-lock).
  // [base x, half width, height, sweep back, delay s]
  const LOCKS_BACK = [[50, 13, 36, -16, -0.25], [80, 15, 52, -20, -0.5], [110, 13, 40, -15, -0.1]];
  const LOCKS_FRONT = [[64, 14, 44, -18, -0.35], [96, 14, 46, -18, 0], [121, 10, 28, -11, -0.6]];
  // A flame lock: round body bulging well above the head line, then an S-curve that flicks the tip
  // back, ending in a small round cap that curls down a touch (never a point).
  const lock = (bx, w, h, s, Y0 = 60, r = 1.6) => {
    const ax = bx + s, ay = Y0 - h;
    const f = (n) => n.toFixed(1);
    return `M${f(bx + w)} ${Y0} C${f(bx + w * 1.5)} ${f(Y0 - h * 0.6)} ${f(ax + w * 0.8)} ${f(ay + h * 0.28)} ${f(ax + r * 0.5)} ${f(ay)} `
      + `A${r} ${r} 0 0 0 ${f(ax - r * 0.6)} ${f(ay + r * 1.8)} `
      + `C${f(ax + w * 0.3)} ${f(ay + h * 0.4)} ${f(bx - w * 1.6)} ${f(Y0 - h * 0.45)} ${f(bx - w)} ${Y0} Z`;
  };
  const lockG = ([bx, w, h, s, dl], fill, streak) =>
    `<g class="sm-lock" style="--dl:${dl}s"><path d="${lock(bx, w, h, s)}" fill="${fill}" stroke="${INK}" stroke-width="2.2"/>`
    + (streak ? `<path d="${lock(bx - w * 0.1, w * 0.3, h * 0.62, s * 0.8, 54, 1.4)}" fill="#fff6c2" opacity=".9"/>` : '') + '</g>';
  // Rising embers: tiny upright flame drops (a droplet with a round bottom).
  const ember = (x, y, k, dl) =>
    `<g class="sm-ember" style="--dl:${dl}s"><path transform="translate(${x} ${y}) scale(${k})" d="M0 -4.5 C2.2 -1.8 3 0 3 1.4 A3 3 0 0 1 -3 1.4 C-3 0 -2.2 -1.8 0 -4.5 Z" fill="#ffe066" stroke="${INK}" stroke-width="${(1.2 / k).toFixed(2)}"/></g>`;
  const bolt = (x, y, s, dl) =>
    `<g class="sm-spark" style="--dl:${dl}s"><path transform="translate(${x} ${y}) scale(${s})" d="M1 -7 L-4 1 L0 1 L-2 7 L5 -1.5 L1 -1.5 L3 -7 Z" fill="#fff1a6" stroke="${INK}" stroke-width="${(1.3 / s).toFixed(2)}" stroke-linejoin="round"/></g>`;
  const superBack = `
      <g class="sm-layer sm-back" aria-hidden="true">
        <g class="sm-aura">
          <path class="sm-a1 sm-with-hair" d="${aura(1.02, 12)}" fill="url(#sm-aura-g)" opacity=".8"/>
          <path class="sm-a1 sm-no-hair" d="${aura(1.02, 12, 0)}" fill="url(#sm-aura-g)" opacity=".8"/>
        </g>
        <g class="sm-tuft" stroke-linejoin="round" stroke-linecap="round">
          ${LOCKS_BACK.map((l) => lockG(l, 'url(#sm-tuft-b)')).join('')}
          ${LOCKS_FRONT.map((l) => lockG(l, 'url(#sm-tuft-g)', true)).join('')}
          ${ember(58, 18, 1.4, 0)}${ember(102, 12, 1.2, -0.45)}${ember(124, 28, 1.05, -0.8)}
        </g>
        <g class="sm-aura sm-aura-over" opacity=".3">
          <path class="sm-a2 sm-with-hair" d="${aura(0.93, 8)}" fill="#fff3a0" opacity=".55"/>
          <path class="sm-a2 sm-no-hair" d="${aura(0.93, 8, 0)}" fill="#fff3a0" opacity=".55"/>
        </g>
      </g>`;
  const superFront = `<g class="sm-layer sm-sparks" aria-hidden="true">${bolt(16, 62, 1.1, 0)}${bolt(145, 74, 1.25, 0.25)}${bolt(20, 124, 0.95, 0.5)}${bolt(140, 128, 1, 0.15)}${bolt(134, 34, 0.85, 0.4)}${bolt(26, 34, 0.85, 0.6)}</g>`;

  // Speed lines: straight bars with round caps streaking out behind Tapomo.
  // [tier, x, y, length, duration s, delay s]. Tier 1 shows from "good", 2 from "fire", 3 from "beating".
  const LINES = [
    [1, 26, 64, 30, 0.5, 0], [1, 22, 88, 38, 0.44, -0.2], [1, 26, 112, 32, 0.52, -0.33], [1, 30, 130, 26, 0.46, -0.1],
    [2, 18, 74, 44, 0.4, -0.27], [2, 16, 100, 48, 0.38, -0.05], [2, 22, 122, 40, 0.42, -0.4],
    [3, 20, 52, 54, 0.34, -0.15], [3, 12, 94, 60, 0.32, -0.3], [3, 18, 138, 50, 0.36, -0.08],
  ];
  const speedLines = LINES.map(([tier, x, y, len, d, dl]) =>
    `<path class="ln t${tier}" style="--d:${d}s;--dl:${dl}s" d="M${x - 4} ${y}h-${len - 4}"/>`).join('');

  const markup = `
    <defs>
      <radialGradient id="m-shadow-grad">
        <stop offset="0" stop-color="${INK}" stop-opacity=".18"/>
        <stop offset=".55" stop-color="${INK}" stop-opacity=".11"/>
        <stop offset="1" stop-color="${INK}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="m-glow-grad">
        <stop offset="0" stop-color="#ffc93c" stop-opacity=".55"/>
        <stop offset=".6" stop-color="#ffc93c" stop-opacity=".22"/>
        <stop offset="1" stop-color="#ffc93c" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="sm-aura-g" cx=".5" cy=".55" r=".55"><stop offset=".55" stop-color="#fff3a0"/><stop offset=".8" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9f1c" stop-opacity=".7"/></radialGradient>
      <linearGradient id="sm-tuft-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe98a"/><stop offset=".55" stop-color="#ffd23f"/><stop offset="1" stop-color="#ffb52e"/></linearGradient>
      <linearGradient id="sm-tuft-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc53d"/><stop offset="1" stop-color="#f08a1c"/></linearGradient>
    </defs>
    <g class="m-extras m-glow" aria-hidden="true"><ellipse cx="80" cy="92" rx="84" ry="76" fill="url(#m-glow-grad)"/></g>
    <g class="m-extras m-lines" aria-hidden="true" fill="none" stroke-width="4" stroke-linecap="round">${speedLines}</g>
    <g class="m-shadow-g"><ellipse class="m-shadow" cx="80" cy="142" rx="46" ry="7.5" fill="url(#m-shadow-grad)"/></g>
    <use class="m-ghost g2" aria-hidden="true" transform="translate(-26 0)"/>
    <use class="m-ghost g1" aria-hidden="true" transform="translate(-13 0)"/>
    <g class="m-run">
    <g class="m-hop"><g class="m-bob"><g class="m-lift"><g class="m-breath">
    <g class="m-shake"><g id="mascot-body" class="mascot-body">${superBack}
      <rect x="30" y="40" width="100" height="98" rx="30" fill="#ff9e7a"/>
      <rect x="40" y="46" width="80" height="72" rx="22" fill="#ffffff" opacity=".28"/>
      <g data-part="eyes"><g class="eyes-look"><g class="eyes-blink">
        <g class="eyes-round">
          <circle cx="62" cy="84" r="7" fill="${INK}"/><circle cx="98" cy="84" r="7" fill="${INK}"/>
          <circle cx="64" cy="82" r="2.4" fill="#fff"/><circle cx="100" cy="82" r="2.4" fill="#fff"/>
        </g>
        <g class="eyes-sparkle">
          <circle cx="62" cy="84" r="8.2" fill="${INK}"/><circle cx="98" cy="84" r="8.2" fill="${INK}"/>
          ${star(64.5, 81.5, 1.15)}${star(100.5, 81.5, 1.15)}
          <circle cx="59" cy="87.5" r="1.4" fill="#fff"/><circle cx="95" cy="87.5" r="1.4" fill="#fff"/>
        </g>
        <g class="eyes-wide">
          <circle cx="62" cy="84" r="9.45" fill="${INK}"/><circle cx="98" cy="84" r="9.45" fill="${INK}"/>
          <circle cx="64.8" cy="80.8" r="3.5" fill="#fff"/><circle cx="100.8" cy="80.8" r="3.5" fill="#fff"/>
          <circle cx="58.8" cy="88.4" r="1.7" fill="#fff"/><circle cx="94.8" cy="88.4" r="1.7" fill="#fff"/>
        </g>
        <g class="eyes-star">${goldStar(62, 84)}${goldStar(98, 84)}</g>
        <g class="eyes-dots">
          <circle cx="62" cy="85" r="3.2" fill="${INK}"/><circle cx="98" cy="85" r="3.2" fill="${INK}"/>
        </g>
        <g class="eyes-closed" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round">
          <path d="M55 85 Q62 79 69 85"/><path d="M91 85 Q98 79 105 85"/>
        </g>
      </g>
      <g class="m-brows" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M54 66 Q62 60 70 65"/><path d="M90 65 Q98 60 106 66"/></g>
      </g></g>
      <g class="m-cheeks" data-part="cheeks">
        <circle class="cheek" cx="50" cy="98" r="7" fill="#ff6f61"/><circle class="cheek" cx="110" cy="98" r="7" fill="#ff6f61"/>
      </g>
      <g data-part="mouth" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path class="mouth-smile" d="M72 100 Q80 108 88 100"/>
        <path class="mouth-small" d="M75 102 Q80 105 85 102"/>
        <ellipse class="mouth-o" cx="80" cy="105" rx="4.2" ry="5" fill="${INK}" stroke="none"/>
        <path class="mouth-big" d="M67 97 Q80 116 93 97"/>
        <g class="mouth-open"><path d="M69 98 Q80 120 91 98 Z" fill="${INK}"/><ellipse cx="80" cy="110" rx="4.5" ry="2.6" fill="#ff6f61" stroke="none"/></g>
        <path class="mouth-wavy" d="M67 104 q3.5 -6 7 0 t7 0 t7 0"/>
      </g>
      <g class="m-extras m-shades" aria-hidden="true" display="none">
        <rect x="47" y="76" width="30" height="18" rx="7" fill="${INK}"/><rect x="83" y="76" width="30" height="18" rx="7" fill="${INK}"/>
        <path d="M77 82h6" stroke="${INK}" stroke-width="3"/>
        <path d="M52 80l8 0M88 80l8 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
      </g>
      ${superFront}
      <g class="m-extras m-crown" aria-hidden="true" display="none">
        <g transform="rotate(-8 80 42)"><path d="M63 42 L61 26 L72 34 L80 22 L88 34 L99 26 L97 42 Z" fill="#ffcc4d" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        <circle cx="61" cy="26" r="2.3" fill="#ffcc4d" stroke="${INK}" stroke-width="1.6"/><circle cx="80" cy="22" r="2.3" fill="#ffcc4d" stroke="${INK}" stroke-width="1.6"/><circle cx="99" cy="26" r="2.3" fill="#ffcc4d" stroke="${INK}" stroke-width="1.6"/>
        <path d="M67 38 H93" stroke="#fff3c4" stroke-width="2" stroke-linecap="round" opacity=".8"/></g>
      </g>
    </g></g></g></g></g></g>
    </g>
    <g class="m-extras m-zzz" aria-hidden="true" fill="${INK}" font-family="inherit" font-weight="800">
      <text class="z z1" x="112" y="44" font-size="16" style="--dl:0s">z</text>
      <text class="z z2" x="124" y="30" font-size="20" style="--dl:1.1s">z</text>
      <text class="z z3" x="138" y="14" font-size="24" style="--dl:2.2s">z</text>
    </g>
    <g class="m-fx" aria-hidden="true"></g>`;

  // ------------------------------------------------------------- helpers

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Global animation speed (1 = normal). The lab changes `--speed` on <html>. */
  const speed = () => {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--speed'));
    return v > 0 ? v : 1;
  };
  const dur = (ms) => ms / speed();
  const part = (svg, sel) => svg.querySelector(sel);
  const run = (el, frames, opts) => (el && !reduced() ? el.animate(frames, { fill: 'none', ...opts, duration: dur(opts.duration) }) : null);

  let mounts = 0;
  let gradMounts = 0;
  function mount(svg) {
    svg.classList.add('mascot');
    // Gradient ids are made unique per mascot: with repeated ids, url(#id) resolves to the first one in
    // the page, and if that mascot is hidden (a closed dialog) the others lose their fills.
    const n = ++gradMounts;
    svg.innerHTML = markup.replace(/id="((?:m|sm)-[a-z0-9-]+)"/g, `id="$1-u${n}"`).replace(/url\(#((?:m|sm)-[a-z0-9-]+)\)/g, `url(#$1-u${n})`);
    // A page can hold several mascots: the afterimages must clone this one's body.
    const runId = `m-run-${++mounts}`;
    part(svg, '.m-run').id = runId;
    for (const u of svg.querySelectorAll('.m-ghost')) u.dataset.href = `#${runId}`;
    svg.__anim = {};
    setFace(svg, {});
    startBlinking(svg);
    return svg;
  }

  /**
   * eyes: round|sparkle|wide|star|dots|closed · mouth: smile|small|o|big|open|wavy · cheeks: false|true (strong blush)
   * brows: raised eyebrows · tense: a very subtle 12 Hz tremble. Parts cross-fade (mascot.css), they never pop.
   */
  function setFace(svg, { eyes = 'round', mouth = 'smile', cheeks = false, brows = false, tense = false } = {}) {
    svg.dataset.eyes = eyes;
    svg.dataset.mouth = mouth;
    if (brows) svg.dataset.brows = 'up';
    else delete svg.dataset.brows;
    svg.classList.toggle('blush', cheeks);
    svg.classList.toggle('tense', tense);
    if (eyes === 'closed') look(svg, 0, 0);
  }

  // ----------------------------------------------------------- reactions

  /** Current scale of an element, so a restarted squish continues from where the last one was. */
  function currentScale(el) {
    const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(el).transform || '');
    if (!m) return [1, 1];
    const v = m[1].split(',').map(Number);
    return [v[0] || 1, v[3] || 1];
  }

  /** Key press: squash down (volume kept), rebound past rest, settle. ~180 ms; restarts cleanly. */
  function squish(svg) {
    const body = part(svg, '.mascot-body');
    if (!body || reduced()) return;
    const [sx, sy] = currentScale(body);
    svg.__anim.squish?.cancel();
    svg.__anim.squish = run(
      body,
      [
        { transform: `scale(${sx},${sy})`, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: 'scale(1.04,.93)', offset: 0.3, easing: 'ease-in-out' },
        { transform: 'scale(.992,1.02)', offset: 0.65, easing: 'ease-out' },
        { transform: 'scale(1,1)' },
      ],
      { duration: 180 }
    );
    const shadow = part(svg, '.m-shadow');
    svg.__anim.squishShadow?.cancel();
    svg.__anim.squishShadow = run(shadow, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.05,.95)', offset: 0.3 }, { transform: 'scale(1,1)' }], { duration: 180, easing: 'ease-out' });
  }

  /** Tilt of the head ("oops"): -6deg, 4deg, back. */
  function tilt(svg) {
    const hop = part(svg, '.m-hop');
    svg.__anim.hop?.cancel();
    svg.__anim.hop = run(
      hop,
      [
        { transform: 'rotate(0deg)', easing: 'ease-out' },
        { transform: 'rotate(-6deg)', offset: 0.28, easing: 'ease-in-out' },
        { transform: 'rotate(4deg)', offset: 0.62, easing: 'ease-in-out' },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 460 }
    );
  }

  function burstStars(svg, n = 9, size0 = 1) {
    const fx = part(svg, '.m-fx');
    if (!fx || reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const r = (40 + Math.random() * 34) * (size0 < 1 ? 0.8 : 1);
      const size = (0.8 + Math.random() * 1.1) * size0;
      const spin = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 200);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', 'translate(80 80)');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M0 -6 L1.7 -1.7 L6 0 L1.7 1.7 L0 6 L-1.7 1.7 L-6 0 L-1.7 -1.7Z');
      p.setAttribute('fill', i % 3 === 0 ? '#fff' : '#ffc93c');
      p.style.transformBox = 'fill-box';
      p.style.transformOrigin = 'center';
      g.append(p);
      fx.append(g);
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r - 8;
      const anim = run(
        p,
        [
          { transform: 'translate(0px,0px) scale(.15) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.8}px,${dy * 0.8}px) scale(${size}) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px,${dy + 14}px) scale(${size * 0.5}) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 450, delay: dur(Math.random() * 90), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }
      );
      if (anim) anim.onfinish = () => g.remove();
      else g.remove();
    }
  }

  /**
   * A jump: small crouch (anticipation, 80 ms), push-off with stretch, hang, land with squash.
   * `big` also throws stars (new record); the shadow shrinks while Tapomo is in the air.
   */
  function jump(svg, { big = true } = {}) {
    if (reduced()) return;
    const h = big ? 26 : 12;
    const T = big ? 900 : 560;
    svg.__anim.hop?.cancel();
    svg.__anim.hop = run(
      part(svg, '.m-hop'),
      [
        { transform: 'translateY(0) scale(1,1)', easing: 'ease-out' },
        { transform: 'translateY(0) scale(1.07,.88)', offset: big ? 0.09 : 0.12, easing: 'ease-out' },
        { transform: 'translateY(0) scale(.96,1.06)', offset: big ? 0.16 : 0.2, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: `translateY(${-h}px) scale(.93,1.1)`, offset: 0.4, easing: 'ease-in-out' },
        { transform: `translateY(${-h}px) scale(.97,1.04)`, offset: 0.5, easing: 'cubic-bezier(.6,0,.9,.5)' },
        { transform: 'translateY(0) scale(1.1,.86)', offset: 0.72, easing: 'ease-out' },
        { transform: 'translateY(0) scale(.98,1.03)', offset: 0.84, easing: 'ease-in-out' },
        { transform: 'translateY(0) scale(1,1)' },
      ],
      { duration: T }
    );
    svg.__anim.shadow?.cancel();
    svg.__anim.shadow = run(
      part(svg, '.m-shadow'),
      [
        { transform: 'scale(1)', opacity: 1, easing: 'ease-out' },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.09 },
        { transform: 'scale(.62)', opacity: 0.45, offset: 0.4, easing: 'ease-in-out' },
        { transform: 'scale(.66)', opacity: 0.5, offset: 0.5, easing: 'ease-in' },
        { transform: 'scale(1.1,1.05)', opacity: 1, offset: 0.72, easing: 'ease-out' },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: T }
    );
    if (big) setTimeout(() => burstStars(svg), dur(T * 0.16));
  }

  /**
   * The record crown: pops on with a bounce, stays while on. `setCrown(svg, false)` fades it away;
   * `crownFlyOff` throws it up and sideways, spinning (the streak broke).
   */
  function setCrown(svg, on) {
    on = !!on;
    if (!!svg.__crown === on) return;
    svg.__crown = on;
    const crown = part(svg, '.m-crown');
    svg.__anim.crown?.cancel();
    svg.__anim.crown = null;
    if (on) {
      svg.dataset.crown = 'on';
      svg.__anim.crown = run(
        crown,
        [
          { transform: 'translateY(-16px) scale(.2) rotate(-25deg)', opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
          { transform: 'translateY(2px) scale(1.25) rotate(6deg)', opacity: 1, offset: 0.5, easing: 'ease-in-out' },
          { transform: 'translateY(-1px) scale(.94) rotate(-2deg)', opacity: 1, offset: 0.75, easing: 'ease-in-out' },
          { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1 },
        ],
        { duration: 520 }
      );
    } else {
      const anim = run(crown, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
      svg.__anim.crown = anim;
      if (anim) anim.onfinish = () => !svg.__crown && delete svg.dataset.crown;
      else delete svg.dataset.crown;
    }
  }

  function crownFlyOff(svg) {
    if (!svg.__crown) return;
    svg.__crown = false;
    const crown = part(svg, '.m-crown');
    svg.__anim.crown?.cancel();
    const dir = Math.random() < 0.5 ? -1 : 1;
    const anim = run(
      crown,
      [
        { transform: 'translate(0px,0px) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(.2,.7,.4,1)' },
        { transform: `translate(${dir * 24}px,-44px) rotate(${dir * 200}deg)`, opacity: 1, offset: 0.55, easing: 'ease-in' },
        { transform: `translate(${dir * 44}px,-22px) rotate(${dir * 400}deg)`, opacity: 0 },
      ],
      { duration: 800 }
    );
    svg.__anim.crown = anim;
    if (anim) anim.onfinish = () => !svg.__crown && delete svg.dataset.crown;
    else delete svg.dataset.crown;
  }

  /** Eyes pop open (wake up), plus a small hop. */
  function wake(svg) {
    if (reduced()) return;
    run(part(svg, '.eyes-blink'), [{ transform: 'scaleY(.08)' }, { transform: 'scaleY(1.3)', offset: 0.6 }, { transform: 'scaleY(1)' }], { duration: 280, easing: 'ease-out' });
    jump(svg, { big: false });
  }

  function blink(svg) {
    const eyes = part(svg, '.eyes-blink');
    if (!eyes || document.hidden || svg.classList.contains('sleeping')) return;
    if (!['round', 'sparkle', 'wide'].includes(svg.dataset.eyes)) return;
    const once = () => run(eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: 0.5 }, { transform: 'scaleY(1)' }], { duration: 120, easing: 'ease-in-out' });
    once();
    if (Math.random() < 0.18) setTimeout(once, dur(210));
  }

  function startBlinking(svg) {
    clearTimeout(svg.__blink);
    const next = () => {
      svg.__blink = setTimeout(() => {
        blink(svg);
        next();
      }, dur(2500 + Math.random() * 3500));
    };
    next();
  }


  // ------------------------------------------------------ typing motion
  // A smoothed key rate (keys/s) drives a continuous bob: amplitude and tempo follow the rate
  // through critically damped springs, so speeding up or slowing down never jolts. Each key only
  // kicks a tiny underdamped nudge (scaleY ~0.98) that blends into the bob instead of restarting.
  const RATE_TAU = 1.0; // seconds of key history the rate averages over
  const MAX_RATE_FOR_BOUNCE = 9; // keys/s at which the bounce is at full liveliness (never frantic beyond)
  // Forward lean by zone (degrees): it grows with the pace.
  const LEAN = { good: 2, fire: 4.5, beating: 7, super: 8 };
  const damp = (cur, vel, target, w, dt) => {
    const x = cur - target;
    const e = Math.exp(-w * dt);
    const t = vel + w * x;
    return [target + (x + t * dt) * e, (vel - w * t * dt) * e];
  };

  function motion(svg) {
    return (svg.__motion ||= {
      energy: 0, amp: 0, ampV: 0, freq: 0.7, freqV: 0, lean: 0, leanV: 0, phase: 0,
      nudge: 0, nudgeV: 0, last: 0, raf: 0, nextSparkle: 0, bob: null, shadow: null,
    });
  }

  function motionStep(svg, now) {
    const m = motion(svg);
    const dt = Math.min(0.05, Math.max(0.001, (now - m.last) / 1000));
    m.last = now;
    const sp = speed();
    m.energy *= Math.exp(-dt / RATE_TAU);
    const A = Math.min(1, m.energy / MAX_RATE_FOR_BOUNCE);
    const ampT = m.energy > 0.3 ? 0.9 + 3.4 * A : 0;
    const freqT = 0.7 + 1.9 * A;
    const zone = svg.dataset.zone;
    const leanT = LEAN[zone] || 0;
    [m.amp, m.ampV] = damp(m.amp, m.ampV, ampT, 5, dt);
    [m.freq, m.freqV] = damp(m.freq, m.freqV, freqT, 5, dt);
    [m.lean, m.leanV] = damp(m.lean, m.leanV, leanT, 8, dt);
    m.phase += 2 * Math.PI * m.freq * dt * sp;
    // Nudge: underdamped spring, kicked per key.
    const k = 700 * sp * sp;
    const c = 2 * Math.sqrt(k) * 0.6;
    m.nudgeV += (-k * m.nudge - c * m.nudgeV) * dt;
    m.nudge = Math.max(-0.04, Math.min(0.04, m.nudge + m.nudgeV * dt));

    const y = -m.amp * (1 - Math.cos(m.phase)) * 0.5;
    const rot = m.lean + (m.amp > 0.05 ? Math.sin(m.phase * 0.5) * (0.8 + 1.6 * A) * Math.min(1, m.amp) : 0);
    const sy = 1 - 0.012 * A * Math.cos(m.phase) * Math.min(1, m.amp) - m.nudge;
    m.bob.style.transform = `translateY(${y.toFixed(3)}px) rotate(${rot.toFixed(3)}deg) scale(${(1 + (1 - sy) * 0.4).toFixed(4)},${sy.toFixed(4)})`;
    m.shadow.style.transform = `scale(${(1 + y * 0.03).toFixed(3)})`;

    if (zone === 'rhythm' && m.energy > 1 && now > m.nextSparkle) {
      if (m.nextSparkle) burstStars(svg, 2, 0.55);
      m.nextSparkle = now + 2500 + Math.random() * 2500;
    }
    const busy = m.energy > 0.05 || m.amp > 0.02 || Math.abs(m.nudge) > 0.0005 || Math.abs(m.nudgeV) > 0.01 || Math.abs(m.lean - leanT) > 0.02;
    if (busy) m.raf = requestAnimationFrame((t) => motionStep(svg, t));
    else {
      m.raf = 0;
      // At rest only the forward lean (good and up) stays.
      m.bob.style.transform = leanT ? `rotate(${leanT}deg)` : '';
      m.shadow.style.transform = '';
      m.amp = m.ampV = m.nudge = m.nudgeV = 0;
      m.lean = leanT;
      m.leanV = 0;
    }
  }

  function motionKick(svg) {
    const m = motion(svg);
    m.bob ||= part(svg, '.m-bob');
    m.shadow ||= part(svg, '.m-shadow-g');
    if (!m.raf) {
      m.last = performance.now();
      m.raf = requestAnimationFrame((t) => motionStep(svg, t));
    }
  }

  /** One key was typed: feeds the smoothed rate and gives a tiny nudge. Never restarts anything. */
  function keyTick(svg) {
    if (reduced()) return;
    const m = motion(svg);
    m.energy = Math.min(14, m.energy + 1 / RATE_TAU);
    m.nudgeV += 0.55 * Math.sqrt(speed());
    motionKick(svg);
  }

  /** Re-evaluate the loop when the zone changes (lean in, lean out). */
  function motionPoke(svg) {
    if (!reduced() && svg.__motion) motionKick(svg);
    else if (!reduced() && LEAN[svg.dataset.zone]) motionKick(svg);
  }

  /** Smoothed key rate in keys/s (for the lab and tests). */
  const keyRate = (svg) => motion(svg).energy;

  // ----------------------------------------------------- state toggles

  /** Sunglasses slide down from above with a bounce, and slide back up. */
  function setShades(svg, on) {
    if (!!svg.__shades === on) return;
    svg.__shades = on;
    const shades = part(svg, '.m-shades');
    svg.__anim.shades?.cancel();
    if (reduced()) {
      if (on) svg.dataset.shades = 'on';
      else delete svg.dataset.shades;
      return;
    }
    if (on) {
      svg.dataset.shades = 'on';
      svg.__anim.shades = run(
        shades,
        [
          { transform: 'translateY(-38px)', opacity: 0, easing: 'ease-in' },
          { transform: 'translateY(4px)', opacity: 1, offset: 0.55, easing: 'ease-out' },
          { transform: 'translateY(-1.5px)', offset: 0.78, easing: 'ease-in-out' },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 480 }
      );
    } else {
      const anim = run(shades, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-38px)', opacity: 0 }], { duration: 260, easing: 'ease-in' });
      svg.__anim.shades = anim;
      if (anim) anim.onfinish = () => !svg.__shades && delete svg.dataset.shades;
      else delete svg.dataset.shades;
    }
  }

  /**
   * Zone drives the extras (warming < rhythm < good < fire < beating < super): speed lines from good
   * on (more, longer and faster per zone), forward lean, afterimages (beating, super), glow and
   * sunglasses (beating), golden aura, tuft and bolts (super). The face must show in Supermochi, so
   * no sunglasses there.
   */
  function setZone(svg, zone) {
    svg.dataset.zone = zone || 'idle';
    motionPoke(svg);
    setShades(svg, zone === 'beating' && !svg.classList.contains('sleeping'));
    // The afterimages clone the whole body: they only reference it while they can be seen.
    const ghosts = (zone === 'beating' || zone === 'super') && !reduced();
    for (const u of svg.querySelectorAll('.m-ghost')) {
      if (ghosts) u.setAttribute('href', u.dataset.href);
      else u.removeAttribute('href');
    }
  }

  /** Supermochi flame-hair on (default) or off; aura, bolts and glow stay either way. */
  function setSuperHair(svg, on) {
    svg.classList.toggle('sm-nohair', on === false);
    // Also as SVG attributes: the afterimages are <use> clones, and page CSS can't reach inside them.
    const set = (sel, visible) => svg.querySelectorAll(sel).forEach((el) => (visible ? el.removeAttribute('display') : el.setAttribute('display', 'none')));
    set('.sm-tuft', on !== false);
    set('.sm-with-hair', on !== false);
    set('.sm-no-hair', on === false);
  }

  /** Supermochi swallowed a backspace: the aura pulses once. */
  function superAbsorb(svg) {
    if (reduced()) return;
    svg.classList.remove('sm-absorb');
    void svg.getBoundingClientRect();
    svg.classList.add('sm-absorb');
    clearTimeout(svg.__absorb);
    svg.__absorb = setTimeout(() => svg.classList.remove('sm-absorb'), dur(450));
  }

  function setSleeping(svg, on) {
    svg.classList.toggle('sleeping', on);
    if (on) setShades(svg, false);
    else setZone(svg, svg.dataset.zone);
  }

  /** The pointer is over Tapomo: it lifts a little and looks up. */
  function setHover(svg, on) {
    svg.classList.toggle('hover', on);
    if (on) look(svg, 0, -1);
  }

  /** Being dragged: lifted higher, shadow smaller. */
  function setHeld(svg, on) {
    svg.classList.toggle('held', on);
  }

  // ------------------------------------------------------------ eyes

  const REACH_X = 3.4;
  const REACH_Y = 2.6;

  /** nx, ny in -1..1: where the eyes look. The mouth and cheeks follow a little (parallax). */
  function look(svg, nx, ny) {
    const set = (sel, k) => {
      const el = part(svg, sel);
      if (el) el.style.transform = `translate(${(nx * REACH_X * k).toFixed(2)}px,${(ny * REACH_Y * k).toFixed(2)}px)`;
    };
    set('.eyes-look', 1);
    set('[data-part="mouth"]', 0.3);
    set('.m-cheeks', 0.5);
  }

  /** Looks toward a point given in client (viewport) px. */
  function lookAtPoint(svg, cx, cy) {
    if (svg.classList.contains('hover') || svg.dataset.eyes === 'closed') return look(svg, 0, svg.dataset.eyes === 'closed' ? 0 : -1);
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const dx = cx - (r.left + (r.width * 80) / 160);
    const dy = cy - (r.top + (r.height * 84) / 160);
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return look(svg, 0, 0);
    const k = Math.min(1, dist / (r.width * 0.7));
    look(svg, (dx / dist) * k, (dy / dist) * k);
  }

  // ------------------------------------------------------------ hiding

  /**
   * Hiding: Tapomo ducks behind the bottom edge of its box (mascot.css, `.hiding` on the parent
   * element) and glances left and right every few seconds. Coming out pops up with a little hop.
   * With reduced motion it just sits there, eyes still.
   */
  function setHiding(svg, on) {
    on = !!on;
    if (!!svg.__hiding === on) return;
    const was = !!svg.__hiding;
    svg.__hiding = on;
    if (svg.parentElement) svg.parentElement.classList.toggle('hiding', on);
    clearTimeout(svg.__glance);
    clearTimeout(svg.__pop);
    if (on) {
      setFace(svg, { eyes: 'round', mouth: 'small' });
      look(svg, 0, 0.2);
      const glance = () => {
        svg.__glance = setTimeout(() => {
          if (reduced() || document.hidden) return glance();
          const dir = Math.random() < 0.5 ? -1 : 1;
          look(svg, dir * 1.3, 0.2);
          svg.__glance = setTimeout(() => {
            // Sometimes a quick look at the other side before settling back.
            if (Math.random() < 0.4) look(svg, -dir * 1.3, 0.2);
            svg.__glance = setTimeout(() => { look(svg, 0, 0.2); glance(); }, dur(700));
          }, dur(800));
        }, dur(2200 + Math.random() * 2400));
      };
      if (!reduced()) glance();
    } else {
      look(svg, 0, 0);
      setFace(svg, {});
      if (was && !reduced()) svg.__pop = setTimeout(() => jump(svg, { big: false }), dur(330));
    }
  }

  // Loops (breathing, z's, speed lines, glow) pause while nothing is on screen.
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-hidden', document.hidden));

  return { mount, setFace, keyTick, keyRate, squish, tilt, jump, wake, blink, setZone, setSuperHair, superAbsorb, setShades, setSleeping, setHover, setHeld, setCrown, crownFlyOff, setHiding, isHiding: (svg) => !!svg.__hiding, look, lookAtPoint, burstStars, reduced };
})();
