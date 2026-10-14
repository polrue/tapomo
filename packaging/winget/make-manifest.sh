#!/usr/bin/env bash
# Writes the winget manifests for a published Tapomo release (multi-file format, schema 1.6).
#   ./make-manifest.sh 0.5.0            → manifests/p/PolRue/Tapomo/0.5.0/*.yaml
# Then open a PR to https://github.com/microsoft/winget-pkgs with that folder
# (or run `wingetcreate submit` / `komac submit`). winget does not require code signing.
set -euo pipefail
v=${1:?usage: make-manifest.sh <version>}
url="https://github.com/polrue/tapomo/releases/download/v$v/Tapomo_${v}_x64-setup.exe"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/setup.exe"
sha=$(sha256sum "$tmp/setup.exe" | cut -d' ' -f1 | tr a-f A-F)
dir="manifests/p/PolRue/Tapomo/$v"
mkdir -p "$dir"
id=PolRue.Tapomo
cat > "$dir/$id.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $v
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
YAML
cat > "$dir/$id.installer.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $v
InstallerType: nullsoft
Scope: user
InstallModes:
  - interactive
  - silent
UpgradeBehavior: install
ReleaseDate: $(date -u +%F)
Installers:
  - Architecture: x64
    InstallerUrl: $url
    InstallerSha256: $sha
ManifestType: installer
ManifestVersion: 1.6.0
YAML
cat > "$dir/$id.locale.en-US.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.defaultLocale.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $v
PackageLocale: en-US
Publisher: Pol Rué
PublisherUrl: https://github.com/polrue
PackageName: Tapomo
PackageUrl: https://github.com/polrue/tapomo
License: GPL-3.0-or-later
LicenseUrl: https://github.com/polrue/tapomo/blob/main/LICENSE
PrivacyUrl: https://github.com/polrue/tapomo/blob/main/PRIVACY.md
ShortDescription: Measures your real typing speed while you work, privately, with a friendly mochi mascot.
Description: Tapomo passively measures typing speed (words per minute, peaks, streaks) in every app, keeps only local aggregates (never the text) and turns it into gentle goals, levels, badges and typing lessons.
Moniker: tapomo
Tags:
  - typing
  - wpm
  - productivity
  - typing-tutor
ReleaseNotesUrl: https://github.com/polrue/tapomo/releases/tag/v$v
ManifestType: defaultLocale
ManifestVersion: 1.6.0
YAML
cat > "$dir/$id.locale.es-ES.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.locale.1.6.0.schema.json
PackageIdentifier: $id
PackageVersion: $v
PackageLocale: es-ES
Publisher: Pol Rué
PackageName: Tapomo
ShortDescription: Mide tu velocidad real al escribir mientras trabajas, en privado y con una mascota mochi.
Description: Tapomo mide sin molestar a qué velocidad escribes (palabras por minuto, picos, rachas) en todas las aplicaciones, guarda solo resúmenes locales (nunca el texto) y lo convierte en objetivos amables, niveles, insignias y lecciones de mecanografía.
ManifestType: locale
ManifestVersion: 1.6.0
YAML
echo "Written $dir (sha256 $sha)"
