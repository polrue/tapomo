// Tiny i18n. To add a language: drop locales/xx.json (with a "name" key) and add it to LANGUAGES.
// The tray menu is translated in Rust from the same JSON files (src-tauri/src/i18n.rs).
const LANGUAGES = ['es', 'en'];
const FALLBACK = 'en';

const dictionaries = {};
let current = FALLBACK;

async function loadAll() {
  await Promise.all(
    LANGUAGES.map(async (code) => {
      try {
        dictionaries[code] = await (await fetch(`locales/${code}.json`)).json();
      } catch (e) {
        console.error('locale failed to load', code, e);
        dictionaries[code] = {};
      }
    })
  );
}

/** Saved choice if valid, else the browser language (es-* -> es), else English. */
function resolveLanguage(saved) {
  if (saved && LANGUAGES.includes(saved)) return saved;
  const nav = (navigator.language || FALLBACK).toLowerCase();
  return LANGUAGES.find((c) => nav === c || nav.startsWith(c + '-')) || FALLBACK;
}

function t(key, vars) {
  let s = (dictionaries[current] && dictionaries[current][key]) ?? (dictionaries[FALLBACK] && dictionaries[FALLBACK][key]) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

/** Fills every [data-i18n] (text), [data-i18n-placeholder] and [data-i18n-title] in the document. */
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
}

function setLanguage(code) {
  current = code;
  document.documentElement.lang = code;
}
