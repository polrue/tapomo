# Distribución: firma, verificación y tiendas

Estado a 13-10-2026. Aquí se explica cómo se publica Tapomo y qué falta para que Windows confíe en el instalador.

## Cómo se publica una versión

1. Sube la versión en `src-tauri/Cargo.toml` y escribe las notas en `docs/releases/vX.Y.Z.md`, en ES y EN.
2. Haz commit, crea la etiqueta `vX.Y.Z` y súbela.
3. El flujo `.github/workflows/release.yml` se encarga del resto:
   - comprueba que la etiqueta coincide con la versión;
   - compila en Windows;
   - genera la **certificación de procedencia** (`attest-build-provenance`);
   - **espera la aprobación de Pol** en el entorno `release`, desde Actions → la ejecución → «Review deployments»;
   - publica la versión (normal, no prerelease) con la sección «Verificación» y la SHA-256;
   - la sube a **VirusTotal** y añade el resultado y el enlace a las notas.
4. El análisis de VirusTotal necesita el secreto `VT_API_KEY`:
   - Créate una cuenta gratuita en virustotal.com y copia tu clave desde *API key*.
   - Guárdala con `gh secret set VT_API_KEY -R polrue/tapomo`.
   - Sin la clave, este paso se salta.

## Firma de código: SignPath Foundation (rechazada el 14-10-2026)

> SignPath respondió que el proyecto aún no tiene suficiente visibilidad. Se puede volver a pedir cuando tenga más estrellas, descargas o presencia (winget, web). Todo lo de abajo sigue cumpliéndose y vale para la próxima solicitud.

