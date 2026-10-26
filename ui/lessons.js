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
  ];
  // The path is shown in blocks, each with a heading and a short intro (lessons.block.<id>.title/.intro).
  // Unlocking stays sequential across blocks; the library and the finger trainer follow as blocks 4 and 5.
  const BLOCKS = [
    { id: 'letters', units: ['home', 'top', 'bottom'] },
    { id: 'beyond', units: ['caps', 'numbers', 'punct', 'accents'] },
    { id: 'fluency', units: ['common', 'sentences'] },
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

  const L = LessonLogic;

  /** This layout's text library (ui/library/*.js), or null while there is none. */
  function library(lay) {
    const all = typeof window !== 'undefined' && window.LessonLibrary;
    const lib = all && all[L.libLang(lay)];
    return lib && Array.isArray(lib.texts) && lib.texts.length ? lib : null;
  }

  /** Repeats a generator with fresh seeds until about `len` characters, cut at a space. */
  function sized(len, gen, seed) {
    let text = '';
    for (let i = 0; text.length < len && i < 30; i++) text = text ? `${text} ${gen(seed + i)}` : gen(seed);
    return L.trimTo(text, len);
  }

  /** Sprint: sentences of the library texts up to the user's level, in a seeded endless flow. Part
   * `n` of the flow is the next ~400 characters. */
  function sprintMore(lesson, seed, n) {
    return fill(rng(seed + 7919 * n), lesson.pool || [], 400);
  }

  /** «Entrenador de dedos»: a drill of the finger's keys with home-row anchors, then real words dense
   * in its letters (texts of the library and the lesson word list). */
  function fingerText(lesson, lay, seed) {
    const r = rng(seed);
    const keys = lesson.keys || [];
    const home = swap(lay, UNITS[0].keys[lay] || UNITS[0].keys.us);
    const drillPart = drill({ newKeys: keys.join(''), known: home + keys.join('') }, seed, 70);
    const lib = library(lay);
    const libWords = lib ? lib.texts.flatMap((x) => L.plainText(x.text).split(' ').map((w) => w.replace(/[^\p{L}]/gu, ''))) : [];
    const words = L.fingerWords([...(LessonWords[langOf(lay).lang] || []), ...libWords], keys);
    return words.length >= 5 ? `${drillPart} ${fill(r, words, 100)}` : drill({ newKeys: keys.join(''), known: home + keys.join('') }, seed, 170);
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
      case 'practice': return lesson.len ? sized(lesson.len, (sd) => practiceText(lesson, layout, sd), seed) : practiceText(lesson, layout, seed);
      case 'library': return L.plainText(lesson.text);
      case 'pangrams': return fill(r, ((library(layout) || {}).pangrams || []).map(L.plainText), 200);
      case 'sprint': return sprintMore(lesson, seed, 0);
      case 'finger': return fingerText(lesson, layout, seed);
      case 'words': case 'words-short': case 'words-mid': case 'words-long': {
        const k = WORD_KINDS[lesson.kind];
        return wordsText(lesson, layout, seed, k.len, k.max);
      }
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
  let tick = 0; // interval of the sprint clock and the «Ritmo» pacer

  const MODE_STORE = 'tapomo.lessonMode';
  const FINGER_STORE = 'tapomo.lessonFinger';
  const MODES = ['normal', 'precision', 'pace'];
  const FINGERS = [0, 1, 2, 3, 6, 7, 8, 9]; // thumbs only type the space
  const SPRINT_MS = 60_000;
  function stored(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function store(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { /* optional */ }
  }
  let mode = MODES.includes(stored(MODE_STORE)) ? stored(MODE_STORE) : 'normal';

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
  const bestWpmOf = (id) => (progress.lessons.find((l) => l[0] === id) || [])[3] || 0;
  const todayStars = (id) => ((progress.today || []).find((l) => l[0] === id) || [id, 0])[1];
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
    if (l.kind === 'practice') return t(l.len ? 'lessons.today_practice.kicker' : 'lessons.practice.title');
    if (l.kind === 'library') return l.title;
    if (l.kind === 'pangrams') return t('lessons.pangrams.title');
    if (l.kind === 'sprint') return t('lessons.sprint.title');
    if (l.kind === 'finger') return t('lessons.fingers.drill', { finger: t(`finger.${l.finger}`) });
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

  /** The hard-keys practice; `daily` sizes it to about 3 minutes at the user's pace («Tu práctica del día»). */
  function startPractice(daily) {
    const len = daily ? L.practiceChars(progress.recent_wpm || progress.everyday_wpm || 0) : 0;
    start({ id: 'practice', unit: 'practice', index: 0, newKeys: practiceKeys.join(''), bigrams: bigrams.slice(0, 3), known: '', kind: 'practice', base: 20, len });
  }

  // New exercises (0.9). Library texts keep their permanent id, so the path, the daily text and the
  // stars share one progress.
  const libLesson = (x, i, daily) => ({
    id: x.id, unit: 'lib', index: i, newKeys: '', known: '', kind: 'library', base: 16 + 2 * (x.level || 1),
    title: x.title, source: x.source || '', text: x.text, level: x.level, daily: !!daily,
  });
  const pangramLesson = () => ({ id: 'pangrams', unit: 'lib', index: 0, newKeys: '', known: '', kind: 'pangrams', base: 20 });
  function sprintLesson() {
    const lib = library(layout);
    const max = L.levelReached(lib.texts, bestOf);
    const pool = lib.texts.filter((x) => (x.level || 1) <= max).flatMap((x) => L.sentences(x.text));
    return { id: 'sprint-1m', unit: 'sprint', index: 0, newKeys: '', known: '', kind: 'sprint', base: 20, pool: pool.length ? pool : lib.texts.map((x) => L.plainText(x.text)) };
  }
  const fingerLesson = (f) => ({
    id: `finger-${f}`, unit: 'fingers', index: f, newKeys: '', known: '', kind: 'finger', finger: f, base: 15,
    keys: L.drillableKeys(Keyboard.keysForFinger(layout, f)),
  });
  /** Text exercises where the «Normal / Precisión / Ritmo» modes make sense. */
  const hasModes = (l) => ['library', 'pangrams', 'practice'].includes(l.kind);

  function setSource(node, source) {
    node.hidden = !source;
    node.textContent = source || '';
  }
  function starLine(node, label, n) {
    const s = document.createElement('span');
    s.className = 'ls-stars';
    s.innerHTML = starIcons(n);
    s.setAttribute('aria-label', t('lessons.stars_aria', { n }));
    s.setAttribute('role', 'img');
    node.replaceChildren(document.createTextNode(`${label} `), s);
  }

  /** Top cards: «Texto del día», «Tu práctica del día» and the sprint. */
  function renderTop() {
    const lib = library(layout);
    $('ls-daily').hidden = !lib;
    $('ls-sprint').hidden = !lib;
    if (lib) {
      const i = L.dailyIndex(new Date(), lib.texts.length);
      const x = lib.texts[i];
      const st = todayStars(x.id);
      $('ls-daily-title').textContent = x.title;
      setSource($('ls-daily-source'), x.source);
      starLine($('ls-daily-meta'), `${t('lessons.level', { n: x.level || 1 })} · ${t('lessons.daily.today')}`, st);
      $('ls-daily').classList.toggle('done', st > 0);
      $('ls-daily-go').onclick = () => start(libLesson(x, i, true));
      const best = bestWpmOf('sprint-1m');
      $('ls-sprint-best').textContent = best > 0 ? t('lessons.sprint.best', { wpm: fmt(best) }) : t('lessons.sprint.no_best');
      $('ls-sprint-go').onclick = () => start(sprintLesson());
    }
    // «Tu práctica del día»: once the lessons know a few keys you miss more.
    const ready = practiceKeys.length >= 3;
    $('ls-practice-ready').hidden = !ready;
    $('ls-practice-empty').hidden = ready;
    $('ls-practice').classList.toggle('done', ready && todayStars('practice') > 0);
    if (ready) {
      $('ls-practice-text').textContent = t('lessons.today_practice.text');
      $('ls-practice-keys').textContent = practiceKeys.join('  ');
      const pairs = $('ls-practice-pairs');
      pairs.hidden = bigrams.length === 0;
      pairs.textContent = bigrams.length ? t('lessons.practice.bigrams', { pairs: bigrams.slice(0, 3).join(' · ') }) : '';
      $('ls-practice-go').onclick = () => startPractice(true);
    }
  }

  /** «Biblioteca de textos»: «Todas las letras» and the path of texts by level. */
  function renderLib() {
    const lib = library(layout);
    $('ls-lib').hidden = !lib;
    if (!lib) return;
    const hasPangrams = (lib.pangrams || []).length > 0;
    $('ls-pangrams-go').closest('.ls-pangrams').hidden = !hasPangrams;
    $('ls-pangrams-stars').innerHTML = starIcons(bestOf('pangrams'));
    $('ls-pangrams-go').onclick = () => start(pangramLesson());
    const open = L.pathUnlocked(lib.texts, bestOf);
    // The level with the next text to do starts unfolded (the first one for a new user).
    const nextIdx = lib.texts.findIndex((x, i) => open[i] && bestOf(x.id) < 2);
    const nextLevel = (lib.texts[nextIdx < 0 ? lib.texts.length - 1 : nextIdx] || {}).level;
    const box = $('ls-path');
    box.replaceChildren();
    for (const [level, texts] of L.byLevel(lib.texts)) {
      const det = document.createElement('details');
      det.className = 'ls-unit ls-level';
      det.open = level === nextLevel;
      const sum = document.createElement('summary');
      const done = texts.filter((x) => bestOf(x.id) >= 2).length;
      sum.innerHTML = '<span class="ls-level-name"></span><span class="ls-level-count"></span>';
      sum.querySelector('.ls-level-name').textContent = t('lessons.level', { n: level });
      sum.querySelector('.ls-level-count').textContent = t('lessons.lib.count', { done, n: texts.length });
      const ol = document.createElement('ol');
      ol.className = 'ls-list';
      for (const x of texts) {
        const i = lib.texts.indexOf(x);
        const best = bestOf(x.id);
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `ls-lesson ls-text-item${best === 3 ? ' gold' : ''}`;
        b.disabled = !open[i];
        b.innerHTML = '<span class="ls-name"><span class="ls-ttl"></span><small class="ls-source"></small></span><span class="ls-stars"></span>';
        b.querySelector('.ls-ttl').textContent = x.title;
        setSource(b.querySelector('small'), x.source);
        b.querySelector('.ls-stars').innerHTML = open[i] ? starIcons(best) : '<span class="ls-lock" aria-hidden="true">🔒</span>';
        b.setAttribute('aria-label', `${x.title}. ${open[i] ? t('lessons.stars_aria', { n: best }) : t('lessons.lib.locked')}`);
        if (!open[i]) b.title = t('lessons.lib.locked');
        b.addEventListener('click', () => start(libLesson(x, i, false)));
        li.append(b);
        ol.append(li);
      }
      det.append(sum, ol);
      box.append(det);
    }
  }

  /** «Entrenador de dedos»: one chip per finger (no thumbs); the last one picked stays marked. */
  function renderFingers() {
    const ok = typeof Keyboard.keysForFinger === 'function';
    $('ls-fingers').hidden = !ok;
    if (!ok) return;
    const last = stored(FINGER_STORE);
    const box = $('ls-finger-chips');
    box.replaceChildren();
    for (const f of FINGERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ls-chip';
      b.setAttribute('aria-pressed', String(last === String(f)));
      const keys = L.drillableKeys(Keyboard.keysForFinger(layout, f)).filter((k) => /\p{L}/u.test(k));
      b.innerHTML = '<span class="ls-chip-name"></span><span class="ls-chip-keys"></span><span class="ls-stars"></span>';
      b.querySelector('.ls-chip-name').textContent = t(`finger.${f}`);
      b.querySelector('.ls-chip-keys').textContent = keys.join(' ');
      b.querySelector('.ls-stars').innerHTML = starIcons(bestOf(`finger-${f}`));
      b.setAttribute('aria-label', `${t(`finger.${f}`)}: ${keys.join(' ')}. ${t('lessons.stars_aria', { n: bestOf(`finger-${f}`) })}`);
      b.addEventListener('click', () => {
        store(FINGER_STORE, f);
        start(fingerLesson(f));
      });
      box.append(b);
    }
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
    const unitSec = (u) => {
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
      return sec;
    };
    const present = unitsFor(layout);
    BLOCKS.forEach((blk, n) => {
      const us = present.filter((u) => blk.units.includes(u.id));
      if (!us.length) return;
      const sec = document.createElement('section');
      sec.className = 'ls-section ls-block';
      const h = document.createElement('h3');
      h.textContent = `${n + 1} · ${t(`lessons.block.${blk.id}.title`)}`;
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t(`lessons.block.${blk.id}.intro`);
      const grid = document.createElement('div');
      grid.className = 'ls-units';
      grid.append(...us.map(unitSec));
      sec.append(h, p, grid);
      box.append(sec);
    });
    renderTop();
    renderLib();
    renderFingers();
    const ba = progress.before_after;
    $('ls-real').hidden = !ba;
    if (ba) $('ls-real').textContent = t('lessons.real', { a: fmt(ba[0]), b: fmt(ba[1]) });
    stopTick();
    run = null;
    $('ls-map').hidden = false;
    $('ls-run').hidden = true;
    $('ls-result').hidden = true;
  }

  // --------------------------------------------------------------- runner
  /** Spans of `text`: letters of a word stay together on one line; lines break only at spaces (0.7.2). */
  function spansFor(text) {
    const out = [];
    let word = null;
    for (const c of text) {
      const s = document.createElement('span');
      s.textContent = c === ' ' ? ' ' : c;
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
    return out;
  }

  /** Starts (or restarts) an exercise. The same `seed` gives the same text: «Reiniciar» keeps it. */
  function start(lesson, seed = Date.now()) {
    stopTick();
    const text = textFor(lesson, layout, seed);
    const timed = lesson.kind === 'sprint';
    run = {
      lesson, seed, text, pos: 0, reach: 0, errAt: new Set(), keys: new Map(), pairs: new Map(), started: 0, lastAt: 0,
      target: targetFor(lesson), mode: hasModes(lesson) ? mode : 'normal', timed, part: 0, paceAt: -1,
    };
    run.paceWpm = L.pacerWpm(progress.recent_wpm, run.target);
    $('ls-map').hidden = true;
    $('ls-result').hidden = true;
    $('ls-run').hidden = false;
    $('ls-run-title').textContent = lessonName(lesson);
    setSource($('ls-run-source'), lesson.source);
    $('ls-timer-box').hidden = !timed;
    $('ls-timer').textContent = String(SPRINT_MS / 1000);
    renderTools();
    $('ls-text').replaceChildren(...spansFor(text));
    if (!kb) kb = Keyboard.render($('ls-kb'), layout, { t, legend: true, ariaLabel: t('keyboard.aria') });
    else kb.setLayout(layout);
    paint();
    Mascot.setFace($('mascot'), { eyes: 'round', mouth: 'small' });
    const input = $('ls-input');
    input.value = '';
    input.focus();
  }

  /** «Reiniciar»: the same exercise and text from zero; the attempt is dropped (nothing saved, no XP). */
  function restart() {
    if (run && !$('ls-run').hidden) start(run.lesson, run.seed);
  }

  /** Mode buttons, hands toggle and the mode hint of the running header. */
  function renderTools() {
    const modes = $('ls-modes');
    modes.hidden = !hasModes(run.lesson);
    for (const b of modes.querySelectorAll('[data-mode]')) {
      const on = b.dataset.mode === run.mode;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    const hint = $('ls-mode-hint');
    hint.hidden = modes.hidden || run.mode === 'normal';
    hint.textContent = run.mode === 'pace' ? t('lessons.mode.pace_hint', { wpm: fmt(run.paceWpm) }) : run.mode === 'precision' ? t('lessons.mode.precision_tip') : '';
    const hands = $('ls-hands');
    const canHands = typeof Keyboard.setHands === 'function' && typeof Keyboard.handsOn === 'function';
    hands.hidden = !canHands;
    if (canHands) hands.setAttribute('aria-pressed', String(Keyboard.handsOn()));
  }

  function setMode(next) {
    if (!MODES.includes(next) || !run) return;
    mode = next;
    store(MODE_STORE, next);
    // A new mode is a fresh attempt at the same text.
    if (run.mode !== next) start(run.lesson, run.seed);
    else $('ls-input').focus();
  }

  function stopTick() {
    if (tick) clearInterval(tick);
    tick = 0;
  }
  /** The sprint clock and the «Ritmo» pacer move with time, not with keys. */
  function startTick() {
    if (tick || !(run.timed || run.mode === 'pace')) return;
    tick = setInterval(() => {
      if (!run || !run.started) return;
      if (run.timed && performance.now() - run.started >= SPRINT_MS) {
        finish();
        return;
      }
      paintClock();
    }, 100);
  }

  /** Characters attempted so far: those passed plus the current one if it has a mistake. */
  const attempted = () => run.reach + (run.errAt.has(run.reach) ? 1 : 0);

  function paintClock() {
    const elapsed = run.started ? performance.now() - run.started : 0;
    if (run.timed) {
      $('ls-timer').textContent = String(Math.max(0, Math.ceil((SPRINT_MS - elapsed) / 1000)));
      $('ls-bar').style.width = `${Math.min(100, (elapsed / SPRINT_MS) * 100).toFixed(1)}%`;
    }
    if (run.mode === 'pace') {
      const at = run.started ? L.pacerPos(elapsed, run.paceWpm, run.text.length - 1) : -1;
      if (at !== run.paceAt) {
        const spans = $('ls-text').querySelectorAll('.ls-ch');
        spans[run.paceAt]?.classList.remove('pace');
        spans[at]?.classList.add('pace');
        run.paceAt = at;
      }
    }
  }

  function paint() {
    const spans = $('ls-text').querySelectorAll('.ls-ch');
    for (let i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('done', i < run.pos);
      spans[i].classList.toggle('cur', i === run.pos);
      spans[i].classList.toggle('err', run.errAt.has(i) && i <= run.pos);
      spans[i].classList.remove('pace');
    }
    spans[run.pos]?.scrollIntoView({ block: 'nearest' });
    const next = run.text[run.pos];
    if (next !== undefined) kb.highlight(next);
    const mins = run.started ? (performance.now() - run.started) / 60000 : 0;
    const typed = attempted();
    const speed = run.timed ? L.netWpm(run.pos, run.errAt.size, mins * 60000) : run.pos / 5 / mins;
    $('ls-wpm').textContent = mins > 0.05 ? fmt(speed) : '–';
    const acc = typed ? 1 - run.errAt.size / typed : 1;
    $('ls-acc').textContent = `${fmt(Math.max(0, acc) * 100)} %`;
    if (!run.timed) $('ls-bar').style.width = `${((run.pos / run.text.length) * 100).toFixed(1)}%`;
    run.paceAt = -1; // repaint the pacer on the fresh classes
    paintClock();
  }

  /** The sprint never runs out of text: more sentences join before the cursor gets near the end. */
  function extendSprint() {
    while (run.text.length - run.pos < 200) {
      run.part++;
      const more = ` ${sprintMore(run.lesson, run.seed, run.part)}`;
      run.text += more;
      $('ls-text').append(...spansFor(more));
    }
  }

  /** One character typed into the hidden input (dead keys arrive already composed). */
  function onChar(ch) {
    if (!run || run.pos >= run.text.length || run.over) return;
    const now = performance.now();
    if (!run.started) {
      run.started = run.lastAt = now;
      startTick();
    }
    const want = run.text[run.pos];
    const stat = run.keys.get(want) || { key: want, hits: 0, misses: 0, ms: 0 };
    // The pair "previous letter + this letter" of OUR lesson text (letters only, never across a space).
    const pairKey = run.pos > 0 ? (run.text[run.pos - 1] + want).toLowerCase() : '';
    const pair = /^\p{L}\p{L}$/u.test(pairKey) ? (run.pairs.get(pairKey) || { pair: pairKey, hits: 0, misses: 0, ms: 0 }) : null;
    const code = Keyboard.charMap(layout).get(want);
    const firstCode = Array.isArray(code) ? code[0].code : code && code.code;
    const ok = ch === want;
    if (ok) {
      // Longest run without a mistake: lessons count for the "sin borrar" record too (0.7.2).
      run.clean = (run.clean || 0) + 1;
      run.bestClean = Math.max(run.bestClean || 0, run.clean);
      stat.hits++;
      stat.ms += Math.round(now - run.lastAt);
      if (pair) { pair.hits++; pair.ms += Math.round(now - run.lastAt); }
      kb.flash(firstCode, true);
      Mascot.keyTick($('mascot'));
    } else {
      run.clean = 0;
      if (!run.errAt.has(run.pos)) { stat.misses++; if (pair) pair.misses++; }
      run.errAt.add(run.pos);
      kb.flash(firstCode, false);
    }
    run.lastAt = now;
    run.keys.set(want, stat);
    if (pair) run.pairs.set(pair.pair, pair);
    run.pos = L.advance(run.text, run.pos, ok, run.mode);
    run.reach = Math.max(run.reach, run.pos);
    if (run.timed) extendSprint();
    paint();
    if (!run.timed && run.pos >= run.text.length) finish();
  }

  async function finish() {
    if (!run || run.over) return;
    run.over = true;
    stopTick();
    const done = run;
    const ms = done.timed ? Math.min(SPRINT_MS, performance.now() - done.started) : performance.now() - done.started;
    const typed = attempted();
    kb.clear();
    // A sprint without a single key typed right is not a result.
    if (done.timed && done.pos === 0) {
      renderMap();
      return;
    }
    const chars = done.timed ? done.pos : done.text.length;
    const wpm = done.timed ? L.netWpm(done.pos, done.errAt.size, ms) : done.text.length / 5 / (ms / 60000);
    const accuracy = Math.max(0, 1 - done.errAt.size / Math.max(1, done.timed ? typed : done.text.length));
    const bestBefore = bestWpmOf(done.lesson.id);
    let saved = { stars: 1, best_before: 0, xp: 0 };
    try {
      saved = await invoke('save_lesson', {
        run: {
          lesson_id: done.lesson.id, layout, duration_ms: Math.round(ms), wpm, accuracy, target_wpm: done.target, keys: [...done.keys.values()], bigrams: [...done.pairs.values()],
          chars, best_run: done.bestClean || 0,
        },
      });
    } catch (e) { showError(e); }
    progress = await invoke('get_lessons_progress', { layout }).catch(() => progress);
    if (run !== done) return; // restarted or closed meanwhile
    showResult(done, saved, wpm, accuracy, { record: done.timed && wpm > bestBefore, bestBefore });
  }

  /** What comes after a finished exercise: the next lesson of its unit, or the next text of the path. */
  function nextOf(lesson) {
    if (lesson.unit === 'lib' && !lesson.daily) {
      const lib = library(layout);
      if (!lib) return null;
      const i = lesson.kind === 'pangrams' ? -1 : lib.texts.findIndex((x) => x.id === lesson.id);
      const x = lib.texts[i + 1];
      return x && L.pathUnlocked(lib.texts, bestOf)[i + 1] ? libLesson(x, i + 1, false) : null;
    }
    if (['sprint', 'fingers', 'practice'].includes(lesson.unit) || lesson.daily) return null;
    const list = catalogue(layout);
    const i = list.findIndex((l) => l.id === lesson.id);
    return i < 0 ? null : list[i + 1];
  }

  function showResult(done, saved, wpm, accuracy, sprint) {
    $('ls-run').hidden = true;
    $('ls-result').hidden = false;
    const lesson = done.lesson;
    const timed = done.timed;
    $('ls-res-stars').innerHTML = timed ? '' : starIcons(saved.stars);
    $('ls-res-stars').hidden = timed;
    if (timed) {
      $('ls-res-title').textContent = t(sprint.record ? 'lessons.sprint.record' : 'lessons.sprint.done');
      $('ls-res-line').textContent = t('lessons.sprint.line', { wpm: fmt(wpm), acc: fmt(accuracy * 100), xp: fmt(saved.xp) });
      $('ls-res-tip').textContent = sprint.record
        ? (sprint.bestBefore > 0 ? t('lessons.sprint.beaten', { wpm: fmt(sprint.bestBefore) }) : t('lessons.sprint.first'))
        : t('lessons.sprint.best', { wpm: fmt(sprint.bestBefore) });
    } else {
      $('ls-res-title').textContent = t(`lessons.result.${saved.stars}`);
      $('ls-res-line').textContent = t('lessons.result.line', { wpm: fmt(wpm), acc: fmt(accuracy * 100), xp: fmt(saved.xp) });
      $('ls-res-tip').textContent = saved.stars < 3 ? t(saved.stars < 2 ? 'lessons.tip.acc' : 'lessons.tip.pace', { target: fmt(done.target) }) : (saved.stars > saved.best_before ? t('lessons.tip.new_best') : '');
    }
    const next = nextOf(lesson);
    $('ls-next').hidden = !next;
    $('ls-next').onclick = () => next && start(next);
    // «Repetir» after a sprint is a new run of sentences; any other exercise gets a fresh text as before.
    $('ls-again').onclick = () => start(lesson);
    $('ls-back').onclick = () => renderMap();
    const big = timed ? sprint.record : saved.stars === 3;
    Mascot.jump($('mascot'), { big });
    if (big) setTimeout(() => Support.happyMoment(progress.lessons.length >= 5 ? 7 : 0), 1200);
    Mascot.setFace($('mascot'), { eyes: big ? 'sparkle' : 'round', mouth: 'big' });
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
    stopTick();
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
      // Ctrl+Enter restarts (Enter alone is typed in texts with line breaks; Esc already exits).
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); restart(); return; }
      if (e.key === 'Enter' && run && run.text[run.pos] === '\n') { e.preventDefault(); onChar('\n'); }
    });
    $('ls-text').addEventListener('click', () => input.focus());
    $('ls-restart').addEventListener('click', restart);
    const modes = $('ls-modes');
    modes.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) setMode(b.dataset.mode);
    });
    modes.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step || !run) return;
      e.preventDefault();
      setMode(MODES[(MODES.indexOf(run.mode) + step + MODES.length) % MODES.length]);
      modes.querySelector(`[data-mode="${run.mode}"]`)?.focus();
    });
    $('ls-hands').addEventListener('click', () => {
      if (typeof Keyboard.setHands !== 'function' || !run) return;
      Keyboard.setHands(!Keyboard.handsOn());
      renderTools();
      paint();
      input.focus();
    });
  }

  return { bind, open, close, refresh, practiceNow, layout: () => layout || defaultLayout(), catalogue, textFor, UNITS };
})();
