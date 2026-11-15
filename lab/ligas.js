// Lab only: «Ligas en Hoy» study (2026-11-15). Pol approved moving «Ligas con amigos» (today a folded card at the
// bottom of «Mi Tapomo») INTO the «Liga» card of «Hoy» (the league with yourself). Up to 5 friend leagues, each with
// its own nickname. Three states of the merged card, stacked/side by side: sin ligas, una liga, tres ligas (+ 5/5).
// All fake data, no network. The mock uses the app's tokens (ui/style.css + league.css); no mascot is drawn.
(() => {
  const E = window.Estudios;
  if (!E) return;
  const { el, btn, seg } = E;
  const MAX = 5;
  const opts = { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
  const apps = [];

  const ownPart = () => {
    const c = el('div', 'lgl-own');
    const em = el('div', 'lgl-emblem', '🥉');
    em.setAttribute('aria-hidden', 'true');
    const b = el('div', 'lgl-body');
    const h = el('div', 'lgl-head');
    h.append(el('h4', 'lgl-name', 'Liga Bronce'), el('span', 'lgl-days', 'Quedan 4 días'));
    const bar = el('div', 'lgl-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', '62');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.append(el('i'));
    b.append(h, el('p', 'lgl-text', '1.240 XP esta semana · 760 más para subir a Plata'), bar);
    c.append(em, b);
    return c;
  };
  const field = (label, ph, max) => {
    const l = el('label');
    const i = el('input');
    i.maxLength = max;
    i.placeholder = ph;
    i.autocomplete = 'off';
    l.append(label, i);
    return l;
  };
  const forms = () => {
    const w = el('div', 'lgl-forms');
    const f1 = el('div', 'lgl-form');
    f1.append(field('Tu apodo', 'Pol', 24), field('Nombre de la liga', 'Trabajo', 40), btn('Crear', 'lgl-btn'));
    const f2 = el('div', 'lgl-form');
    f2.append(field('Código', 'K7M2QX9P', 8), field('Tu apodo', 'Pol', 24), btn('Unirme', 'lgl-btn'));
    f1.hidden = f2.hidden = true;
    w.hidden = true;
    w.append(f1, f2);
    const show = (which) => {
      w.hidden = false;
      f1.hidden = which !== 'crear';
      f2.hidden = which !== 'unirme';
      (which === 'crear' ? f1 : f2).querySelector('input').focus();
    };
    return { w, show };
  };
  const table = (rows) => {
    const ol = el('ol', 'lgl-list');
    rows.forEach(([p, n, xp, me]) => {
      const li = el('li', me ? 'me' : '');
      const x = el('span', 'lgl-xp', `${xp} XP`);
      li.append(el('span', 'lgl-pos', `${p}.º`), el('span', 'lgl-who', n), x);
      if (me) { const u = el('span', 'lgl-up', '↑'); u.setAttribute('aria-label', 'has subido'); li.append(u); }
      ol.append(li);
    });
    return ol;
  };
  const full = [[1, 'Ana', '1.510'], [2, 'Marta', '1.340'], [3, 'Tú', '1.240', 1], [4, 'Jordi', '1.180'], [5, 'Lucía', '960'], [6, 'Pau', '720']];
  const near = full.slice(1, 4);
  const copyBtn = () => {
    const c = btn('Copiar', 'lgl-btn pill ghost');
    c.addEventListener('click', () => { c.textContent = '¡Copiado!'; setTimeout(() => { c.textContent = 'Copiar'; }, 1400); });
    return c;
  };
  /** Code line + leave button; leaving asks nothing in the mock (a real one would confirm). */
  const extras = (onLeave) => {
    const code = el('p', 'lgl-hint');
    code.append('Código para invitar: ', el('strong', 'lgl-code', 'K7M2QX9P'), copyBtn());
    const leave = btn('Salir de la liga', 'lgl-btn ghost');
    leave.style.justifySelf = 'start';
    leave.addEventListener('click', onLeave);
    return [code, leave];
  };
  const addLine = (count, onClick) => {
    const w = el('div', 'lgl-league');
    const full5 = count >= MAX;
    const b = btn(`+ Crear o unirme (${count}/${MAX})`, 'lgl-link');
    b.disabled = full5;
    if (full5) { b.style.opacity = '.5'; b.style.cursor = 'not-allowed'; b.setAttribute('aria-describedby', 'lgl-max'); }
    const f = forms();
    const pick = el('div', 'lgl-invite');
    pick.hidden = true;
    const c1 = btn('Crear liga', 'lgl-btn'), c2 = btn('Tengo un código', 'lgl-btn ghost');
    c1.addEventListener('click', () => f.show('crear'));
    c2.addEventListener('click', () => f.show('unirme'));
    pick.append(c1, c2);
    b.addEventListener('click', () => { pick.hidden = !pick.hidden; if (pick.hidden) f.w.hidden = true; });
    w.append(b);
    if (full5) { const n = el('p', 'lgl-note', 'Máximo 5 ligas'); n.id = 'lgl-max'; w.append(n); }
    w.append(pick, f.w);
    return w;
  };

  const card = (caption, build) => {
    const col = el('div');
    col.append(el('p', 'lgl-cap', caption));
    const c = el('section', 'lgl-card');
    c.setAttribute('aria-label', 'Liga');
    c.append(ownPart());
    const fr = el('div', 'lgl-friends');
    build(fr);
    c.append(fr);
    col.append(c);
    return col;
  };

  // 1 · sin ligas
  const sin = () => card('1 · Sin ligas', (fr) => {
    const inv = el('div', 'lgl-invite');
    const c1 = btn('Crear liga', 'lgl-btn'), c2 = btn('Tengo un código', 'lgl-btn ghost');
    inv.append(el('strong', '', '🏆 Compite con amigos'), c1, c2);
    const f = forms();
    c1.addEventListener('click', () => f.show('crear'));
    c2.addEventListener('click', () => f.show('unirme'));
    fr.append(inv, f.w);
  });

  // 2 · una liga
  const una = () => card('2 · Una liga', (fr) => {
    const name = el('h4', 'lgl-lname', '🏆 Trabajo · 3.º de 6');
    const t = table(near);
    const more = el('div', 'lgl-more');
    more.hidden = true;
    const rest = table(full);
    const ex = extras(() => { fr.replaceChildren(el('p', 'lgl-note', 'Has salido de «Trabajo» (maqueta: pulsa «Ver otra vez»).')); });
    more.append(rest, ...ex);
    const tog = btn('Ver todo', 'lgl-link');
    tog.setAttribute('aria-expanded', 'false');
    tog.addEventListener('click', () => {
      const o = more.hidden;
      more.hidden = !o;
      t.hidden = o;
      tog.textContent = o ? 'Ver menos' : 'Ver todo';
      tog.setAttribute('aria-expanded', String(o));
    });
    fr.append(name, t, tog, more, addLine(1));
  });

  // 3 · tres ligas (+ variant at 5/5)
  const LEAGUES = [
    ['Cole', '3.º de 12', 'up', [[1, 'Nuria', '1.620'], [2, 'Álex', '1.390'], [3, 'Tú', '1.240', 1], [4, 'Sara', '1.100']]],
    ['Trabajo', '3.º de 6', 'up', full],
    ['Extraescolar', '2.º de 5', '', [[1, 'Biel', '1.300'], [2, 'Tú', '1.240', 1], [3, 'Ona', '900']]],
    ['Familia', '1.º de 4', 'up', [[1, 'Tú', '1.240', 1], [2, 'Mamá', '980'], [3, 'Abu', '420']]],
    ['Bici', '5.º de 8', '', [[4, 'Rubén', '1.310'], [5, 'Tú', '1.240', 1], [6, 'Eli', '300']]],
  ];
  const varias = (n, caption) => card(caption, (fr) => {
    const list = el('div', 'lgl-league');
    LEAGUES.slice(0, n).forEach(([nm, pos, up, rows]) => {
      const row = btn('', 'lgl-row');
      row.append(`🏆 ${nm} · ${pos}`);
      if (up) row.append(el('span', 'lgl-up', '↑'));
      row.append(el('span', 'lgl-chev', '›'));
      row.setAttribute('aria-expanded', 'false');
      const p = el('div', 'lgl-panel');
      p.hidden = true;
      p.append(table(rows), ...extras(() => { row.remove(); p.remove(); }));
      row.addEventListener('click', () => {
        const o = p.hidden;
        p.hidden = !o;
        row.setAttribute('aria-expanded', String(o));
      });
      list.append(row, p);
    });
    fr.append(list, addLine(n));
  });

  let host;
  const render = () => {
    host.replaceChildren();
    apps.length = 0;
    const g = el('div', 'lgl-grid');
    g.append(sin(), una(), varias(3, '3 · Tres ligas'), varias(MAX, '3b · Cinco ligas (máximo)'));
    host.append(g);
    host.dataset.theme = opts.theme;
  };

  const { body } = E.add('ligas', 'Ligas en Hoy');
  body.append(el('p', 'note', '«Ligas con amigos» sale del fondo de «Mi Tapomo» y entra en la tarjeta «Liga» de «Hoy» (la liga contigo mismo). Hasta 5 ligas, cada una con su apodo. Maqueta con los estilos de la app; todo es de mentira y los botones se pueden pulsar. Se ven los tres estados (más el de 5/5) a la vez.'));
  host = el('div', 'lgl-app');
  const ts = seg('Tema', [['light', 'Claro'], ['dark', 'Oscuro']], () => opts.theme, (v) => { opts.theme = v; host.dataset.theme = v; });
  const again = btn('Reiniciar la maqueta', '');
  again.addEventListener('click', render);
  const bs = el('div', 'btns');
  bs.append(again);
  body.append(ts.box, bs, host, el('p', 'rw-sub', 'Propuesto'), E.list([
    'Sin ligas: una sola línea invitadora con «Crear liga» y «Tengo un código»; cada botón despliega su formulario en la misma tarjeta.',
    'Una liga: se ven las filas de alrededor (una arriba y una abajo de ti); «Ver todo» abre la tabla entera, el código para invitar y «Salir de la liga».',
    'Varias ligas: filas compactas «🏆 Cole · 3.º de 12 ↑» que se despliegan una a una. Con 5/5 la línea de añadir queda desactivada con «Máximo 5 ligas».',
  ]));
  render();
  window.LigasLab = { render, opts };
})();
