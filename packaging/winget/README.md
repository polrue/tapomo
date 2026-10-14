# winget

`make-manifest.sh <versión>` genera los manifiestos de winget para una versión **ya publicada** (descarga el instalador y calcula la SHA-256). winget no exige firma de código.

Para publicar en winget (lo hace Pol, porque es un PR con su cuenta a un repositorio de Microsoft):

1. Aprobar y publicar la versión en GitHub Releases.
2. `./make-manifest.sh 0.5.0`
3. Abrir un PR a [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) con la carpeta `manifests/p/PolRue/Tapomo/0.5.0/`, o usar `wingetcreate submit` / `komac submit`.
4. Las versiones siguientes se pueden automatizar con la acción `vedantmgoyal9/winget-releaser` en el flujo de publicación (necesita un token personal de GitHub de Pol como secreto).

Nota: el instalador es NSIS por usuario (`Scope: user`, sin permisos de administrador). El silencio de la instalación (`/S`) ya lo admite el instalador de Tauri.
