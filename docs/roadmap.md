# Plan de desarrollo de Tapomo

Plan acordado el 11-10-2026. Se avanza poco a poco: cada bloque es una versión pequeña que se puede probar sola. Lo que sea fácil se adelanta.

Reglas que valen para todo el plan:

- **Siempre en positivo.** Tapomo nunca regaña, nunca enseña que vas «peor» y nunca te baja de nivel. Si un dato no es favorable, se muestra tu progreso en su lugar.
- **Privacidad.** De la escritura normal nunca se guarda qué escribes ni qué tecla pulsas. Los campos de contraseña no se miden. Del ordenador solo salen resúmenes, y solo si el usuario lo activa.
- **Gratis.** Nada de esto debe costar dinero mantener más allá del dominio. Las donaciones son voluntarias.
- **Nada de ranking mundial abierto.** Se puede falsear (el código es abierto y la medición es local), compara cosas que no son comparables (programar no es chatear) y haría que casi todos se vieran abajo. La competición es **contigo mismo** y **entre amigos**.

## Estado

| Versión | Contenido | Estado |
|---|---|---|
| 0.1 | Medición pasiva por ráfagas, estadísticas, calendario, apps | Hecho |
| 0.2 | Barra de velocidad personal, Tapomo flotante, caras de racha, estrellitas, bienvenida, instalador con Tapomo, aviso de versión nueva | Hecho |
| 0.3 | Gamificación personal: objetivo diario, días seguidos, XP y niveles, insignias, liga contigo mismo, carta semanal | En curso (0.3.0 hecho: objetivo diario y días seguidos) |
| 0.4 | Lecciones de mecanografía (ES + US) | Pendiente |
| 0.5 | Web tapomo.app, estadísticas anónimas opcionales, ligas entre amigos | Pendiente |
| Más tarde | Cifrado de la base de datos, firma de código, más idiomas | Pendiente |

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

### 0.3.1 XP y niveles

- **XP por constancia, no solo por velocidad**, para que cualquiera pueda subir:
  - 1 XP por cada 100 caracteres escritos en ráfagas;
  - +20 XP al cumplir el objetivo diario;
  - +10 XP por cada récord personal (pico de 10 s, mejor racha sin borrar);
  - +5 XP por cada día seguido (máximo +50);
  - más adelante, XP por lecciones.
- **Niveles**: XP necesaria para el nivel *n* = `100 × n^1.5` acumulada. Curva suave: los primeros niveles llegan en días, los altos en meses.
- **Recompensas**: accesorios cosméticos para Tapomo (bufanda, gafas, auriculares, gorrito, pajarita…). Se elige cuál ponerse. Regla del personaje: accesorios sí, cambiar la forma del cuerpo no.
- Datos: tabla `xp_events(ts, kind, amount)` (sin nada de texto ni teclas); el nivel se deriva sumando.
- Sin pérdida de XP nunca.

### 0.3.2 Insignias

Se calculan con datos locales. Primera tanda (unas 15):

- Primera ráfaga · 100 ráfagas · 1.000 ráfagas
- 1.000 caracteres sin borrar · 5.000 sin borrar
- 10.000 caracteres en un día
- Primer récord batido · Superándote (zona morada) 5 veces
- 7 días seguidos · 30 días seguidos
- Madrugador (escribir antes de las 8) · Búho (después de las 23)
- Una semana entera con objetivo cumplido
- Coronado (llegar a la cara de corona)

Pantalla de insignias con las conseguidas en color y las pendientes en silueta suave con una pista amable («Escribe 1.000 caracteres sin borrar»). Nunca un «0 de 15» frío: se muestra lo conseguido.

### 0.3.3 Liga contigo mismo

- Cada semana (lunes a domingo) cuenta tu XP semanal.
- Ligas: Bronce → Plata → Oro → Diamante → Mochi legendario.
- **Subes** si tu XP de la semana supera la media de tus 4 semanas anteriores. **Nunca bajas**: como mucho «te mantienes».
- El lunes, Tapomo anuncia el resultado con animación (subida = estrellitas y corona; mantener = «¡Buena semana, sigues en Oro!»).

### 0.3.4 Carta semanal

- Cada lunes, una tarjeta con lo mejor de la semana: hora más rápida, récord, días cumplidos, app donde más escribiste, insignias nuevas. Solo hechos positivos.

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

### Contenido

- Listas de palabras frecuentes ES/EN con licencia compatible con GPL (revisar fuente y licencia antes de incluirla) o generadas a partir de textos de dominio público.
- Frases escritas por nosotros.

---

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

- Cifrado opcional de la base de datos (SQLCipher + clave DPAPI) antes del lanzamiento público.
- Firma de código o Microsoft Store; con firma, actualización automática (Tauri updater).
- Licencia de arte separada del código GPL (Tapomo y el nombre como marca).
- Más idiomas de interfaz y más distribuciones de teclado (francés, alemán, catalán…).
- Cuentas GitHub Sponsors / Ko-fi (pendiente de crear por Pol).
