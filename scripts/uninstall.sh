#!/usr/bin/env bash
# Desativa e remove o KWin Script contido em ./package.
set -euo pipefail

cd "$(dirname "$0")"
ID=$(sed -n 's/.*"Id": *"\([^"]*\)".*/\1/p' package/metadata.json | head -n1)

kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" false || true
dbus-send --session --print-reply --dest=org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 || true
kpackagetool6 --type=KWin/Script --remove "$ID"
echo "$ID removido."
