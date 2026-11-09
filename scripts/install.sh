#!/usr/bin/env bash
# Instala (ou atualiza), ativa e recarrega os pacotes em ./packages/*
# (KWin Scripts e KWin Effects).
set -euo pipefail

cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "erro: '$1' não encontrado (Plasma 6 instalado?)" >&2; exit 1; }; }
need kpackagetool6
need kwriteconfig6
need dbus-send

meta() { sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" "$1/metadata.json" | head -n1; }
kwin() { dbus-send --session --print-reply --dest=org.kde.KWin "$@" >/dev/null 2>&1; }

for PKG in ./packages/*/; do
    PKG=${PKG%/}
    ID=$(meta "$PKG" Id)
    VERSION=$(meta "$PKG" Version)
    TYPE=$(meta "$PKG" KPackageStructure)
    [ -n "$ID" ] && [ -n "$TYPE" ] || { echo "erro: metadata.json inválido em $PKG" >&2; exit 1; }

    if kpackagetool6 --type="$TYPE" --show "$ID" >/dev/null 2>&1; then
        echo "Atualizando $ID para $VERSION…"
        kpackagetool6 --type="$TYPE" --upgrade "$PKG"
    else
        echo "Instalando $ID $VERSION…"
        kpackagetool6 --type="$TYPE" --install "$PKG"
    fi
    kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" true

    # Recarrega para pegar a versão nova.
    case "$TYPE" in
        KWin/Script) kwin /Scripting org.kde.kwin.Scripting.unloadScript "string:$ID" || true ;;
        KWin/Effect)
            kwin /Effects org.kde.kwin.Effects.unloadEffect "string:$ID" || true
            kwin /Effects org.kde.kwin.Effects.loadEffect "string:$ID" || true ;;
    esac
done

kwin /KWin org.kde.KWin.reconfigure || true
if kwin /Scripting org.kde.kwin.Scripting.start; then
    echo "Pronto: tudo instalado e ativo."
else
    echo "Instalado. Não consegui recarregar o KWin: ative em Configurações do Sistema › Scripts do KWin / Efeitos."
fi
echo "Logs: journalctl --user -f | grep kubik"
