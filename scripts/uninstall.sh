#!/usr/bin/env bash
# Desativa e remove o Kubik: os pacotes, o ícone, a entrada do menu e os
# atalhos (devolve os do KDE). Roda de dois lugares:
#   - de dentro do .tar.gz (ao lado de ./packages/*);
#   - da cópia que o install.sh guarda em ~/.local/share/kubik (botão
#     "Desinstalar" do gerenciador), que usa a lista ./installed.list.
set -euo pipefail

cd "$(dirname "$0")"
DATA=${XDG_DATA_HOME:-$HOME/.local/share}
APP_ID=io.github.dionatansimioni.kubik
# shellcheck source=shortcuts.sh
source ./shortcuts.sh
sc_restore_kde || true

meta() { sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" "$1/metadata.json" | head -n1; }

# "<KPackageStructure> <Id>" de cada pacote a remover.
packages() {
    if [ -d ./packages ]; then
        for PKG in ./packages/*/; do echo "$(meta "${PKG%/}" KPackageStructure) $(meta "${PKG%/}" Id)"; done
    elif [ -s ./installed.list ]; then
        cat ./installed.list
    else
        printf '%s\n' "KWin/Script kubik" "KWin/Effect kubikanimations" "Plasma/Applet $APP_ID"
    fi
}

while read -r TYPE ID; do
    [ -n "$ID" ] || continue
    [ "$TYPE" = Plasma/Applet ] || kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" false || true
    # Para na hora (sem isso o script seguia rodando até o próximo login).
    case "$TYPE" in
        KWin/Script) dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "string:$ID" >/dev/null 2>&1 || true ;;
        KWin/Effect) dbus-send --session --print-reply --dest=org.kde.KWin /Effects org.kde.kwin.Effects.unloadEffect "string:$ID" >/dev/null 2>&1 || true ;;
    esac
    kpackagetool6 --type="$TYPE" --remove "$ID" || true
    echo "$ID removido."
done < <(packages)

rm -f "$DATA/icons/hicolor/scalable/apps/$APP_ID.svg" "$DATA/applications/$APP_ID.desktop"
command -v kbuildsycoca6 >/dev/null && { kbuildsycoca6 >/dev/null 2>&1 || true; }
rm -rf "$DATA/kubik"
dbus-send --session --print-reply --dest=org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null 2>&1 || true
echo "Kubik removido."
