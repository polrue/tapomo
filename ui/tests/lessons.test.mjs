// Lessons logic tests (0.9). Run: node --test ui/tests/
// The UI scripts are plain browser scripts; they run here in a vm context with a fake `window`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A fresh context with the given ui/ scripts loaded (shared top-level scope, like a page). */
function page(scripts, extra = {}) {
  const store = new Map();
  const ctx = {
    console, performance, Date, Math,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    navigator: { language: 'es-ES' },
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of scripts) vm.runInContext(fs.readFileSync(path.join(UI, s), 'utf8'), ctx, { filename: s });
  return ctx;
}

// The pure helpers load as a CommonJS module (same file the page loads), so results compare as plain arrays.
const L = createRequire(import.meta.url)('../lesson-logic.js');

test('daily text: same index all day, next day moves on, cycles, local date', () => {
  assert.equal(L.dailyIndex(new Date(2026, 0, 1, 0, 1), 10), 0);
  assert.equal(L.dailyIndex(new Date(2026, 0, 1, 23, 59), 10), 0);
  assert.equal(L.dailyIndex(new Date(2026, 0, 2, 8), 10), 1);
  assert.equal(L.dailyIndex(new Date(2026, 0, 11), 10), 0, 'repeats after the cycle');
  assert.equal(L.dailyIndex(new Date(2026, 9, 21), 7), 293 % 7);
  // Across the DST change (29 March 2026 in Europe) the count stays whole days.
  assert.equal(L.dailyIndex(new Date(2026, 2, 30, 12), 1000), 88);
  assert.equal(L.dailyIndex(new Date(2025, 11, 31), 10), 9, 'dates before the epoch stay in range');
  assert.equal(L.dailyIndex(new Date(), 0), -1);
});

test('path: first text open, the next one with 2 stars, done texts stay open', () => {
  const texts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const stars = { a: 2, b: 1, d: 1 };
  assert.deepEqual(L.pathUnlocked(texts, (id) => stars[id] || 0), [true, true, false, true]);
  assert.deepEqual(L.pathUnlocked(texts, () => 0), [true, false, false, false]);
  assert.deepEqual(L.pathUnlocked(texts, () => 3), [true, true, true, true]);
});

test('levels: grouped in order, level reached', () => {
  const texts = [{ id: 'a', level: 1 }, { id: 'b', level: 2 }, { id: 'c', level: 1 }, { id: 'd', level: 3 }];
  assert.deepEqual(L.byLevel(texts).map(([lv, xs]) => [lv, xs.map((x) => x.id)]), [[1, ['a', 'c']], [2, ['b']], [3, ['d']]]);
  assert.equal(L.levelReached(texts, () => 0), 1);
  assert.equal(L.levelReached(texts, (id) => (id === 'b' ? 1 : 0)), 2);
});

test('plain text: typographic marks become typeable ones', () => {
  assert.equal(L.plainText('«Hola» — dijo… “sí”  ’ya’ fin'), '"Hola" - dijo... "sí" \'ya\' fin');
  assert.equal(L.plainText('„Gut“\nnext'), '"Gut" next');
  assert.deepEqual(L.sentences('Uno dos tres. ¿Y ahora qué? ¡Vamos ya! Fin.'), ['Uno dos tres.', '¿Y ahora qué?', '¡Vamos ya!']);
});

test('trimTo cuts at a space, never mid-word', () => {
  assert.equal(L.trimTo('hola mundo bonito', 12), 'hola mundo');
  assert.equal(L.trimTo('hola', 10), 'hola');
  assert.equal(L.trimTo('abcdefghij', 4), 'abcd');
});

test('finger words: scored by share of the finger letters', () => {
  assert.equal(L.fingerScore('aqa', ['a', 'q', 'z']), 1);
  assert.equal(L.fingerScore('casa', ['a', 'q', 'z']), 0.5);
  assert.equal(L.fingerScore('', ['a']), 0);
  const words = L.fingerWords(['casa', 'Casa', 'perro', 'zaza', 'mal', 'x1', 'a'], ['a', 'q', 'z'], 10);
  assert.deepEqual(words, ['zaza', 'casa', 'mal'], 'best first, no duplicates, no junk, no 1-letter words');
  assert.deepEqual(L.drillableKeys(['º', '1', 'q', 'a', '<', 'z', ',', '¡', "'", '-', 'ñ']), ['1', 'q', 'a', 'z', ',', "'", '-', 'ñ']);
});

test('pacer: 110 % of the recent pace, else the lesson target; position in characters', () => {
  assert.equal(L.pacerWpm(40, 20), 44);
  assert.equal(L.pacerWpm(null, 18), 18);
  assert.equal(L.pacerWpm(0, 2), 5);
  assert.equal(L.pacerPos(60_000, 30, 1000), 150);
  assert.equal(L.pacerPos(6_000, 30, 1000), 15);
  assert.equal(L.pacerPos(600_000, 30, 100), 100, 'never past the text');
  assert.equal(L.pacerPos(0, 30, 100), 0);
});

test('precision mode: a wrong key goes back to the start of the word', () => {
  const text = 'hola que tal';
  assert.equal(L.advance(text, 6, true, 'precision'), 7);
  assert.equal(L.advance(text, 7, false, 'precision'), 5);
  assert.equal(L.advance(text, 5, false, 'precision'), 5, 'first letter: stays');
  assert.equal(L.advance(text, 2, false, 'precision'), 0);
  assert.equal(L.advance(text, 7, false, 'normal'), 7, 'normal waits for the right key');
  assert.equal(L.advance(text, 7, false, 'pace'), 7);
  assert.equal(L.advance(text, 7, true, 'normal'), 8);
});

