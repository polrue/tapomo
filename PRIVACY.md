# Política de privacidad de Tapomo

**Español** · [English](#tapomo-privacy-policy)

*Última actualización: 15 de octubre de 2026 (funciones en línea opcionales).*

Tapomo es una aplicación gratuita y de código abierto que mide a qué velocidad escribes. Está hecha para que **nada de lo que escribes salga nunca de tu equipo**, y casi nada se guarde siquiera en él.

## Qué hace Tapomo con el teclado

Para medir la velocidad, Tapomo escucha el teclado de todo el sistema mientras está en marcha. Cada pulsación se traduce al momento a una **categoría** (letra, espacio, intro, borrar…) y **la tecla concreta se descarta**. Tapomo no puede reconstruir el texto que escribiste, porque nunca lo tiene.

Además:

- Los **campos de contraseña** se ignoran por completo: ni se cuentan ni se cronometran.
- Las **aplicaciones excluidas** se ignoran. Por defecto lo están los gestores de contraseñas (KeePass, KeePassXC, 1Password y Bitwarden), y puedes añadir más.
- Las pulsaciones inyectadas por macros o autotypers se ignoran.
- Para no contar como escritura el aporreo del teclado («asdasdasd», «aaaaaa»), el gancho compara cada tecla con las dos anteriores en su memoria y solo pasa un «igual que antes: sí/no». Las teclas no salen del gancho ni se guardan.
- Hay una única excepción a «la tecla se descarta»: cuando pulsas Retroceso justo después de una tecla de carácter, el gancho envía el código de **esa** tecla y se convierte al instante en un contador diario (ver abajo). Las pausas, las aplicaciones excluidas y los campos de contraseña también valen para él, y se puede desactivar.
- Puedes **pausar** la medición en cualquier momento desde la bandeja del sistema.

## Qué se guarda (solo en tu equipo)

En una base de datos SQLite local, en tu carpeta de usuario:

- Para cada ráfaga de escritura: hora de inicio y fin, número de pulsaciones, número de borrados y la mejor velocidad de 10 segundos.
- El **nombre del ejecutable** de la aplicación en primer plano (por ejemplo `WINWORD.EXE`) y el nombre propio que le pongas.
- Tus ajustes y tu progreso: objetivo diario, días seguidos, XP, insignias, etc.
- De las **lecciones** (el texto es de Tapomo, no tuyo): resultados y qué teclas del texto de la lección fallas más, para prepararte práctica a medida.
- Cuántos **atajos de teclado** usas cada día de cada tipo (copiar y pegar, deshacer, guardar, ventanas, otros). El atajo se convierte en su tipo dentro del propio gancho de teclado. Solo los atajos del **álbum** (un catálogo cerrado y público de unos 30, en [`data/shortcuts.json`](data/shortcuts.json), sin ninguno sensible como abrir una ventana de incógnito) se reconocen por su nombre, y de cada uno solo se guarda en cuántos días distintos lo has usado. Cualquier otra combinación cuenta como «otros» sin saber cuál fue. Se desactiva en Ajustes → «Contar atajos de teclado».
- Cuántas veces, cada día, la tecla que pulsaste **justo antes de borrar** con Retroceso fue cada una (por ejemplo «la R: 12 veces»), para mostrarte «Teclas que más corriges». Es un contador por día y por tecla: nunca el texto, ni qué teclas iban antes o después, ni en qué aplicación. Con varias borradas seguidas solo cuenta la primera. Se desactiva en Ajustes → «Contar las teclas que corriges».

**Nunca** se guarda: el texto, secuencias de teclas (solo ese contador diario por tecla corregida), los títulos de ventana, las direcciones web, capturas de pantalla ni nada parecido.

Al desinstalar Tapomo puedes borrar también estos datos. Si quieres, puedes **cifrar** la base de datos (Ajustes → «Cifrar la base de datos»): se cifra con SQLCipher y la clave queda protegida por Windows para tu usuario.

## Conexiones a internet

Tapomo **no tiene telemetría, ni analítica, ni publicidad, ni cuentas de usuario**. Las únicas conexiones son:

| Para qué | Con quién | Qué se envía | Cómo desactivarla |
|---|---|---|---|
| Comprobar si hay una versión nueva, como mucho una vez al día | GitHub (`github.com`, el archivo `latest.json` de la última versión) | Una petición normal de la web, sin ningún dato tuyo ni de tu uso | Ajustes → «Comprobar si hay versiones nuevas» |
| Descargar una versión nueva: solo si aceptas instalarla o si activas la actualización automática | GitHub (`github.com`) | Una descarga normal | No aceptando la actualización, o desactivando la comprobación; la actualización automática está desactivada por defecto (Ajustes → «Actualizar automáticamente») |

Como en cualquier conexión, GitHub ve tu dirección IP. Consulta la [declaración de privacidad de GitHub](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement).

### Funciones en línea opcionales (desactivadas por defecto)

Solo funcionan si tú las activas, y hablan únicamente con `api.tapomo.app` (Cloudflare Workers; el código está en [`server/`](server/)):

- **Estadísticas anónimas** (Ajustes → «Compartir estadísticas anónimas»): una vez por semana se envía la semana anterior: velocidad media, pico, precisión, minutos activos e idioma de la app, con un número de instalación al azar. Sin cuenta, sin email, sin nada de lo que escribes. Se guarda 26 semanas y lo puedes borrar con «Borrar mis datos del servidor».
- **Ligas con amigos** (solo si creas una liga o te unes a una): tu apodo y tu XP semanal. Se guarda 12 semanas y se borra al salir de la liga.

El servidor no guarda direcciones IP (solo un resumen cifrado, que cambia cada 10 minutos, para limitar abusos), pero Cloudflare, como cualquier proveedor, ve la IP de la conexión. Consulta la [política de privacidad de Cloudflare](https://www.cloudflare.com/privacypolicy/).

## Cambios en el sistema

- El instalador instala Tapomo **solo para tu usuario**, sin permisos de administrador, y crea los accesos directos del menú Inicio y, si lo eliges, del escritorio.
- Tapomo **se inicia con Windows por defecto**, para medir sin que tengas que abrirlo cada día. Lo puedes desactivar en Ajustes en cualquier momento.
- Tapomo se desinstala desde **Configuración → Aplicaciones** como cualquier otro programa.

## Contacto

Para cualquier duda, abre una incidencia en [github.com/polrue/tapomo/issues](https://github.com/polrue/tapomo/issues). El código fuente es público y puedes comprobar todo lo que dice esta política.

---

# Tapomo privacy policy

*Last updated: 15 October 2026.*

Tapomo is a free, open-source app that measures how fast you type. It is built so that **nothing you type ever leaves your computer**, and almost nothing is even stored on it.

## What Tapomo does with the keyboard

To measure speed, Tapomo listens to the system-wide keyboard while it is running. Each keystroke is immediately translated into a **category** (letter, space, enter, delete…) and **the actual key is thrown away**. Tapomo cannot rebuild the text you typed, because it never has it.

Also:

- **Password fields** are ignored entirely: not counted, not timed.
- **Excluded applications** are ignored. Password managers (KeePass, KeePassXC, 1Password and Bitwarden) are excluded by default, and you can add more.
- Keystrokes injected by macros or auto-typers are ignored.
- So that keyboard mashing ("asdasdasd", "aaaaaa") doesn't count as typing, the hook compares each key with the previous two in its own memory and only passes on a "same as before: yes/no". The keys never leave the hook and are never stored.
- There is a single exception to "the key is thrown away": when you press Backspace right after a character key, the hook sends the code of **that** key, which is turned into a daily counter at once (see below). Pause, excluded applications and password fields apply to it too, and it can be turned off.
- You can **pause** measuring at any time from the system tray.

## What is stored (only on your computer)

In a local SQLite database in your user folder:

- For each typing burst: start and end time, keystroke count, delete count and the best 10-second speed.
- The foreground application's **executable name** (e.g. `WINWORD.EXE`) and any friendly name you give it.
- Your settings and progress: daily goal, days in a row, XP, badges, etc.
- From **lessons** (the text is Tapomo's, not yours): results and which keys of the lesson text you miss most, to build tailored practice.
- How many **keyboard shortcuts** you use each day of each kind (copy & paste, undo, save, windows, other). The shortcut becomes its kind inside the keyboard hook itself. Only **album** shortcuts (a closed, public catalogue of about 30, in [`data/shortcuts.json`](data/shortcuts.json), with nothing sensitive such as opening an incognito window) are recognised by name, and for each one only the number of different days you used it is stored. Any other combination counts as "other" without knowing which. Turn it off in Settings → "Count keyboard shortcuts".
- How many times, each day, the key you pressed **right before deleting** with Backspace was each one (for example "R: 12 times"), to show you "Keys you correct most". It is one counter per day and per key: never the text, never which keys came before or after, never which application. With several Backspaces in a row only the first counts. Turn it off in Settings → "Count the keys you correct".

**Never** stored: text, key sequences (only that daily counter per corrected key), window titles, web addresses, screenshots or anything similar.

When you uninstall Tapomo you can also delete this data. If you like, you can **encrypt** the database (Settings → "Encrypt the database"): it is encrypted with SQLCipher and the key is protected by Windows for your user.

## Internet connections

Tapomo has **no telemetry, analytics, ads or user accounts**. The only connections are:

| What for | With whom | What is sent | How to turn it off |
|---|---|---|---|
| Checking for a new version, at most once a day | GitHub (`github.com`, the `latest.json` file of the latest release) | A plain web request, with no data about you or your usage | Settings → "Check for new versions" |
| Downloading a new version: only if you accept it or if you turn on automatic updates | GitHub (`github.com`) | A plain download | Don't accept the update, or turn off the check; automatic updates are off by default (Settings → "Update automatically") |

As with any connection, GitHub sees your IP address. See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

### Optional online features (off by default)

They only work if you turn them on, and they only talk to `api.tapomo.app` (Cloudflare Workers; the code is in [`server/`](server/)):

- **Anonymous stats** (Settings → "Share anonymous stats"): once a week the previous week is sent: average speed, peak, accuracy, active minutes and the app language, with a random install number. No account, no email, nothing you type. Kept for 26 weeks, and you can delete it with "Delete my data from the server".
- **Leagues with friends** (only if you create or join a league): your nickname and weekly XP. Kept for 12 weeks and deleted when you leave the league.

The server stores no IP addresses (only a salted hash that changes every 10 minutes, to limit abuse), but Cloudflare, like any provider, sees the connection's IP. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

## Changes to your system

- The installer installs Tapomo **for your user only**, without administrator rights, and creates Start menu shortcuts and, if you choose, a desktop shortcut.
- Tapomo **starts with Windows by default**, so it can measure without you opening it every day. You can turn this off in Settings at any time.
- Tapomo is uninstalled from **Settings → Apps** like any other program.

## Contact

For any question, open an issue at [github.com/polrue/tapomo/issues](https://github.com/polrue/tapomo/issues). The source code is public, so you can check everything this policy says.
