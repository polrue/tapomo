// Wardrobe: what Tapomo wears. Ported from the animation lab (lab/rewards.js) without any lab UI.
// It wraps Mascot.mount, so every Tapomo mounted afterwards gets the reward layers, all inside
// .mascot-body: they inherit hop, bob, lift, breath, shake and squish, so they bounce, squash and
// rotate with the body. Rule: accessories sit ON Tapomo; skins only change the colour/texture of the
// mochi, never its shape or face. Styles live in wardrobe.css. Load after mascot.js.
//
// API: Wardrobe.ITEMS, REWARD_LEVELS, itemsAt, unlocked, nextReward, clashes, wear, set, get,
//      decorate, preview, setSupporter. Display names are NOT here: the app uses the i18n keys `item.<id>`.
(() => {
  'use strict';
  if (window.Wardrobe) return;
  const INK = '#23202b';
  const NS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------------------ drawings (as in the lab)
  const fourStar = (x, y, s, fill = '#ffcc4d', sw = 1.3) =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -4 L1.2 -1.2 L4 0 L1.2 1.2 L0 4 L-1.2 1.2 L-4 0 L-1.2 -1.2Z" fill="${fill}" stroke="${INK}" stroke-width="${sw / s}" stroke-linejoin="round"/>`;
  const flower = (x, y, petal) => {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      s += `<circle cx="${(x + Math.cos(a) * 3.7).toFixed(2)}" cy="${(y + Math.sin(a) * 3.7).toFixed(2)}" r="3.3" fill="${petal}" stroke="${INK}" stroke-width="1.4"/>`;
    }
    return s + `<circle cx="${x}" cy="${y}" r="2.4" fill="#ffcc4d" stroke="${INK}" stroke-width="1.3"/>`;
  };
  const leaf = (x, y, rot) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="2.2" transform="rotate(${rot} ${x} ${y})" fill="#7cc47f" stroke="${INK}" stroke-width="1.3"/>`;

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
    capa: `<g stroke-linejoin="round">
        <path d="M44 64 C27 90 19 122 15 146 Q47 153 80 151 Q113 153 145 146 C141 122 133 90 116 64 Z" fill="#e0565b" stroke="${INK}" stroke-width="2.4"/>
        <path d="M17.5 139.5 Q48 146.5 80 144.5 Q112 146.5 142.5 139.5" fill="none" stroke="#ffcc4d" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M30 98 Q24 118 22 136" fill="none" stroke="#b9414a" stroke-width="2" stroke-linecap="round"/>
        <path d="M130 98 Q136 118 138 136" fill="none" stroke="#b9414a" stroke-width="2" stroke-linecap="round"/>
      </g>`,
    capaFront: `<g><circle cx="32.5" cy="68" r="3.4" fill="#ffcc4d" stroke="${INK}" stroke-width="1.6"/><circle cx="127.5" cy="68" r="3.4" fill="#ffcc4d" stroke="${INK}" stroke-width="1.6"/></g>`,
    chef: `<g stroke-linejoin="round">
        <path d="M53 36 C40 34 37 15 51 12.5 C53 0 70 -3 77 5 C83 -3 101 -1 103 10 C119 10 122 31 107 36 Z" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M66 34 Q63.5 23 67.5 14 M94 34 Q96.5 23 92.5 14" fill="none" stroke="#d9d3e3" stroke-width="2" stroke-linecap="round"/>
        <rect x="50" y="33" width="60" height="13" rx="4" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M56 39.5 H104" stroke="#e9e4f0" stroke-width="2" stroke-linecap="round"/>
      </g>`,
    flores: `<g>
        <path d="M37 56 Q46 41 60 41 Q80 36 100 41 Q114 41 123 56" fill="none" stroke="#5fae6a" stroke-width="2.6" stroke-linecap="round"/>
        ${leaf(50, 44.5, -40)}${leaf(69, 37.5, -12)}${leaf(91, 37.5, 12)}${leaf(110, 44.5, 40)}
        ${flower(42, 49, '#ff9cc0')}${flower(59, 40.5, '#ffffff')}${flower(80, 38, '#c6b5ff')}${flower(101, 40.5, '#ffffff')}${flower(118, 49, '#ff9cc0')}
      </g>`,
    aureola: `<g class="rw-halo-move"><g class="rw-halo">
        <ellipse cx="80" cy="12" rx="31" ry="7.2" fill="none" stroke="#fff2b0" stroke-width="6" opacity=".55"/>
        <ellipse cx="80" cy="12" rx="31" ry="7.2" fill="none" stroke="#ffcc4d" stroke-width="2.6"/>
        <g class="tw" style="--dl:0s">${fourStar(49.5, 11, 1.25)}</g>
        <g class="tw" style="--dl:.5s">${fourStar(64, 18.4, 1)}</g>
        <g class="tw" style="--dl:1s">${fourStar(80, 19.4, 1.35)}</g>
        <g class="tw" style="--dl:1.5s">${fourStar(96, 18.4, 1)}</g>
        <g class="tw" style="--dl:.8s">${fourStar(110.5, 11, 1.25)}</g>
        <g class="tw" style="--dl:1.2s">${fourStar(80, 4.8, .85)}</g>
      </g></g>`,
  };

  // Skin textures: only inside the body outline (clip), never on the face area.
  const dots = (pts, fn) => pts.map(fn).join('');
  /** A tiny five-petal cherry blossom (each petal with its little notch) for the mecenas skin. */
  const sakura = (x, y, rot) => {
    let s = `<g transform="translate(${x} ${y}) rotate(${rot})">`;
    for (let i = 0; i < 5; i++) s += `<path transform="rotate(${i * 72})" d="M0 0 C-2.2 -1 -2.3 -3.6 -0.9 -4.3 L0 -3.6 L0.9 -4.3 C2.3 -3.6 2.2 -1 0 0 Z" fill="#ff9dbb" stroke="#e46d93" stroke-width=".5" stroke-linejoin="round"/>`;
    return s + `<circle r="1" fill="#fff3b0"/></g>`;
  };
  const EDGE = [[42, 56], [57, 47.5], [103, 47.5], [118, 57], [37, 77], [123, 79], [39, 103], [121, 105], [50, 127], [110, 127], [80, 46.5], [66, 131], [94, 131], [36, 92], [124, 93]];
  const TEX = {
    clasico: '',
    fresa: dots(EDGE, ([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="1.25" ry="1.9" transform="rotate(${(i * 37) % 50 - 25} ${x} ${y})" fill="#fff1a8" stroke="#e86a8a" stroke-width=".6"/>`),
    matcha: dots(EDGE, ([x, y], i) => `<circle cx="${x + (i % 3) - 1}" cy="${y}" r="${i % 2 ? 1.1 : 1.6}" fill="#86b061" opacity=".7"/>`)
      + `<rect x="30" y="112" width="100" height="26" fill="#8ab866" opacity=".22"/>`,
    mango: `<rect x="30" y="40" width="100" height="98" fill="url(#rw-mango-ID)"/>`,
    arandano: dots(EDGE, ([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 1.2 : 1.8}" fill="#ffffff" opacity=".38"/>`)
      + `<rect x="30" y="40" width="100" height="98" fill="url(#rw-bloom-ID)"/>`,
    sesamo: dots(EDGE.concat([[48, 64], [112, 65], [45, 118], [115, 118], [72, 44], [88, 44]]), ([x, y], i) =>
      i % 4 === 3
        ? `<ellipse cx="${x}" cy="${y}" rx=".9" ry="1.6" transform="rotate(${(i * 53) % 80 - 40} ${x} ${y})" fill="#d8d1de" opacity=".8"/>`
        : `<ellipse cx="${x}" cy="${y}" rx="1" ry="1.8" transform="rotate(${(i * 41) % 80 - 40} ${x} ${y})" fill="#2a2630"/>`),
    // Sakura mochi (supporter skin): a soft pink blush at the bottom, a few tiny cherry blossoms and loose petals.
    mecenas: `<rect x="30" y="40" width="100" height="98" fill="url(#rw-sakura-ID)"/>`
      + [[57, 48.5, 0], [117, 59, 30], [40, 104, 50], [109, 127, 15]].map(([x, y, r]) => sakura(x, y, r)).join('')
      + [[103, 48, 40], [38, 72, -30], [123, 85, 70], [52, 127, -60], [122, 108, 10], [81, 46.5, 95]].map(([x, y, r]) =>
        `<path transform="translate(${x} ${y}) rotate(${r})" d="M0 -2.6 C1.9 -1.6 1.9 1.4 0 2.6 C-1.9 1.4 -1.9 -1.6 0 -2.6 Z" fill="#ffb3c9" stroke="#e9789c" stroke-width=".5"/>`).join(''),
    dorado: `<rect x="30" y="40" width="100" height="98" rx="30" fill="none" stroke="#b8741a" stroke-width="7" opacity=".42"/>
      <ellipse cx="72" cy="50" rx="30" ry="6.5" fill="#fffbe0" opacity=".5"/><ellipse cx="62" cy="49" rx="10" ry="3" fill="#ffffff" opacity=".65"/>
      <g class="rw-glint" opacity="0"><path d="M24 40 L44 40 L4 138 L-16 138 Z" fill="#ffffff" opacity=".55"/><path d="M50 40 L56 40 L16 138 L10 138 Z" fill="#ffffff" opacity=".4"/></g>
      <g class="rw-ting" opacity="0"><path d="M0 -9 L1.8 -1.8 L9 0 L1.8 1.8 L0 9 L-1.8 1.8 L-9 0 L-1.8 -1.8 Z" fill="#ffffff"/><circle r="2.2" fill="#ffffff"/></g>`,
  };
  // ------------------------------------------------------------------ bold style ("llamativo")
  // Same ink and stroke weights, bigger shapes and saturated fills, readable at the 76 px header size.
  const bigFlower = (x, y, petal, r = 4.4, d = 4.8) => {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      s += `<circle cx="${(x + Math.cos(a) * d).toFixed(2)}" cy="${(y + Math.sin(a) * d).toFixed(2)}" r="${r}" fill="${petal}" stroke="${INK}" stroke-width="1.8"/>`;
    }
    return s + `<circle cx="${x}" cy="${y}" r="${(r * 0.72).toFixed(2)}" fill="#ffd23f" stroke="${INK}" stroke-width="1.6"/><circle cx="${x - 1}" cy="${y - 1}" r="1" fill="#fff" opacity=".9"/>`;
  };
  const bigLeaf = (x, y, rot) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M-7 0 Q0 -5.5 7 0 Q0 5.5 -7 0 Z" fill="#4fbf5f" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/><path transform="translate(${x} ${y}) rotate(${rot})" d="M-4.5 0 H4.5" stroke="#9be6a4" stroke-width="1.2" stroke-linecap="round"/>`;
  const ART_BOLD = {
    lacito: `<g transform="rotate(14 106 40)" stroke-linejoin="round">
        <path d="M103.5 43 L94 61 L100.8 59.6 L103 65.5 L109.5 45 Z" fill="#e8336f" stroke="${INK}" stroke-width="2.4"/>
        <path d="M108.5 43 L118 61 L111.2 60 L108.6 65.5 L103.5 45 Z" fill="#e8336f" stroke="${INK}" stroke-width="2.4"/>
        <path d="M106 40 C96 23 80.5 25.5 82 40 C81.5 54.5 96 56.5 106 40 Z" fill="#ff4f8f" stroke="${INK}" stroke-width="2.4"/>
        <path d="M106 40 C116 23 131.5 25.5 130 40 C130.5 54.5 116 56.5 106 40 Z" fill="#ff4f8f" stroke="${INK}" stroke-width="2.4"/>
        <path d="M95 40 Q99 39 103 40 M117 40 Q113 39 109 40" fill="none" stroke="#c42563" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="89" cy="35" r="1.9" fill="#fff"/><circle cx="91.5" cy="46" r="1.6" fill="#fff"/><circle cx="123" cy="35" r="1.9" fill="#fff"/><circle cx="120.5" cy="46" r="1.6" fill="#fff"/>
        <path d="M86.5 31.5 Q89 28.5 93 28.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>
        <rect x="100.5" y="34.5" width="11" height="11" rx="4" fill="#ff7aaa" stroke="${INK}" stroke-width="2.4"/>
      </g>`,
    gafas: `<g class="rw-glasses" fill="none" stroke-linecap="round">
        <circle cx="62" cy="84" r="15" fill="#ffffff" fill-opacity=".18" stroke="${INK}" stroke-width="5.6"/><circle cx="98" cy="84" r="15" fill="#ffffff" fill-opacity=".18" stroke="${INK}" stroke-width="5.6"/>
        <circle cx="62" cy="84" r="15" stroke="#2f8fe8" stroke-width="2.4"/><circle cx="98" cy="84" r="15" stroke="#2f8fe8" stroke-width="2.4"/>
        <path d="M77 82 Q80 78 83 82" stroke="${INK}" stroke-width="5"/><path d="M77 82 Q80 78 83 82" stroke="#2f8fe8" stroke-width="2"/>
        <path d="M47 81 L31 77.5" stroke="${INK}" stroke-width="3.4"/><path d="M113 81 L129 77.5" stroke="${INK}" stroke-width="3.4"/>
        <path d="M51.5 76.5 Q54 72 59.5 71" stroke="#fff" stroke-width="2.2" opacity=".85"/><path d="M87.5 76.5 Q90 72 95.5 71" stroke="#fff" stroke-width="2.2" opacity=".85"/>
      </g>`,
    bufanda: `<g stroke-linejoin="round">
        <path d="M112 124 L123 121 L133 151 L120 155 Z" fill="#14b39a" stroke="${INK}" stroke-width="2.4"/>
        <path d="M116.5 133.5 L126 131 M119.5 143 L129.5 140.4" stroke="#fff3d6" stroke-width="3" stroke-linecap="round"/>
        <path d="M121 156 v5 M124.5 155 v5 M128 154 v5 M131.5 152.8 v5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M98 125 L111 126 L115 158 L100 158.5 Z" fill="#19c4a8" stroke="${INK}" stroke-width="2.4"/>
        <path d="M100.5 136 L112.5 136 M101.4 146 L113.8 146" stroke="#fff3d6" stroke-width="3" stroke-linecap="round"/>
        <path d="M101.5 159 v5 M105.5 159 v5.4 M109.5 159 v5.4 M113.5 159 v5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M26 110 Q80 124 134 110 L135.6 127 Q80 143 24.4 127 Z" fill="#19c4a8" stroke="${INK}" stroke-width="2.4"/>
        <path d="M26.8 116 Q80 130 134.8 116" fill="none" stroke="#fff3d6" stroke-width="3" stroke-linecap="round"/>
        <path d="M25.6 121.6 Q80 136 135.2 121.6" fill="none" stroke="#fff3d6" stroke-width="3" stroke-linecap="round"/>
        <path d="M44 117 v8 M60 120 v8 M100 120 v8 M116 117 v8" stroke="#0f9a84" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
      </g>`,
    auris: `<g stroke-linejoin="round">
        <path d="M27 74 Q27 22 80 22 Q133 22 133 74" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
        <path d="M27 74 Q27 22 80 22 Q133 22 133 74" fill="none" stroke="#8b6cff" stroke-width="6.2" stroke-linecap="round"/>
        <path d="M44 34 Q58 26 72 25" fill="none" stroke="#c9bcff" stroke-width="2" stroke-linecap="round"/>
        <rect x="30" y="66" width="10" height="34" rx="5" fill="#ffc2d6" stroke="${INK}" stroke-width="2.2"/>
        <rect x="120" y="66" width="10" height="34" rx="5" fill="#ffc2d6" stroke="${INK}" stroke-width="2.2"/>
        <rect x="12" y="61" width="24" height="44" rx="11" fill="#8b6cff" stroke="${INK}" stroke-width="2.6"/>
        <rect x="124" y="61" width="24" height="44" rx="11" fill="#8b6cff" stroke="${INK}" stroke-width="2.6"/>
        <path d="M17.5 69 V81 M129.5 69 V81" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
        <circle cx="24" cy="92" r="3.6" fill="#ffd23f" stroke="${INK}" stroke-width="1.6"/><circle cx="136" cy="92" r="3.6" fill="#ffd23f" stroke="${INK}" stroke-width="1.6"/>
      </g>`,
    gorrito: `<g stroke-linejoin="round">
        <path d="M35 53 Q35 6 80 6 Q125 6 125 53 Z" fill="#3f6fff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M37.5 33 Q80 22 122.5 33 L123.8 41.5 Q80 30.5 36.2 41.5 Z" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>
        <path d="M58 12 Q53 30 53 50 M80 7 V50 M102 12 Q107 30 107 50" fill="none" stroke="#2c55d6" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>
        <path d="M47 21 Q52 14 60 11.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
        <rect x="30" y="45" width="100" height="15.5" rx="7.75" fill="#ff5d6c" stroke="${INK}" stroke-width="2.4"/>
        <path d="M40 49 v7.5 M48 49 v7.5 M56 49 v7.5 M64 49 v7.5 M72 49 v7.5 M80 49 v7.5 M88 49 v7.5 M96 49 v7.5 M104 49 v7.5 M112 49 v7.5 M120 49 v7.5" stroke="#d63c4c" stroke-width="2" stroke-linecap="round"/>
        <path d="M80 -15 a4.5 4.5 0 0 1 7 2.5 a4.5 4.5 0 0 1 4.2 6.5 a4.5 4.5 0 0 1 -1.5 7.5 a4.5 4.5 0 0 1 -6 4.5 a4.5 4.5 0 0 1 -7.4 0 a4.5 4.5 0 0 1 -6 -4.5 a4.5 4.5 0 0 1 -1.5 -7.5 a4.5 4.5 0 0 1 4.2 -6.5 a4.5 4.5 0 0 1 7 -2.5 Z" fill="#fff6f2" stroke="${INK}" stroke-width="2.2"/>
        <path d="M75 -7 Q77 -10 81 -10.5" fill="none" stroke="#ffcfc0" stroke-width="2" stroke-linecap="round"/>
      </g>`,
    pajarita: `<g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round">
        <path d="M80 126 L60 115 Q54.5 126 60 137 Z" fill="#ff3d58"/>
        <path d="M80 126 L100 115 Q105.5 126 100 137 Z" fill="#ff3d58"/>
        <g stroke="none" fill="#fff"><circle cx="64" cy="121.5" r="1.8"/><circle cx="66" cy="131" r="1.6"/><circle cx="71" cy="126" r="1.4"/><circle cx="96" cy="121.5" r="1.8"/><circle cx="94" cy="131" r="1.6"/><circle cx="89" cy="126" r="1.4"/></g>
        <rect x="74" y="120" width="12" height="12" rx="4" fill="#ff6b80"/>
      </g>`,
    capa: `<g stroke-linejoin="round">
        <path d="M38 66 Q22 58 22 48 Q36 50 48 55 Z" fill="#d6304a" stroke="${INK}" stroke-width="2.4"/>
        <path d="M122 66 Q138 58 138 48 Q124 50 112 55 Z" fill="#d6304a" stroke="${INK}" stroke-width="2.4"/>
        <path d="M40 58 C18 86 6 120 1 152 Q24 147 40 156 Q60 150 80 156 Q100 150 120 156 Q136 147 159 152 C154 120 142 86 120 58 Z" fill="#e8405a" stroke="${INK}" stroke-width="2.4"/>
        <path d="M5 146 Q24 141 40 150 Q60 144 80 150 Q100 144 120 150 Q136 141 155 146" fill="none" stroke="#ffcc4d" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M26 92 Q15 118 10 140 M134 92 Q145 118 150 140 M36 104 Q30 124 28 146 M124 104 Q130 124 132 146" fill="none" stroke="#b42a40" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M25 51 Q35 52 44 56" fill="none" stroke="#ffcc4d" stroke-width="2" stroke-linecap="round"/><path d="M135 51 Q125 52 116 56" fill="none" stroke="#ffcc4d" stroke-width="2" stroke-linecap="round"/>
      </g>`,
    capaFront: `<g><circle cx="32" cy="66" r="5" fill="#ffcc4d" stroke="${INK}" stroke-width="2"/><circle cx="128" cy="66" r="5" fill="#ffcc4d" stroke="${INK}" stroke-width="2"/><circle cx="30.5" cy="64.5" r="1.4" fill="#fff"/><circle cx="126.5" cy="64.5" r="1.4" fill="#fff"/></g>`,
    chef: `<g stroke-linejoin="round">
        <path d="M51 38 C32 36 28 10 46 6 C42 -14 64 -24 77 -12 C85 -26 110 -20 108 -3 C128 -3 132 28 109 38 Z" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M64 36 Q58 18 63 0 M80 36 Q79 16 81 -6 M96 36 Q102 18 98 2" fill="none" stroke="#d9d3e3" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M45 10 Q47 3 54 0" fill="none" stroke="#eef2ff" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="46" y="33" width="68" height="16" rx="5" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>
        <path d="M51 41 H109" stroke="#4f86ff" stroke-width="3" stroke-linecap="round"/>
      </g>`,
    flores: `<g>
        <path d="M33 58 Q42 38 60 38 Q80 32 100 38 Q118 38 127 58" fill="none" stroke="#3f9e4f" stroke-width="3.2" stroke-linecap="round"/>
        ${bigLeaf(49, 41, -38)}${bigLeaf(69.5, 33.5, -10)}${bigLeaf(90.5, 33.5, 10)}${bigLeaf(111, 41, 38)}${bigLeaf(34, 56, -70)}${bigLeaf(126, 56, 70)}
        ${bigFlower(40, 49, '#ff5c9a')}${bigFlower(59, 38.5, '#ffffff')}${bigFlower(80, 34, '#9b7bff', 4.9, 5.3)}${bigFlower(101, 38.5, '#ffffff')}${bigFlower(120, 49, '#ff8a3c')}
      </g>`,
    aureola: `<g class="rw-halo-move"><g class="rw-halo">
        <ellipse cx="80" cy="8" rx="38" ry="9" fill="none" stroke="#fff2b0" stroke-width="9" opacity=".6"/>
        <ellipse cx="80" cy="8" rx="38" ry="9" fill="none" stroke="${INK}" stroke-width="5.4"/>
        <ellipse cx="80" cy="8" rx="38" ry="9" fill="none" stroke="#ffcc4d" stroke-width="2.8"/>
        <g class="tw" style="--dl:0s">${fourStar(42.5, 7, 1.8, '#ffcc4d', 1.6)}</g>
        <g class="tw" style="--dl:.5s">${fourStar(60, 15.8, 1.45, '#ffcc4d', 1.6)}</g>
        <g class="tw" style="--dl:1s">${fourStar(80, 17.2, 1.9, '#ffcc4d', 1.6)}</g>
        <g class="tw" style="--dl:1.5s">${fourStar(100, 15.8, 1.45, '#ffcc4d', 1.6)}</g>
        <g class="tw" style="--dl:.8s">${fourStar(117.5, 7, 1.8, '#ffcc4d', 1.6)}</g>
        <g class="tw" style="--dl:1.2s">${fourStar(80, -1, 1.2, '#ffcc4d', 1.6)}</g>
      </g></g>`,
  };

  // Strawberry costume (fresa, bold): seeds in a loose jittered grid, kept off the face oval.
  const strawSeeds = (() => {
    let s = '';
    let i = 0;
    for (let row = 0, y = 46; y <= 134; y += 8.5, row++) {
      for (let x = 34 + (row % 2) * 5; x <= 126; x += 10) {
        i++;
        const jx = x + ((i * 7) % 5) - 2;
        const jy = y + ((i * 11) % 5) - 2;
        const cx = Math.min(100, Math.max(60, jx));
        const cy = Math.min(108, Math.max(70, jy));
        if (Math.hypot(jx - cx, jy - cy) > 25) continue; // outside the body (inset)
        if (((jx - 80) / 41) ** 2 + ((jy - 92) / 31) ** 2 < 1) continue; // face area
        s += `<path transform="translate(${jx} ${jy}) rotate(${(i * 29) % 60 - 30})" d="M0 -2.6 C1.6 -0.7 1.6 1.8 0 2.1 C-1.6 1.8 -1.6 -0.7 0 -2.6 Z" fill="#fff1b8" stroke="#b8263e" stroke-width=".7"/>`;
      }
    }
    return s;
  })();
  const FRESA_BOLD_TEX = `<ellipse cx="80" cy="92" rx="42" ry="32" fill="url(#rw-face-ID)"/>${strawSeeds}`;
  const CALYX = `<g class="rw-calyx" stroke-linejoin="round">
      <path d="M80 37 Q80 28 85 21" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <path d="M80 37 Q80 28 85 21" fill="none" stroke="#5cae4e" stroke-width="2.6" stroke-linecap="round"/>
      <g fill="#5cc45a" stroke="${INK}" stroke-width="2.2">
        <path d="M80 39 Q62 32 44 46 Q62 48 80 43 Z"/>
        <path d="M80 39 Q98 32 116 46 Q98 48 80 43 Z"/>
        <path d="M80 40 Q66 43 59 56 Q72 52 80 44 Z"/>
        <path d="M80 40 Q94 43 101 56 Q88 52 80 44 Z"/>
        <path d="M80 40 Q76 47 80 55 Q84 47 80 40 Z"/>
      </g>
      <path d="M52 44.5 Q64 41 76 41.5 M108 44.5 Q96 41 84 41.5 M64 51 Q71 46 77 43.5 M96 51 Q89 46 83 43.5" fill="none" stroke="#a4e59c" stroke-width="1.3" stroke-linecap="round"/>
      <ellipse cx="80" cy="40.5" rx="4.4" ry="3" fill="#5cc45a" stroke="${INK}" stroke-width="2"/>
    </g>`;
  // Arms live in the BACK layer, so the body itself hides the shoulder joint and they grow out of
  // its sides. Left arm in local coords; the right one is the same group mirrored. Two poses: relaxed
  // (hanging, slightly bent) and flexing (double biceps); CSS moves between them.
  const arm = (fist = '') => `
      <g class="rw-arm-u">
        <g class="rw-arm-f">
          <path d="M5.5 99 C5 90 6 84 8 79 L17.5 79 C19 84 20 90 20.5 99 Z" fill="__BODY__" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M8.5 92 Q9 86 10.5 82" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>
          <path d="M4.5 70 Q4.5 61.5 12.8 61.5 Q21 61.5 21.2 69.5 Q21.4 78 12.8 78 Q4.5 78 4.5 70 Z" fill="__BODY__" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M8 66.5 Q10 65 12 66.5 M12.2 66.3 Q14.2 64.8 16.2 66.3" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/>
          <path d="M16.5 73.5 Q20 72.5 19.8 76" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>${fist}
        </g>
        <g class="rw-bicep">
          <path d="M42 89 C35 87 31 82 24.5 80.5 C17 79 8.5 82.5 5.5 90 C3 96.5 5 103.5 11.5 105 C18.5 106.5 30 106.5 42 106.5 Z" fill="__BODY__" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M12.5 86.5 Q17.5 82.5 24 83.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
          <path d="M27.5 97.5 Q21 100.5 14.5 97" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>
        </g>
      </g>`;
  const dumbbell = `<g><rect x="-3" y="68" width="31" height="4" rx="2" fill="#8a8fa0" stroke="${INK}" stroke-width="1.8"/>
      <rect x="-7.5" y="60.5" width="7" height="19" rx="2.5" fill="#4b4f60" stroke="${INK}" stroke-width="2"/><rect x="25" y="60.5" width="7" height="19" rx="2.5" fill="#4b4f60" stroke="${INK}" stroke-width="2"/>
      <path d="M-5 64 V71 M27.5 64 V71" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
      <path d="M4.5 70 Q4.5 61.5 12.8 61.5 Q21 61.5 21.2 69.5 Q21.4 78 12.8 78 Q4.5 78 4.5 70 Z" fill="__BODY__" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M8 66.5 Q10 65 12 66.5 M12.2 66.3 Q14.2 64.8 16.2 66.3" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".6"/></g>`;
  // Six-pack: soft lighter pads with a faint ink edge, so it reads on every skin (fresa and sésamo too).
  // ABS_LOW: a slightly smaller pack starting lower, so it shows whole under the (short) beard.
  const sixPack = (y0, step, h) => {
    let s = '<g class="rw-abs">';
    for (let r = 0; r < 3; r++) {
      const y = y0 + r * step;
      for (const x of [65.5, 80.8]) s += `<rect x="${x}" y="${y}" width="13.7" height="${h}" rx="${(h / 2 - 0.05).toFixed(2)}" fill="#ffffff" fill-opacity=".22" stroke="${INK}" stroke-opacity=".3" stroke-width="1.1"/>`;
    }
    return s + `</g>`;
  };
  const ABS = sixPack(115.5, 7.2, 6.3);
  const ABS_LOW = sixPack(120, 5.9, 5);
  // X scar: two curved strokes crossing, raised pinkish core with a darker edge and stitch marks.
  const SCAR_XY = { mejilla: [55, 99, 6.6, -6], frente: [64, 51, 6.2, 8], cuerpo: [106, 124, 8.4, 12] };
  const scar = ([cx, cy, k, rot]) => {
    const p1 = `M${-k} ${-0.78 * k} Q${-0.15 * k} ${0.12 * k} ${k} ${0.8 * k}`;
    const p2 = `M${k} ${-0.82 * k} Q${0.1 * k} ${-0.05 * k} ${-k} ${0.76 * k}`;
    const st = [[-0.62, -0.42], [0.58, 0.5], [0.6, -0.5], [-0.6, 0.47]].map(([x, y]) => {
      const nx = (x > 0) === (y > 0) ? 0.6 : -0.6;
      return `M${(x * k - nx * 2.4).toFixed(2)} ${(y * k + 2.4 * 0.8).toFixed(2)} l${(nx * 4.8).toFixed(2)} ${(-4.8 * 0.8).toFixed(2)}`;
    }).join(' ');
    return `<g transform="translate(${cx} ${cy}) rotate(${rot})" fill="none" stroke-linecap="round">
        <path d="${p1}" stroke="#9c3b50" stroke-width="4.4" opacity=".9"/><path d="${p2}" stroke="#9c3b50" stroke-width="4.4" opacity=".9"/>
        <path d="${p1}" stroke="#ffc9c4" stroke-width="2.5"/><path d="${p2}" stroke="#ffc9c4" stroke-width="2.5"/>
        <path d="${st}" stroke="${INK}" stroke-width="1" opacity=".5"/>
      </g>`;
  };
  const dinoTeeth = (() => {
    let s = '';
    for (let i = 0; i <= 8; i++) {
      const t = Math.PI + (Math.PI * (i + 0.5)) / 9.6 + 0.08;
      const x = 80 + Math.cos(t) * 41;
      const y = 88 + Math.sin(t) * 34;
      const nx = (80 - x) / 41;
      const ny = (88 - y) / 34;
      const L = Math.hypot(nx, ny);
      const tx = -ny / L;
      const ty = nx / L;
      s += `<path d="M${(x - tx * 3).toFixed(1)} ${(y - ty * 3).toFixed(1)} L${(x + (nx / L) * 5.5).toFixed(1)} ${(y + (ny / L) * 5.5).toFixed(1)} L${(x + tx * 3).toFixed(1)} ${(y + ty * 3).toFixed(1)} Z" fill="#fffaf0" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    return s;
  })();
  const bushy = (cx) => `<path transform="translate(${cx} 61)" d="M-12 3 Q-11 -5 -1 -6 Q10 -6.5 12.5 1 Q10.5 0 9 2.2 Q7 -.5 4.6 2 Q2.4 -.6 0 2 Q-2.6 -.4 -5 2.4 Q-7.6 .2 -9.4 3.4 Q-10.8 2 -12 3 Z" fill="#4a3426" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <path transform="translate(${cx} 61)" d="M-7 -3 Q-1 -4.8 6 -3.4" fill="none" stroke="#8a6248" stroke-width="1.3" stroke-linecap="round"/>`;
  // Hairstyles (slot pelo): drawn ON the head, over the top of the body and never over the eyes or
  // cheeks. Same drawing in both styles. Each one: soft fill, darker strands, a white shine.
  // `bangs` builds a row of rounded fringe locks from right to left: gaps at y `yg`, tips at `tips[i]`.
  const bangs = (x0, x1, yg, tips, lean = 0.2) => {
    const w = (x0 - x1) / tips.length;
    return tips.map((yt, i) => {
      const a = x0 - i * w;
      const b = a - w;
      const yc = (yg + (yt - yg) / 0.75).toFixed(1);
      return ` C${(a - w * lean).toFixed(1)} ${yc} ${(b + w * (0.5 - lean)).toFixed(1)} ${yc} ${b.toFixed(1)} ${yg}`;
    }).join('');
  };
  const HAIR_ART = {
    flequillo: `<g class="rw-hair" stroke-linejoin="round" stroke-linecap="round">
        <path d="M28.5 75 C24 52 40 32.5 80 32 C120 32.5 136 52 131.5 75 Q129.5 78.5 126.5 75.5 C125.5 66 124 58 122 52${bangs(122, 38, 49.5, [55.5, 58.5, 60, 60, 58.5, 55.5])} C36 58 34.5 66 33.5 75.5 Q30.5 78.5 28.5 75 Z" fill="__HB__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M108 38.5 Q111 44 108 50 M94 35.5 Q96 43 94 50 M80 34.5 V50 M66 35.5 Q64 43 66 50 M52 38.5 Q49 44 52 50" fill="none" stroke="__HD__" stroke-width="1.8"/>
        <path d="M40 52 Q44 41 56 37" fill="none" stroke="__HS__" stroke-width="2.6" opacity="__HO__"/>
        <path d="M62 35.6 L68 34.8" fill="none" stroke="__HS__" stroke-width="2.4" opacity="__HO__"/>
      </g>`,
    tupe: `<g class="rw-hair" stroke-linejoin="round" stroke-linecap="round">
        <path d="M30 68 C28.5 52 36 42 52 39 L108 39 C124 42 131.5 52 130 68 C127 60 122 55 115 51 L112 42 L48 42 L45 51 C38 55 33 60 30 68 Z" fill="__HB__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M100 18 C104 5 118 3 121 12 C116 9.5 110 11 107.5 19 Z" fill="__HB__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M42 50 C33 31 52 15 76 14 C94 13 108 15 116 24 C122 31 122 41 117 47 C111 53 101 53 95 48 C89 54 78 54 72 48.5 C65 54 50 55 42 50 Z" fill="__HB__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M54 44 C54 31 68 24 86 24 C98 24 106 28 110 35" fill="none" stroke="__HD__" stroke-width="2"/>
        <path d="M66 46 C67 38 76 33 88 33.5" fill="none" stroke="__HD__" stroke-width="1.8"/>
        <path d="M49 34 Q55 22 69 18.5" fill="none" stroke="__HS__" stroke-width="2.6" opacity="__HO__"/>
        <path d="M108 12.5 Q111 9 115 9" fill="none" stroke="__HS__" stroke-width="2" opacity="__HO__"/>
      </g>`,
    melenita: `<g class="rw-hair" stroke-linejoin="round" stroke-linecap="round">
        <path d="M23.5 102 C19 74 24 36 80 32.5 C136 36 141 74 136.5 102 C133.5 106.5 127.5 106 125.5 101.5 C124.5 86 127 70 121 60 C110 58 97 52 88 44 C82 50 74 52 66 52 C56 53 48 56 42 61 C35 71 36 86 34.5 101.5 C32.5 106 26.5 106.5 23.5 102 Z" fill="__HB__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M88 44 C92 50 98 56 104 58" fill="none" stroke="__HD__" stroke-width="1.8"/>
        <path d="M30 96 C28 82 29 70 33 62 M130 96 C132 82 131 70 127 62 M66 39 Q72 37 80 38" fill="none" stroke="__HD__" stroke-width="1.8"/>
        <path d="M34 62 Q38 45 54 39" fill="none" stroke="__HS__" stroke-width="2.6" opacity="__HO__"/>
        <path d="M96 38 Q104 38 110 41" fill="none" stroke="__HS__" stroke-width="2.2" opacity="__HO__"/>
      </g>`,
  };
  // The fringe under the ninja band (anime style): the band covers the top of the head and the
  // locks start under it, so the gaps sit hidden behind the band and only the longer tips peek out.
  const FRINGE_BAND = `<g class="rw-hair" stroke-linejoin="round" stroke-linecap="round">
        <path d="M28.5 75 C24 52 40 32.5 80 32 C120 32.5 136 52 131.5 75 Q129.5 78.5 126.5 75.5 C125.5 68 124.5 61 122 55${bangs(122, 38, 55, [62.5, 65.5, 67, 67, 65.5, 62.5])} C36 61 34.5 68 33.5 75.5 Q30.5 78.5 28.5 75 Z" fill="__HB__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M108 38.5 Q111 44 108 50 M94 35.5 Q96 43 94 50 M80 34.5 V50 M66 35.5 Q64 43 66 50 M52 38.5 Q49 44 52 50" fill="none" stroke="__HD__" stroke-width="1.8"/>
        <path d="M40 52 Q44 41 56 37" fill="none" stroke="__HS__" stroke-width="2.6" opacity="__HO__"/>
        <path d="M62 35.6 L68 34.8" fill="none" stroke="__HS__" stroke-width="2.4" opacity="__HO__"/>
      </g>`;
  // Hair colours: one palette per colour (base fill, darker strands, shine) shared by every hairstyle.
  // The placeholders __HB__/__HD__/__HS__/__HO__ in the drawings are filled in at paint time.
  const HAIR_PAL = {
    negro: { base: '#423d4c', dark: '#211e28', shine: '#b9b3da', op: 0.85 },
    castano: { base: '#7a4a33', dark: '#5a3322', shine: '#fff', op: 0.6 },
    rubio: { base: '#f8e08e', dark: '#c99a3a', shine: '#fff', op: 0.9 },
  };
  const HAIR_COLORS = Object.keys(HAIR_PAL);
  const HAIR_DEFAULT = 'castano';
  const hairPal = (c) => HAIR_PAL[c] || HAIR_PAL[HAIR_DEFAULT];
  const tintHair = (html, c) => { const p = hairPal(c); return html.replaceAll('__HB__', p.base).replaceAll('__HD__', p.dark).replaceAll('__HS__', p.shine).replaceAll('__HO__', String(p.op)); };
  const PROP_ART = {
    ...Object.fromEntries(Object.entries(HAIR_ART).map(([k, v]) => [k, { front: v }])),
    gorra: {
      back: `<path d="M50 24 Q80 8 110 24 Q112 30 80 30 Q48 30 50 24 Z" fill="#ff4d3a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
      front: `<g stroke-linejoin="round">
        <path d="M34 56 Q34 18 80 18 Q126 18 126 56 Z" fill="#ff5a3c" stroke="${INK}" stroke-width="2.4"/>
        <path d="M58 22 Q54 38 54 55 M102 22 Q106 38 106 55" fill="none" stroke="#d63c22" stroke-width="2" stroke-linecap="round"/>
        <path d="M68 56 A12 11 0 0 1 92 56 Z" fill="__BODY__" stroke="${INK}" stroke-width="2.2"/>
        <path d="M66 52 H94" stroke="#ffd23f" stroke-width="3.2" stroke-linecap="round"/><path d="M66 52 H94" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity=".35"/>
        <circle cx="80" cy="17.5" r="4" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>
        <path d="M44 32 Q50 24 60 21" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
      </g>` },
    gafassol: {
      front: `<g class="rw-glasses" stroke-linejoin="round">
        <path d="M47 77 Q47 74 51 74 L73 74 Q76.5 74 75.5 78.5 Q73.5 95 61 96 Q49.5 96 47.5 85 Z" fill="url(#rw-aviator-ID)" stroke="${INK}" stroke-width="2.6"/>
        <path d="M113 77 Q113 74 109 74 L87 74 Q83.5 74 84.5 78.5 Q86.5 95 99 96 Q110.5 96 112.5 85 Z" fill="url(#rw-aviator-ID)" stroke="${INK}" stroke-width="2.6"/>
        <path d="M74 76.5 Q80 72.5 86 76.5" fill="none" stroke="${INK}" stroke-width="3"/><path d="M74 76.5 Q80 72.5 86 76.5" fill="none" stroke="#ffcc4d" stroke-width="1.3"/>
        <path d="M47.5 78 L31 75 M112.5 78 L129 75" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <path d="M52 79 L60 79 M88 79 L96 79" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
        <path d="M54 89 L57 86 M90 89 L93 86" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
      </g>` },
    ninja: {
      front: `<g stroke-linejoin="round">
        <g class="rw-flutter"><path d="M126 51 Q138 40 152 42 Q144 47 147 52 Q137 50 128 55 Z" fill="#e8384f" stroke="${INK}" stroke-width="2.2"/>
          <path d="M126 54 Q136 60 149 66 Q140 66 139 72 Q132 62 125 58 Z" fill="#d42c43" stroke="${INK}" stroke-width="2.2"/></g>
        <path d="M37 47 Q80 53 123 47 L129.5 56 Q80 62.5 30.5 56 Z" fill="#e8384f" stroke="${INK}" stroke-width="2.4"/>
        <path d="M36 51 Q80 57 124.5 51" fill="none" stroke="#ff8a98" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
        <circle cx="80" cy="54" r="5.2" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cx="80" cy="54" r="2.4" fill="#e8384f"/>
        <circle cx="127" cy="53.5" r="4.4" fill="#d42c43" stroke="${INK}" stroke-width="2.2"/>
      </g>` },
    vikingo: {
      front: `<g stroke-linejoin="round">
        <path d="M41 40 C25 38 15 26 18 8 C23 19 33 23 46 26 Z" fill="#fff3dd" stroke="${INK}" stroke-width="2.4"/>
        <path d="M119 40 C135 38 145 26 142 8 C137 19 127 23 114 26 Z" fill="#fff3dd" stroke="${INK}" stroke-width="2.4"/>
        <path d="M24 26 Q28 30 33 31 M136 26 Q132 30 127 31" fill="none" stroke="#e3cfae" stroke-width="2" stroke-linecap="round"/>
        <path d="M35 54 Q35 12 80 12 Q125 12 125 54 Z" fill="#b9c2d3" stroke="${INK}" stroke-width="2.4"/>
        <path d="M80 13 V46" stroke="#8d97ab" stroke-width="5" stroke-linecap="round"/><path d="M80 13 V46" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".35"/>
        <path d="M46 26 Q52 18 62 15" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>
        <rect x="31" y="44" width="98" height="13" rx="6.5" fill="#e0a83a" stroke="${INK}" stroke-width="2.4"/>
        <g fill="#fff3c4" stroke="${INK}" stroke-width="1.2"><circle cx="42" cy="50.5" r="1.9"/><circle cx="56" cy="50.5" r="1.9"/><circle cx="70" cy="50.5" r="1.9"/><circle cx="90" cy="50.5" r="1.9"/><circle cx="104" cy="50.5" r="1.9"/><circle cx="118" cy="50.5" r="1.9"/></g>
      </g>` },
    gamer: {
      front: `<g stroke-linejoin="round">
        <path d="M27 74 Q27 22 80 22 Q133 22 133 74" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
        <path d="M27 74 Q27 22 80 22 Q133 22 133 74" fill="none" stroke="#3a3548" stroke-width="6.2" stroke-linecap="round"/>
        <path d="M60 25.5 Q80 22 100 25.5" fill="none" class="rw-rgb" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M17 96 Q20 116 48 116 L56 116" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <path d="M17 96 Q20 116 48 116 L56 116" fill="none" stroke="#3a3548" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="53" y="112" width="9" height="8" rx="4" fill="#3a3548" stroke="${INK}" stroke-width="2"/>
        <rect x="11" y="60" width="26" height="46" rx="12" fill="#3a3548" stroke="${INK}" stroke-width="2.6"/>
        <rect x="123" y="60" width="26" height="46" rx="12" fill="#3a3548" stroke="${INK}" stroke-width="2.6"/>
        <rect x="16" y="66" width="7" height="34" rx="3.5" class="rw-rgb rw-rgb-f" stroke="${INK}" stroke-width="1.4"/>
        <rect x="137" y="66" width="7" height="34" rx="3.5" class="rw-rgb rw-rgb-f" stroke="${INK}" stroke-width="1.4"/>
        <circle cx="30" cy="70" r="1.6" fill="#3ddc97"/><circle cx="130" cy="70" r="1.6" fill="#3ddc97"/>
      </g>` },
    bigote: {
      front: `<g stroke-linejoin="round">
        <path d="M80 92.6 C76.5 89.6 70.5 90.2 67 94 C64.6 96.8 61 97.2 59 94.4 C58.6 98.8 63 101.8 68.4 100.2 C72.8 99.2 77 98 80 96.4 C83 98 87.2 99.2 91.6 100.2 C97 101.8 101.4 98.8 101 94.4 C99 97.2 95.4 96.8 93 94 C89.5 90.2 83.5 89.6 80 92.6 Z" fill="#5a3a2a" stroke="${INK}" stroke-width="2"/>
        <path d="M70 93.6 Q74 92.2 77.4 93.6 M82.6 93.6 Q86 92.2 90 93.6" fill="none" stroke="#9a6a4c" stroke-width="1.3" stroke-linecap="round"/>
      </g>` },
    barba: {
      front: `<g stroke-linejoin="round">
        <path d="M32 82 C26 96 25 113 32 123 C38 131 49 133 56 128 C60 125 62 120 65 117.5 Q72 115.5 76 117 Q80 119.5 84 117 Q88 115.5 95 117.5 C98 120 100 125 104 128 C111 133 122 131 128 123 C135 113 134 96 128 82 C124 88 121 98 118 104 C115 110 108 113 100 111.5 Q94 110 90 111.5 Q80 115 70 111.5 Q66 110 60 111.5 C52 113 45 110 42 104 C39 98 36 88 32 82 Z" fill="#b5653a" stroke="${INK}" stroke-width="2.4"/>
        <path d="M35 98 Q34 110 39 120 M46 113 Q48 121 53 126 M125 98 Q126 110 121 120 M114 113 Q112 121 107 126" fill="none" stroke="#8a4724" stroke-width="2" stroke-linecap="round"/>
        <path d="M30 100 Q30 110 34 117" fill="none" stroke="#e39a6c" stroke-width="2" stroke-linecap="round" opacity=".8"/>
      </g>` },
    cejas: {
      front: `<g class="rw-bb"><g class="rw-bb-l">${bushy(62)}</g><g class="rw-bb-r"><g transform="translate(196 0) scale(-1 1)">${bushy(98)}</g></g></g>` },
    parche: {
      front: `<g stroke-linejoin="round">
        <path d="M30 67 L129 54" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M49.5 79 Q50 71.5 62 71.5 Q74 71.5 74.5 79 Q75 93 62 96.5 Q49 93 49.5 79 Z" fill="${INK}" stroke="${INK}" stroke-width="2.2"/>
        <path d="M55 77 Q58 74.5 62 74.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>
      </g>` },
    musculitos: {
      back: `<g class="rw-arm rw-arm-l">${arm()}</g><g transform="translate(160 0) scale(-1 1)"><g class="rw-arm rw-arm-r">${arm()}</g></g>`,
      front: ABS },
    pesa: {
      back: `<g transform="translate(160 0) scale(-1 1)"><g class="rw-arm rw-arm-r">${arm(dumbbell)}</g></g>` },
    cicatriz: { front: '' }, // drawn from SCAR_POS at paint time
    astronauta: {
      front: `<g stroke-linejoin="round">
        <path d="M28.7 128 A66 70 0 1 1 131.3 128" fill="#cfe9ff" fill-opacity=".2" stroke="${INK}" stroke-width="2.6"/>
        <path d="M28.7 128 A66 70 0 1 1 131.3 128" fill="none" stroke="#bfe3ff" stroke-width="1.4" transform="translate(80 84) scale(.965) translate(-80 -84)" opacity=".9"/>
        <path d="M34 62 Q42 34 70 22" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".75"/>
        <path d="M30 80 Q30 74 32 70" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
        <path d="M126 104 Q130 96 131 88" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>
        <ellipse cx="80" cy="132" rx="57" ry="10.5" fill="#eef2f8" stroke="${INK}" stroke-width="2.4"/>
        <path d="M30 130 Q80 141 130 130" fill="none" stroke="#c9d1df" stroke-width="2" stroke-linecap="round"/>
        <rect x="100" y="128" width="12" height="7" rx="2" fill="#ff7a3c" stroke="${INK}" stroke-width="1.6"/>
        <circle cx="54" cy="132.5" r="2.4" fill="#3ddc97" stroke="${INK}" stroke-width="1.2"/>
      </g>` },
    superheroe: {
      back: `<g stroke-linejoin="round">
        <path d="M40 58 C18 86 6 120 1 152 Q24 147 40 156 Q60 150 80 156 Q100 150 120 156 Q136 147 159 152 C154 120 142 86 120 58 Z" fill="#2f6fe8" stroke="${INK}" stroke-width="2.4"/>
        <path d="M5 146 Q24 141 40 150 Q60 144 80 150 Q100 144 120 150 Q136 141 155 146" fill="none" stroke="#ffd23f" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M26 92 Q15 118 10 140 M134 92 Q145 118 150 140" fill="none" stroke="#1f52b8" stroke-width="2.2" stroke-linecap="round"/>
      </g>`,
      front: `<g stroke-linejoin="round">
        <g class="rw-flutter"><path d="M114 80 Q126 78 134 70 Q131 79 136 84 Q125 84 115 86 Z" fill="#1f52b8" stroke="${INK}" stroke-width="2"/></g>
        <path fill-rule="evenodd" d="M44 79 Q45 69.5 62 70.5 Q74 71.5 80 75.5 Q86 71.5 98 70.5 Q115 69.5 116 79 Q117 93 103 96 Q90 98 80 91 Q70 98 57 96 Q43 93 44 79 Z M73.5 84 A11.5 11 0 1 0 50.5 84 A11.5 11 0 1 0 73.5 84 Z M109.5 84 A11.5 11 0 1 0 86.5 84 A11.5 11 0 1 0 109.5 84 Z" fill="#2f6fe8" stroke="${INK}" stroke-width="2.2"/>
        <circle cx="32.5" cy="66" r="5" fill="#ffd23f" stroke="${INK}" stroke-width="2"/><circle cx="127.5" cy="66" r="5" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>
      </g>` },
    dino: {
      back: `<g stroke-linejoin="round" fill="#3fa84a" stroke="${INK}" stroke-width="2.2">
        <path d="M44 40 Q46 26 54 20 Q58 30 60 38 Z"/><path d="M62 36 Q66 18 76 12 Q79 26 80 34 Z"/><path d="M80 34 Q84 18 94 13 Q96 26 98 36 Z"/><path d="M100 38 Q104 26 110 21 Q114 30 116 40 Z"/>
        <path d="M124 122 Q146 124 156 108 Q156 132 132 138 Z"/><path d="M141 124 L147 113 L150 122 Z" fill="#2f8a3a"/>
      </g>`,
      front: `<g stroke-linejoin="round">
        <path fill-rule="evenodd" d="M26 66 Q26 34 58 34 L102 34 Q134 34 134 66 L134 116 Q134 128 122 128 L38 128 Q26 128 26 116 Z M121 88 A41 34 0 1 0 39 88 A41 34 0 1 0 121 88 Z" fill="#5cc45a" stroke="${INK}" stroke-width="2.4"/>
        ${dinoTeeth}
        <path d="M36 46 Q44 38 56 37" fill="none" stroke="#a4e59c" stroke-width="2.4" stroke-linecap="round"/>
        <g fill="#3fa84a"><circle cx="31.5" cy="100" r="2.2"/><circle cx="128.5" cy="96" r="2.6"/><circle cx="124" cy="110" r="1.8"/><circle cx="36" cy="114" r="1.8"/></g>
      </g>` },
  };

  // ------------------------------------------------------------------ catalogue
  const ACC_IDS = ['lacito', 'gafas', 'bufanda', 'auris', 'gorrito', 'pajarita', 'capa', 'chef', 'flores', 'aureola'];
  const SKIN_IDS = ['clasico', 'fresa', 'matcha', 'mango', 'arandano', 'sesamo', 'dorado', 'mecenas'];
  const SKIN_DEF = {
    clasico: { base: '#ff9e7a', hi: 0.28 }, fresa: { base: '#ff8fab', hi: 0.3 }, matcha: { base: '#a8cc84', hi: 0.3 },
    mango: { base: '#ffbf4f', hi: 0.3 }, arandano: { base: '#9aa3ec', hi: 0.3 }, sesamo: { base: '#6d6773', hi: 0.26 },
    dorado: { base: 'gold', hi: 0.34 }, mecenas: { base: '#ffd6e1', hi: 0.4 },
  };
  // [level, approved item, second item, optional third (hairstyles)]; the original lab "PAIRS" table,
  // now all real rewards. A pack can hold 1-3 items: never assume pairs.
  const PACKS = [
    [4, 'lacito', 'bigote'], [7, 'gafas', 'gafassol'], [10, 'fresa', 'cejas'], [13, 'bufanda', 'gorra'],
    [16, 'auris', 'gamer', 'flequillo'], [19, 'matcha', 'parche', 'tupe'], [22, 'gorrito', 'ninja', 'melenita'], [25, 'pajarita', 'barba'],
    [28, 'mango', 'pesa'], [31, 'capa', 'superheroe'], [34, 'chef', 'vikingo'], [37, 'arandano', 'musculitos'],
    [40, 'flores', 'dino'], [43, 'sesamo', 'cicatriz'], [46, 'aureola', 'astronauta'], [50, 'dorado', null],
  ];
  const THEME = {
    lacito: 'cute', bigote: 'broma', gafas: 'cute', gafassol: 'canero', fresa: 'cute', cejas: 'broma', bufanda: 'cute', gorra: 'canero',
    auris: 'cute', gamer: 'canero', matcha: 'cute', parche: 'broma', gorrito: 'cute', ninja: 'canero', pajarita: 'cute', barba: 'broma',
    mango: 'cute', pesa: 'fuerza', capa: 'cute', superheroe: 'disfraz', chef: 'cute', vikingo: 'canero', arandano: 'cute',
    musculitos: 'fuerza', flores: 'cute', dino: 'disfraz', sesamo: 'cute', cicatriz: 'canero', aureola: 'cute', astronauta: 'disfraz',
    dorado: 'cute', clasico: 'cute', mecenas: 'cute', flequillo: 'cute', tupe: 'canero', melenita: 'cute',
  };
  // Where Tapomo's head item ends, per style: how far the record crown and the halo rise above it.
  const LIFT_SUBTLE = { lacito: 0, gorrito: 26, chef: 40, flores: 5 };
  const LIFT_BOLD = { lacito: 0, gorrito: 44, chef: 58, flores: 10, gorra: 8, ninja: 0, vikingo: 40, astronauta: 32, dino: 18 };
  // Hair is not a head item (a bow or flowers can sit on it), so it lifts the crown on its own.
  const LIFT_HAIR = { flequillo: 5, tupe: 20, melenita: 5 };

  // Sleeping "z z z": how far they rise so they start above what is worn on the head (measured where
  // the z's are drawn, right of the head). Style-dependent items have a subtle value too.
  const ZZZ_LIFT = { lacito: 15, gorrito: 32, chef: 50, flores: 9, gorra: 22, vikingo: 27, flequillo: 10, tupe: 41, melenita: 7, auris: 24, gamer: 24, dino: 24, astronauta: 25 };
  const ZZZ_LIFT_SUBTLE = { lacito: 7, gorrito: 23, flores: 4 };
  // ------------------------------------------------------------------ style rule
  // Only these change between "subtle" and "bold"; every other item always uses the bold drawing.
  const STYLE_VARIES = ['lacito', 'bufanda', 'gorrito', 'capa', 'flores', 'gamer', 'musculitos', 'fresa', 'dorado'];
  // gamer and musculitos have no separate subtle drawing: CSS switches off their animation instead.

  // ------------------------------------------------------------------ clothing rules (from the lab)
  // Every item declares its slot(s) and what it excludes ('slot:x' = everything in slot x, or an item
  // key). Two items conflict if they share a slot or either one excludes the other. Full-body costumes
  // (disfraz) exclude every external accessory and keep only face items and the halo.
  // Hair (slot pelo, one style at a time): every hat that covers the head excludes it, so a hat takes
  // the hair off and the hair takes the hat off. The ninja band goes over any hairstyle (the fringe
  // switches to FRINGE_BAND, its locks peeking out under the band).
  // Bow, flowers, headphones and halo sit on top of the hair.
  const SLOT_NAMES = ['cabeza', 'pelo', 'frente', 'orejas', 'ojos', 'cejas', 'bigote', 'barba', 'marca', 'cuello', 'espalda', 'brazos', 'torso', 'aura', 'cuerpo'];
  const FACE_SLOTS = ['ojos', 'cejas', 'bigote', 'barba', 'marca', 'aura'];
  const COSTUME_EXCL = SLOT_NAMES.filter((z) => !FACE_SLOTS.includes(z)).map((z) => `slot:${z}`);
  const RULES = {
    lacito: { slots: ['cabeza'], excluye: ['slot:frente'] },
    gafas: { slots: ['ojos'] },
    bufanda: { slots: ['cuello'] },
    auris: { slots: ['orejas'] },
    gorrito: { slots: ['cabeza'], excluye: ['slot:frente', 'slot:pelo'] },
    pajarita: { slots: ['cuello'] },
    capa: { slots: ['espalda'] },
    chef: { slots: ['cabeza'], excluye: ['slot:frente', 'slot:orejas', 'slot:pelo'] },
    flores: { slots: ['cabeza'], excluye: ['slot:frente'] },
    aureola: { slots: ['aura'] },
    gorra: { slots: ['cabeza'], excluye: ['slot:frente', 'slot:pelo'] },
    gafassol: { slots: ['ojos'] },
    ninja: { slots: ['frente'] },
    vikingo: { slots: ['cabeza'], excluye: ['slot:frente', 'slot:orejas', 'slot:pelo'] },
    gamer: { slots: ['orejas'] },
    bigote: { slots: ['bigote'] },
    barba: { slots: ['barba'] },
    cejas: { slots: ['cejas'] },
    parche: { slots: ['ojos'] },
    musculitos: { slots: ['brazos', 'torso'] },
    pesa: { slots: ['brazos'] },
    cicatriz: { slots: ['marca'] },
    astronauta: { slots: ['cuerpo', 'cabeza'], disfraz: true },
    dino: { slots: ['cuerpo', 'cabeza'], disfraz: true },
    superheroe: { slots: ['cuerpo', 'espalda', 'ojos'], disfraz: true, permite: ['musculitos'] },
    flequillo: { slots: ['pelo'] },
    tupe: { slots: ['pelo'] },
    melenita: { slots: ['pelo'] },
  };
  const HAIR_IDS = Object.keys(HAIR_ART);
  // The scar's own exclusions depend on where it sits. Only 'mejilla' is used for now.
  const SCAR_EXCL = { mejilla: [], frente: ['gorrito', 'chef', 'flores', 'gorra', 'vikingo', 'ninja', 'dino'], cuerpo: ['barba', 'bufanda', 'pajarita'] };
  const SCAR_POS = 'mejilla';
  const slotsOf = (k) => RULES[k].slots;
  const exclOf = (k) => [...(RULES[k].excluye || []), ...(RULES[k].disfraz ? COSTUME_EXCL : []), ...(k === 'cicatriz' ? SCAR_EXCL[SCAR_POS] : [])];
  const excludes = (a, b) => !(RULES[a].permite || []).includes(b) && exclOf(a).some((e) => e === b || (e.startsWith('slot:') && slotsOf(b).includes(e.slice(5))));
  const clash = (a, b) => a !== b && (slotsOf(a).some((z) => slotsOf(b).includes(z)) || excludes(a, b) || excludes(b, a));

  const ITEMS = [{ id: 'clasico', kind: 'skin', level: 1, theme: THEME.clasico, slots: [] }];
  for (const [level, ...ids] of PACKS) {
    for (const id of ids) {
      if (!id) continue;
      const skin = SKIN_IDS.includes(id);
      ITEMS.push({ id, kind: skin ? 'skin' : 'acc', level, theme: THEME[id], slots: skin ? [] : slotsOf(id).slice() });
    }
  }
  // Thank-you skin for supporters: not a level reward (never in PACKS / REWARD_LEVELS / itemsAt);
  // unlocked() only lists it after setSupporter(true).
  ITEMS.push({ id: 'mecenas', kind: 'skin', level: 0, supporter: true, theme: THEME.mecenas, slots: [] });
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const REWARD_LEVELS = PACKS.map((p) => p[0]);
  const isAcc = (id) => typeof id === 'string' && BY_ID[id] !== undefined && BY_ID[id].kind === 'acc';
  const isSkin = (id) => typeof id === 'string' && BY_ID[id] !== undefined && BY_ID[id].kind === 'skin';

  let supporter = false;
  /** Marks this user as a supporter (unlocks the mecenas skin in unlocked()). */
  const setSupporter = (on) => { supporter = !!on; return supporter; };
  const itemsAt = (level) => ITEMS.filter((i) => i.level === level && i.id !== 'clasico' && !i.supporter).map((i) => i.id);
  const unlocked = (level) => ITEMS.filter((i) => (i.supporter ? supporter : i.level <= level)).map((i) => i.id);
  function nextReward(level) {
    const lv = REWARD_LEVELS.find((l) => l > level);
    return lv === undefined ? null : { level: lv, ids: itemsAt(lv) };
  }
  const clashes = (a, b) => isAcc(a) && isAcc(b) && clash(a, b);
  /** Puts `id` on top of the worn list, taking off everything it clashes with. */
  function wear(accIds, id) {
    const cur = (Array.isArray(accIds) ? accIds : []).filter(isAcc);
    if (!isAcc(id)) return { acc: [...new Set(cur)], removed: [] };
    const removed = cur.filter((o) => clash(id, o));
    const acc = cur.filter((o) => !removed.includes(o) && o !== id);
    acc.push(id);
    return { acc, removed };
  }
  /** Accepts an array or a stored "a,b c" string; drops unknown ids and resolves any clash. */
  function cleanAcc(input) {
    const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,]+/) : [];
    let acc = [];
    for (const id of list) if (isAcc(id)) acc = wear(acc, id).acc;
    return acc;
  }


  // ------------------------------------------------------------------ state + mounting
  const state = { skin: 'clasico', acc: [], style: 'bold', hair: HAIR_DEFAULT };
  const POSE = 'auto'; // musculitos: relaxed, flexing on happy faces and celebrations
  const mounted = new Set();
  let uid = 0;

  function decorate(svg) {
    if (!svg || svg.__rw || !svg.querySelector) return;
    const body = svg.querySelector('.mascot-body');
    const defs = svg.querySelector('defs');
    if (!body || !defs) return;
    const rects = body.querySelectorAll(':scope > rect');
    const base = rects[0];
    const hi = rects[1];
    const crown = body.querySelector('.m-crown');
    if (!base || !hi || !crown) return;
    const id = `rw${++uid}`;
    base.classList.add('rw-skin-base');
    hi.classList.add('rw-skin-hi');
    defs.insertAdjacentHTML('beforeend', `
      <clipPath id="rw-clip-${id}"><rect x="30" y="40" width="100" height="98" rx="30"/></clipPath>
      <linearGradient id="rw-gold-${id}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffe88a"/><stop offset=".35" stop-color="#ffcf45"/><stop offset=".7" stop-color="#f0aa26"/><stop offset="1" stop-color="#d98c16"/></linearGradient>
      <linearGradient id="rw-mango-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#ff8a3c" stop-opacity="0"/><stop offset="1" stop-color="#ff8a3c" stop-opacity=".55"/></linearGradient>
      <linearGradient id="rw-straw-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ec3f58"/><stop offset=".55" stop-color="#f4566c"/><stop offset="1" stop-color="#ff8796"/></linearGradient>
      <radialGradient id="rw-face-${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".26"/><stop offset=".7" stop-color="#ffffff" stop-opacity=".14"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      <linearGradient id="rw-aviator-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2540"/><stop offset=".6" stop-color="#5a3fa8" stop-opacity=".92"/><stop offset="1" stop-color="#ff7aa8" stop-opacity=".85"/></linearGradient>
      <linearGradient id="rw-sakura-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#ff8fb3" stop-opacity="0"/><stop offset="1" stop-color="#ff8fb3" stop-opacity=".32"/></linearGradient>
      <radialGradient id="rw-bloom-${id}" cx=".5" cy=".55" r=".7"><stop offset=".55" stop-color="#5d63c4" stop-opacity="0"/><stop offset="1" stop-color="#5d63c4" stop-opacity=".35"/></radialGradient>`);
    const g = (cls) => { const el = document.createElementNS(NS, 'g'); el.setAttribute('class', `rw-layer ${cls}`); el.setAttribute('aria-hidden', 'true'); return el; };
    const back = g('rw-back');
    const tex = g('rw-tex');
    tex.setAttribute('clip-path', `url(#rw-clip-${id})`);
    const front = g('rw-front');
    body.insertBefore(back, base);
    hi.after(tex);
    // Supermochi turns Tapomo golden for a while (any skin; the real «Tapomo dorado» keeps its glints).
    const gold = g('rw-supergold');
    gold.setAttribute('clip-path', `url(#rw-clip-${id})`);
    gold.innerHTML = `<rect x="30" y="40" width="100" height="98" rx="30" fill="url(#rw-gold-${id})"/>
      <rect x="40" y="46" width="80" height="72" rx="22" fill="#fff8d8" opacity=".3"/>
      <rect class="rw-supergold-sweep" x="-10" y="20" width="26" height="140" fill="#fffbe8" opacity=".75" transform="rotate(18 80 90)"/>`;
    tex.after(gold);
    body.append(front);
    // The record crown moves to the very top of the stack, inside a wrapper that rises over hats.
    const lift = document.createElementNS(NS, 'g');
    lift.setAttribute('class', 'rw-crown-lift');
    body.append(lift);
    lift.append(crown);
    svg.__rw = { id, base, hi, back, tex, front, lift, look: null };
    mounted.add(svg);
    paint(svg, svg.__rwFixed || state, false);
    startGlint();
  }

  // Celebrations make the arms flex for a moment (the Mascot object's jump / burstStars).
  const speed = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--speed')) || 1;
  const flex = (svg) => {
    if (!svg || !svg.classList) return;
    svg.classList.add('rw-flexing');
    clearTimeout(svg.__rwFlex);
    svg.__rwFlex = setTimeout(() => svg.classList.remove('rw-flexing'), 1400 / speed());
  };
  if (typeof Mascot !== 'undefined' && !Mascot.__wardrobe) {
    Mascot.__wardrobe = true;
    for (const fn of ['jump', 'burstStars']) {
      const real = Mascot[fn];
      Mascot[fn] = (svg, ...rest) => { const r = real(svg, ...rest); if (fn === 'jump' || (rest[0] || 9) >= 5) flex(svg); return r; };
    }
    const realMount = Mascot.mount;
    Mascot.mount = (svg) => { const r = realMount(svg); decorate(svg); return r; };
    const realZone = Mascot.setZone;
    Mascot.setZone = (svg, ...rest) => { const r = realZone(svg, ...rest); if (svg && svg.__rw) hairZone(svg); return r; };
  }

  // Drawing order, back to front: neck, face, hair (over the glasses' arms), hats, brows (over brims), ears, helmet, halo.
  const FRONT_ORDER = ['capa', 'superheroe', 'musculitos', 'pesa', 'cicatriz', 'barba', 'bufanda', 'pajarita', 'bigote', 'gafas', 'gafassol', 'parche',
    ...HAIR_IDS, 'lacito', 'gorrito', 'chef', 'flores', 'gorra', 'ninja', 'vikingo', 'dino', 'cejas', 'auris', 'gamer', 'astronauta', 'aureola'];

  function paint(svg, look, animateNew = true, fresh = null) {
    const rw = svg.__rw;
    if (!rw) return;
    rw.look = look;
    const skin = SKIN_DEF[look.skin];
    const bold = look.style === 'bold';
    const worn = new Set(look.acc);
    // Only the items listed in STYLE_VARIES have a subtle drawing; the rest always use the bold one.
    const A = new Proxy({}, { get: (_, k) => (!bold && STYLE_VARIES.includes(k === 'capaFront' ? 'capa' : k) ? ART[k] : ART_BOLD[k]) });
    svg.classList.toggle('rw-subtle', !bold);
    const head = look.acc.find((k) => slotsOf(k).includes('cabeza'));
    const covered = look.acc.some((k) => slotsOf(k).includes('cabeza') || slotsOf(k).includes('cuerpo'));
    const hair = look.acc.find((k) => slotsOf(k).includes('pelo'));
    const costume = bold && look.skin === 'fresa';
    // The strawberry calyx shares the top of the head: it stays with the bow, the ninja band,
    // headphones and halo, and steps aside (is not drawn) under any hat, helmet, hood or hairstyle.
    const calyx = costume && !covered && !hair;
    // rw-head-on: a hat or helmet hides the Supermochi flame-hair. A bow or flowers over a hairstyle don't.
    svg.classList.toggle('rw-head-on', covered && !hair);
    // Supermochi grows its golden flame-hair only over a hairstyle (which hides meanwhile, see hairZone).
    if (typeof Mascot !== 'undefined' && Mascot.setSuperHair) Mascot.setSuperHair(svg, !!hair);
    svg.classList.remove('rw-pose-auto', 'rw-pose-relax', 'rw-pose-flex');
    svg.classList.add(`rw-pose-${POSE}`);
    svg.classList.toggle('rw-gold', skin.base === 'gold');
    const bodyFill = skin.base === 'gold' ? `url(#rw-gold-${rw.id})` : costume ? `url(#rw-straw-${rw.id})` : skin.base;
    rw.base.setAttribute('fill', bodyFill);
    rw.hi.setAttribute('opacity', String(costume ? 0.22 : skin.hi));
    rw.tex.innerHTML = (costume ? FRESA_BOLD_TEX : TEX[look.skin] || '').replaceAll('-ID)', `-${rw.id})`);
    // On the red costume the blush turns light pink so it still shows.
    svg.classList.toggle('rw-straw', costume);
    svg.classList.toggle('rw-has-bb', worn.has('cejas'));
    svg.querySelectorAll('.cheek').forEach((c) => c.setAttribute('fill', costume ? '#ffb3c4' : '#ff6f61'));
    const pop = (k) => (animateNew && fresh === k ? ' class="rw-pop"' : '');
    const fix = (html) => tintHair(html, look.hair).replaceAll('__BODY__', bodyFill).replaceAll('-ID)', `-${rw.id})`);
    const backOf = (k) => (PROP_ART[k] ? PROP_ART[k].back || '' : k === 'capa' ? A[k] : '');
    const frontOf = (k) => (k === 'cicatriz' ? scar(SCAR_XY[SCAR_POS]) : k === 'musculitos' && worn.has('barba') ? ABS_LOW: k === 'flequillo' && worn.has('ninja') ? FRINGE_BAND : PROP_ART[k] ? PROP_ART[k].front || '' : k === 'capa' ? A.capaFront : A[k]);
    const wrap = (k, html) => (html ? `<g data-acc="${k}"${pop(k)}>${html}</g>` : '');
    const order = FRONT_ORDER.filter((k) => worn.has(k));
    rw.back.innerHTML = fix(order.map((k) => wrap(k, backOf(k))).join(''));
    rw.front.innerHTML = fix((calyx ? CALYX : '') + order.map((k) => wrap(k, frontOf(k))).join(''));
    const headLift = !head ? 0 : ((!bold && STYLE_VARIES.includes(head) ? LIFT_SUBTLE[head] : LIFT_BOLD[head]) || 0);
    const up = Math.max(headLift, hair ? LIFT_HAIR[hair] : 0) + (calyx ? 12 : 0);
    rw.lift.setAttribute('transform', `translate(0 ${-up})`);
    const zzz = svg.querySelector('.m-zzz');
    const zUp = Math.max(0, ...look.acc.map((k) => (!bold && ZZZ_LIFT_SUBTLE[k] !== undefined ? ZZZ_LIFT_SUBTLE[k] : ZZZ_LIFT[k]) || 0)) + (calyx ? 8 : 0);
    if (zzz) zzz.setAttribute('transform', `translate(0 ${-zUp})`);
    rw.lift.style.transform = `translateY(${-up}px)`;
    const halo = rw.front.querySelector('.rw-halo-move');
    if (halo) halo.style.transform = `translateY(${-up}px)`;
    hairZone(svg);
  }

  // In Supermochi the flame-hair replaces the worn hairstyle. wardrobe.css fades it; the opacity
  // attribute also reaches the afterimages (<use> clones, which page CSS can't style).
  function hairZone(svg) {
    const sup = svg.dataset.zone === 'super';
    svg.querySelectorAll('.rw-hair').forEach((el) => (sup ? el.setAttribute('opacity', '0') : el.removeAttribute('opacity')));
  }

  function paintAll(fresh) {
    mounted.forEach((svg) => {
      if (svg.isConnected) svg.__rwSeen = true;
      else if (svg.__rwSeen) { mounted.delete(svg); return; } // gone from the page: stop tracking
      if (!svg.__rwFixed) paint(svg, state, true, fresh);
    });
  }

  // ------------------------------------------------------------------ public look
  const normalize = (look, base) => ({
    skin: look && look.skin !== undefined ? (isSkin(look.skin) ? look.skin : base.skin) : base.skin,
    acc: look && look.acc !== undefined ? cleanAcc(look.acc) : base.acc.slice(),
    style: look && look.style !== undefined ? (look.style === 'subtle' || look.style === 'bold' ? look.style : base.style) : base.style,
    hair: look && look.hair !== undefined ? (HAIR_PAL[look.hair] ? look.hair : HAIR_DEFAULT) : base.hair,
  });
  /** Stores the look globally and repaints every mounted Tapomo (except fixed previews). Missing fields are kept. */
  function set(look, opts) {
    const next = normalize(look, state);
    const fresh = opts && opts.fresh && next.acc.includes(opts.fresh) ? opts.fresh : null;
    Object.assign(state, next);
    paintAll(fresh);
    return get();
  }
  const get = () => ({ skin: state.skin, acc: state.acc.slice(), style: state.style, hair: state.hair });
  /** Paints ONE svg with a specific look (thumbnails, reveal dialogs); it then ignores global set(). */
  function preview(svg, look) {
    if (!svg) return;
    svg.__rwFixed = normalize(look, { skin: 'clasico', acc: [], style: state.style, hair: state.hair });
    if (!svg.__rw) decorate(svg);
    else paint(svg, svg.__rwFixed, false);
  }

  // Tapomo dorado: a quick glint at random 5-10 s intervals with a "ting" sparkle near its end.
  let glintOn = false;
  function startGlint() {
    if (glintOn) return;
    glintOn = true;
    const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function glint() {
      if (!reduce() && !document.hidden) {
        const T = (600 + Math.random() * 300) / speed();
        const tx = 45 + Math.random() * 70;
        const ty = 50 + Math.random() * 28;
        mounted.forEach((svg) => {
          if (!svg.__rw || !svg.__rw.look || svg.__rw.look.skin !== 'dorado' || svg.__rw.look.style !== 'bold') return;
          const g = svg.querySelector('.rw-glint');
          const t = svg.querySelector('.rw-ting');
          if (!g) return;
          g.animate([{ transform: 'translateX(-10px)', opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { transform: 'translateX(150px)', opacity: 0 }], { duration: T, easing: 'ease-in-out' });
          if (t) {
            t.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`);
            t.animate([{ opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(.1) rotate(0deg)` }, { opacity: 1, transform: `translate(${tx}px, ${ty}px) scale(1.15) rotate(25deg)`, offset: 0.45 }, { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(.3) rotate(45deg)` }],
              { duration: 380 / speed(), delay: T * 0.7, easing: 'ease-out' });
          }
        });
      }
      setTimeout(glint, 5000 + Math.random() * 5000);
    }
    setTimeout(glint, 2500 + Math.random() * 2500);
  }

  /** A small CSS colour for a hair-colour swatch in the UI (the palette's base fill). */
  const hairSwatch = (c) => hairPal(c).base;

  window.Wardrobe = { HAIR_COLORS, hairSwatch, ITEMS, REWARD_LEVELS, itemsAt, unlocked, nextReward, clashes, wear, set, get, decorate, preview, setSupporter };
})();
