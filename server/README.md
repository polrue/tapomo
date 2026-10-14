# Servidor de Tapomo (0.5): estadísticas anónimas y ligas entre amigos

API mínima para las dos funciones en línea de la 0.5 ([roadmap](../docs/roadmap.md#05--web-estadísticas-anónimas-y-ligas-entre-amigos)). Cloudflare Workers + D1 (SQLite), plan gratuito, sin dependencias npm.

Las dos funciones son **opcionales y vienen desactivadas** en la app. Antes de activarlas hay que actualizar [PRIVACY.md](../PRIVACY.md), como promete la propia política.

## Qué se guarda

| Tabla | Qué contiene | Cuánto dura |
|---|---|---|
| `weekly_stats` | Por instalación y semana ISO: identificador aleatorio de instalación (UUID v4 que genera la app, sin relación con nada más), semana (`2026-W42`), idioma de la app (`es`/`en`), ppm media, ppm pico, precisión (0–1) y minutos activos. | 26 semanas, o hasta que pulses «Borrar mis datos». |
| `stats_histogram` | Recuentos agregados por semana, idioma y ppm entera. Sirve para el percentil sin leer la tabla de arriba. Sin identificadores. | 26 semanas. Se rehace cada hora. |
| `leagues` | Código de 8 caracteres, nombre de la liga (≤ 40) y semana de creación. | Mientras tenga miembros. Una liga sin ninguna puntuación en 12 semanas (y creada hace más de 12) se borra. |
| `members` | Identificador aleatorio, liga, apodo (≤ 24) y el **SHA-256** del secreto del miembro, más la semana en que entró. | Hasta que sales de la liga (o la liga caduca). |
| `league_scores` | XP semanal de cada miembro. | 12 semanas, o hasta que sales de la liga. |
| `rate_limits` | Contadores de peticiones. La clave es `SHA-256(sal secreta, ventana, IP)`: cambia cada 10 minutos y no se puede revertir sin la sal. | Se borran cada hora. |

## Qué no se guarda nunca

- Emails, cuentas, contraseñas, nombres reales.
- **Direcciones IP**: solo se usan, con sal y hash, para el límite de peticiones. Ojo: Cloudflare, como cualquier proveedor, ve la IP de la conexión (hay que mencionarlo en PRIVACY.md, igual que con GitHub).
- Horas exactas: lo más fino que se guarda es la semana ISO.
- Nada de lo que escribes, ni teclas, ni aplicaciones, ni títulos de ventana: la app solo envía los números de arriba.
- El secreto del miembro: solo su hash. Quien lea la base de datos no puede hacerse pasar por nadie.
- No hay registros (logs) propios. `console.error` solo se usa para errores internos inesperados y no incluye datos de la petición.

## API (`/v1`, JSON)

Todas las respuestas llevan `Cache-Control: no-store`. Los errores son `{"error": "<código>"}`.

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `POST /v1/stats` | `{install_id, week, lang, avg_wpm, peak_wpm, accuracy, active_min}` | `204`. Una fila por instalación y semana (se sobrescribe). |
| `GET /v1/stats/percentile` | `?lang=es&week=2026-W42&avg_wpm=48.5` | `{percent, sample}` = % de instalaciones de esa semana e idioma con menos ppm media. Con menos de 30, `{percent: null}`. |
| `DELETE /v1/stats/:install_id` | — | `204`. Borra todas las semanas de esa instalación. |
| `POST /v1/leagues` | `{name, nickname}` | `201 {code, member_id, member_secret}`. El creador entra en la liga. |
| `POST /v1/leagues/:code/join` | `{nickname}` | `201 {member_id, member_secret}`. `409 nickname_taken` / `409 league_full` (50). |
| `POST /v1/leagues/:code/score` | `{member_id, member_secret, week, xp}` | `204`. Sobrescribe la XP de esa semana. |
| `GET /v1/leagues/:code?week=…` | Cabecera `Authorization: Bearer <member_id>.<member_secret>` | `{name, week, members: [{nickname, xp, up}]}` ordenado por XP. Sin `week`, la semana actual. |
| `DELETE /v1/leagues/:code/members/me` | Misma cabecera | `204`. Borra el miembro y sus puntuaciones; si la liga se queda vacía, también la liga. |

Cualquier otra ruta o método → `404`.

**Validación** (todo lo que no cumpla → `400`, campos desconocidos incluidos; cuerpo > 2 KB → `413`; sin `Content-Type: application/json` → `415`):

- `install_id`: UUID v4. `lang`: `es` o `en`. `week`: `YYYY-Www` que exista (la W53 solo en años que la tienen).
- Plausibilidad: `avg_wpm` 0–250, `peak_wpm` 0–300, media ≤ pico, `accuracy` 0–1, `active_min` entero 0–10 080, `xp` entero 0–5600 (7 × 800).
- Para escribir (`stats` y `score`) solo se aceptan **la semana actual o la anterior**, con 14 h de margen para cualquier huso horario.
- Nombre y apodo: se recortan espacios y se normalizan (NFC); se rechazan caracteres de control e invisibles (p. ej. cambios de dirección de texto). Apodo único por liga sin distinguir mayúsculas ni formas de ancho completo (NFKC + minúsculas).
- Códigos de liga: 8 caracteres de `23456789ABCDEFGHJKMNPQRSTVWXYZ` (sin 0/O, 1/I/L ni U), aleatorios con `crypto.getRandomValues`: 30⁸ ≈ 6,6 · 10¹¹ códigos. Se aceptan en minúsculas. Unirse está limitado a 20 intentos por IP cada 10 min, así que adivinar códigos no es práctico. Aun así, ver la clasificación exige ser miembro.
- `up`: la XP de esa semana supera la del propio miembro la semana anterior. Si no hay semana anterior, `false`.

**CORS**: solo `tauri://localhost`, `http://tauri.localhost` y `https://tauri.localhost`. Una petición con cualquier otra cabecera `Origin` recibe `403`, para que ninguna web pueda usar el navegador de un visitante contra la API. Sin `Origin` (peticiones desde Rust, curl) no aplica CORS.

**Límite de peticiones**: contador por ventana fija de 10 minutos en D1: 120 peticiones por IP y, aparte, 20 creaciones o uniones a ligas. Al pasarse → `429` con `Retry-After`. Ajustable en `[vars]` de `wrangler.toml`.
Cloudflare también tiene un enlace nativo de rate limiting para Workers, pero se ha preferido D1 para no depender de su disponibilidad en el plan gratuito y poder probarlo en local. Coste: una escritura en D1 por petición.

**Percentil**: la consulta lee el histograma (≤ 251 filas) y no la tabla de estadísticas, porque D1 cobra por fila leída y contar miles de filas en cada consulta agotaría la cuota diaria. Contrapartida: los datos nuevos aparecen en el percentil en menos de una hora. El porcentaje se redondea hacia abajo y compara con la ppm entera (48,9 cuenta como 48), así nunca dice que eres más rápido de lo que eres. El servidor contesta siempre; es la app la que solo lo enseña si es favorable.

## Tarea programada (Cron Trigger)

`scheduled()` se ejecuta cada hora (`17 * * * *`) y, en una sola transacción:

1. borra estadísticas de hace más de 26 semanas y puntuaciones de liga de hace más de 12;
2. borra las ligas creadas hace más de 12 semanas que ya no tienen ninguna puntuación, con sus miembros;
3. borra los contadores de peticiones de ventanas pasadas;
4. rehace el histograma de percentiles de las semanas en las que aún se puede escribir.

Los valores están en `LIMITS` al principio de `src/index.js`.

## Pruebas

```sh
node --test server/test            # desde la raíz del repositorio (Node 24)
cd server && npm test              # lo mismo
```

No hace falta instalar nada: las pruebas usan `node:sqlite` dentro de un pequeño simulador de la API de D1 (`test/fake-d1.mjs`) y llaman al `fetch`/`scheduled` del Worker tal cual, con el `schema.sql` real.

## Despliegue paso a paso (para Pol)

Coste: **0 €** en el plan gratuito de Workers + D1 (condiciones de octubre de 2026; compruébalas en la [página de precios](https://developers.cloudflare.com/workers/platform/pricing/)): 100 000 peticiones al día, 5 millones de filas leídas y 100 000 escritas al día en D1, 5 GB de almacenamiento y Cron Triggers incluidos. Cada envío semanal de estadísticas son 2 escrituras (contador + fila), así que cabe con holgura para muchos miles de usuarios. Si algún día no basta, el plan de pago es de 5 $/mes.

1. **Cuenta**: crea una cuenta gratuita en [dash.cloudflare.com](https://dash.cloudflare.com) (no hace falta tarjeta para Workers Free).
2. **Iniciar sesión** desde esta carpeta (wrangler se descarga con `npx`; no hace falta instalarlo):
   ```sh
   cd server
   npx wrangler login
   ```
3. **Account ID**: cópialo del panel (Workers & Pages → «Account ID») a `account_id` en `wrangler.toml`.
4. **Crear la base de datos** y pegar el `database_id` que imprime en `wrangler.toml`:
   ```sh
   npx wrangler d1 create tapomo
   ```
   Elige ubicación europea si lo pregunta (`--location weur`).
5. **Aplicar el esquema**:
   ```sh
   npx wrangler d1 execute tapomo --remote --file=schema.sql
   ```
6. **Sal secreta** para los hashes de IP (un valor aleatorio largo; no hace falta recordarlo):
   ```sh
   openssl rand -base64 48 | npx wrangler secret put RATE_LIMIT_SALT
   ```
7. **Publicar**:
   ```sh
   npx wrangler deploy
   ```
   Queda en `https://tapomo-api.<tu-subdominio>.workers.dev`. Prueba rápida: `curl -i https://…/v1/nada` debe devolver `404 {"error":"not_found"}`.
8. **Dominio `api.tapomo.app`**: cuando el dominio tapomo.app esté en Cloudflare (añadir el sitio y cambiar los servidores DNS en el registrador), descomenta el bloque `routes` de `wrangler.toml`, pon `workers_dev = false` y vuelve a ejecutar `npx wrangler deploy`. Cloudflare crea el registro DNS y el certificado solo.
9. **Comprobar el cron**: en el panel del Worker → Settings → Triggers aparece `17 * * * *`. Se puede forzar en local con `npx wrangler dev --test-scheduled` y `curl "http://localhost:8787/__scheduled?cron=17+*+*+*+*"`.

Cambios futuros del esquema: añadir sentencias idempotentes (`CREATE … IF NOT EXISTS`, `ALTER TABLE` en un archivo aparte) y volver a ejecutar el paso 5 con ese archivo.

## Lo que la app tendrá que hacer (no incluido aquí)

- Generar el `install_id` con un UUID v4 aleatorio al activar las estadísticas, y uno nuevo si se borran los datos.
- Guardar `member_id` y `member_secret` de cada liga solo en el equipo.
- Mostrar el percentil solo si es favorable; si no, enseñar el progreso propio.
- Llamar a `DELETE /v1/stats/:install_id` desde «Borrar mis datos», y a `DELETE …/members/me` al salir de una liga.