Es gratis para proyectos de código abierto. El certificado aparece a nombre de «SignPath Foundation». Requisitos ([condiciones](https://signpath.org/terms)) y su estado:

| Requisito | Estado |
|---|---|
| Licencia aprobada por la OSI, sin componentes cerrados | ✅ GPL-3.0-or-later |
| Mantenido y con versiones publicadas | ✅ |
| Funcionalidad descrita en la página de descarga | ✅ README |
| Compilación automática y verificable desde el repositorio | ✅ `release.yml` y certificación de procedencia |
| Aprobación manual de cada versión | ✅ entorno `release` con Pol como revisor; además, la aprobación en SignPath |
| Política de privacidad mostrada durante la instalación | ✅ `PRIVACY.md`: resumen en la bienvenida del instalador y enlace en la pantalla final |
| Envíos de datos que se puedan desactivar | ✅ «Comprobar si hay versiones nuevas» en Ajustes |
| Anunciar los cambios en el sistema y poder desinstalar | ✅ el instalador avisa de que se inicia con Windows; se desinstala desde Configuración → Aplicaciones |
| Página «Code signing policy» con roles | ✅ sección en el README; añadir la línea de crédito cuando aprueben |
| Verificación en dos pasos en GitHub y SignPath | ⬜ **Pol** |
| Metadatos de producto y versión coherentes | ✅ Tauri los rellena; se fijarán en SignPath |

### Borrador de la solicitud (en inglés)

> **Project:** Tapomo — https://github.com/polrue/tapomo
> **What it does:** a free, GPL-3.0 Windows tray app that passively measures typing speed (words per minute, peaks, streaks) and shows personal statistics and gentle goals.
> **Why it needs a keyboard hook, and why it is not a keylogger:** to measure speed it uses a low-level keyboard hook, but every keystroke is immediately reduced to a category (letter, space, enter, delete) and the key itself is discarded, so the text can never be reconstructed. Password fields (detected via UI Automation), password managers and injected keystrokes are ignored, and measuring can be paused from the tray. Only aggregates (burst timings and counts, foreground executable name) are stored, in a local SQLite file. There is no telemetry; the only network access is an optional check of the GitHub releases API for updates. Privacy policy: https://github.com/polrue/tapomo/blob/main/PRIVACY.md
> **Build:** fully automated in GitHub Actions from tagged commits (`.github/workflows/release.yml`), with build provenance attestations and a manual approval gate. Single maintainer (author, reviewer and approver): Pol Rué.
> **Artifacts to sign:** `tapomo.exe` and the NSIS installer `Tapomo_X.Y.Z_x64-setup.exe`.

### Integración cuando aprueben

- Añadir `signpath/github-action-submit-signing-request` al flujo: tras compilar, se envían `tapomo.exe` y el instalador a SignPath, que los firma tras la aprobación y los devuelve.
- **Orden:** primero la firma Authenticode y después la firma `.sig` del actualizador, porque esta última se calcula sobre el instalador ya firmado.
- Añadir al README la línea de crédito: «Free code signing provided by SignPath.io, certificate by SignPath Foundation».

## Alternativas de firma

- **Azure Artifact Signing** (~10 $/mes): no sirve para particulares fuera de EE. UU. y Canadá; solo para empresas de la UE.
- **Certum Open Source** (~25–70 €/año): a nombre de Pol, pero difícil de automatizar porque pide un código del móvil, y su reputación empieza de cero.
- **Decisión del 14-10-2026:** los planes de pago se salen del presupuesto. Solo se consideran vías gratuitas.

## Microsoft Store

Investigado el 13-10-2026 con fuentes de Microsoft Learn. Lo marcado «sin confirmar» no se pudo verificar.

- **Cuenta de desarrollador:** **gratis** para particulares desde 2025. Se abre en storedeveloper.microsoft.com con una cuenta Microsoft personal, foto del DNI y un selfi; el acceso es inmediato. Las cuentas de particular no se pueden convertir después en cuentas de empresa.
- **Opción A, enviar el `.exe`:**
  - Se mantiene el instalador NSIS. La Store enlaza a una URL versionada de GitHub Releases, y cada versión es un envío nuevo, automatizable.
  - Pide instalación silenciosa (`/S`), un instalador sin descargas adicionales (WebView2 en modo offline), entrada en el menú Inicio y en Aplicaciones, y desinstalación limpia.
  - **La política 10.2.9 exige que el instalador y sus `.exe` estén firmados** con un certificado de una CA de confianza. Por tanto, **primero hace falta SignPath**. Que la Store acepte el certificado de SignPath está sin confirmar, aunque es lo esperable porque es una CA pública.
- **Opción B, MSIX:**
  - **Microsoft firma el paquete**: no hay avisos de SmartScreen y no hace falta certificado propio.
  - Tauri no genera MSIX; la herramienta `winapp` de Microsoft tiene una guía para Tauri, pero es nueva.
  - Obliga a una versión aparte para la Store: inicio con Windows mediante `StartupTask`, sin actualizador propio y con la capacidad `runFullTrust`, que requiere justificación.
- **Políticas que afectan a Tapomo:**
  - **Política de privacidad obligatoria** para apps Win32; vale el enlace a `PRIVACY.md`.
  - Ninguna regla prohíbe el gancho de teclado. Aun así, el análisis o la revisión podrían tomarlo por un keylogger, así que hay que explicarlo en las notas para los revisores (2.000 caracteres).
  - **Actualizador propio:** las reglas no son claras. Lo prudente es desactivarlo en la versión de la Store.
  - **Inicio con Windows:** la política 10.2.8 pide consentimiento. En la versión de la Store debería estar desactivado por defecto o preguntarse.
  - Cuestionario de edad IARC.
- **winget:** gratis, con un PR a `microsoft/winget-pkgs`, y no exige firma. Es útil para quien instala con `winget install`, pero no quita los avisos de SmartScreen.
- **Plan recomendado:**
  1. SignPath.
  2. Store por la opción A con el `.exe` firmado (unos 2–4 días de trabajo).
  3. winget.
  4. MSIX solo si la firma da problemas.

## Cómo se sostiene Tapomo (decidido por Pol el 15-10-2026)

Todo el código sigue siendo GPL-3.0 y la app es gratis en GitHub, sin nada bloqueado. Tapomo se sostiene de tres formas a la vez:

1. **Apoyo voluntario, visible y con cariño:**
   - Hay una tarjeta grande «Apoya a Tapomo» en la app y una sección en la web, con Ko-fi como botón principal y GitHub Sponsors para desarrolladores.
   - En momentos felices (premio de nivel, lección de tres estrellas) aparece una invitación amable: como mucho una vez al mes, nunca la primera semana y siempre se puede cerrar.
2. **Código de mecenas:**
   - Quien apoya recibe un código firmado (ed25519, `packaging/supporter/`) que la app comprueba sin conexión.
   - Desbloquea solo agradecimientos cosméticos: la skin «Mecenas» y la insignia.
   - Es un sistema de confianza: como el código es abierto, se podría saltar, y es aceptable.
3. **Versión de pago en Microsoft Store (5–9 €):**
   - Es la misma app; se paga por la comodidad de instalarla y actualizarla desde la Store. Es un modelo habitual en software libre (Krita, por ejemplo) y compatible con la GPL.
   - Requiere antes la firma de código (SignPath o un certificado), porque la Store exige el `.exe` firmado.

Se descartó un curso de pago cerrado. Rompería la confianza que necesita una app que escucha el teclado, y SignPath exige no tener componentes cerrados.

**Pendiente de Pol:**
- Crear la página de Ko-fi (`ko-fi.com/tapomo`) y el perfil de GitHub Sponsors. Los enlaces de la app y la web ya apuntan ahí.
- Hacer una copia de seguridad de `~/data/secrets/tapomo-supporter-ed25519.pem` fuera del servidor.
