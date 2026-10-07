<p align="center"><img src="assets/tapomo.svg" width="120" alt="Tapomo"></p>

# Tapomo

**Español** · [English](#english)

Tapomo es una aplicación gratuita y de código abierto (GPL-3.0) para Windows que mide en segundo plano **a qué velocidad escribes de verdad**. Vive en la bandeja del sistema, no te interrumpe, y cuando quieres te enseña tu velocidad media, tu récord, tus rachas sin borrar y a qué horas escribes mejor.

## Privacidad

Tapomo **nunca guarda lo que escribes**. El teclado solo se traduce a categorías (letra, espacio, intro, borrar…) y se descarta la tecla.

Qué se guarda, en una base de datos SQLite local en tu equipo:

- Para cada ráfaga de escritura: hora de inicio y fin, número de pulsaciones, número de borrados y la mejor velocidad de 10 s.
- El **nombre del ejecutable** de la aplicación en primer plano (por ejemplo `WINWORD.EXE`), al que puedes poner un nombre propio («Word»).

Qué **no** se guarda nunca: el texto, las teclas concretas, los títulos de ventana, capturas ni nada que salga de tu equipo. Tapomo no tiene red ni telemetría.

Además: las pulsaciones inyectadas por macros o autotypers se ignoran, los atajos (Ctrl/Alt/Win + tecla) no cuentan, hay una lista de aplicaciones excluidas (gestores de contraseñas por defecto: KeePass, KeePassXC, 1Password, Bitwarden), los juegos y presentaciones a pantalla completa se ignoran (se puede desactivar) y puedes pausar la medición en cualquier momento desde la bandeja.

## Cómo se mide

- **Ráfaga**: una tanda de escritura sin pausas largas. Si dejas de escribir más de **2 s** (ajustable de 1 a 5 s) la ráfaga termina; el tiempo de pausa no cuenta, así que pensar no te penaliza. Cambiar de aplicación también cierra la ráfaga.
- **Mínimo de 15 caracteres**: las ráfagas más cortas (un «ok», una búsqueda) se descartan.
- **PPM (palabras por minuto)**: 5 caracteres = 1 palabra. La velocidad media de un periodo es la suma de todos los intervalos entre pulsaciones dividida entre el tiempo total de ráfagas, no una media de medias.
- **PPM neta**: igual, restando un carácter por cada Retroceso.
- **Récord (pico)**: la mejor velocidad mantenida durante una ventana de **10 s** dentro de una ráfaga.
- **Racha sin borrar**: la mayor cantidad de caracteres seguidos sin pulsar Retroceso (ni Ctrl+Retroceso).

## Descarga

Todavía no hay versiones publicadas. Mientras tanto, descarga el instalador (`.msi` o `.exe`) del artefacto `tapomo-windows` de la última ejecución correcta de [Actions](https://github.com/polrue/tapomo/actions). El instalador aún **no está firmado**: Windows SmartScreen mostrará un aviso; pulsa «Más información → Ejecutar de todas formas».

## Compilar desde el código

Necesitas [Rust](https://rustup.rs), Node 22+ y, en Windows, las herramientas de compilación de Visual Studio y WebView2.

```
npm install
npx tauri build      # instaladores en target/release/bundle/
cargo test -p tapomo-core
```

El motor de medida (`crates/tapomo-core`) no depende de Windows ni de Tauri y tiene sus propias pruebas. La interfaz son ficheros estáticos en `ui/`; para añadir un idioma crea `ui/locales/xx.json`, regístralo en `ui/i18n.js` (`LANGUAGES`) y en `src-tauri/src/i18n.rs` (`LOCALES`).

## Licencia y apoyo

GPL-3.0-or-later, ver [LICENSE](LICENSE). Si Tapomo te gusta, puedes [invitarle a un café ☕](https://github.com/sponsors/polrue).

---

## English

Tapomo is a free, open-source (GPL-3.0) Windows app that quietly measures **how fast you really type**. It lives in the system tray, stays out of your way, and when you want it shows your average speed, your peak, your no-backspace streaks and the hours of the day you type best.

### Privacy

Tapomo **never stores what you type**. The keyboard is only translated into categories (letter, space, enter, delete…) and the key itself is thrown away.

What is stored, in a local SQLite database on your machine:

- For each typing burst: start and end time, keystroke count, delete count and the best 10 s speed.
- The foreground application's **executable name** (e.g. `WINWORD.EXE`), which you can rename to something friendly ("Word").

What is **never** stored: text, individual keys, window titles, screenshots, or anything that leaves your computer. Tapomo has no networking and no telemetry.

Also: keystrokes injected by macros or auto-typers are ignored, shortcuts (Ctrl/Alt/Win + key) don't count, there is an excluded-apps list (password managers by default: KeePass, KeePassXC, 1Password, Bitwarden), fullscreen games and presentations are ignored (can be turned off), and you can pause measuring at any time from the tray.

### How it is measured

- **Burst**: a stretch of typing without long pauses. If you stop for more than **2 s** (adjustable 1–5 s) the burst ends; pause time isn't counted, so thinking doesn't hurt your score. Switching application also ends the burst.
- **15-character minimum**: shorter bursts (an "ok", a search) are discarded.
- **WPM (words per minute)**: 5 characters = 1 word. The average speed for a period is all keystroke intervals divided by total burst time, not an average of averages.
- **Net WPM**: the same, taking one character off for each Backspace.
- **Peak**: the best speed held over a **10 s** window inside a burst.
- **Streak**: the most characters in a row without pressing Backspace (or Ctrl+Backspace).

### Download

There are no releases yet. For now, grab the installer (`.msi` or `.exe`) from the `tapomo-windows` artifact of the latest successful [Actions](https://github.com/polrue/tapomo/actions) run. The installer is **unsigned**, so Windows SmartScreen will warn you: click "More info → Run anyway".

### Build from source

You need [Rust](https://rustup.rs), Node 22+ and, on Windows, the Visual Studio build tools and WebView2.

```
npm install
npx tauri build      # installers in target/release/bundle/
cargo test -p tapomo-core
```

The measuring engine (`crates/tapomo-core`) has no Windows or Tauri dependency and its own tests. The UI is static files in `ui/`; to add a language create `ui/locales/xx.json`, then register it in `ui/i18n.js` (`LANGUAGES`) and `src-tauri/src/i18n.rs` (`LOCALES`).

### License and support

GPL-3.0-or-later, see [LICENSE](LICENSE). If you like Tapomo you can [buy it a coffee ☕](https://github.com/sponsors/polrue).
