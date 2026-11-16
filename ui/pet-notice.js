// «Hay una versión nueva» on the floating Tapomo (lab: «Hay una actualización», B · Paquetito).
// The app found a newer version: Tapomo holds a small parcel with a red ribbon (floating mittens, never
// arms) and shakes it now and then. It says it ONCE in a bubble; after that only the parcel stays. It lets go
// of it while the user types and takes it again in the pauses. The right-click menu (pet.rs) carries
// «Actualizar a la versión X»; the download shows as a bar under Tapomo, where the pace bar lives.
//
// Rust drives it with `tapomo://update-state` ({ state, version }: available | none | downloading |
// installing | failed) and `tapomo://update-progress` ({ downloaded, total }).
const PetNotice = (() => {
  const INK = '#23202b';
  const NS = 'http://www.w3.org/2000/svg';
  const SAID_KEY = 'tapomo.update.said'; // the version Tapomo already announced
  const SHAKE_EVERY_MS = 4500;
  const LET_GO_MS = 2500; // the parcel comes back this long after the last key
  const SAY_MS = 5500;
  const FAILED_MS = 4000;
  const SAY_RETRY_MS = 15000;
  // A parcel held in front of the belly, with two mittens (same drawing as the lab's variant B).
  const PARCEL = `<g class="pk-parcel" stroke-linejoin="round">
      <rect x="61" y="110" width="38" height="28" rx="4" fill="#d9a86c" stroke="${INK}" stroke-width="2.2"/>
      <path d="M61 121 H99" stroke="#e8384f" stroke-width="4"/><path d="M80 110 V138" stroke="#e8384f" stroke-width="4"/>
      <path d="M80 110 Q70 100 66.5 105 Q67 111 80 110 Q90 100 93.5 105 Q93 111 80 110 Z" fill="#ff5a6e" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="80" cy="110" r="2.6" fill="#e8384f" stroke="${INK}" stroke-width="1.4"/>
      <path d="M65 114 Q66 112.5 68 112.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
      <path d="M86 129 h8 M86 133 h5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity=".35"/>
      <circle class="pk-mitt" cx="59" cy="128" r="6" fill="#ff9e7a" stroke="${INK}" stroke-width="2.2"/>
      <circle class="pk-mitt" cx="101" cy="128" r="6" fill="#ff9e7a" stroke="${INK}" stroke-width="2.2"/>
    </g>`;

  let ctx = null; // { svg, pet, say(text, ms), canSpeak() }
  let version = null; // the newer version, or null
  let node = null; // the overlay <g>
  let prog = null; // { box, bar, text }
  let busy = false; // downloading / installing
  let shakeTimer = 0;
  let letGoTimer = 0;
  let sayTimer = 0;
  let failedTimer = 0;

  const reduced = () => typeof Mascot !== 'undefined' && Mascot.reduced();
  const bodyFill = () => {
    const base = ctx.svg.querySelector('.rw-skin-base') || ctx.svg.querySelector('.mascot-body rect');
    return (base && base.getAttribute('fill')) || '#ff9e7a';
  };
  const paintMittens = () => node && node.querySelectorAll('.pk-mitt').forEach((c) => c.setAttribute('fill', bodyFill()));

  function ensureNode() {
    if (node && node.isConnected) return node;
    const body = ctx.svg.querySelector('.mascot-body');
    if (!body) return null;
    node = document.createElementNS(NS, 'g');
    node.setAttribute('class', 'pk-ov');
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = PARCEL;
    body.append(node); // inside the body: it hops and squishes with Tapomo
    paintMittens();
    return node;
  }

  function shake() {
    if (!node || busy || reduced() || node.classList.contains('away') || ctx.pet.classList.contains('under')) return;
    paintMittens();
    const p = node.querySelector('.pk-parcel');
    if (p) p.animate([{ transform: 'none' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(4deg)' }, { transform: 'none' }], { duration: 620, easing: 'ease-in-out' });
  }

  function showParcel() {
    if (!ensureNode()) return;
    paintMittens();
    // One frame after insertion so the entrance transition runs.
    requestAnimationFrame(() => node && node.classList.add('on'));
    clearInterval(shakeTimer);
    shakeTimer = setInterval(shake, SHAKE_EVERY_MS);
    setTimeout(shake, 900);
  }

  function hideParcel() {
    clearInterval(shakeTimer);
    if (node) node.classList.remove('on');
  }

  /** Says it once per version, when Tapomo is on screen and awake with nothing else to say. */
  function maybeSay() {
    if (!version || !ctx.canSpeak()) return;
    let said = null;
    try { said = localStorage.getItem(SAID_KEY); } catch (_) { /* optional */ }
    if (said === version) return;
    try { localStorage.setItem(SAID_KEY, version); } catch (_) { /* optional */ }
    ctx.say(t('pet.update.found'), SAY_MS);
  }

  // ------------------------------------------------------------- download bar

  function showProgress(text, striped) {
    if (!prog) {
      const box = document.createElement('div');
      box.className = 'pk-prog';
      box.setAttribute('role', 'status');
      const bar = document.createElement('div');
      bar.className = 'pk-bar';
      const fill = document.createElement('i');
      bar.append(fill);
      const label = document.createElement('span');
      box.append(bar, label);
      ctx.pet.append(box);
      prog = { box, fill, label };
    }
    prog.label.textContent = text;
    prog.box.classList.toggle('installing', !!striped);
    if (striped) prog.fill.style.width = '100%';
    ctx.pet.classList.add('upd-busy');
    if (node) node.classList.add('busy');
  }

  function clearProgress() {
    busy = false;
    if (prog) prog.box.remove();
    prog = null;
    ctx.pet.classList.remove('upd-busy');
    if (node) node.classList.remove('busy');
  }

  function onProgress(p) {
    if (!busy || !p) return;
    const pct = p.total ? Math.max(0, Math.min(100, Math.round((p.downloaded / p.total) * 100))) : null;
    if (pct === null) return showProgress(t('update.downloading_plain'), false);
    showProgress(pct >= 100 ? t('update.installing') : t('update.downloading', { p: pct }), pct >= 100);
    if (pct < 100) prog.fill.style.width = `${pct}%`;
  }

  /** `tapomo://update-state` from Rust. */
  function onState(msg) {
    if (!ctx || !msg) return;
    clearTimeout(failedTimer);
    switch (msg.state) {
      case 'available':
        version = msg.version || version;
        if (!busy) clearProgress(); // a check finishing mid-download must not wipe the progress bar
        if (version) {
          showParcel();
          maybeSay();
        }
        break;
      case 'none':
        version = null;
        if (busy) break;
        clearProgress();
        hideParcel();
        break;
      case 'downloading':
        busy = true;
        showParcel();
        showProgress(t('update.downloading_plain'), false);
        if (prog) prog.fill.style.width = '0%';
        break;
      case 'installing':
        busy = true;
        showProgress(t('update.installing'), true);
        break;
      case 'failed':
        clearProgress();
        ctx.say(t('pet.update.failed'), FAILED_MS);
        break;
      default:
    }
  }

  return {
    /** `deps`: { svg, pet, say(text, ms), canSpeak() }. Asks Rust for what it already knows. */
    init(deps) {
      ctx = deps;
      clearInterval(sayTimer);
      sayTimer = setInterval(maybeSay, SAY_RETRY_MS);
      return invoke('pet_update_notice').then((v) => v && onState({ state: 'available', version: v })).catch(() => {});
    },
    onState,
    onProgress,
    maybeSay,
    /** A key was pressed: Tapomo puts the parcel down, and takes it again in the next pause. */
    typing() {
      if (!node || !version) return;
      node.classList.add('away');
      clearTimeout(letGoTimer);
      letGoTimer = setTimeout(() => node && node.classList.remove('away'), LET_GO_MS);
    },
  };
})();
