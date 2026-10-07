// The Tapomo mascot, shared by the main window, the floating pet and the animation lab.
//
// Structure (outside in), each layer owns one kind of motion so they never fight over a transform:
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
    </defs>
    <g class="m-extras m-glow" aria-hidden="true"><ellipse cx="80" cy="92" rx="84" ry="76" fill="url(#m-glow-grad)"/></g>
    <g class="m-extras m-lines" aria-hidden="true" fill="none" stroke-linecap="round" stroke-width="4">
      <path class="ln" style="--d:.46s;--dl:-.05s" d="M-4 62h-30"/>
      <path class="ln" style="--d:.38s;--dl:-.2s" d="M4 79h-18"/>
      <path class="ln" style="--d:.52s;--dl:-.33s" d="M-8 96h-38"/>
      <path class="ln" style="--d:.42s;--dl:-.12s" d="M2 113h-24"/>
    </g>
    <g class="m-shadow-g"><ellipse class="m-shadow" cx="80" cy="142" rx="46" ry="7.5" fill="url(#m-shadow-grad)"/></g>
    <g class="m-hop"><g class="m-bob"><g class="m-lift"><g class="m-breath">
    <g id="mascot-body" class="mascot-body">
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
        <g class="eyes-dots">
          <circle cx="62" cy="85" r="3.2" fill="${INK}"/><circle cx="98" cy="85" r="3.2" fill="${INK}"/>
        </g>
        <g class="eyes-closed" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round">
          <path d="M55 85 Q62 79 69 85"/><path d="M91 85 Q98 79 105 85"/>
        </g>
      </g></g></g>
      <g class="m-cheeks" data-part="cheeks">
        <circle class="cheek" cx="50" cy="98" r="7" fill="#ff6f61"/><circle class="cheek" cx="110" cy="98" r="7" fill="#ff6f61"/>
      </g>
      <g data-part="mouth" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path class="mouth-smile" d="M72 100 Q80 108 88 100"/>
        <path class="mouth-small" d="M75 102 Q80 105 85 102"/>
        <path class="mouth-big" d="M67 97 Q80 116 93 97"/>
        <g class="mouth-open"><path d="M69 98 Q80 120 91 98 Z" fill="${INK}"/><ellipse cx="80" cy="110" rx="4.5" ry="2.6" fill="#ff6f61" stroke="none"/></g>
        <path class="mouth-wavy" d="M67 104 q3.5 -6 7 0 t7 0 t7 0"/>
      </g>
      <g class="m-extras m-shades" aria-hidden="true">
        <rect x="47" y="76" width="30" height="18" rx="7" fill="${INK}"/><rect x="83" y="76" width="30" height="18" rx="7" fill="${INK}"/>
        <path d="M77 82h6" stroke="${INK}" stroke-width="3"/>
        <path d="M52 80l8 0M88 80l8 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
      </g>
    </g></g></g></g></g>
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

  function mount(svg) {
    svg.classList.add('mascot');
    svg.innerHTML = markup;
    svg.__anim = {};
    setFace(svg, {});
    startBlinking(svg);
    return svg;
  }

  /** eyes: round|sparkle|dots|closed · mouth: smile|small|big|open|wavy · cheeks: false|true (strong blush) */
  function setFace(svg, { eyes = 'round', mouth = 'smile', cheeks = false } = {}) {
    svg.dataset.eyes = eyes;
    svg.dataset.mouth = mouth;
    svg.classList.toggle('blush', cheeks);
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

  /** Eyes pop open (wake up), plus a small hop. */
  function wake(svg) {
    if (reduced()) return;
    run(part(svg, '.eyes-blink'), [{ transform: 'scaleY(.08)' }, { transform: 'scaleY(1.3)', offset: 0.6 }, { transform: 'scaleY(1)' }], { duration: 280, easing: 'ease-out' });
    jump(svg, { big: false });
  }

  function blink(svg) {
    const eyes = part(svg, '.eyes-blink');
    if (!eyes || document.hidden || svg.classList.contains('sleeping')) return;
    if (svg.dataset.eyes !== 'round' && svg.dataset.eyes !== 'sparkle') return;
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
    const leanT = zone === 'fire' || zone === 'beating' ? 2.5 : 0;
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

    if (zone === 'good' && m.energy > 1 && now > m.nextSparkle) {
      if (m.nextSparkle) burstStars(svg, 2, 0.55);
      m.nextSparkle = now + 2500 + Math.random() * 2500;
    }
    const busy = m.energy > 0.05 || m.amp > 0.02 || Math.abs(m.nudge) > 0.0005 || Math.abs(m.nudgeV) > 0.01 || Math.abs(m.lean - leanT) > 0.02;
    if (busy) m.raf = requestAnimationFrame((t) => motionStep(svg, t));
    else {
      m.raf = 0;
      // At rest only the forward lean (fire / beating) stays.
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
    else if (!reduced() && (svg.dataset.zone === 'fire' || svg.dataset.zone === 'beating')) motionKick(svg);
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

  /** Zone drives the extras: speed lines (fire, beating), glow and sunglasses (beating). */
  function setZone(svg, zone) {
    svg.dataset.zone = zone || 'idle';
    motionPoke(svg);
    setShades(svg, zone === 'beating' && !svg.classList.contains('sleeping'));
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

  // Loops (breathing, z's, speed lines, glow) pause while nothing is on screen.
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-hidden', document.hidden));

  return { mount, setFace, keyTick, keyRate, squish, tilt, jump, wake, blink, setZone, setShades, setSleeping, setHover, setHeld, look, lookAtPoint, burstStars, reduced };
})();
