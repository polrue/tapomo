# Plan de desarrollo de Tapomo

Plan acordado el 11-10-2026. Se avanza poco a poco: cada bloque es una versión pequeña que se puede probar sola. Lo que sea fácil se adelanta.

Reglas que valen para todo el plan:

- **Siempre en positivo.** Tapomo nunca regaña, nunca enseña que vas «peor» y nunca te baja de nivel. Si un dato no es favorable, se muestra tu progreso en su lugar.
- **Privacidad.** De la escritura normal nunca se guarda qué escribes ni qué tecla pulsas. Los campos de contraseña no se miden. Del ordenador solo salen resúmenes, y solo si el usuario lo activa.
- **Atajos (decidido 13-10-2026).** Se cuentan combinaciones Ctrl/Win/Alt + tecla (AltGr no, Shift + letra no). Solo se guardan contadores diarios de los atajos que están en el **catálogo cerrado** de Tapomo; cualquier otra combinación suma a «otros» sin registrar cuál fue. Los atajos marcados como **sensibles** (p. ej. `Ctrl+Mayús+N`, ventana de incógnito) nunca se registran: cuentan como «otros». Nunca letras sueltas. Se puede desactivar.
- **Gratis.** Nada de esto debe costar dinero mantener más allá del dominio. Las donaciones son voluntarias.
- **Nada de ranking mundial abierto.** Se puede falsear (el código es abierto y la medición es local), compara cosas que no son comparables (programar no es chatear) y haría que casi todos se vieran abajo. La competición es **contigo mismo** y **entre amigos**.

## Estado

| Versión | Contenido | Estado |
|---|---|---|
| 0.1 | Medición pasiva por ráfagas, estadísticas, calendario, apps | Hecho |
| 0.2 | Barra de velocidad personal, Tapomo flotante, caras de racha, estrellitas, bienvenida, instalador con Tapomo, aviso de versión nueva | Hecho |
| 0.3 | Gamificación personal: objetivo diario, días seguidos, actualizador automático, XP y niveles, insignias, liga contigo mismo, carta semanal, contador de atajos | En curso (hechas: 0.3.0 objetivo diario y días seguidos; 0.3.1 actualizador y caracteres por minuto; 0.3.2 XP, niveles, retos, armario y zonas nuevas; 0.3.3 insignias; 0.3.4 liga contigo mismo; 0.3.5 carta semanal; 0.3.6 atajos por tipos) |
| 0.4 | Lecciones de mecanografía (ES + US) y entrenador de atajos | Pendiente |
| 0.5 | Web tapomo.app, estadísticas anónimas opcionales, ligas entre amigos | Pendiente |
| Más tarde | Cifrado de la base de datos, más idiomas | Pendiente |
| Aparte | Firma de código (SignPath), web tapomo.app, Microsoft Store y winget. Ver [`distribution.md`](distribution.md) | En curso |

---

## 0.3 — Gamificación personal

Todo es local, sin servidor. Se calcula a partir de las ráfagas que ya se guardan.

### 0.3.0 Objetivo diario y días seguidos *(fácil, se adelanta)*

- **Objetivo diario** en minutos activos escribiendo. Opciones: 10, 20 (por defecto) o 30 minutos, o desactivado. Se usan minutos y no caracteres porque es justo para quien escribe despacio.
- **Anillo de progreso** en la pestaña Hoy («12 de 20 min»). Al cumplirlo, Tapomo lo celebra con estrellitas grandes y un globo («¡Objetivo cumplido!»).
- **Días seguidos**: días consecutivos cumpliendo el objetivo. Se ve junto al anillo, con una llamita.
- **Comodín**: un día sin cumplir por semana no rompe la racha; se gasta solo y se avisa en positivo («Tapomo te guardó la racha»). Los fines de semana no son obligatorios si el usuario lo marca.
- Datos: sin tabla nueva; los minutos activos de cada día se suman de `bursts` (`end_ms - start_ms`, por día local de inicio). Ajustes `daily_goal_min` y `weekend_rest`. Cálculo puro en `tapomo-core::goal_status`; evento `tapomo://goal` una vez al día.
- Frases nuevas para el globo de Tapomo (`pet_tip.rs`): «Te faltan 5 minutos para tu objetivo», «Llevas 6 días seguidos».

