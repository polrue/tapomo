// Pure helpers for the lessons screen (0.9): no DOM, no Tauri, so node can test them
// (ui/tests/lessons.test.mjs). lessons.js uses them through `LessonLogic`.
const LessonLogic = (() => {
  const DAY_MS = 86_400_000;
  /** Day 0 of «Texto del día». */
  const EPOCH = Date.UTC(2026, 0, 1);

  /** Library language of a lesson keyboard layout (the same mapping as lesson-texts.js). */
  function libLang(layout) {
    return { es: 'es', us: 'en', fr: 'fr', de: 'de' }[layout] || 'en';
  }

  /** «Texto del día»: the same index for everyone on the same local date, cycling through `n` texts. */
  function dailyIndex(date, n) {
    if (!n) return -1;
    const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH) / DAY_MS);
    return ((days % n) + n) % n;
  }

  /** Path of texts: the first is open; text n+1 opens with 2★ on text n. One already done stays open. */
  function pathUnlocked(texts, bestOf) {
    return texts.map((x, i) => i === 0 || bestOf(texts[i - 1].id) >= 2 || bestOf(x.id) > 0);
  }

  /** `[[level, [texts…]], …]` in level order, keeping the library order inside each level. */
  function byLevel(texts) {
    const map = new Map();
    for (const x of texts) {
      if (!map.has(x.level)) map.set(x.level, []);
      map.get(x.level).push(x);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }

  /** Highest level with a text done at least once (1 when none). */
  function levelReached(texts, bestOf) {
    return texts.reduce((m, x) => (bestOf(x.id) > 0 ? Math.max(m, x.level) : m), 1);
  }

  /** Typographic characters the lesson keyboards cannot type, as their plain equivalents. */
  function plainText(s) {
    return String(s)
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟«»″]/g, '"')
      .replace(/[‹›]/g, "'")
      .replace(/[—–‒―]/g, '-')
      .replace(/…/g, '...')
      .replace(/[\s  ]+/g, ' ')
      .trim();
  }

  /** Sentences of a text, punctuation kept. */
  function sentences(text) {
    return plainText(text).split(/(?<=[.!?;:])\s+/).filter((s) => s.length >= 8);
  }

  /** Cuts `text` to at most `len` characters at a space (never mid-word); short texts stay whole. */
  function trimTo(text, len) {
    if (text.length <= len) return text;
    const cut = text.lastIndexOf(' ', len);
    return (cut > 0 ? text.slice(0, cut) : text.slice(0, len)).trim();
  }

  /** Share (0–1) of a word's characters typed by the finger whose keys are `keys`. */
  function fingerScore(word, keys) {
    const chars = [...word.toLowerCase()];
    if (!chars.length) return 0;
    const set = new Set(keys.map((k) => k.toLowerCase()));
    return chars.filter((c) => set.has(c)).length / chars.length;
  }

  /** Words dense in the finger's keys, best first: at least `min` share, at most `n` words. */
  function fingerWords(words, keys, n = 40, min = 0.3) {
    const seen = new Set();
    const scored = [];
    for (const w of words) {
      const lw = w.toLowerCase();
      if (lw.length < 2 || seen.has(lw) || !/^\p{L}+$/u.test(lw)) continue;
      seen.add(lw);
      const s = fingerScore(lw, keys);
      if (s >= min) scored.push([lw, s]);
    }
    scored.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    return scored.slice(0, n).map((x) => x[0]);
  }

  /** Keys of a finger worth drilling: letters, digits and common punctuation (no rare symbols). */
  function drillableKeys(keys) {
    return keys.filter((k) => /^[\p{L}\d,.;:'-]$/u.test(k) && !'ºª'.includes(k));
  }

  /** «Ritmo»: target pace = 110 % of the recent lesson speed, or the lesson target with no history. */
  function pacerWpm(recentWpm, targetWpm) {
    return recentWpm > 0 ? Math.max(5, Math.round(recentWpm * 1.1)) : Math.max(5, Math.round(targetWpm || 0));
  }

  /** Character index the pacer has reached after `ms` at `wpm` (5 characters a word), within the text. */
  function pacerPos(ms, wpm, len) {
    if (!(ms > 0) || !(wpm > 0)) return 0;
    return Math.min(len, Math.floor((ms / 60_000) * wpm * 5));
  }

  /** Start of the word the cursor is in (after the previous space). */
  function wordStart(text, pos) {
    let i = Math.min(pos, text.length);
    while (i > 0 && text[i - 1] !== ' ') i--;
    return i;
  }

  /** Where the cursor goes after a key. Normal: right key moves on, wrong key waits. «Precisión»: a
   * wrong key sends you back to the start of the word, which you type again. */
  function advance(text, pos, ok, mode) {
    if (ok) return pos + 1;
    return mode === 'precision' ? wordStart(text, pos) : pos;
  }

  /** «Tu práctica del día»: about 3 minutes at `wpm` (5 characters a word), 150–900 characters. */
  function practiceChars(wpm) {
    const w = wpm > 0 ? wpm : 20;
    return Math.max(150, Math.min(900, Math.round(w * 5 * 3)));
  }

  /** Net speed: correct characters minus the mistakes, per minute (5 characters a word), never below 0. */
  function netWpm(chars, errors, ms) {
    if (!(ms > 0)) return 0;
    return Math.max(0, (chars - errors) / 5 / (ms / 60_000));
  }

  return { libLang, dailyIndex, pathUnlocked, byLevel, levelReached, plainText, sentences, trimTo, fingerScore, fingerWords, drillableKeys, pacerWpm, pacerPos, wordStart, advance, practiceChars, netWpm };
})();

if (typeof window !== 'undefined') window.LessonLogic = LessonLogic;
if (typeof module !== 'undefined') module.exports = LessonLogic;
