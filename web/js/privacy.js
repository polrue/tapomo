// tapomo.app/privacy.html: shows the policy in one language at a time (es, en, ca, fr, de).
// Every language is already in the HTML (Spanish is visible without JS); this only picks which one to show.
(function () {
  'use strict';
  var LANGS = ['es', 'en', 'ca', 'fr', 'de'];
  var KEY = 'tapomo.lang';
  var chrome = window.PRIVACY_CHROME || {};
  var html = document.documentElement;

  function get() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { window.localStorage.setItem(KEY, v); } catch (e) { /* private mode: fine */ } }

  function pick() {
    var m = /[?&]lang=([a-z]{2})/.exec(location.search);
    if (m && LANGS.indexOf(m[1]) > -1) return m[1];
    var saved = get();
    if (saved && LANGS.indexOf(saved) > -1) return saved;
    var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'es'];
    for (var i = 0; i < prefs.length; i++) {
      var base = String(prefs[i]).toLowerCase().split('-')[0];
      if (LANGS.indexOf(base) > -1) return base;
    }
    return 'en';
  }

  function apply(lang) {
    html.lang = lang;
    var blocks = document.querySelectorAll('.policy-lang');
    for (var i = 0; i < blocks.length; i++) blocks[i].hidden = blocks[i].getAttribute('data-lang') !== lang;
    var btns = document.querySelectorAll('[data-set-lang]');
    for (var j = 0; j < btns.length; j++) btns[j].setAttribute('aria-pressed', btns[j].getAttribute('data-set-lang') === lang ? 'true' : 'false');
    var c = chrome[lang];
    if (!c) return;
    document.title = c.title;
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', c.desc);
    var texts = document.querySelectorAll('[data-c]');
    for (var k = 0; k < texts.length; k++) { var v = c[texts[k].getAttribute('data-c')]; if (typeof v === 'string') texts[k].textContent = v; }
    var attrs = document.querySelectorAll('[data-c-attr]');
    for (var a = 0; a < attrs.length; a++) {
      var pair = attrs[a].getAttribute('data-c-attr').split(':');
      if (typeof c[pair[1]] === 'string') attrs[a].setAttribute(pair[0], c[pair[1]]);
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-set-lang]') : null;
    if (!b) return;
    var lang = b.getAttribute('data-set-lang');
    set(lang);
    apply(lang);
  });

  apply(pick());
})();
