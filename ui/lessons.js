// Typing lessons (0.4). The text is ours, so the page knows which key was expected and which was
// pressed; that never applies to everyday typing, which Tapomo still never sees. Typing inside Tapomo's
// own window is not counted in the everyday stats (src-tauri/src/tracker.rs, is_own_exe).
//
// A lesson is never failed: a wrong key is marked softly and the cursor waits for the right one.
const Lessons = (() => {
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------ catalogue
  // Units unlock letters progressively. `keys`: letters this unit adds (per layout); `base`: target wpm.
  // `perLayout`: lessons for layouts whose letters sit elsewhere (AZERTY, QWERTZ); others use `lessons`.
  const UNITS = [
    { id: 'home', base: 12, keys: { es: 'asdfghjklñ', us: 'asdfghjkl;', fr: 'qsdfghjklm', de: 'asdfghjklö' },
      // Gradual start (0.7.0): 2 letters, then 3, 4, 6… Ids keep the old ones where the known letters
      // match, so earlier progress still counts.
      // 0.8: short real words right after the 8th letter ('home-2w'); the final words lesson stays home-4.
      ids: ['home-1a', 'home-1b', 'home-1', 'home-2a', 'home-2', 'home-2w', 'home-3', 'home-4'],
      lessons: [['fj'], ['d'], ['k'], ['sl'], ['añ'], 'words-short', ['gh'], 'words'],
      // AZERTY's home row has no vowels, so no real words yet: a review of the keys instead.
      perLayout: { fr: [['fj'], ['d'], ['k'], ['sl'], ['qm'], 'review', ['gh'], 'words'], de: [['fj'], ['d'], ['k'], ['sl'], ['aö'], 'words-short', ['gh'], 'words'] } },
    { id: 'top', base: 15, keys: { es: 'qwertyuiop', us: 'qwertyuiop', fr: 'azertyuiop', de: 'qwertzuiop' },
      // 0.8: a words lesson after each drill (short, then longer); old ids kept, final words stays top-4.
      ids: ['top-1', 'top-1w', 'top-2', 'top-2w', 'top-3', 'top-3w', 'top-4'],
      lessons: [['ei'], 'words-short', ['ru', 'ty'], 'words-mid', ['wo', 'qp'], 'words-long', 'words'],
      perLayout: { fr: [['ei'], 'words-short', ['ru', 'ty'], 'words-mid', ['zo', 'ap'], 'words-long', 'words'], de: [['ei'], 'words-short', ['ru', 'tz'], 'words-mid', ['wo', 'qp'], 'words-long', 'words'] } },
    { id: 'bottom', base: 18, keys: { es: 'zxcvbnm,.', us: 'zxcvbnm,.', fr: 'wxcvbn,;:', de: 'yxcvbnm,.' },
      ids: ['bottom-1', 'bottom-1w', 'bottom-2', 'bottom-2w', 'bottom-3', 'bottom-3w', 'bottom-4'],
      lessons: [['vm'], 'words-short', ['cn', ',.'], 'words-mid', ['bxz'], 'words-long', 'words'],
      perLayout: { fr: [['vn'], 'words-short', ['c,', ';:'], 'words-mid', ['bxw'], 'words-long', 'words'], de: [['vm'], 'words-short', ['cn', ',.'], 'words-mid', ['bxy'], 'words-long', 'words'] } },
    // From here on every letter is known; each unit practises one more skill (0.4.1).
    { id: 'caps', base: 18, keys: { es: '⇧', us: '⇧', fr: '⇧', de: '⇧' }, lessons: ['caps-left', 'caps-right', 'names'] },
    { id: 'numbers', base: 15, keys: { es: '1234567890', us: '1234567890', fr: '1234567890', de: '1234567890' }, lessons: ['num-left', 'num-right', 'num-words'] },
    { id: 'punct', base: 16, keys: { es: ',.;:¿?¡!-()', us: ",.;:?!-()'", fr: ",.;:?!-()'", de: ',.;:?!-()' }, lessons: ['punct-drill', 'punct-phrases'] },
    { id: 'accents', base: 16, keys: { es: 'á é í ó ú ü', us: '', fr: 'é è à ç ù ê â î ô û ë ï', de: 'ä ö ü ß Ä Ö Ü é' },
      only: ['es', 'fr', 'de'], lessons: ['accent-vowels', 'accent-words'] },
    { id: 'common', base: 22, keys: { es: 'a–z', us: 'a–z', fr: 'a–z', de: 'a–z' }, lessons: ['common-1', 'common-2'] },
    { id: 'sentences', base: 22, keys: { es: 'Aa.', us: 'Aa.', fr: 'Aa.', de: 'Aa.' }, lessons: ['sentences-1', 'sentences-2', 'sentences-3'] },
    // 0.8: six longer practice texts, the last unit. Every key is known by now.
    { id: 'texts', base: 22, keys: { es: 'Aa.', us: 'Aa.', fr: 'Aa.', de: 'Aa.' }, lessons: ['text-1', 'text-2', 'text-3', 'text-4', 'text-5', 'text-6'] },
  ];
  // US layout swaps the ES-only home key (fr/de have their own drills in `perLayout`).
  const swap = (layout, s) => (layout === 'us' ? s.replace(/ñ/g, ';') : s);
  const lessonsOf = (u, layout) => (u.perLayout && u.perLayout[layout]) || u.lessons;

  // Per-layout language data. `letters`: every letter key of the three rows; `left`: left-hand ones
  // (capitals of those use the right Shift); `plain`: words with no letters beyond the three rows.
  const LANG = {
    es: { lang: 'es', letters: 'asdfghjklñqwertyuiopzxcvbnm', left: 'qwertasdfgzxcvb', plain: /^[a-zñ]+$/ },
    us: { lang: 'en', letters: 'asdfghjklqwertyuiopzxcvbnm', left: 'qwertasdfgzxcvb', plain: /^[a-z]+$/ },
    fr: { lang: 'fr', letters: 'qsdfghjklmazertyuiopwxcvbn', left: 'azertqsdfgwxcvb', plain: /^[a-z]+$/ },
    de: { lang: 'de', letters: 'asdfghjklöqwertzuiopyxcvbnm', left: 'qwertasdfgyxcvb', plain: /^[a-zö]+$/ },
  };
  const langOf = (layout) => LANG[layout] || LANG.us;
  // First lesson of the accents unit: the layout's accented letters alone, then in pairs.
  const ACCENT_DRILL = {
    es: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'á é', 'í ó', 'ú á', 'Á', 'É'],
    fr: ['é', 'è', 'à', 'ç', 'ù', 'ê', 'â', 'î', 'ô', 'û', 'ë', 'ï', 'é è', 'à ç', 'ê ô', 'û ù', 'â î'],
    de: ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü', 'é', 'ä ö', 'ü ß', 'Ä Ö', 'ö ü'],
  };

  /** Every lesson in order: `{ id, unit, index, newKeys, known, kind }`. Units marked `only` skip other layouts. */
  function catalogue(layout) {
    const out = [];
    let known = '';
    for (const u of unitsFor(layout)) {
      lessonsOf(u, layout).forEach((l, i) => {
        const drillKeys = Array.isArray(l) ? swap(layout, l.join('')) : '';
        known += drillKeys;
        const kind = Array.isArray(l) ? 'drill' : l;
        out.push({ id: (u.ids && u.ids[i]) || `${u.id}-${i + 1}`, unit: u.id, index: i, newKeys: drillKeys, known, kind, base: u.base });
      });
    }
    return out;
  }
  function unitsFor(layout) {
    return UNITS.filter((x) => !x.only || x.only.includes(layout));
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

  /** A drill: short groups that lean on the new keys, about `len` characters (shorter while few keys are
   * known: about 55 characters with two keys, up to 150 from ten on). */
  function drill(lesson, seed, len) {
    const r = rng(seed);
    const known = [...new Set(lesson.known.replace(/[^\p{L};,.]/gu, ''))];
    len = len || Math.min(150, 30 + 12 * known.length);
    const fresh = [...new Set(lesson.newKeys)];
    const words = [];
    let size = 0;
    while (size < len) {
      const n = 2 + Math.floor(r() * 4);
      let w = '';
      for (let i = 0; i < n; i++) w += r() < 0.55 && fresh.length ? pick(r, fresh) : pick(r, known);
      // Punctuation never starts a group.
      w = w.replace(/^[,.:]+/, '') || pick(r, fresh.length ? fresh : known);
      words.push(w);
      size += w.length + 1;
    }
    return words.join(' ');
  }

  // Words lessons: longest word allowed (0 = any) and text length. The old 'words' is the full-length final one.
  const WORD_KINDS = {
    'words-short': { max: 4, len: 100 },
    'words-mid': { max: 5, len: 125 },
    'words-long': { max: 0, len: 160 },
    words: { max: 0, len: 170 },
  };

  /** Real words that only use letters already learnt, at most `max` letters long (pseudo-drill if there are too few). */
  function wordsText(lesson, layout, seed, len = 170, max = 0) {
    const r = rng(seed);
    const ok = new Set(lesson.known);
    const pool = (LessonWords[langOf(layout).lang] || []).filter((w) => (!max || w.length <= max) && [...w].every((c) => ok.has(c)));
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

  /** Joins items picked at random until the text is about `len` long. */
  function fill(r, items, len, sep = ' ') {
    const out = [];
    let size = 0;
    while (size < len && items.length) {
      const w = pick(r, items);
      if (out[out.length - 1] === w && items.length > 1) continue;
      out.push(w);
      size += w.length + sep.length;
    }
    return out.join(sep);
  }

  /** Custom practice: half drill on the hard keys, half real words that contain them. */
  function practiceText(lesson, layout, seed) {
    const r = rng(seed);
    const hard = [...lesson.newKeys];
    const words = LessonWords[langOf(layout).lang] || [];
    const pool = words.filter((w) => hard.some((k) => w.includes(k)));
    const all = langOf(layout).letters;
    // Words that contain the hardest letter pairs join the mix (0.9: «binomios»).
    const pairs = lesson.bigrams || [];
    const pairWords = pairs.length ? words.filter((w) => pairs.some((b) => w.includes(b))) : [];
    if (pairWords.length >= 3) {
      const parts = [drill({ newKeys: lesson.newKeys, known: all }, seed, 60)];
      if (pool.length >= 5) parts.push(fill(r, pool, 70));
      parts.push(fill(r, pairWords, 80));
      return parts.join(' ');
    }
    const half = drill({ newKeys: lesson.newKeys, known: all }, seed, 90);
    return pool.length >= 5 ? `${half} ${fill(r, pool, 100)}` : drill({ newKeys: lesson.newKeys, known: all }, seed, 180);
  }

  // Capitalised, very short or interjection-like words look odd ("Ja", "Mas"): capitals use longer words.
  const capWords = (words) => words.filter((w) => w.length >= 4 && !['hala', 'jaja', 'lass', 'lads', 'gals', 'fads'].includes(w));
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

  function textFor(lesson, layout, seed) {
    const r = rng(seed);
    const { lang, left, plain } = langOf(layout);
    const words = (LessonWords[lang] || []).filter((w) => plain.test(w));
    const T = LessonTexts[lang];
    switch (lesson.kind) {
      case 'drill': return drill(lesson, seed);
      case 'review': return drill({ ...lesson, newKeys: lesson.known }, seed);
      case 'practice': return practiceText(lesson, layout, seed);
      case 'words': case 'words-short': case 'words-mid': case 'words-long': {
        const k = WORD_KINDS[lesson.kind];
        return wordsText(lesson, layout, seed, k.len, k.max);
      }
      case 'text-1': case 'text-2': case 'text-3': case 'text-4': case 'text-5': case 'text-6':
        return T.texts[Number(lesson.kind.split('-')[1]) - 1];
      // Shift with the other hand: capitals of left-hand letters use the right Shift and vice versa.
      case 'caps-left': return fill(r, capWords(words).filter((w) => left.includes(w[0])).map(cap), 150);
      case 'caps-right': return fill(r, capWords(words).filter((w) => !left.includes(w[0])).map(cap), 150);
      case 'names': return fill(r, T.names, 160);
      case 'num-left': return fill(r, ['1', '2', '3', '4', '5', '12', '21', '345', '54', '123', '2025', '15'], 120);
      case 'num-right': return fill(r, ['6', '7', '8', '9', '0', '67', '89', '90', '678', '1990', '80', '70'], 120);
      case 'num-words': return fill(r, words.slice(0, 120).map((w) => `${1 + Math.floor(r() * 99)} ${w}`), 160);
      case 'punct-drill': return fill(r, layout === 'us' || layout === 'fr' ? ['a,', 'b.', 'c;', 'd:', 'e?', 'f!', '(g)', 'h-i', "j's"]
        : layout === 'de' ? ['a,', 'b.', 'c;', 'd:', 'e?', 'f!', '(g)', 'h-i']
          : ['a,', 'b.', 'c;', 'd:', '¿e?', '¡f!', '(g)', 'h-i'], 120);
      case 'punct-phrases': return fill(r, T.punct, 170);
      case 'accent-vowels': return fill(r, ACCENT_DRILL[layout] || ACCENT_DRILL.es, 100);
      case 'accent-words': return fill(r, T.accents, 170);
      case 'common-1': return fill(r, words.filter((w) => w.length <= 4), 180);
      case 'common-2': return fill(r, words.filter((w) => w.length >= 5), 200);
      default: {
        // Sentences: a different third of the list for each of the three lessons.
        const n = Number(lesson.kind.split('-')[1]) || 1;
        return fill(r, T.sentences.filter((_, i) => i % 3 === n - 1), 180);
      }
    }
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
    // Catalan typists use the Spanish keyboard (and the Spanish lesson texts: there is no Catalan set).
    if (savedLayout()) return savedLayout();
    const ui = document.documentElement.lang;
    if (ui === 'fr' || ui === 'de') return ui;
    // French and German speakers usually have AZERTY / QWERTZ keyboards even with the UI in English.
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('fr')) return 'fr';
    if (nav.startsWith('de')) return 'de';
    return ['es', 'ca'].includes(document.documentElement.lang) ? 'es' : 'us';
  }
  const bestOf = (id) => (progress.lessons.find((l) => l[0] === id) || [id, 0, 0])[1];
  const targetFor = (lesson) => {
    const cap = progress.everyday_wpm > 0 ? progress.everyday_wpm * 0.8 : lesson.base;
    return Math.max(5, Math.round(Math.min(lesson.base, cap)));
  };

  function lessonName(l) {
    if (l.kind === 'drill') return t(l.newKeys.length === 1 ? 'lessons.key' : 'lessons.keys', { keys: l.newKeys.split('').join(' ') });
    if (l.kind === 'words') return t('lessons.words');
    if (l.kind === 'words-mid') return t('lessons.words_mid');
    if (l.kind === 'words-short') return t('lessons.words_short');
    if (l.kind === 'review') return t('lessons.review');
    if (l.kind === 'words-long') return t('lessons.words_long');
    if (l.kind.startsWith('text-')) return t('lessons.kind.text', { n: l.index + 1 });
    if (l.kind === 'practice') return t('lessons.practice.title');
    if (l.kind.startsWith('sentences')) return t('lessons.kind.sentences', { n: l.index + 1 });
    return t(`lessons.kind.${l.kind}`);
  }

  // ------------------------------------------------------------------ map
  function starIcons(n) {
    return [1, 2, 3].map((i) => `<span class="ls-star${i <= n ? ' on' : ''}" aria-hidden="true">★</span>`).join('');
  }

  let hard = [];
  let bigrams = [];
  let practiceKeys = [];

  /** Keys to practise: the lesson ones first, then the most corrected keys of everyday typing that are
   * not there yet, at most 6. */
  function mergeKeys(lessonKeys, corrected) {
    const out = [];
    const has = (c) => out.some((o) => o.toLowerCase() === c.toLowerCase());
    for (const c of [...lessonKeys, ...corrected]) {
      if (out.length >= 6) break;
      if (c && /\S/.test(c) && !has(c)) out.push(c);
    }
    return out;
  }

  async function correctedChars() {
    if (typeof settings !== 'undefined' && settings && settings.count_corrections === false) return [];
    const rows = await invoke('top_corrected_keys', { days: 30, n: 5 }).catch(() => []);
    const map = Keyboard.charMap(layout);
    return rows.map((r) => Keyboard.charForVk(layout, r.vk)).filter((c) => c && map.has(c));
  }

  async function refresh() {
    layout = layout || defaultLayout();
    let corrected;
    [progress, hard, bigrams, corrected] = await Promise.all([
      invoke('get_lessons_progress', { layout }),
      invoke('get_hard_keys', { layout }).catch(() => []),
      invoke('get_hard_bigrams', { layout }).catch(() => []),
      correctedChars(),
    ]);
    practiceKeys = mergeKeys(hard, corrected);
    renderMap();
  }

  function startPractice() {
    start({ id: 'practice', unit: 'practice', index: 0, newKeys: practiceKeys.join(''), bigrams: bigrams.slice(0, 3), known: '', kind: 'practice', base: 20 });
  }

  /** From the «Teclas que más corriges» card: open the lessons and start the practice at once. */
  async function practiceNow() {
    open();
    await refresh();
    if (practiceKeys.length) startPractice();
  }

  function renderMap() {
    const box = $('ls-units');
    box.replaceChildren();
    $('ls-layout').value = layout;
    const list = catalogue(layout);
    // A lesson opens once the previous one has been done at least once (never by stars: never blocked by skill).
    // Done anything later counts too, so lessons added before old progress never lock it.
    const doneFrom = list.map((l) => bestOf(l.id) > 0);
    for (let i = doneFrom.length - 2; i >= 0; i--) doneFrom[i] = doneFrom[i] || doneFrom[i + 1];
    let open = true;
    for (const u of unitsFor(layout)) {
      const sec = document.createElement('section');
      sec.className = 'ls-unit';
      const h = document.createElement('h3');
      h.textContent = t(`lessons.unit.${u.id}`);
      const keys = document.createElement('p');
      keys.className = 'ls-keys';
      const k = u.keys[layout];
      keys.textContent = /[–⇧ ]/.test(k) || k.length <= 3 ? k : swap(layout, k).split('').join(' ');
      const ol = document.createElement('ol');
      ol.className = 'ls-list';
      for (const l of list.filter((x) => x.unit === u.id)) {
        const best = bestOf(l.id);
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ls-lesson';
        b.disabled = !open;
        const name = lessonName(l);
        b.innerHTML = `<span class="ls-name"></span><span class="ls-stars">${starIcons(best)}</span>`;
        b.querySelector('.ls-name').textContent = name;
        b.setAttribute('aria-label', `${name}. ${t('lessons.stars_aria', { n: best })}`);
        b.addEventListener('click', () => start(l));
        li.append(b);
        ol.append(li);
        open = doneFrom[list.indexOf(l)];
      }
      sec.append(h, keys, ol);
      box.append(sec);
    }
    // "Práctica de tus teclas difíciles": once the lessons know a few keys you miss more.
    const prac = $('ls-practice');
    prac.hidden = practiceKeys.length < 3;
    if (!prac.hidden) {
      $('ls-practice-keys').textContent = practiceKeys.join('  ');
      const pairs = $('ls-practice-pairs');
      pairs.hidden = bigrams.length === 0;
      pairs.textContent = bigrams.length ? t('lessons.practice.bigrams', { pairs: bigrams.slice(0, 3).join(' · ') }) : '';
      $('ls-practice-go').onclick = startPractice;
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
    run = { lesson, text, pos: 0, errAt: new Set(), keys: new Map(), pairs: new Map(), started: 0, lastAt: 0, target: targetFor(lesson) };
    $('ls-map').hidden = true;
    $('ls-result').hidden = true;
    $('ls-run').hidden = false;
    $('ls-run-title').textContent = lessonName(lesson);
    const box = $('ls-text');
    // Letters of a word stay together on one line; lines break only at spaces (0.7.2).
    const out = [];
    let word = null;
    for (const c of text) {
      const s = document.createElement('span');
      s.textContent = c === ' ' ? ' ' : c;
      s.className = 'ls-ch';
      if (c === ' ') {
        word = null;
        out.push(s, document.createElement('wbr'));
      } else {
        if (!word) {
          word = document.createElement('span');
          word.className = 'ls-word';
          out.push(word);
        }
        word.append(s);
      }
    }
    box.replaceChildren(...out);
    if (!kb) kb = Keyboard.render($('ls-kb'), layout, { t, legend: true, ariaLabel: t('keyboard.aria') });
    else kb.setLayout(layout);
    paint();
    Mascot.setFace($('mascot'), { eyes: 'round', mouth: 'small' });
    const input = $('ls-input');
    input.value = '';
    input.focus();
  }

  function paint() {
    const spans = $('ls-text').querySelectorAll('.ls-ch');
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
    // The pair "previous letter + this letter" of OUR lesson text (letters only, never across a space).
    const pairKey = run.pos > 0 ? (run.text[run.pos - 1] + want).toLowerCase() : '';
    const pair = /^\p{L}\p{L}$/u.test(pairKey) ? (run.pairs.get(pairKey) || { pair: pairKey, hits: 0, misses: 0, ms: 0 }) : null;
    const code = Keyboard.charMap(layout).get(want);
    const firstCode = Array.isArray(code) ? code[0].code : code && code.code;
    if (ch === want) {
      // Longest run without a mistake: lessons count for the "sin borrar" record too (0.7.2).
      run.clean = (run.clean || 0) + 1;
      run.bestClean = Math.max(run.bestClean || 0, run.clean);
      stat.hits++;
      stat.ms += Math.round(now - run.lastAt);
      if (pair) { pair.hits++; pair.ms += Math.round(now - run.lastAt); }
      run.lastAt = now;
      run.pos++;
      kb.flash(firstCode, true);
      Mascot.keyTick($('mascot'));
    } else {
      run.clean = 0;
      if (!run.errAt.has(run.pos)) { stat.misses++; if (pair) pair.misses++; }
      run.errAt.add(run.pos);
      kb.flash(firstCode, false);
    }
    run.keys.set(want, stat);
    if (pair) run.pairs.set(pair.pair, pair);
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
        run: {
          lesson_id: run.lesson.id, layout, duration_ms: Math.round(ms), wpm, accuracy, target_wpm: run.target, keys: [...run.keys.values()], bigrams: [...run.pairs.values()],
          chars: run.text.length, best_run: run.bestClean || 0,
        },
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
    const next = i < 0 ? null : list[i + 1];
    $('ls-next').hidden = !next;
    $('ls-next').onclick = () => next && start(next);
    $('ls-again').onclick = () => start(run.lesson);
    $('ls-back').onclick = () => renderMap();
    Mascot.jump($('mascot'), { big: saved.stars === 3 });
    if (saved.stars === 3) setTimeout(() => Support.happyMoment(progress.lessons.length >= 5 ? 7 : 0), 1200);
    Mascot.setFace($('mascot'), { eyes: saved.stars === 3 ? 'sparkle' : 'round', mouth: 'big' });
    $('ls-again').focus();
  }

  // ------------------------------------------------------------- the view
  function open() {
    document.body.dataset.view = 'lessons';
    SectionNav.render();
    $('lessons-btn').setAttribute('aria-pressed', 'true');
    refresh().catch(showError);
  }
  function close() {
    document.body.dataset.view = '';
    SectionNav.render();
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

  return { bind, open, close, refresh, practiceNow, layout: () => layout || defaultLayout(), catalogue, textFor, UNITS };
})();