### 0.3.1 Actualizador automático y caracteres por minuto *(decidido 13-10-2026)*

- **Actualizador** con `tauri-plugin-updater`:
  - **Tapomo pregunta antes de actualizar** («Hay una versión nueva. ¿Actualizar ahora?»).
  - Ajuste opcional **«Actualizar automáticamente»**.
  - Las actualizaciones están firmadas con una clave propia. La clave privada solo vive en un secreto de GitHub, y Pol guarda una copia de seguridad.
  - El flujo de publicación genera `latest.json`, y las versiones se publican como normales, no prerelease.
  - **La 0.3.1 se instala a mano por última vez.** A partir de ella, Tapomo se actualiza solo.
- **Caracteres por minuto (cpm).**
  - Se muestran junto a las ppm.
  - Públicamente se llaman «caracteres por minuto», nunca «pulsaciones por minuto», para no confundirlas con las palabras por minuto.
  - El glosario explica que **es lo mismo que las pulsaciones por minuto** de las academias, la medida más usada en España.

### 0.3.2 XP, niveles, retos del día, armario y zonas nuevas *(hecho, 15-10-2026)*

- Diseño completo en [`xp.md`](xp.md): fuentes de XP con topes diarios, curva `47 × (n − 1)^1.8`, retos del día calibrados con tus 14 días anteriores, XP retroactiva del historial.
- Cada 3 niveles, un pack de dos premios para Tapomo (16 niveles con premio, 31 premios). Se eligen en el **armario**, con estilo llamativo o sutil.
- La barra de velocidad pasa a 6 zonas (Calentando <40, Cogiendo ritmo 40–60, Buen ritmo 60–80, ¡En racha! 80–95, ¡Superándote! 95–108, ¡Modo Supermochi! ≥108 %), con líneas de velocidad. El Supermochi dura al menos 35 s y mientras dura Tapomo no dice «¡ups!».
- Datos: tabla `xp_events(ts, day, kind, amount)`, una fila por día y tipo de premio; sin texto ni teclas.

### 0.3.3 Insignias *(hecho, 15-10-2026)*

- Implementadas 18 (las de atajos llegan con la 0.3.6). Catálogo y reglas en `crates/tapomo-core/src/badges.rs`; tabla `badges(id, ts, retro, seen)`; XP una sola vez por rareza (25/50/100). Las ganadas con el historial se revelan juntas.

Se calculan con datos locales. Primera tanda (unas 15):

- Primera ráfaga · 100 ráfagas · 1.000 ráfagas
- 1.000 caracteres sin borrar · 5.000 sin borrar
- 10.000 caracteres en un día
- Primer récord batido · ¡Superándote! (zona dorada, 95–108 %) 5 veces
- 7 días seguidos · 30 días seguidos
- Madrugador (escribir antes de las 8) · Búho (después de las 23)
- Una semana entera con objetivo cumplido
- Coronado (llegar a la cara de corona)

Pantalla de insignias con las conseguidas en color y las pendientes en silueta suave con una pista amable («Escribe 1.000 caracteres sin borrar»). Nunca un «0 de 15» frío: se muestra lo conseguido.

### 0.3.4 Liga contigo mismo *(hecho, 15-10-2026)*

- Implementada en `crates/tapomo-core/src/league.rs` y `src-tauri/src/league.rs`, sin tabla nueva: se recalcula con `xp_events`. No cuentan la XP del historial ni la de las insignias. La primera semana marca el ritmo y no sube; las semanas vacías cuentan como 0.

