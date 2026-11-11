#!/usr/bin/env bash
# Desativa e remove os pacotes em ./packages/*.
set -euo pipefail

cd "$(dirname "$0")"
meta() { sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" "$1/metadata.json" | head -n1; }

for PKG in ./packages/*/; do
    PKG=${PKG%/}
    ID=$(meta "$PKG" Id)
    TYPE=$(meta "$PKG" KPackageStructure)
    [ "$TYPE" = Plasma/Applet ] || kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" false || true
    if [ "$TYPE" = KWin/Effect ]; then
        dbus-send --session --print-reply --dest=org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect "string:$ID" >/dev/null 2>&1 || true
    fi
    kpackagetool6 --type="$TYPE" --remove "$ID" || true
    echo "$ID removido."
done
dbus-send --session --print-reply --dest=org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 || true
