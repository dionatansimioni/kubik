#!/usr/bin/env bash
# Instala (ou atualiza) o KWin Script contido em ./package e o ativa.
set -euo pipefail

cd "$(dirname "$0")"
PKG=./package

need() { command -v "$1" >/dev/null 2>&1 || { echo "erro: '$1' não encontrado (Plasma 6 instalado?)" >&2; exit 1; }; }
need kpackagetool6
need kwriteconfig6

ID=$(sed -n 's/.*"Id": *"\([^"]*\)".*/\1/p' "$PKG/metadata.json" | head -n1)
VERSION=$(sed -n 's/.*"Version": *"\([^"]*\)".*/\1/p' "$PKG/metadata.json" | head -n1)
[ -n "$ID" ] || { echo "erro: Id não encontrado em metadata.json" >&2; exit 1; }

if kpackagetool6 --type=KWin/Script --show "$ID" >/dev/null 2>&1; then
    echo "Atualizando $ID para $VERSION…"
    kpackagetool6 --type=KWin/Script --upgrade "$PKG"
else
    echo "Instalando $ID $VERSION…"
    kpackagetool6 --type=KWin/Script --install "$PKG"
fi

kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" true

# Recarrega o script: desativa e reativa para pegar a versão nova.
QDBUS=$(command -v qdbus6 || command -v qdbus || true)
if [ -n "$QDBUS" ]; then
    "$QDBUS" org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$ID" >/dev/null 2>&1 || true
    "$QDBUS" org.kde.KWin /KWin reconfigure >/dev/null 2>&1 || true
    "$QDBUS" org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null 2>&1 || true
    echo "Pronto: $ID $VERSION instalado e ativo."
else
    echo "Instalado. qdbus6 não encontrado: ative em Configurações do Sistema › Scripts do KWin."
fi
echo "Logs: journalctl --user -f | grep kubik"