- Cada semana (lunes a domingo) cuenta tu XP semanal.
- Ligas: Bronce → Plata → Oro → Diamante → Mochi legendario.
- **Subes** si tu XP de la semana supera la media de tus 4 semanas anteriores. **Nunca bajas**: como mucho «te mantienes».
- El lunes, Tapomo anuncia el resultado con animación (subida = estrellitas y corona; mantener = «¡Buena semana, sigues en Oro!»).

### 0.3.5 Carta semanal *(hecho, 15-10-2026)*

- Va dentro del aviso del lunes de la liga y se puede reabrir desde su tarjeta. Datos en `src-tauri/src/weekly.rs`; solo se muestran los datos que no son cero.

- Cada lunes, una tarjeta con lo mejor de la semana: hora más rápida, récord, días cumplidos, app donde más escribiste, insignias nuevas. Solo hechos positivos.

### 0.3.6 Atajos: contar por tipos (Fase A) *(hecho, 15-10-2026)*

- La clasificación se hace dentro del gancho (es un `match` instantáneo, `tapomo-core::shortcuts::classify`), así que la tecla no sale nunca de ahí: aún más privado que hacerlo en el hilo de trabajo. Tabla `shortcut_days(day, kind, count)`. Reto «Usa N atajos» solo para quien ya usa 5 o más al día.

- Cinco contadores por día: copiar/pegar/cortar, deshacer/rehacer, guardar, ventanas y escritorio (`Alt+Tab`, `Win+…`), otros. Sin catálogo todavía y sin guardar la tecla.
- Clasificación en el hilo de trabajo (no en el hook, que debe responder rápido); la combinación solo vive en memoria un instante.
- Tarjeta «Atajos hoy» y elogios de Tapomo («Hoy has usado 50 atajos, ¡eres rápido de verdad!»).
- XP por atajos con **tope diario** (no se puede farmear con `Ctrl+C` en bucle).
- Ajuste «Contar atajos» (activado por defecto) y texto de privacidad actualizado en la app y el README.
- Insignias: «Maestro de atajos» (1.000), «Ni tocas el ratón» (100 en un día).

### Ver tus récords *(idea de Pol, 13-10-2026)*

- Que se pueda ver **cuál fue** la mejor racha o el récord, no solo la cifra.
- Del texto no hay nada que enseñar, porque nunca se guarda. Pero sí hay contexto: el día y la hora, la app, cuánto duró, la velocidad y equivalencias («unas 3 páginas de libro sin borrar»).
- Sugerencias para hacerlo entretenido, en el chat del 13-10-2026; queda pendiente elegir:
  - un sobre que se revela con un clic;
  - una tarjeta de récord;
  - Tapomo que lo cuenta.

### Criterios para cerrar la 0.3

- Usuarios existentes: el historial cuenta (se calcula XP retroactiva de las ráfagas ya guardadas, sin inflar).
- Todo funciona sin conexión.
- Nada sale del ordenador.

---

## 0.4 — Lecciones de mecanografía

Lo que hace único a Tapomo: puede decir «desde que empezaste las lecciones tu velocidad **real** ha pasado de 52 a 61 ppm», porque mide la escritura del día a día.

### Distribuciones

- Español (ISO, con ñ, acentos con tecla muerta, ¿¡) y EE. UU. al principio.
- Teclado en pantalla dibujado en SVG, con un color por dedo y la siguiente tecla iluminada.

### Recorrido

1. Fila central: `asdf jklñ` (ES) / `asdf jkl;` (US)
2. Fila superior
3. Fila inferior
4. Mayúsculas con Shift (la mano contraria)
5. Números
6. Puntuación
7. Acentos, ñ, ü, ¿¡ (solo ES), donde las webs en inglés fallan
8. Palabras frecuentes
9. Frases reales cortas

Cada unidad tiene 3–5 lecciones de unos 5 minutos: primero ejercicios con las letras nuevas, luego palabras reales que solo usan letras ya aprendidas, luego frases.

### Cómo funciona una lección

