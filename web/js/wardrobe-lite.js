// A few accessories from Tapomo's wardrobe (ui/wardrobe.js, subtle style), drawn exactly as in the app.
// Wardrobe.wear(svg, id) adds one on top of a mounted mascot; it bounces and squishes with the body.
(() => {
  'use strict';
  const INK = '#23202b';
  const ART = {
    lacito: `<g transform="rotate(16 110 45)">
        <path d="M108 47 L101 58 L105.5 57 L107 61 L111 48 Z" fill="#ff7aa8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M112 47 L118 58 L114 57.5 L111.5 61 L109.5 48 Z" fill="#ff7aa8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M110 45 C103 34 93.5 35.5 94.5 44.5 C94 53 103 55 110 45 Z" fill="#ff8fb5" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M110 45 C117 34 126.5 35.5 125.5 44.5 C126 53 117 55 110 45 Z" fill="#ff8fb5" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M99 41 Q100.5 38.5 103.5 39" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>
        <rect x="106.3" y="41.3" width="7.4" height="7.4" rx="3" fill="#ff6f9c" stroke="${INK}" stroke-width="2"/>
      </g>`,
    gafas: `<g class="rw-glasses" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round">
        <circle cx="62" cy="84" r="13.5" fill="#ffffff" fill-opacity=".16"/><circle cx="98" cy="84" r="13.5" fill="#ffffff" fill-opacity=".16"/>
        <path d="M75.4 82.5 Q80 78.6 84.6 82.5"/>
        <path d="M48.6 81.5 L32 78.5"/><path d="M111.4 81.5 L128 78.5"/>
        <path d="M52.5 78.5 Q54.5 74.5 59 73.6" stroke="#fff" stroke-width="2" opacity=".8"/><path d="M88.5 78.5 Q90.5 74.5 95 73.6" stroke="#fff" stroke-width="2" opacity=".8"/>
      </g>`,
    bufanda: `<g stroke-linejoin="round">
        <path d="M104 125 L113 126.5 L118.5 151 L106.5 151.5 Z" fill="#5fbfae" stroke="${INK}" stroke-width="2.2"/>
        <path d="M107 136 L115.6 135.6 M108.4 143.6 L117 143.2" stroke="#c7f0e7" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M108 152 v4 M111 152 v4.4 M114 152 v4 M117 151.6 v4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M29 116 Q80 127.5 131 116 L132.2 128 Q80 140 27.8 128 Z" fill="#5fbfae" stroke="${INK}" stroke-width="2.4"/>
        <path d="M30.5 122.2 Q80 133.6 130.5 122.2" fill="none" stroke="#c7f0e7" stroke-width="2.2" stroke-linecap="round"/>
      </g>`,
    auris: `<g stroke-linejoin="round">
        <path d="M30 76 Q30 29 80 29 Q130 29 130 76" fill="none" stroke="${INK}" stroke-width="7.4" stroke-linecap="round"/>
        <path d="M30 76 Q30 29 80 29 Q130 29 130 76" fill="none" stroke="#b6a6ff" stroke-width="3.2" stroke-linecap="round"/>
        <rect x="19" y="68" width="17" height="29" rx="7.5" fill="#b6a6ff" stroke="${INK}" stroke-width="2.4"/>
        <rect x="124" y="68" width="17" height="29" rx="7.5" fill="#b6a6ff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M23.5 74 V82 M128.5 74 V82" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".75"/>
        <circle cx="27.5" cy="89" r="2.4" fill="#ff8fb5" stroke="${INK}" stroke-width="1.4"/><circle cx="132.5" cy="89" r="2.4" fill="#ff8fb5" stroke="${INK}" stroke-width="1.4"/>
      </g>`,
    gorrito: `<g stroke-linejoin="round">
        <path d="M38 52 Q38 16 80 16 Q122 16 122 52 Z" fill="#6c8cf5" stroke="${INK}" stroke-width="2.4"/>
        <path d="M61 22 Q56.5 36 56.5 49 M80 17.5 V49 M99 22 Q103.5 36 103.5 49" fill="none" stroke="#5170d8" stroke-width="2" stroke-linecap="round"/>
        <path d="M50 27 Q54 22 60 20.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>
        <rect x="33" y="46" width="94" height="13" rx="6.5" fill="#93acff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M43 49.5v6 M51 49.5v6 M59 49.5v6 M67 49.5v6 M75 49.5v6 M83 49.5v6 M91 49.5v6 M99 49.5v6 M107 49.5v6 M115 49.5v6" stroke="#6c8cf5" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="80" cy="13" r="8" fill="#fff4f0" stroke="${INK}" stroke-width="2.2"/>
        <path d="M76 9.5 Q78 8 80.5 8.3" fill="none" stroke="#ffd2c2" stroke-width="1.8" stroke-linecap="round"/>
      </g>`,
    pajarita: `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
        <path d="M80 126.5 L66.5 119 Q63 126.5 66.5 134 Z" fill="#ef5b66"/>
        <path d="M80 126.5 L93.5 119 Q97 126.5 93.5 134 Z" fill="#ef5b66"/>
        <path d="M68.5 123 Q67.5 126.5 68.5 130" fill="none" stroke="#ffb0b6" stroke-width="1.6" stroke-linecap="round"/>
        <rect x="76.2" y="122.7" width="7.6" height="7.6" rx="2.6" fill="#ff7d86"/>
      </g>`,
  };
  const NS = 'http://www.w3.org/2000/svg';
  function wear(svg, id) {
    const body = svg && svg.querySelector('.mascot-body');
    if (!body || !ART[id]) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'rw-layer rw-' + id);
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = ART[id];
    body.append(g);
    return g;
  }
  window.Wardrobe = { wear, ids: Object.keys(ART) };
})();
