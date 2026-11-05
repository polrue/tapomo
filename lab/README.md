# Tapomo animation lab

Fuente del artefacto publicado «Tapomo animation lab»: https://claude.ai/artifact/JLY76gXqwAkYdVufm1Ew3W

Es una copia autónoma para probar a Tapomo: escenario fijo a la izquierda y panel a la derecha. El panel tiene tres partes, de arriba abajo:

1. **Pendiente de decidir** (ahora vacío: muestra «Nada pendiente»): un fieldset por estudio abierto, igual que los demás del lab, con un selector de variante A/B/C y sus controles. Se ven en el escenario con el Tapomo del lab y la ropa elegida en «Premios». Avisos y Actualización (ya en «Ya decidido») necesitan un escritorio: mientras se usan, el escenario muestra una maqueta (Bloc de notas, barra de tareas y el Tapomo de escritorio) y «Volver al escenario» lo devuelve. `estudios.*` tiene lo compartido.
   - «Después de actualizar» (`reinicio.*`, `#reinicio`): decidido 2026-11-06 (ya en «Ya decidido»): A · Estallido y D · ¡Pof! al azar cada vez (selector «Al azar» / A / D); B y C quitadas; solo el reflejo del brillo, sin dorado; la ropa se pone tras el estallido.
2. **Herramientas** (no son decisiones): premios (skins y accesorios), propuestas y reglas de ropa, reproducción, teclas, rachas, zonas de la barra (con Supermochi), ratón, cabecera y reacciones.
3. **Ya decidido** (al final del panel, plegado): solo la opción elegida de cada estudio cerrado, con una línea de lo decidido y la fecha.
   - «Modo vergonzoso» (`shy.*`, 2026-10-31): «Bajo tierra» + «Onda», «Sal un ratito» 2 min, «No dejarme salir» opcional y desmarcado;
   - manos de las lecciones (`hands.js` + `hands3.*`, 2026-10-31): «Ilustradas» con los dedos que se mueven (lab v29). Las siluetas (`hands2.*`) están aparcadas: el archivo sigue aquí pero ya no se enseña;
   - popup de subida de nivel (`levelup.*`, 2026-10-23): B con premio, C sin premio o sin foco, con la barra de XP de A y los rayos en los niveles 10, 25 y 50;
   - gafas + gafas de sol de racha (`gafas.*`, `#gafas-racha`, 2026-11-05): B · Pinza, con el selector de gafas;
   - «Modo repaso» (`repaso.*`, `#repaso`, 2026-11-05): A · Lupa de serie; B · Detective se desbloquea en el nivel 20 (premio de ese nivel) y desde ahí es el de serie, con la lupa elegible. C · Lápiz y libreta descartada;
   - avisos fuera de la app (`avisos.*`, `#avisos`, 2026-11-05): aprobado tal cual, ajuste «Automático (según el aviso)» por defecto + Cartel / Aviso / Tarjeta, con la tabla de reparto;
   - «Hay una actualización» (`actualiza.*`, `#actualizacion`, 2026-11-05): B · Paquetito, con GitHub / Store, menú y progreso. Lo que pasa al reiniciar es el estudio «Después de actualizar».

Las variantes descartadas ya no se pintan, pero sus archivos y su código siguen aquí. Excepción: el paquete y la tecla nueva de «Después de actualizar» se quitaron de `reinicio.js` al rehacerlo (están en la versión publicada v32 del lab).

**No es código de la app:**

- `mascot.css`, `pet.js` e `i18n.js` pueden diferir de los de `ui/`.
- `rewards.js`, `zones.js`, `shy.*`, `hands.*`, `levelup.*`, `estudios.*`, `repaso.*`, `gafas.*`, `avisos.*`, `actualiza.*`, `reinicio.*` y `lab.js` existen solo aquí; `keyboard.*` son copias de ui/.
- Cuando se implemente la 0.3.2, los dibujos y las reglas se pasarán a `ui/` desde aquí.

**Para republicar:** publica `lab/index.html` como página, con el resto de archivos como `files`, en la misma URL.
