// The Tapomo mascot, shared by the main window and the floating pet.
// The face is split into parts (eyes, mouth, cheeks) and each part has several variants;
// `Mascot.setFace` picks one by setting data attributes that mascot.css reads.
const Mascot = (() => {
  const INK = '#23202b';
  const star = (x, y, s = 1) =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -4 L1.1 -1.1 L4 0 L1.1 1.1 L0 4 L-1.1 1.1 L-4 0 L-1.1 -1.1Z" fill="#fff"/>`;

  const markup = `
    <g class="m-extras m-lines" aria-hidden="true">
      <path d="M-12 62h30M-18 84h36M-10 106h28" stroke="#ff9e7a" stroke-width="4" stroke-linecap="round" fill="none"/>
    </g>
    <ellipse cx="80" cy="142" rx="44" ry="6" fill="#cfc8dd"/>
    <g id="mascot-body" class="mascot-body">
      <rect x="30" y="40" width="100" height="98" rx="30" fill="#ff9e7a"/>
      <rect x="40" y="46" width="80" height="72" rx="22" fill="#ffffff" opacity=".28"/>
      <g data-part="eyes">
        <g class="eyes-round">
          <circle cx="62" cy="84" r="7" fill="${INK}"/><circle cx="98" cy="84" r="7" fill="${INK}"/>
          <circle cx="64" cy="82" r="2.4" fill="#fff"/><circle cx="100" cy="82" r="2.4" fill="#fff"/>
        </g>
        <g class="eyes-sparkle">
          <circle cx="62" cy="84" r="8.2" fill="${INK}"/><circle cx="98" cy="84" r="8.2" fill="${INK}"/>
          ${star(64.5, 81.5, 1.15)}${star(100.5, 81.5, 1.15)}
          <circle cx="59" cy="87.5" r="1.4" fill="#fff"/><circle cx="95" cy="87.5" r="1.4" fill="#fff"/>
        </g>
        <g class="eyes-dots">
          <circle cx="62" cy="85" r="3.2" fill="${INK}"/><circle cx="98" cy="85" r="3.2" fill="${INK}"/>
        </g>
        <g class="eyes-closed" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round">
          <path d="M55 85 Q62 79 69 85"/><path d="M91 85 Q98 79 105 85"/>
        </g>
      </g>
      <g class="m-cheeks" data-part="cheeks">
        <circle class="cheek" cx="50" cy="98" r="7" fill="#ff6f61"/><circle class="cheek" cx="110" cy="98" r="7" fill="#ff6f61"/>
      </g>
      <g data-part="mouth" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path class="mouth-smile" d="M72 100 Q80 108 88 100"/>
        <path class="mouth-small" d="M75 102 Q80 105 85 102"/>
        <path class="mouth-big" d="M67 97 Q80 116 93 97"/>
        <g class="mouth-open"><path d="M69 98 Q80 120 91 98 Z" fill="${INK}"/><ellipse cx="80" cy="110" rx="4.5" ry="2.6" fill="#ff6f61" stroke="none"/></g>
        <path class="mouth-wavy" d="M67 104 q3.5 -6 7 0 t7 0 t7 0"/>
      </g>
      <g class="m-extras m-shades" aria-hidden="true">
        <rect x="47" y="76" width="30" height="18" rx="7" fill="${INK}"/><rect x="83" y="76" width="30" height="18" rx="7" fill="${INK}"/>
        <path d="M77 82h6" stroke="${INK}" stroke-width="3"/>
        <path d="M52 80l8 0M88 80l8 0" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
      </g>
    </g>
    <g class="m-extras m-zzz" aria-hidden="true" fill="${INK}" font-family="inherit" font-weight="800">
      <text class="z z1" x="112" y="44" font-size="16">z</text>
      <text class="z z2" x="124" y="30" font-size="20">z</text>
      <text class="z z3" x="138" y="14" font-size="24">z</text>
    </g>`;

  function mount(svg) {
    svg.classList.add('mascot');
    svg.innerHTML = markup;
    setFace(svg, {});
    return svg;
  }

  /** eyes: round|sparkle|dots|closed · mouth: smile|small|big|open|wavy · cheeks: false|true (strong blush) */
  function setFace(svg, { eyes = 'round', mouth = 'smile', cheeks = false } = {}) {
    svg.dataset.eyes = eyes;
    svg.dataset.mouth = mouth;
    svg.classList.toggle('blush', cheeks);
  }

  return { mount, setFace };
})();
