// tapomo.app: language, scroll reveals, the Mochitsuki intro and Tapomo's trip down the page.
// Plain JS, no dependencies besides the mascot files copied from the app (mascot.js, wardrobe-lite.js,
// badges-art.js) and the strings in i18n.js.
(() => {
  'use strict';

  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const REDUCED = motionQuery.matches;
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode: fine */ } },
  };
  const VISITED = 'tapomo.visited';
  const LANG = 'tapomo.lang';

  // ================================================================== language
  const DICT = window.I18N;
  let lang = 'es';
  function pickLang() {
    const saved = store.get(LANG);
    if (saved && DICT[saved]) return saved;
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'es'];
    for (const p of prefs) {
      const base = String(p).toLowerCase().split('-')[0];
      if (base === 'es' || base === 'ca' || base === 'gl' || base === 'eu') return 'es';
      if (base === 'en') return 'en';
    }
    return 'en';
  }
  const t = (key) => {
    const d = DICT[lang] || DICT.es;
    return key in d ? d[key] : DICT.es[key];
  };
  function applyLang(next) {
    lang = DICT[next] ? next : 'es';
    html.lang = lang;
    for (const el of $$('[data-i18n]')) {
      const v = t(el.dataset.i18n);
      if (typeof v === 'string' && el.innerHTML !== v) el.innerHTML = v;
    }
    for (const el of $$('[data-i18n-attr]')) {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(key));
      }
    }
    document.title = t('meta.title');
    buildHeat();
  }

  // ================================================================== static decorations
  function buildHeat() {
    const box = $('.heat');
    if (!box) return;
    const days = t('m.heat.days');
    let s = '';
    for (let d = 0; d < 7; d++) {
      s += `<b>${days[d]}</b>`;
      const weekday = d < 5;
      for (let h = 0; h < 24; h++) {
        let l = 0;
        if (weekday) {
          if (h >= 9 && h <= 13) l = 3;
          else if (h >= 15 && h <= 18) l = 2;
          else if (h === 8 || (h >= 19 && h <= 22)) l = 1;
        } else if ((h >= 10 && h <= 12) || (h >= 17 && h <= 20)) l = 1;
        const noise = Math.sin(d * 12.9898 + h * 78.233) * 43758.5453;
        const n = noise - Math.floor(noise);
        if (l > 0 && n > 0.78) l += 1;
        if (l > 1 && n < 0.18) l -= 1;
        if (d === 1 && h === 10) l = 4;
        s += `<i data-l="${clamp(l, 0, 4)}" style="--d:${(h * 0.018 + d * 0.05).toFixed(3)}s"></i>`;
      }
    }
    s += '<span></span><span class="hh">0</span><span class="hh">6</span><span class="hh">12</span><span class="hh">18</span>';
    box.innerHTML = s;
  }

  function setIndexVars() {
    for (const sel of ['.medals li', '.cat-keys kbd', '.cat-chips span', '.home-row kbd']) {
      $$(sel).forEach((el, i) => el.style.setProperty('--i', i));
    }
  }

  function buildMedals() {
    if (!window.BadgeArt) return;
    for (const li of $$('.medals li')) {
      li.insertAdjacentHTML('afterbegin', window.BadgeArt.medal(li.dataset.medal, li.dataset.rarity, !li.hasAttribute('data-locked')));
    }
  }

  const minis = [];
  function buildWardrobe() {
    const faces = [{ eyes: 'sparkle' }, { mouth: 'big' }, { cheeks: true }, { eyes: 'closed', mouth: 'big' }];
    $$('.wardrobe .mini').forEach((svg, i) => {
      Mascot.mount(svg);
      window.Wardrobe.wear(svg, svg.dataset.wear);
      Mascot.setFace(svg, faces[i] || {});
      minis.push(svg);
      if (!REDUCED) svg.addEventListener('pointerenter', () => Mascot.jump(svg, { big: false }));
    });
  }
  let miniTimer = 0;
  function miniHops(on) {
    clearInterval(miniTimer);
    if (!on || REDUCED) return;
    miniTimer = setInterval(() => {
      const m = minis[Math.floor(Math.random() * minis.length)];
      if (m) Mascot.jump(m, { big: false });
    }, 1700);
  }

  // ================================================================== reveals (CSS scroll timelines + IO)
  const SDA = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
  const SCROLL_TL = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));
  if (!SDA) html.classList.add('no-sda');

  function watchReveals() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
        if (e.target.classList.contains('card-speed')) countUp();
      }
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));

    // Things that loop only while they are on screen.
    const live = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target.classList.contains('card-speed')) { speedVisible = e.isIntersecting; typingLoop(); }
        if (e.target.classList.contains('card-xp')) miniHops(e.isIntersecting);
      }
    });
    for (const el of $$('.card-speed, .card-xp')) live.observe(el);
  }

  // ================================================================== "what it measures" live demo
  let speedVisible = false;
  let typingTimer = 0;
  let counting = false;
  function countUp() {
    const el = $('.card-speed .count');
    if (!el || REDUCED || counting) return;
    counting = true;
    const to = Number(el.dataset.to) || 72;
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / 1500, 0, 1);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
      else counting = false;
    };
    requestAnimationFrame(step);
  }
  function typingLoop() {
    const wanted = !REDUCED && (speedVisible || state === 'measure');
    if (!wanted) { clearTimeout(typingTimer); typingTimer = 0; return; }
    if (typingTimer) return;
    const keys = $$('.mini-keys i');
    const count = $('.card-speed .count');
    let n = 0;
    const tick = () => {
      if (speedVisible && keys.length) {
        const k = keys[Math.random() < 0.18 ? keys.length - 1 : Math.floor(Math.random() * (keys.length - 1))];
        k.classList.add('on');
        setTimeout(() => k.classList.remove('on'), 85);
        if (++n % 9 === 0 && count && !counting) count.textContent = String(68 + Math.floor(Math.random() * 9));
      }
      if (state === 'measure' && tsvg) {
        Mascot.keyTick(tsvg);
        if (Math.random() < 0.35) Mascot.squish(tsvg);
      }
      typingTimer = 0;
      if (!REDUCED && (speedVisible || state === 'measure')) typingTimer = setTimeout(tick, 70 + Math.random() * 90);
    };
    typingTimer = setTimeout(tick, 60);
  }

  // ================================================================== the traveller
  const layer = $('.trail-layer');
  const traveler = $('.traveler');
  const tinner = $('.traveler-inner');
  const tsvg = REDUCED ? null : $('.traveler-svg');
  const bubble = $('.bubble');
  let state = '';        // '' (flying) or the name of the stage Tapomo stands on
  let samples = [];      // path samples: {x, y, s (size), l (length so far)}
  let anchors = [];      // per stage: {name, y (path), a (scroll anchor), r (magnet radius)}
  let total = 0;
  let lastX = null;
  let tilt = 0;

  /** Keeps the bubble inside the viewport; re-run while Tapomo moves, or it drifts off the edge. */
  function keepBubbleOnScreen() {
    if (!bubble || !bubble.classList.contains('show')) return;
    const prev = parseFloat(bubble.style.getPropertyValue('--bx')) || 0;
    const r = bubble.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const left = r.left - prev; // where it would be without the shift
    let dx = 0;
    if (left + r.width > vw - 10) dx = vw - 10 - (left + r.width);
    if (left + dx < 10) dx = 10 - left;
    if (Math.round(dx) !== Math.round(prev)) bubble.style.setProperty('--bx', `${Math.round(dx)}px`);
  }

  function say(text, ms = 3400) {
    if (!bubble || !text) return;
    const span = bubble.firstElementChild;
    span.textContent = text;
    bubble.classList.add('show');
    keepBubbleOnScreen();
    setTimeout(keepBubbleOnScreen, 320); // again once the pop-in scale has settled
    clearTimeout(say.timer);
    say.timer = setTimeout(() => bubble.classList.remove('show'), Math.max(ms * 1.4, 2800)); // time to read it
  }

  // Cubic Bézier helper for the path.
  const bez = (p0, p1, p2, p3, u) => {
    const v = 1 - u;
    return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3;
  };

  function layout() {
    if (!tsvg || !layer) return;
    const docEl = document.documentElement;
    const vw = docEl.clientWidth;
    const vh = window.innerHeight;
    const sy = window.scrollY;
    const docH = Math.max(docEl.scrollHeight, document.body.scrollHeight);
    layer.style.height = `${docH}px`;
    const stages = $$('[data-stage]').map((el) => {
      const r = el.getBoundingClientRect();
      const sec = el.closest('section');
      return {
        name: el.dataset.stage,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2 + sy,
        size: r.width,
        top: sec ? sec.getBoundingClientRect().top + sy : r.top + sy,
      };
    }).filter((s) => s.size > 0);
    if (stages.length < 2) return;

    // Rails: Tapomo travels in the side margins (or peeks from the screen edge on narrow screens),
    // so it never sits on top of text while you read.
    const wrap = $('.sec .wrap');
    const pad = wrap ? parseFloat(getComputedStyle(wrap).paddingLeft) || 16 : 16;
    const contentLeft = wrap ? wrap.getBoundingClientRect().left + pad : 16;
    const F = clamp(vw * 0.07, 60, 84); // size while travelling
    const inset = contentLeft > F * 0.95 ? contentLeft / 2 : F * 0.16;
    const railFor = (s) => (s.x > vw / 2 ? vw - inset : inset);

    const pts = [];
    let d = '';
    const push = (x, y, s) => {
      const prev = pts[pts.length - 1];
      const l = prev ? prev.l + Math.hypot(x - prev.x, y - prev.y) : 0;
      pts.push({ x, y, s, l });
    };
    const curve = (a, b, c, e, s0, s1) => {
      const n = Math.max(8, Math.ceil(Math.hypot(e[0] - a[0], e[1] - a[1]) / 6));
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const ease = u * u * (3 - 2 * u);
        push(bez(a[0], b[0], c[0], e[0], u), bez(a[1], b[1], c[1], e[1], u), lerp(s0, s1, ease));
      }
      d += ` C${b[0].toFixed(1)} ${b[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`;
    };
    const line = (e, s) => {
      const prev = pts[pts.length - 1];
      const n = Math.max(1, Math.ceil(Math.abs(e[1] - prev.y) / 24));
      const x0 = prev.x, y0 = prev.y;
      for (let i = 1; i <= n; i++) push(lerp(x0, e[0], i / n), lerp(y0, e[1], i / n), s);
      d += ` L${e[0].toFixed(1)} ${e[1].toFixed(1)}`;
    };

    const first = stages[0];
    push(first.x, first.y, first.size);
    d = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
    const stageL = [0]; // path length at which Tapomo stands on each stage
    for (let i = 0; i < stages.length - 1; i++) {
      const S = stages[i], N = stages[i + 1];
      const rS = railFor(S), rN = railFor(N);
      const yb = Math.max(N.top, S.y + 40);
      const above = Math.max(40, yb - S.y);
      const below = Math.max(40, N.y - yb);
      const dy1 = Math.min(170, above * 0.4);
      const k1 = Math.min(110, (above - dy1) * 0.8);
      const k2 = Math.min(110, below * 0.35);
      const dy2 = Math.min(170, (below - k2) * 0.8);
      // out of the stage, onto the rail
      curve([S.x, S.y], [S.x, S.y + dy1 * 0.55], [rS, S.y + dy1 * 0.45], [rS, S.y + dy1], S.size, F);
      line([rS, yb - k1], F);
      // across, between the two sections (inside their padding, so no text is crossed)
      if (Math.abs(rS - rN) > 1) curve([rS, yb - k1], [rS, yb], [rN, yb], [rN, yb + k2], F, F);
      else line([rN, yb + k2], F);
      line([rN, N.y - dy2], F);
      // off the rail, into the next stage
      curve([rN, N.y - dy2], [rN, N.y - dy2 * 0.45], [N.x, N.y - dy2 * 0.55], [N.x, N.y], F, N.size);
      stageL.push(pts[pts.length - 1].l);
    }
    samples = pts;
    total = pts[pts.length - 1].l;

    for (const g of $$('.trail g')) {
      let p = g.firstElementChild;
      if (!p) { p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); g.append(p); }
      p.setAttribute('d', d);
    }
    const done = $('.trail-done path');
    if (done) done.style.strokeDasharray = `0 ${total + 10}`;

    // Scroll anchors: the "viewport centre" value at which Tapomo stands on each stage.
    const maxY = docH - vh;
    const mid = vh * 0.5;
    anchors = stages.map((s, i) => ({ name: s.name, y: s.y, l: stageL[i], a: clamp(s.y, mid, maxY + mid) }));
    for (let i = 1; i < anchors.length; i++) anchors[i].a = Math.max(anchors[i].a, anchors[i - 1].a + 2);
    const R = Math.min(vh * 0.4, 340);
    anchors.forEach((an, i) => {
      const gapPrev = i ? an.a - anchors[i - 1].a : Infinity;
      const gapNext = i < anchors.length - 1 ? anchors[i + 1].a - an.a : Infinity;
      an.r = Math.max(1, Math.min(R, gapPrev / 2, gapNext / 2));
    });
    update(true);
  }

  // The magnet: around each anchor Tapomo holds still for a while, then eases out and travels.
  const HOLD = 0.5; // share of each stage's radius where Tapomo stays put (more margin to see it)
  const C = 1 - HOLD;
  const GA = 3 - C, GB = C - 2; // g(e) = GA e² + GB e³, g(1) = 1, g'(1) = C (slope matches outside)
  // Anticipation: on the way in Tapomo lands a little early (bigger hold on the arriving side); on the
  // way out it lingers a moment, then sets off gradually (the eased curve below + the spring).
  let scrollDir = 1; // 1 scrolling down, -1 up
  function warp(v) {
    // Past the last stage (or above the first) it stays there: the ending never depends on stopping
    // in exactly the right spot.
    const first = anchors[0], last = anchors[anchors.length - 1];
    if (last && v >= last.a) return { v: last.a, at: last.name };
    if (first && v <= first.a) return { v: first.a, at: first.name };
    for (const an of anchors) {
      const z = v - an.a;
      if (Math.abs(z) >= an.r) continue;
      const arriving = Math.sign(z) === -scrollDir;
      const hold = an.r * (arriving ? HOLD + 0.15 : HOLD);
      if (Math.abs(z) <= hold) return { v: an.a, at: an.name };
      const e = (Math.abs(z) - hold) / (an.r - hold);
      return { v: an.a + Math.sign(z) * an.r * (GA * e * e + GB * e * e * e), at: '' };
    }
    return { v, at: '' };
  }

  /** Point at path length L (binary search over the samples). */
  function pointAtL(L) {
    let lo = 0, hi = samples.length - 1;
    if (L <= 0) return samples[0];
    if (L >= samples[hi].l) return samples[hi];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (samples[m].l < L) lo = m; else hi = m;
    }
    const a = samples[lo], b = samples[hi];
    const k = b.l === a.l ? 1 : (L - a.l) / (b.l - a.l);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), s: lerp(a.s, b.s, k), l: L };
  }

  // Tapomo has inertia: a critically damped spring pulls it towards where the scroll says it should be,
  // with limited acceleration and speed. It sets off gently, cruises, brakes and stops without overshoot.
  const OMEGA = 7.5;       // spring stiffness (rad/s): settles in ~0.6 s
  const MAX_ACCEL = 4200;  // px/s²: how hard it can speed up or brake
  const MAX_SPEED = 1800;  // px/s along the path while visible: a brisk walk, never a dash
  let shownL = null;
  let vel = 0;
  let lastT = 0;
  let lastCentre = null;

  function update(force) {
    if (!samples.length || !anchors.length) return;
    const vh = window.innerHeight;
    const centre = window.scrollY + vh * 0.5;
    if (lastCentre !== null && Math.abs(centre - lastCentre) > 0.5) scrollDir = centre > lastCentre ? 1 : -1;
    lastCentre = centre;
    const w = warp(centre);
    // anchor space -> distance along the path (piecewise linear between stages). Distance, not
    // height: crossing the screen sideways takes its fair share of scroll instead of a few pixels.
    let L = anchors[0].l;
    if (w.v >= anchors[anchors.length - 1].a) L = anchors[anchors.length - 1].l;
    else if (w.v > anchors[0].a) {
      for (let i = 0; i < anchors.length - 1; i++) {
        const A = anchors[i], B = anchors[i + 1];
        if (w.v <= B.a) { L = lerp(A.l, B.l, (w.v - A.a) / (B.a - A.a)); break; }
      }
    }
    const now = performance.now();
    // The first frame of a new gesture is a normal frame, not "everything since it stopped".
    const dt = lastT ? Math.min(1 / 30, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    if (force || shownL === null) {
      shownL = L;
      vel = 0;
    } else {
      // Far off screen (after a long fast scroll) it may run faster, so it's never lost; nobody sees it.
      const here = pointAtL(shownL);
      const outside = Math.max(0, window.scrollY - here.y, here.y - (window.scrollY + vh));
      const vmax = MAX_SPEED * (1 + 2.5 * clamp((outside - 100) / 400, 0, 1));
      const acc = clamp(OMEGA * OMEGA * (L - shownL) - 2 * OMEGA * vel, -MAX_ACCEL, MAX_ACCEL);
      vel = clamp(vel + acc * dt, -vmax, vmax);
      shownL += vel * dt;
    }
    const moving = Math.abs(L - shownL) > 0.5 || Math.abs(vel) > 4;
    if (!moving) {
      shownL = L;
      vel = 0;
    }
    const p = pointAtL(shownL);
    const size = Math.round(p.s);
    traveler.style.width = traveler.style.height = `${size}px`;
    traveler.style.transform = `translate3d(${(p.x - size / 2).toFixed(1)}px, ${(p.y - size / 2).toFixed(1)}px, 0)`;
    const done = $('.trail-done path');
    if (done) done.style.strokeDasharray = `${p.l.toFixed(1)} ${total + 10}`;
    // Lean into the direction of travel.
    const vx = lastX === null ? 0 : p.x - lastX;
    lastX = p.x;
    tilt = lerp(tilt, clamp(vx * 0.6, -12, 12), 0.25);
    if (Math.abs(tilt) < 0.2) tilt = 0;
    tinner.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
    keepBubbleOnScreen();
    // A stage's reaction starts as soon as the scroll reaches it, while Tapomo is still arriving, so a
    // visitor who keeps scrolling still sees it (and MIN_DWELL keeps it a moment).
    setState(w.at);
    if (tilt !== 0 || moving) requestUpdate(); // keep walking / settle the lean back to zero
    else lastT = 0;
  }

  let rafPending = false;
  function requestUpdate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; update(); });
  }

  // ------------------------------------------------------------------ reactions per stage
  let celebrateTimer = 0;
  let ringTimer = 0;
  const REACT = {
    hero: {
      enter() { Mascot.setFace(tsvg, {}); },
      leave() {},
    },
    measure: {
      enter() {
        Mascot.setFace(tsvg, { eyes: 'sparkle', mouth: 'open' });
        Mascot.setZone(tsvg, 'fire');
        say(t('say.measure'), 1800);
      },
      leave() { Mascot.setZone(tsvg, null); },
    },
    privacy: {
      enter() {
        Mascot.setFace(tsvg, { eyes: 'closed', mouth: 'small', cheeks: true });
        Mascot.setShades(tsvg, true);
        say(t('say.privacy'));
      },
      leave() { Mascot.setShades(tsvg, false); },
    },
    habits: {
      enter() {
        Mascot.setFace(tsvg, { eyes: 'round', mouth: 'small' });
        traveler.classList.add('ring-on');
        clearTimeout(ringTimer);
        ringTimer = setTimeout(() => {
          if (state !== 'habits') return;
          traveler.classList.add('ring-done');
          Mascot.setFace(tsvg, { eyes: 'sparkle', mouth: 'big', cheeks: true });
          Mascot.jump(tsvg, { big: true });
          say(t('say.habits'));
        }, 550);
      },
      leave() {
        // The ring fills in ~0.5 s, so the day completes well before halfway to the next stage.
        clearTimeout(ringTimer);
        traveler.classList.remove('ring-on', 'ring-done');
      },
    },
    code: {
      enter() {
        tsvg.classList.add('wear-gafas');
        Mascot.setFace(tsvg, { eyes: 'round', mouth: 'small' });
        Mascot.look(tsvg, 0.4, 0.7);
        say(t('say.code'));
      },
      leave() { tsvg.classList.remove('wear-gafas'); Mascot.look(tsvg, 0, 0); },
    },
    faq: {
      enter() {
        Mascot.setFace(tsvg, { eyes: 'wide', mouth: 'o', brows: true });
        Mascot.tilt(tsvg);
        say(t('say.faq'));
      },
      leave() {},
    },
    support: {
      enter() {
        // Grateful, not pushy: eyes closed, blushing, a little hop.
        Mascot.setFace(tsvg, { eyes: 'closed', mouth: 'big', cheeks: true });
        Mascot.jump(tsvg, { big: false });
        say(t('say.support'));
      },
      leave() {},
    },
    cta: {
      enter() {
        Mascot.setFace(tsvg, { eyes: 'star', mouth: 'open', cheeks: true });
        Mascot.setCrown(tsvg, true);
        traveler.classList.add('crowned');
        Mascot.jump(tsvg, { big: true });
        say(t('say.cta'));
        clearInterval(celebrateTimer);
        celebrateTimer = setInterval(() => { if (!document.hidden) Mascot.jump(tsvg, { big: true }); }, 2600);
      },
      leave() { clearInterval(celebrateTimer); Mascot.setCrown(tsvg, false); traveler.classList.remove('crowned'); },
    },
  };

  // A stage's face and props stay at least this long, even if the visitor scrolls on straight away.
  const MIN_DWELL = 2600;      // before the "flying" face comes back
  const MIN_DWELL_NEXT = 1200; // before another stage takes over (the ring fills in 1 s)
  let enteredAt = 0;
  let dwellTimer = 0;
  let queued = null;
  /** The scroll has gone more than halfway towards the neighbouring stage: this stage's moment is over. */
  function farFrom(name) {
    const i = anchors.findIndex((an) => an.name === name);
    if (i < 0 || lastCentre === null) return false;
    const d = lastCentre - anchors[i].a;
    const other = anchors[i + Math.sign(d)];
    return !!other && Math.abs(d) > Math.abs(other.a - anchors[i].a) / 2;
  }

  function setState(next) {
    clearTimeout(dwellTimer);
    // A waiting reaction is dropped once it would show up in the wrong section.
    if (queued && farFrom(queued)) queued = null;
    if (next === state) return;
    const shown = performance.now() - enteredAt;
    const left = (next || queued ? MIN_DWELL_NEXT : MIN_DWELL) - shown;
    // Also when another stage comes next (fast scrolling): the current reaction finishes first, and a
    // stage passed meanwhile is still shown afterwards (never dropped for the "flying" face).
    // …but never past halfway to the next stage (Pol: reactions reached the next section).
    if (state && left > 0 && !REDUCED && !farFrom(state)) {
      if (next || !queued) queued = next;
      dwellTimer = setTimeout(() => applyState(queued && farFrom(queued) ? '' : queued), left);
      return;
    }
    applyState(next || queued || ''); // a stage passed during the dwell still shows, if still in its section
  }

  function applyState(next) {
    queued = null;
    if (next === state) return;
    if (next) enteredAt = performance.now();
    const prev = state;
    state = next;
    if (prev && REACT[prev]) REACT[prev].leave();
    if (next && !prev && !REDUCED) Mascot.squish(tsvg); // a little landing
    if (next && REACT[next]) REACT[next].enter();
    else {
      // flying: wide-eyed and happy
      Mascot.setFace(tsvg, { eyes: 'sparkle', mouth: 'big' });
      bubble.classList.remove('show');
    }
    typingLoop();
  }

  function initTraveler() {
    Mascot.mount(tsvg);
    window.Wardrobe.wear(tsvg, 'gafas');
    tsvg.setAttribute('aria-hidden', 'true');
    tsvg.addEventListener('pointerenter', () => Mascot.setHover(tsvg, true));
    tsvg.addEventListener('pointerleave', () => Mascot.setHover(tsvg, false));
    tsvg.addEventListener('click', () => {
      Mascot.jump(tsvg, { big: true });
      const tips = t('say.tips');
      say(tips[Math.floor(Math.random() * tips.length)], 3200);
    });
    // In the hero Tapomo follows the pointer with its eyes.
    let look = null;
    window.addEventListener('pointermove', (e) => {
      if (state !== 'hero' || e.pointerType !== 'mouse') return;
      look = e;
      requestAnimationFrame(() => { if (look) { Mascot.lookAtPoint(tsvg, look.clientX, look.clientY); look = null; } });
    }, { passive: true });
    for (const btn of $$('.dl-btn')) {
      btn.addEventListener('pointerenter', () => {
        if (state === 'hero') Mascot.setFace(tsvg, { eyes: 'sparkle', mouth: 'big', cheeks: true });
        if (state === 'cta') Mascot.jump(tsvg, { big: false });
      });
      btn.addEventListener('pointerleave', () => { if (state === 'hero') Mascot.setFace(tsvg, {}); });
    }
    window.addEventListener('scroll', () => {
      requestUpdate();
      if (!SCROLL_TL) progressFallback();
    }, { passive: true });
    let relayout = 0;
    const schedule = () => { cancelAnimationFrame(relayout); relayout = requestAnimationFrame(layout); };
    window.addEventListener('resize', schedule);
    if ('ResizeObserver' in window) new ResizeObserver(schedule).observe($('main'));
    layout();
  }

  function progressFallback() {
    const bar = $('.scroll-progress');
    if (!bar) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`;
  }

  // ------------------------------------------------------------------ entrances
  function entrance(kind) {
    if (!tsvg) return;
    traveler.classList.add('ready');
    if (kind === 'again') {
      html.classList.add('entering');
      tinner.animate([
        { transform: 'translateY(-160px) scale(.9,1.1)', opacity: 0, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: 'translateY(0) scale(1.12,.86)', opacity: 1, offset: 0.55, easing: 'ease-out' },
        { transform: 'translateY(-14px) scale(.97,1.04)', offset: 0.78, easing: 'ease-in' },
        { transform: 'translateY(0) scale(1,1)' },
      ], { duration: 720 });
      setTimeout(() => say(t('say.again'), 2200), 520);
      setTimeout(() => html.classList.remove('entering'), 1000);
    } else {
      tinner.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      Mascot.wake(tsvg);
      setTimeout(() => say(t('say.hello'), 1800), 300);
    }
  }

  // ================================================================== intro: Mochitsuki
  const INK = '#23202b';
  function introMarkup() {
    const letters = ['T', 'A', 'P', 'O', 'M'];
    const fills = ['#ffd3dc', '#ffdfc4', '#fff0b3', '#d6f1cb', '#d3ddff'];
    let keys = '';
    letters.forEach((ch, i) => {
      const x = 48 + i * 52;
      keys += `<g class="kb-key"><rect x="${x}" y="216" width="44" height="44" rx="11" fill="${fills[i]}" stroke="${INK}" stroke-width="2.5"/>` +
        `<rect x="${x + 5}" y="220" width="34" height="27" rx="8" fill="#fff" opacity=".5"/>` +
        `<text x="${x + 22}" y="245" text-anchor="middle" font-size="19" font-weight="900" fill="${INK}" font-family="inherit">${ch}</text></g>`;
    });
    return `
      <svg class="scene" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
        <g class="kb" opacity="0">
          <rect class="kb-base" x="38" y="206" width="324" height="64" rx="20" stroke="${INK}" stroke-width="3"/>
          ${keys}
          <rect class="kb-slot" x="308" y="216" width="44" height="44" rx="11" stroke="${INK}" stroke-width="2" stroke-dasharray="4 5"/>
        </g>
        <g class="bowl">
          <path d="M118 196 C121 250 158 270 200 270 C242 270 279 250 282 196 Z" fill="#e8b07a" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
          <path d="M136 226 Q200 242 264 226 M150 248 Q200 258 250 248" fill="none" stroke="#c98a55" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="200" cy="196" rx="84" ry="18" fill="#f2c08e" stroke="${INK}" stroke-width="3.5"/>
          <ellipse cx="200" cy="197" rx="69" ry="11.5" fill="#9a5f35"/>
        </g>
        <g class="grains"></g>
        <g class="blob-move"><ellipse class="blob" cx="200" cy="190" rx="40" ry="30" fill="#fffaf3" stroke="${INK}" stroke-width="3"/></g>
        <g class="puffs"></g>
        <g class="pestle">
          <rect x="162" y="38" width="76" height="64" rx="19" fill="#f4eee9" stroke="${INK}" stroke-width="3.5"/>
          <rect x="171" y="44" width="58" height="40" rx="13" fill="#fff"/>
          <path d="M180 52 H200" stroke="#e6dcd4" stroke-width="3" stroke-linecap="round"/>
        </g>
        <g class="taps"></g>
      </svg>`;
  }

  let intro = null;
  function runIntro() {
    if (intro) return;
    const root = document.createElement('div');
    root.className = 'intro';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', t('intro.label'));
    root.innerHTML = `<button type="button" class="btn btn-small intro-skip">${t('intro.skip')}</button>
      <div class="intro-scene">${introMarkup()}<svg class="intro-mascot faceless" viewBox="0 0 160 160" aria-hidden="true"></svg></div>
      <p class="intro-title" aria-hidden="true">Tapomo</p><p class="intro-tag">${t('intro.tag')}</p>`;
    document.body.prepend(root);
    html.classList.add('intro-on', 'intro-built');
    const scene = $('.scene', root);
    const mascot = $('.intro-mascot', root);
    Mascot.mount(mascot);
    mascot.classList.add('faceless');
    Mascot.setFace(mascot, { eyes: 'closed', mouth: 'small' });

    const anims = [];
    const timers = [];
    const A = (el, frames, opts) => { const a = el.animate(frames, { fill: 'forwards', ...opts }); anims.push(a); return a; };
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    intro = { root, anims, timers, done: false };

    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (parent) parent.append(n);
      return n;
    };

    // Rice grains fall into the mortar.
    const grainsG = $('.grains', scene);
    const grains = [];
    const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (let i = 0; i < 24; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
      const x = 200 + Math.cos(a) * 56 * r, y = 192 + Math.sin(a) * 7 * r;
      const g = el('g', { class: 'grain' }, grainsG);
      el('ellipse', { cx: 0, cy: 0, rx: 3.3, ry: 5.6, fill: '#fffdf8', stroke: INK, 'stroke-width': 1.4, transform: `rotate(${Math.round(rnd() * 180)})` }, g);
      g.style.transform = `translate(${x}px, -30px)`;
      grains.push({ g, x, y });
      A(g, [
        { transform: `translate(${x}px, ${-30 - rnd() * 40}px)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 3}px)`, opacity: 1, offset: 0.8, easing: 'ease-out' },
        { transform: `translate(${x}px, ${y}px)`, opacity: 1 },
      ], { duration: 420, delay: 60 + i * 24, easing: 'cubic-bezier(.5,0,.9,.6)' });
    }

    const pestle = $('.pestle', scene);
    const blob = $('.blob', scene);
    const blobMove = $('.blob-move', scene);
    const bowl = $('.bowl', scene);
    const kb = $('.kb', scene);
    const taps = $('.taps', scene);
    const puffs = $('.puffs', scene);
    blob.style.transform = 'scale(0)';
    A(pestle, [{ transform: 'translateY(-120px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 420, delay: 250, easing: 'cubic-bezier(.34,1.56,.64,1)' });

    const STRIKES = [850, 1420, 1900, 2290, 2620, 2900];
    const SIZES = [0.32, 0.48, 0.62, 0.76, 0.9, 1];
    const TAP_AT = [[118, 74, 24], [284, 66, 26], [106, 120, 28], [296, 112, 28], [128, 32, 32], [272, 26, 36]];
    let prevSize = 0;
    let left = grains.slice();
    STRIKES.forEach((ms, k) => {
      at(ms, () => {
        A(pestle, [
          { transform: 'translateY(0)', easing: 'cubic-bezier(.55,0,1,.45)' },
          { transform: 'translateY(66px) scale(1.04,.92)', offset: 0.32, easing: 'cubic-bezier(.2,.8,.3,1)' },
          { transform: 'translateY(0)' },
        ], { duration: 340 });
      });
      at(ms + 108, () => {
        const s = SIZES[k];
        A(blob, [
          { transform: `scale(${prevSize})` },
          { transform: `scale(${s * 1.22}, ${s * 0.72})`, offset: 0.35 },
          { transform: `scale(${s * 0.96}, ${s * 1.06})`, offset: 0.7 },
          { transform: `scale(${s})` },
        ], { duration: 300, easing: 'ease-out' });
        prevSize = s;
        A(bowl, [{ transform: 'scale(1)' }, { transform: 'scale(1.015,.975)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 220, fill: 'none' });
        // Some grains are absorbed into the mochi; the rest jump.
        const take = k === STRIKES.length - 1 ? left.length : Math.ceil(left.length / (STRIKES.length - k));
        const gone = left.splice(0, take);
        for (const gr of gone) {
          A(gr.g, [
            { transform: `translate(${gr.x}px, ${gr.y}px) scale(1)`, opacity: 1 },
            { transform: `translate(${lerp(gr.x, 200, 0.8)}px, ${lerp(gr.y, 190, 0.8)}px) scale(.3)`, opacity: 0 },
          ], { duration: 240, easing: 'ease-in' });
        }
        for (const gr of left) {
          const hop = 6 + rnd() * 10;
          A(gr.g, [
            { transform: `translate(${gr.x}px, ${gr.y}px)` },
            { transform: `translate(${gr.x + (rnd() - 0.5) * 6}px, ${gr.y - hop}px)`, offset: 0.4, easing: 'ease-in' },
            { transform: `translate(${gr.x}px, ${gr.y}px)` },
          ], { duration: 280 });
        }
        // "tap!"
        const [tx, ty, fs] = TAP_AT[k];
        const word = t('intro.tap') + (k === 2 || k === 5 ? '!' : '');
        const txt = el('text', { class: 'tap', x: tx, y: ty, 'font-size': fs, 'text-anchor': 'middle' }, taps);
        txt.textContent = word;
        A(txt, [
          { transform: 'scale(.3) rotate(-12deg)', opacity: 0 },
          { transform: 'scale(1.18) rotate(4deg)', opacity: 1, offset: 0.25, easing: 'ease-out' },
          { transform: 'scale(1) rotate(0)', opacity: 1, offset: 0.45 },
          { transform: 'scale(1) translateY(-6px)', opacity: 1, offset: 0.8 },
          { transform: 'scale(.9) translateY(-10px)', opacity: 0 },
        ], { duration: 820 });
        // little puffs
        for (let i = 0; i < 3; i++) {
          const dir = i - 1;
          const c = el('circle', { class: 'puff', cx: 200 + dir * 34, cy: 182 - Math.abs(dir) * 4, r: 4.5, fill: '#fffaf3', stroke: INK, 'stroke-width': 1.5 }, puffs);
          A(c, [
            { transform: 'translate(0,0) scale(.4)', opacity: 1 },
            { transform: `translate(${dir * 18}px, ${-10 - (dir === 0 ? 10 : 0)}px) scale(1.1)`, opacity: 0 },
          ], { duration: 380, easing: 'ease-out' });
        }
      });
    });

    // The pestle flies away; the mochi pops out round and turns peach; the keyboard arrives.
    at(3160, () => {
      A(pestle, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translate(70px,-240px) rotate(28deg)', opacity: 0 }], { duration: 460, easing: 'cubic-bezier(.5,0,.9,.4)' });
      A(blobMove, [
        { transform: 'translateY(0)' },
        { transform: 'translateY(6px)', offset: 0.18 },
        { transform: 'translateY(-50px)', offset: 0.65, easing: 'ease-out' },
        { transform: 'translateY(-44px)' },
      ], { duration: 520 });
      A(blob, [
        { transform: 'scale(1)', fill: '#fffaf3' },
        { transform: 'scale(1.18,.8)', offset: 0.18 },
        { transform: 'scale(.92,1.42)', offset: 0.6 },
        { transform: 'scale(1,1.333)', fill: '#ff9e7a' },
      ], { duration: 620, easing: 'ease-out' });
      A(grainsG, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    });
    at(3380, () => A(bowl, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(70px)', opacity: 0 }], { duration: 460, easing: 'cubic-bezier(.5,0,.9,.5)' }));
    at(3560, () => A(kb, [{ transform: 'translateY(90px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.34,1.4,.64,1)' }));

    // Into the empty slot: the ball becomes the last key, T-A-P-O-M-O.
    at(4150, () => {
      A(blobMove, [
        { transform: 'translate(0px,-44px)', easing: 'cubic-bezier(.2,.6,.4,1)' },
        { transform: 'translate(70px,-118px)', offset: 0.46, easing: 'cubic-bezier(.6,0,.9,.5)' },
        { transform: 'translate(130px,48px)' },
      ], { duration: 760 });
      A(blob, [
        { transform: 'scale(1,1.333)' },
        { transform: 'scale(.56,.75)' },
      ], { duration: 760, easing: 'ease-in' });
    });
    at(4900, () => {
      A(blob, [{ opacity: 1 }, { opacity: 0 }], { duration: 60 });
      A($('.kb-slot', scene), [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
      A(mascot, [
        { opacity: 1, transform: 'scale(1.3,.7)' },
        { opacity: 1, transform: 'scale(.94,1.08)', offset: 0.45 },
        { opacity: 1, transform: 'scale(1,1)' },
      ], { duration: 360, easing: 'ease-out' });
      A(kb, [{ transform: 'translateY(0)' }, { transform: 'translateY(5px)', offset: 0.3 }, { transform: 'translateY(0)' }], { duration: 300 });
    });
    at(5150, () => {
      mascot.classList.remove('faceless');
      // the camera moves in on the new key
      A($('.intro-scene', root), [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }], { duration: 800, easing: 'cubic-bezier(.5,0,.2,1)' });
    });
    at(5560, () => {
      Mascot.setFace(mascot, {});
      Mascot.wake(mascot);
    });
    at(5800, () => Mascot.setFace(mascot, { cheeks: true }));
    at(6050, () => {
      Mascot.blink(mascot);
      root.classList.add('named');
      $$('.kb-key', scene).forEach((k, i) => A(k, [
        { transform: 'translateY(0)' }, { transform: 'translateY(-8px)', offset: 0.4, easing: 'ease-out' }, { transform: 'translateY(0)' },
      ], { duration: 360, delay: i * 70, fill: 'none' }));
    });
    at(6420, () => {
      Mascot.setFace(mascot, { eyes: 'sparkle', mouth: 'big', cheeks: true });
      Mascot.jump(mascot, { big: true });
    });
    at(7300, () => endIntro(false));

    const skip = $('.intro-skip', root);
    skip.addEventListener('click', () => endIntro(true));
    skip.focus({ preventScroll: true });
    intro.onKey = (e) => { if (e.key === 'Escape') endIntro(true); };
    // Never trap focus: tabbing out of the intro simply ends it.
    intro.onFocus = (e) => { if (!root.contains(e.target)) endIntro(true); };
    document.addEventListener('keydown', intro.onKey);
    document.addEventListener('focusin', intro.onFocus);
  }

  function endIntro(skipped) {
    if (!intro || intro.done) return;
    const it = intro;
    it.done = true;
    it.timers.forEach(clearTimeout);
    document.removeEventListener('keydown', it.onKey);
    document.removeEventListener('focusin', it.onFocus);
    store.set(VISITED, '1');
    const hadFocus = it.root.contains(document.activeElement);
    it.root.classList.add('out');
    html.classList.remove('intro-on');
    if (hadFocus) document.activeElement.blur();
    setTimeout(() => {
      it.anims.forEach((a) => a.cancel());
      it.root.remove();
      html.classList.remove('intro-built');
      intro = null;
    }, 600);
    setTimeout(() => entrance('first'), skipped ? 150 : 250);
  }

  // ================================================================== reduced motion: one still Tapomo per stage
  function staticStages() {
    const poses = {
      hero: {},
      measure: { eyes: 'sparkle', mouth: 'open' },
      privacy: { eyes: 'closed', mouth: 'small', cheeks: true },
      habits: { eyes: 'sparkle', mouth: 'big', cheeks: true },
      code: { eyes: 'round', mouth: 'small' },
      faq: { eyes: 'wide', mouth: 'o', brows: true },
      support: { eyes: 'closed', mouth: 'big', cheeks: true },
      cta: { eyes: 'star', mouth: 'open', cheeks: true },
    };
    for (const stage of $$('[data-stage]')) {
      const name = stage.dataset.stage;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 160 160');
      svg.setAttribute('aria-hidden', 'true');
      if (name === 'habits') {
        stage.insertAdjacentHTML('afterbegin', '<div class="goal-ring static-ring" style="opacity:1;transform:none"><svg viewBox="0 0 100 100"><circle class="gr-track" cx="50" cy="50" r="44"/><circle class="gr-fill" cx="50" cy="50" r="44" pathLength="100" style="stroke-dashoffset:0;stroke:#ffcc4d"/></svg></div>');
      }
      stage.append(svg);
      Mascot.mount(svg);
      Mascot.setFace(svg, poses[name] || {});
      if (name === 'privacy') Mascot.setShades(svg, true);
      if (name === 'cta') Mascot.setCrown(svg, true);
      if (name === 'code') { window.Wardrobe.wear(svg, 'gafas'); svg.classList.add('wear-gafas'); }
    }
  }

  // ================================================================== start
  function start() {
    applyLang(pickLang());
    setIndexVars();
    buildMedals();
    buildWardrobe();

    const langBtn = $('.lang-btn');
    langBtn.addEventListener('click', () => {
      const next = lang === 'es' ? 'en' : 'es';
      store.set(LANG, next);
      applyLang(next);
      if (tsvg) {
        layout();
        say(t('say.hello'), 1400);
      }
    });

    if (REDUCED) {
      html.classList.add('reduced');
      if (layer) layer.remove();
      staticStages();
      // Reduced motion: no intro to replay (footer link and header button go away).
      for (const el of $$('.replay-intro')) (el.closest('li') || el).remove();
      watchReveals();
      if (!SCROLL_TL) { window.addEventListener('scroll', progressFallback, { passive: true }); progressFallback(); }
      store.set(VISITED, '1');
      return;
    }

    initTraveler();
    watchReveals();
    for (const replay of $$('.replay-intro')) replay.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'auto' });
      traveler.classList.remove('ready');
      runIntro();
    });

    if (html.classList.contains('intro-on')) runIntro();
    else entrance('again');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