test('practice of the day: about 3 minutes, 150–900 characters', () => {
  assert.equal(L.practiceChars(40), 600);
  assert.equal(L.practiceChars(5), 150);
  assert.equal(L.practiceChars(100), 900);
  assert.equal(L.practiceChars(0), 300, 'no pace yet: 20 wpm');
});

test('net wpm: mistakes take speed off, never below zero', () => {
  assert.equal(L.netWpm(250, 0, 60_000), 50);
  assert.equal(L.netWpm(250, 25, 60_000), 45);
  assert.equal(L.netWpm(10, 50, 60_000), 0);
  assert.equal(L.netWpm(10, 0, 0), 0);
});

// ---------------------------------------------------------------- lessons.js with a stub library
const STUB = {
  pangrams: ['El veloz murciélago hindú comía feliz cardillo y kiwi.', 'Jovencillo emponzoñado de whisky: ¡qué figurota exhibe!'],
  texts: [
    { id: 'es-001', level: 1, title: 'Uno', text: 'La casa es azul. El gato «duerme» en la cama.' },
    { id: 'es-002', level: 2, title: 'Dos', text: 'Mañana iremos al mar. Quizá llueva un poco, pero da igual.', source: 'Anónimo' },
  ],
};
function lessonsPage(library) {
  return page(['lesson-words.js', 'lesson-texts.js', 'keyboard.js', 'lesson-logic.js', 'lessons.js'], library ? { LessonLibrary: { es: library } } : {});
}

test('lessons.js: library, pangram, sprint, finger and sized practice texts', () => {
  const ctx = lessonsPage(STUB);
  const { textFor } = vm.runInContext('Lessons', ctx);
  assert.equal(textFor({ kind: 'library', text: STUB.texts[0].text }, 'es', 1), 'La casa es azul. El gato "duerme" en la cama.');
  const pg = textFor({ kind: 'pangrams' }, 'es', 3);
  assert.ok(pg.length >= 100 && STUB.pangrams.some((p) => pg.includes(p)), pg);
  const pool = STUB.texts.flatMap((x) => L.sentences(x.text));
  const sprint = textFor({ kind: 'sprint', pool }, 'es', 5);
  assert.ok(sprint.length >= 400 && sprint.includes('.'), 'punctuation kept');
  assert.equal(textFor({ kind: 'sprint', pool }, 'es', 5), sprint, 'same seed, same text (restart keeps it)');
  const keys = L.drillableKeys(ctx.Keyboard.keysForFinger('es', 0));
  const finger = textFor({ kind: 'finger', keys }, 'es', 9);
  const letters = finger.replace(/[^\p{L}]/gu, '');
  const share = [...letters].filter((c) => keys.includes(c)).length / letters.length;
  assert.ok(share > 0.4, `left pinky letters dominate: ${share.toFixed(2)} in «${finger}»`);
  const practice = { kind: 'practice', newKeys: 'ñqz', bigrams: [], known: '', len: 600 };
  const p = textFor(practice, 'es', 11);
  assert.ok(p.length <= 600 && p.length > 520, `sized to ~600: ${p.length}`);
  assert.equal(textFor(practice, 'es', 11), p);
});

test('lessons.js loads without a library and keeps the old catalogue ids', () => {
  const ctx = lessonsPage(null);
  const { catalogue } = vm.runInContext('Lessons', ctx);
  const ids = [...catalogue('es').map((l) => l.id)];
  assert.ok(ids.includes('home-1a') && ids.includes('texts-6'));
  assert.equal(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------- the real library files (when present)
for (const [lang, layout] of [['es', 'es'], ['en', 'us'], ['fr', 'fr'], ['de', 'de']]) {
  const file = path.join(UI, 'library', `${lang}.js`);
  test(`library ${lang}: contract, unique ids, levels, every character typeable on ${layout}`, { skip: !fs.existsSync(file) && 'not written yet' }, () => {
    const ctx = page(['keyboard.js', `library/${lang}.js`]);
    const lib = ctx.LessonLibrary[lang];
    assert.ok(Array.isArray(lib.pangrams) && lib.pangrams.length > 0, 'pangrams');
    assert.ok(Array.isArray(lib.texts) && lib.texts.length > 0, 'texts');
    const ids = lib.texts.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'unique ids');
    let prev = 1;
    for (const x of lib.texts) {
      assert.match(x.id, new RegExp(`^${lang}-\\d{3}$`), x.id);
      assert.ok(Number.isInteger(x.level) && x.level >= 1 && x.level <= 5, `${x.id} level`);
      assert.ok(x.level >= prev, `${x.id}: ordered by level`);
      prev = x.level;
      assert.ok(typeof x.title === 'string' && x.title.trim(), `${x.id} title`);
      assert.ok(typeof x.text === 'string' && x.text.trim().length >= 20, `${x.id} text`);
    }
    const map = ctx.Keyboard.charMap(layout);
    const bad = new Map();
    for (const s of [...lib.pangrams, ...lib.texts.map((x) => x.text)]) {
      for (const c of L.plainText(s)) if (c !== ' ' && !map.has(c)) bad.set(c, (bad.get(c) || 0) + 1);
    }
    assert.equal(bad.size, 0, `characters the ${layout} keyboard cannot type: ${[...bad].map(([c, n]) => `${c}×${n}`).join(' ')}`);
  });
}
