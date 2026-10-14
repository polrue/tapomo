// Typing lessons (0.4). The text is ours, so the page knows which key was expected and which was
// pressed; that never applies to everyday typing, which Tapomo still never sees. Typing inside Tapomo's
// own window is not counted in the everyday stats (src-tauri/src/tracker.rs, is_own_exe).
//
// A lesson is never failed: a wrong key is marked softly and the cursor waits for the right one.
const Lessons = (() => {
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ catalogue
  // Units unlock letters progressively. `keys`: letters this unit adds (per layout); `base`: target wpm.
  const UNITS = [
    { id: 'home', base: 12, keys: { es: 'asdfghjklñ', us: 'asdfghjkl;' },
      lessons: [['fj', 'dk'], ['sl', 'añ'], ['gh'], 'words'] },
    { id: 'top', base: 15, keys: { es: 'qwertyuiop', us: 'qwertyuiop' },
      lessons: [['ei'], ['ru', 'ty'], ['wo', 'qp'], 'words'] },
    { id: 'bottom', base: 18, keys: { es: 'zxcvbnm,.', us: 'zxcvbnm,.' },
      lessons: [['vm'], ['cn', ',.'], ['bxz'], 'words'] },
  ];
  // US layout swaps the ES-only home key.
  const swap = (layout, s) => (layout === 'us' ? s.replace(/ñ/g, ';') : s);

  /** Every lesson in order: `{ id, unit, index, newKeys, known, kind }`. */
  function catalogue(layout) {
    const out = [];
    let known = '';
    for (const u of UNITS) {
      u.lessons.forEach((l, i) => {
        const newKeys = l === 'words' ? '' : swap(layout, l.join(''));
        known += newKeys;
        out.push({ id: `${u.id}-${i + 1}`, unit: u.id, index: i, newKeys, known: known + (l === 'words' ? '' : ''), kind: l === 'words' ? 'words' : 'drill', base: u.base });
      });
    }
    return out;
  }

  // ----------------------------------------------------------- generators
  /** Small seeded generator (mulberry32) so a retry gets a fresh but reproducible text. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, s) => s[Math.floor(r() * s.length)];

  /** A drill: short groups that lean on the new keys, about `len` characters. */
  function drill(lesson, seed, len = 150) {
    const r = rng(seed);
    const known = [...new Set(lesson.known.replace(/[^\p{L};,.]/gu, ''))];
    const fresh = [...new Set(lesson.newKeys)];
    const words = [];
    let size = 0;
    while (size < len) {
      const n = 2 + Math.floor(r() * 4);
      let w = '';
      for (let i = 0; i < n; i++) w += r() < 0.55 && fresh.length ? pick(r, fresh) : pick(r, known);
      // Punctuation never starts a group.
      w = w.replace(/^[,.]+/, '') || pick(r, fresh.length ? fresh : known);
      words.push(w);
      size += w.length + 1;
    }
    return words.join(' ');
  }

  /** Real words that only use letters already learnt (pseudo-drill if there are too few). */
  function wordsText(lesson, layout, seed, len = 170) {
    const r = rng(seed);
    const ok = new Set(lesson.known);
    const pool = (LessonWords[layout === 'us' ? 'en' : 'es'] || []).filter((w) => [...w].every((c) => ok.has(c)));
    if (pool.length < 8) return drill({ ...lesson, newKeys: lesson.known }, seed, len);
    const out = [];
    let size = 0;
    while (size < len) {
      const w = pick(r, pool);
      if (out[out.length - 1] === w) continue;
      out.push(w);
      size += w.length + 1;
    }
    return out.join(' ');
  }

  function textFor(lesson, layout, seed) {
    return lesson.kind === 'words' ? wordsText(lesson, layout, seed) : drill(lesson, seed);
  }

  // ---------------------------------------------------------------- state
  let layout = null;
  let progress = { lessons: [], everyday_wpm: null, before_after: null };
  let kb = null;
  let run = null; // the lesson being typed

  const STORE = 'tapomo.lessons.layout';
  function savedLayout() {
    try { return localStorage.getItem(STORE); } catch (_) { return null; }
  }
  function defaultLayout() {
    return savedLayout() || (document.documentElement.lang === 'es' ? 'es' : 'us');
  }
  const bestOf = (id) => (progress.lessons.find((l) => l[0] === id) || [id, 0, 0])[1];
  const targetFor = (lesson) => {
    const cap = progress.everyday_wpm > 0 ? progress.everyday_wpm * 0.8 : lesson.base;
    return Math.max(5, Math.round(Math.min(lesson.base, cap)));
  };

  // ------------------------------------------------------------------ map
  function starIcons(n) {
    return [1, 2, 3].map((i) => `<span class="ls-star${i <= n ? ' on' : ''}" aria-hidden="true">★</span>`).join('');
  }

  async function refresh() {
    layout = layout || defaultLayout();
    progress = await invoke('get_lessons_progress', { layout });
    renderMap();
  }

  function renderMap() {
    const box = $('ls-units');
    box.replaceChildren();
    $('ls-layout').value = layout;
    const list = catalogue(layout);
    // A lesson opens once the previous one has been done at least once (never by stars: never blocked by skill).
    let open = true;
    for (const u of UNITS) {
      const sec = document.createElement('section');
      sec.className = 'ls-unit';
      const h = document.createElement('h3');
      h.textContent = t(`lessons.unit.${u.id}`);
      const keys = document.createElement('p');
      keys.className = 'ls-keys';
      keys.textContent = swap(layout, u.keys[layout]).split('').join(' ');
      const ol = document.createElement('ol');
      ol.className = 'ls-list';
      for (const l of list.filter((x) => x.unit === u.id)) {
        const best = bestOf(l.id);
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ls-lesson';
        b.disabled = !open;
        const name = l.kind === 'words' ? t('lessons.words') : t('lessons.keys', { keys: l.newKeys.split('').join(' ') });
        b.innerHTML = `<span class="ls-name"></span><span class="ls-stars">${starIcons(best)}</span>`;
        b.querySelector('.ls-name').textContent = name;
        b.setAttribute('aria-label', `${name}. ${t('lessons.stars_aria', { n: best })}`);
        b.addEventListener('click', () => start(l));
        li.append(b);
        ol.append(li);
        open = open && best > 0;
      }
      sec.append(h, keys, ol);
      box.append(sec);
    }
    const ba = progress.before_after;
    $('ls-real').hidden = !ba;
    if (ba) $('ls-real').textContent = t('lessons.real', { a: fmt(ba[0]), b: fmt(ba[1]) });
    $('ls-map').hidden = false;
    $('ls-run').hidden = true;
    $('ls-result').hidden = true;
  }

  // --------------------------------------------------------------- runner
  function start(lesson, seed = Date.now()) {
    const text = textFor(lesson, layout, seed);
    run = { lesson, text, pos: 0, errAt: new Set(), keys: new Map(), started: 0, lastAt: 0, target: targetFor(lesson) };
    $('ls-map').hidden = true;
    $('ls-result').hidden = true;
    $('ls-run').hidden = false;
    $('ls-run-title').textContent = lesson.kind === 'words' ? t('lessons.words') : t('lessons.keys', { keys: lesson.newKeys.split('').join(' ') });
    const box = $('ls-text');
    box.replaceChildren(...[...text].map((c) => {
      const s = document.createElement('span');
      s.textContent = c === ' ' ? ' ' : c;
      s.className = 'ls-ch';
      return s;
    }));
    if (!kb) kb = Keyboard.render($('ls-kb'), layout, { t, legend: true, ariaLabel: t('keyboard.aria') });
    else kb.setLayout(layout);
    paint();
    Mascot.setFace($('mascot'), { eyes: 'round', mouth: 'small' });
    const input = $('ls-input');
    input.value = '';
    input.focus();
  }

  function paint() {
    const spans = $('ls-text').children;
    for (let i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('done', i < run.pos);
      spans[i].classList.toggle('cur', i === run.pos);
      spans[i].classList.toggle('err', run.errAt.has(i) && i <= run.pos);
    }
    spans[run.pos]?.scrollIntoView({ block: 'nearest' });
    const next = run.text[run.pos];
    if (next !== undefined) kb.highlight(next);
    const typed = run.pos;
    const mins = run.started ? (performance.now() - run.started) / 60000 : 0;
    $('ls-wpm').textContent = mins > 0.05 ? fmt(typed / 5 / mins) : '–';
    const acc = typed ? 1 - [...run.errAt].filter((i) => i < typed).length / typed : 1;
    $('ls-acc').textContent = `${fmt(acc * 100)} %`;
    $('ls-bar').style.width = `${((typed / run.text.length) * 100).toFixed(1)}%`;
  }

  /** One character typed into the hidden input (dead keys arrive already composed). */
  function onChar(ch) {
    if (!run || run.pos >= run.text.length) return;
    const now = performance.now();
    if (!run.started) run.started = run.lastAt = now;
    const want = run.text[run.pos];
    const stat = run.keys.get(want) || { key: want, hits: 0, misses: 0, ms: 0 };
    const code = Keyboard.charMap(layout).get(want);
    const firstCode = Array.isArray(code) ? code[0].code : code && code.code;
    if (ch === want) {
      stat.hits++;
      stat.ms += Math.round(now - run.lastAt);
      run.lastAt = now;
      run.pos++;
      kb.flash(firstCode, true);
      Mascot.keyTick($('mascot'));
    } else {
      if (!run.errAt.has(run.pos)) stat.misses++;
      run.errAt.add(run.pos);
      kb.flash(firstCode, false);
    }
    run.keys.set(want, stat);
    paint();
    if (run.pos >= run.text.length) finish();
  }

  async function finish() {
    const ms = performance.now() - run.started;
    const wpm = run.text.length / 5 / (ms / 60000);
    const accuracy = 1 - run.errAt.size / run.text.length;
    kb.clear();
    let saved = { stars: 1, best_before: 0, xp: 0 };
    try {
      saved = await invoke('save_lesson', {
        run: { lesson_id: run.lesson.id, layout, duration_ms: Math.round(ms), wpm, accuracy, target_wpm: run.target, keys: [...run.keys.values()] },
      });
    } catch (e) { showError(e); }
    progress = await invoke('get_lessons_progress', { layout }).catch(() => progress);
    showResult(saved, wpm, accuracy);
  }

  function showResult(saved, wpm, accuracy) {
    $('ls-run').hidden = true;
    $('ls-result').hidden = false;
    $('ls-res-stars').innerHTML = starIcons(saved.stars);
    $('ls-res-title').textContent = t(`lessons.result.${saved.stars}`);
    $('ls-res-line').textContent = t('lessons.result.line', { wpm: fmt(wpm), acc: fmt(accuracy * 100), xp: fmt(saved.xp) });
    $('ls-res-tip').textContent = saved.stars < 3 ? t(saved.stars < 2 ? 'lessons.tip.acc' : 'lessons.tip.pace', { target: fmt(run.target) }) : (saved.stars > saved.best_before ? t('lessons.tip.new_best') : '');
    const list = catalogue(layout);
    const i = list.findIndex((l) => l.id === run.lesson.id);
    const next = list[i + 1];
    $('ls-next').hidden = !next;
    $('ls-next').onclick = () => next && start(next);
    $('ls-again').onclick = () => start(run.lesson);
    $('ls-back').onclick = () => renderMap();
    Mascot.jump($('mascot'), { big: saved.stars === 3 });
    Mascot.setFace($('mascot'), { eyes: saved.stars === 3 ? 'sparkle' : 'round', mouth: 'big' });
    $('ls-again').focus();
  }

  // ------------------------------------------------------------- the view
  function open() {
    document.body.dataset.view = 'lessons';
    $('lessons-btn').setAttribute('aria-pressed', 'true');
    refresh().catch(showError);
  }
  function close() {
    document.body.dataset.view = '';
    $('lessons-btn').setAttribute('aria-pressed', 'false');
    run = null;
    if (kb) kb.clear();
    Mascot.setFace($('mascot'), {});
  }

  function bind() {
    $('lessons-btn').addEventListener('click', () => (document.body.dataset.view === 'lessons' ? close() : open()));
    $('ls-close').addEventListener('click', close);
    $('ls-layout').addEventListener('change', () => {
      layout = $('ls-layout').value;
      try { localStorage.setItem(STORE, layout); } catch (_) { /* optional */ }
      refresh().catch(showError);
    });
    const input = $('ls-input');
    input.addEventListener('input', (e) => {
      const data = e.data || input.value;
      input.value = '';
      for (const ch of data || '') onChar(ch);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); renderMap(); }
      if (e.key === 'Enter' && run && run.text[run.pos] === '\n') { e.preventDefault(); onChar('\n'); }
    });
    $('ls-text').addEventListener('click', () => input.focus());
  }

  return { bind, open, close, refresh, catalogue, textFor, UNITS };
})();
