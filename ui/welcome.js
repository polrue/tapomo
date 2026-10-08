// First-run welcome: a three-screen modal with a large Tapomo. `Welcome.open(onDone)` shows it
// (first launch, or again from the About card); `onDone` runs when it is finished or skipped.
// Esc and "Skip" count as finished. Reduced motion: no slides, no mascot loops.
const Welcome = (() => {
  const STEPS = 3;
  const SLIDE_PX = 28;
  let step = 0;
  let mounted = false;
  let opener = null;
  let onDone = () => {};
  let moodTimer = 0;

  const el = (id) => document.getElementById(id);

  /** Tapomo's mood on each screen: waving hello, thinking happily, then a proud hop. */
  function mood(n) {
    const svg = el('welcome-mascot');
    clearInterval(moodTimer);
    if (n === 0) Mascot.setFace(svg, { eyes: 'sparkle', mouth: 'big', cheeks: true });
    else if (n === 1) Mascot.setFace(svg, { eyes: 'round', mouth: 'smile' });
    else Mascot.setFace(svg, { eyes: 'star', mouth: 'big', cheeks: true });
    if (Mascot.reduced()) return;
    if (n === 0) {
      // No dedicated wave pose: a friendly tilt every couple of seconds does the job.
      Mascot.tilt(svg);
      moodTimer = setInterval(() => Mascot.tilt(svg), 1900);
    } else if (n === 1) {
      Mascot.jump(svg, { big: false });
    } else {
      Mascot.jump(svg, { big: true });
      Mascot.burstStars(svg);
    }
  }

  function paint() {
    el('welcome-title').textContent = t(`welcome.${step + 1}.title`);
    el('welcome-text').textContent = t(`welcome.${step + 1}.text`);
    el('welcome-step').textContent = t('welcome.step', { n: step + 1, total: STEPS });
    el('welcome-next').textContent = t(step === STEPS - 1 ? 'welcome.start' : 'welcome.next');
    el('welcome-back').hidden = step === 0;
    el('welcome-dots').querySelectorAll('i').forEach((d, i) => d.toggleAttribute('data-on', i === step));
    mood(step);
  }

  /** Slides the text out and the next one in; with reduced motion it simply swaps. */
  function go(n) {
    if (n < 0 || n >= STEPS || n === step) return;
    const dir = n > step ? 1 : -1;
    step = n;
    const body = el('welcome-body');
    body.getAnimations().forEach((a) => a.cancel());
    if (Mascot.reduced()) return paint();
    const out = body.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * SLIDE_PX}px)` }],
      { duration: 140, easing: 'ease-in', fill: 'forwards' }
    );
    out.finished.then(
      () => {
        paint();
        out.cancel();
        body.animate(
          [{ opacity: 0, transform: `translateX(${dir * SLIDE_PX}px)` }, { opacity: 1, transform: 'none' }],
          { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' }
        );
      },
      () => {} // interrupted by a newer go(): that call paints
    );
  }

  function close() {
    clearInterval(moodTimer);
    el('welcome').hidden = true;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    onDone();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowRight') {
      go(step + 1);
    } else if (e.key === 'ArrowLeft') {
      go(step - 1);
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const items = [el('welcome-skip'), ...(step > 0 ? [el('welcome-back')] : []), el('welcome-next')];
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    }
  }

  function open(done) {
    onDone = done || (() => {});
    opener = document.activeElement;
    if (!mounted) {
      mounted = true;
      Mascot.mount(el('welcome-mascot'));
      el('welcome').addEventListener('keydown', onKey);
      el('welcome-skip').addEventListener('click', close);
      el('welcome-back').addEventListener('click', () => go(step - 1));
      el('welcome-next').addEventListener('click', () => (step === STEPS - 1 ? close() : go(step + 1)));
    }
    step = 0;
    paint();
    el('welcome').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    el('welcome-next').focus();
  }

  return { open };
})();
