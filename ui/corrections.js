// «Teclas que más corriges»: the keys pressed right before a Backspace, last 30 days. Tapomo only keeps a
// per-day count per key, never what you type; the card is empty until some corrections were counted.
const Corrections = (() => {
  const $ = (id) => document.getElementById(id);
  async function refresh() {
    const card = $('corrections');
    if (typeof settings === 'undefined' || !settings || !settings.count_corrections) {
      card.hidden = true;
      return;
    }
    const layout = Lessons.layout();
    const rows = await invoke('top_corrected_keys', { days: 30, n: 5 });
    card.hidden = false;
    const ul = $('cr-keys');
    ul.replaceChildren();
    for (const r of rows) {
      const ch = Keyboard.charForVk(layout, r.vk);
      if (!ch) continue;
      const li = document.createElement('li');
      const cap = document.createElement('kbd');
      cap.textContent = ch.toUpperCase();
      const n = document.createElement('small');
      n.textContent = `× ${fmt(r.count)}`;
      li.append(cap, n);
      ul.append(li);
    }
    const any = ul.children.length > 0;
    $('cr-empty').hidden = any;
    $('cr-go').hidden = !any;
  }

  $('cr-go').addEventListener('click', () => Lessons.practiceNow().catch(showError));

  return { refresh };
})();
