# Tapomo animation lab

Fuente del artefacto publicado «Tapomo animation lab»: https://claude.ai/artifact/JLY76gXqwAkYdVufm1Ew3W

Es una copia autónoma para probar a Tapomo. Incluye:

- animaciones y caras;
- zonas de la barra, tanto las actuales como las propuestas, con el modo Supermochi;
- premios: skins y accesorios;
- propuestas de ropa y las reglas de ropa por categorías;
- propuesta del «Modo vergonzoso» (horario tranquilo), en `shy.js` y `shy.css`;
- demo de las manos de las lecciones (`hands.*`, con copias de `keyboard.*` de ui/) y la propuesta de manos en silueta (`hands2.*`);
- propuestas del popup de subida de nivel (`levelup.*`).

**No es código de la app:**

- `mascot.css`, `pet.js` e `i18n.js` pueden diferir de los de `ui/`.
- `rewards.js`, `zones.js`, `shy.*`, `hands.*`, `levelup.*` y `lab.js` existen solo aquí; `keyboard.*` son copias de ui/.
- Cuando se implemente la 0.3.2, los dibujos y las reglas se pasarán a `ui/` desde aquí.

**Para republicar:** publica `lab/index.html` como página, con el resto de archivos como `files`, en la misma URL.
