# Política de privacidad de Tapomo

**Español** · [English](#tapomo-privacy-policy)

*Última actualización: 13 de octubre de 2026.*

Tapomo es una aplicación gratuita y de código abierto que mide a qué velocidad escribes. Está hecha para que **nada de lo que escribes salga nunca de tu equipo**, y casi nada se guarde siquiera en él.

## Qué hace Tapomo con el teclado

Para medir la velocidad, Tapomo escucha el teclado de todo el sistema mientras está en marcha. Cada pulsación se traduce al momento a una **categoría** (letra, espacio, intro, borrar…) y **la tecla concreta se descarta**. Tapomo no puede reconstruir el texto que escribiste, porque nunca lo tiene.

Además:

- Los **campos de contraseña** se ignoran por completo: ni se cuentan ni se cronometran.
- Las **aplicaciones excluidas** se ignoran. Por defecto lo están los gestores de contraseñas (KeePass, KeePassXC, 1Password y Bitwarden), y puedes añadir más.
- Las pulsaciones inyectadas por macros o autotypers se ignoran.
- Puedes **pausar** la medición en cualquier momento desde la bandeja del sistema.

## Qué se guarda (solo en tu equipo)

En una base de datos SQLite local, en tu carpeta de usuario:

- Para cada ráfaga de escritura: hora de inicio y fin, número de pulsaciones, número de borrados y la mejor velocidad de 10 segundos.
- El **nombre del ejecutable** de la aplicación en primer plano (por ejemplo `WINWORD.EXE`) y el nombre propio que le pongas.
- Tus ajustes y tu progreso: objetivo diario, días seguidos, etc.

**Nunca** se guarda: el texto, las teclas concretas, los títulos de ventana, las direcciones web, capturas de pantalla ni nada parecido.

Al desinstalar Tapomo puedes borrar también estos datos.

## Conexiones a internet

Tapomo **no tiene telemetría, ni analítica, ni publicidad, ni cuentas de usuario**. Las únicas conexiones son:

| Para qué | Con quién | Qué se envía | Cómo desactivarla |
|---|---|---|---|
| Comprobar si hay una versión nueva, como mucho una vez al día | GitHub (`api.github.com`) | Una petición normal de la web, sin ningún dato tuyo ni de tu uso | Ajustes → «Comprobar si hay versiones nuevas» |
| Descargar una versión nueva, solo si aceptas instalarla | GitHub (`github.com`) | Una descarga normal | No aceptando la actualización, o desactivando la comprobación |

Como en cualquier conexión, GitHub ve tu dirección IP. Consulta la [declaración de privacidad de GitHub](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement).

Si en el futuro Tapomo ofrece algo que envíe datos fuera de tu equipo, como ligas con amigos, será **opcional, desactivado por defecto**, y esta política se actualizará antes.

## Cambios en el sistema

- El instalador instala Tapomo **solo para tu usuario**, sin permisos de administrador, y crea los accesos directos del menú Inicio y, si lo eliges, del escritorio.
- Tapomo **se inicia con Windows por defecto**, para medir sin que tengas que abrirlo cada día. Lo puedes desactivar en Ajustes en cualquier momento.
- Tapomo se desinstala desde **Configuración → Aplicaciones** como cualquier otro programa.

## Contacto

Para cualquier duda, abre una incidencia en [github.com/polrue/tapomo/issues](https://github.com/polrue/tapomo/issues). El código fuente es público y puedes comprobar todo lo que dice esta política.

---

# Tapomo privacy policy

*Last updated: 13 October 2026.*

Tapomo is a free, open-source app that measures how fast you type. It is built so that **nothing you type ever leaves your computer**, and almost nothing is even stored on it.

## What Tapomo does with the keyboard

To measure speed, Tapomo listens to the system-wide keyboard while it is running. Each keystroke is immediately translated into a **category** (letter, space, enter, delete…) and **the actual key is thrown away**. Tapomo cannot rebuild the text you typed, because it never has it.

Also:

- **Password fields** are ignored entirely: not counted, not timed.
- **Excluded applications** are ignored. Password managers (KeePass, KeePassXC, 1Password and Bitwarden) are excluded by default, and you can add more.
- Keystrokes injected by macros or auto-typers are ignored.
- You can **pause** measuring at any time from the system tray.

## What is stored (only on your computer)

In a local SQLite database in your user folder:

- For each typing burst: start and end time, keystroke count, delete count and the best 10-second speed.
- The foreground application's **executable name** (e.g. `WINWORD.EXE`) and any friendly name you give it.
- Your settings and progress: daily goal, days in a row, etc.

**Never** stored: text, individual keys, window titles, web addresses, screenshots or anything similar.

When you uninstall Tapomo you can also delete this data.

## Internet connections

Tapomo has **no telemetry, analytics, ads or user accounts**. The only connections are:

| What for | With whom | What is sent | How to turn it off |
|---|---|---|---|
| Checking for a new version, at most once a day | GitHub (`api.github.com`) | A plain web request, with no data about you or your usage | Settings → "Check for new versions" |
| Downloading a new version, only if you accept it | GitHub (`github.com`) | A plain download | Don't accept the update, or turn off the check |

As with any connection, GitHub sees your IP address. See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

If Tapomo ever offers something that sends data off your computer, such as leagues with friends, it will be **optional and off by default**, and this policy will be updated first.

## Changes to your system

- The installer installs Tapomo **for your user only**, without administrator rights, and creates Start menu shortcuts and, if you choose, a desktop shortcut.
- Tapomo **starts with Windows by default**, so it can measure without you opening it every day. You can turn this off in Settings at any time.
- Tapomo is uninstalled from **Settings → Apps** like any other program.

## Contact

For any question, open an issue at [github.com/polrue/tapomo/issues](https://github.com/polrue/tapomo/issues). The source code is public, so you can check everything this policy says.
