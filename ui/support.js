// "Apoya a Tapomo" (0.7.0): a big, warm support card, a gentle invitation at happy moments (at most
// once a month, never while typing, always dismissible) and the supporter code ("código de mecenas"),
// which unlocks only cosmetic thanks. Nothing in Tapomo is ever locked behind a payment.
const Support = (() => {
  const KOFI = 'https://ko-fi.com/tapomo';
  const SPONSORS = 'https://github.com/sponsors/polrue';
  const ASK_EVERY_MS = 30 * 24 * 3600 * 1000;
  const KEY = 'tapomo.support.asked';
  const $ = (id) => document.getElementById(id);
  let supporter = false;

  async function refresh() {
    supporter = await invoke('get_supporter').catch(() => false);
    const was = window.Wardrobe && Wardrobe.unlocked(0).includes('mecenas');
    if (window.Wardrobe && Wardrobe.setSupporter) Wardrobe.setSupporter(supporter);
    if (supporter !== was) Progress.applyLook(); // the saved «Mecenas» skin can be worn now
    $('sp-thanks').hidden = !supporter;
    $('sp-ask').hidden = supporter;
  }

  async function redeem() {
    const code = $('sp-code').value.trim();
    if (!code) return;
    const n = await invoke('redeem_supporter', { code }).catch(() => null);
    const msg = $('sp-msg');
    msg.hidden = false;
    if (n == null) {
      msg.textContent = t('support.code_bad');
      return;
    }
    msg.textContent = t('support.code_ok');
    $('sp-code').value = '';
    await refresh();
    Progress.applyLook();
    Badges.refresh().catch(showError);
    Mascot.jump($('mascot'), { big: true });
  }

  function lastAsked() {
    try { return Number(localStorage.getItem(KEY)) || 0; } catch (_) { return Date.now(); }
  }

  /**
   * A happy moment (a level reward, a three-star lesson): maybe invite, gently. Never to supporters,
   * never in the first week of use, at most once a month.
   */
  function happyMoment(daysUsed) {
    if (supporter || daysUsed < 7 || Date.now() - lastAsked() < ASK_EVERY_MS) return;
    if (['level-dialog', 'badge-dialog', 'league-dialog', 'welcome', 'update-dialog'].some((id) => !$(id).hidden)) return;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (_) { /* optional */ }
    const close = () => {
      $('support-dialog').hidden = true;
      document.querySelectorAll('.top, main').forEach((n) => (n.inert = false));
    };
    $('spd-later').onclick = close;
    $('spd-have').onclick = () => { close(); openCard(); };
    $('spd-go').onclick = close; // the link opens Ko-fi; the dialog just closes
    $('support-dialog').onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    $('support-dialog').hidden = false;
    document.querySelectorAll('.top, main').forEach((n) => (n.inert = true));
    $('spd-go').focus();
  }

  function openCard() {
    const card = $('support');
    card.scrollIntoView({ behavior: Mascot.reduced() ? 'auto' : 'smooth', block: 'center' });
    $('sp-code').focus({ preventScroll: true });
  }

  function bind() {
    for (const id of ['sp-kofi', 'spd-go']) $(id).href = KOFI;
    $('sp-sponsors').href = SPONSORS;
    $('sp-redeem').addEventListener('click', () => redeem().catch(showError));
    $('sp-code').addEventListener('keydown', (e) => e.key === 'Enter' && redeem().catch(showError));
    // The mascot in the card holds a heart.
    const svg = $('sp-mascot');
    if (svg && !svg.childElementCount) Mascot.mount(svg);
  }

  return { bind, refresh, happyMoment, isSupporter: () => supporter };
})();