- Texto en pantalla con cursor; la letra fallada se marca suave, sin sonidos de error.
- **Estrellas**: 1 estrella al terminar, 2 con 95 % de precisión, 3 con 98 % y ritmo ≥ tu objetivo de la lección. Nunca se suspende: «repite para más estrellas».
- Tapomo hace de entrenador: se concentra mientras escribes, celebra al terminar, frases de ánimo.
- XP por lección y por estrellas nuevas; cuenta para el objetivo diario si el usuario lo elige.

### Datos y privacidad

- En las lecciones el texto es **nuestro**, así que sí se puede guardar qué tecla se falla, sin romper la regla de privacidad de la escritura normal.
- Tablas: `lesson_results(lesson_id, ts, wpm, accuracy, stars)` y `key_stats(layout, key, hits, misses, avg_ms)` solo con datos de lecciones.
- Las pulsaciones dentro de la ventana de lecciones **no** cuentan en las estadísticas pasivas (se excluye la propia ventana de Tapomo).

### Práctica a medida

- Después de unas lecciones, «Práctica de tus teclas difíciles»: ejercicios generados con las teclas de más errores o más lentas (estilo keybr).
- Esto sustituye a los **bigramas pasivos**, que quedan **aparcados**: dan la misma información sin mirar la escritura real.

### Entrenador de atajos (Fase B)

- **Catálogo v1** (~30 atajos), archivo de datos abierto en el repositorio (`data/shortcuts.json`), con nivel básico / medio / avanzado:
  - Windows: `Win+E`, `Win+D`, `Win+V` (historial del portapapeles), `Win+Mayús+S`, `Alt+Tab`, `Win+←/→`, `Win+L`.
  - Edición universal: `Ctrl+Z/Y/A/F/C/V/X/S`.
  - Navegadores (Chrome, Edge, Firefox, Brave, Opera): `Ctrl+T/W`, `Ctrl+Mayús+T`, `Ctrl+L`, `Ctrl+Tab`, `Ctrl+F`.
- Formato de cada entrada: `id`, `apps` (`*` o lista de exe), combinación en teclas virtuales (VK, así funciona en AZERTY/QWERTZ), `category`, `level`, `sensitive`, `tip` ES/EN y **excepciones por idioma** (`overrides: { "es": … }`, p. ej. Word en español: Guardar `Ctrl+G`, Negrita `Ctrl+N`).
- **Idioma del programa**: por defecto el de Windows; ajustable; y Tapomo lo deduce por uso (si en Word usas `Ctrl+G` y nunca `Ctrl+S`, tu Word está en español).
- **Consejo del día** según el programa en primer plano: como mucho 1 al día, en una pausa (nunca a mitad de ráfaga), con botón «Ya lo sé» y opción de desactivar. Se basa en ausencia («2 h en Chrome sin atajos de pestañas»), nunca en espiar el ratón; siempre en tono de curiosidad.
- **Se adapta a tu nivel**: si ya usas muchos atajos de un tipo, no te enseña lo básico de ese tipo.
- **Álbum de atajos aprendidos**: un atajo sugerido que empiezas a usar en los días siguientes se celebra («¡Ya usas Ctrl+Mayús+T!») y da XP; repetirlo no.
- Unidad de atajos en las lecciones para practicarlos.

### Contenido

- Listas de palabras frecuentes ES/EN con licencia compatible con GPL (revisar fuente y licencia antes de incluirla) o generadas a partir de textos de dominio público.
- Frases escritas por nosotros.

---

## Web tapomo.app (pista aparte, no depende de ninguna versión)

Idea de Pol, 13-10-2026. Es una página estática y divertida, llena de animaciones (sobre todo de Tapomo), con un estilo limpio tipo Apple: mucho blanco, tipografía grande y una idea por pantalla. También es la página de descarga y de privacidad que exigen SignPath y la Store.

- **Primera visita: el origen de Tapomo.** Una animación corta (5–8 s) que se puede saltar y cuenta cómo nació Tapomo. Ideas a elegir:
  - **Mochitsuki** (**elegida por Pol**, 13-10-2026): granos de arroz que se machacan a golpe de teclas, «tap, tap, tap», hasta formar una bola de mochi que cae en el hueco vacío de un teclado y se convierte en tecla. Le salen los ojos y parpadea. Une el mochi con el teclear, que es todo el concepto.
  - **Huevo-tecla:** en un teclado hay una tecla con forma de huevo; un dedo la pulsa varias veces, se agrieta y sale Tapomo.
  - **Meteorito:** una tecla brillante cae del cielo estrellado sobre un teclado, deja un cráter y de él asoma Tapomo.
- **Visitas siguientes:** una entrada rápida (~1 s). Tapomo entra botando, saluda («¡Hola otra vez!») y aparece la página.
- **Tapomo viaja con el scroll** a lo largo de un camino y reacciona en cada sección:
  - teclea a toda velocidad en «qué mide»;
  - se tapa los ojos o se pone gafas de sol en «privacidad»;
  - enseña el anillo del objetivo en «hábitos»;
  - lo celebra junto al botón de descarga.
- **Secciones:** portada con descarga, qué mide, privacidad, hábitos y logros, código abierto con la política de firma, preguntas frecuentes y pie con la política de privacidad.
- **Técnica:**
  - HTML, CSS y JS estáticos, sin frameworks;
  - SVG de Tapomo animado;
  - animaciones ligadas al scroll con CSS (`animation-timeline`) y una alternativa en JS para navegadores sin soporte;
  - `localStorage` para saber si es la primera visita;
  - respeta `prefers-reduced-motion`;
  - ES y EN.
- **Alojamiento gratis** en Cloudflare Pages o GitHub Pages, con el dominio tapomo.app; ahora mismo no tiene DNS. Cuando esté publicada, la web del repositorio, el enlace de privacidad y la página de descarga de SignPath apuntarán a ella.

## 0.5 — Web, estadísticas anónimas y ligas entre amigos

### Infraestructura (coste 0 €)

- Cloudflare Workers + D1 en plan gratuito (o el VPS). Da para muchos miles de usuarios enviando un resumen al día. Si algún día crece mucho: plan de 5 $/mes.
- tapomo.app: página de presentación, descarga, política de privacidad, botón para borrar tus datos.

### Estadísticas anónimas (opcional, desactivado por defecto)

- Identificador aleatorio de instalación; sin cuenta, sin email.
- Envía un resumen semanal: media ppm, pico, precisión, minutos activos, idioma de la app. Nada más.
- Se muestran solo en positivo: «escribes más rápido que el 62 % de quienes usan Tapomo en español». Si no es favorable, se enseña tu progreso.

### Ligas entre amigos

- Crear liga → código para compartir («Liga de la oficina»). Unirse con un apodo, sin email.
- **Puntuación por XP semanal** (constancia y mejora), no por velocidad bruta, para que compita igual alguien lento que alguien rápido.
- Clasificación semanal que se reinicia cada lunes; celebración para todos los que suben respecto a su semana anterior.
- Salir de la liga y borrar tus datos en un clic.
- Anti-trampas ligero: límites de lo plausible (ppm, XP por día). Entre amigos no hay premio, así que basta.

---

## Más tarde

- **Atajos, Fase C**: más programas en el catálogo (Explorador, Office con excepciones por idioma, VS Code, Photoshop…), abierto a contribuciones de la comunidad.

- Cifrado opcional de la base de datos (SQLCipher + clave DPAPI) antes del lanzamiento público.
- Firma de código o Microsoft Store; con firma, actualización automática (Tauri updater).
- Licencia de arte separada del código GPL (Tapomo y el nombre como marca).
- Más idiomas de interfaz y más distribuciones de teclado (francés, alemán, catalán…).
- Cuentas GitHub Sponsors / Ko-fi (pendiente de crear por Pol).
