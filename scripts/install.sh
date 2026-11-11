#!/usr/bin/env bash
# Instala (ou atualiza), ativa e recarrega os pacotes em ./packages/*
# (KWin Scripts, KWin Effects e o ícone da bandeja, um Plasma/Applet).
set -euo pipefail

cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "erro: '$1' não encontrado (Plasma 6 instalado?)" >&2; exit 1; }; }
need kpackagetool6
need kwriteconfig6
need dbus-send

NEEDS_RELOGIN=""
TRAY_ID=""
INSTALLED=""
DATA=${XDG_DATA_HOME:-$HOME/.local/share}
APP_ID=io.github.dionatansimioni.kubik

meta() { sed -n "s/.*\"$2\": *\"\([^\"]*\)\".*/\1/p" "$1/metadata.json" | head -n1; }
kwin() { dbus-send --session --print-reply --dest=org.kde.KWin "$@" >/dev/null 2>&1; }
# shellcheck source=shortcuts.sh
source ./shortcuts.sh

# Teclado: libera Meta+setas & cia. do KDE antes de o script (re)carregar.
sc_free_kde || true

for PKG in ./packages/*/; do
    PKG=${PKG%/}
    ID=$(meta "$PKG" Id)
    VERSION=$(meta "$PKG" Version)
    TYPE=$(meta "$PKG" KPackageStructure)
    [ -n "$ID" ] && [ -n "$TYPE" ] || { echo "erro: metadata.json inválido em $PKG" >&2; exit 1; }
    INSTALLED="$INSTALLED$TYPE $ID"$'\n'

    if kpackagetool6 --type="$TYPE" --show "$ID" >/dev/null 2>&1; then
        echo "Atualizando $ID para $VERSION…"
        kpackagetool6 --type="$TYPE" --upgrade "$PKG"
    else
        echo "Instalando $ID $VERSION…"
        kpackagetool6 --type="$TYPE" --install "$PKG"
    fi
    # O ícone da bandeja não é plugin do KWin: a bandeja do Plasma o mostra
    # sozinha (EnabledByDefault + X-Plasma-NotificationAreaCategory).
    [ "$TYPE" = Plasma/Applet ] && { TRAY_ID=$ID; continue; }
    kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" true

    # Recarrega para pegar a versão nova.
    case "$TYPE" in
        KWin/Script) kwin /Scripting org.kde.kwin.Scripting.unloadScript "string:$ID" || true ;;
        KWin/Effect)
            kwin /Effects org.kde.kwin.Effects.unloadEffect "string:$ID" || true
            kwin /Effects org.kde.kwin.Effects.loadEffect "string:$ID" || true
            # O KWin só descobre efeitos NOVOS ao iniciar a sessão: na primeira
            # instalação, o loadEffect falha até o próximo login.
            if ! dbus-send --session --print-reply --dest=org.kde.KWin /Effects \
                    org.kde.kwin.Effects.isEffectLoaded "string:$ID" 2>/dev/null | grep -q "boolean true"; then
                NEEDS_RELOGIN="$NEEDS_RELOGIN $ID"
            fi ;;
    esac
done

# Para desinstalar sem o pacote: uma cópia do uninstall.sh e a lista do que
# foi instalado.
mkdir -p "$DATA/kubik"
install -m755 ./uninstall.sh "$DATA/kubik/uninstall.sh"
install -m644 ./shortcuts.sh "$DATA/kubik/shortcuts.sh"
printf '%s' "$INSTALLED" > "$DATA/kubik/installed.list"
# O gerenciador é o próprio AppImage (um app Qt, com o Qt dentro): instalando
# por ele (KUBIK_APPIMAGE, que o AppRun passa), ele se guarda aqui e a entrada
# "Kubik" do menu o abre. Copia para um nome temporário e renomeia: um
# AppImage aberto (o gerenciador rodando) continua com o arquivo antigo.
# Sobras de versões anteriores (gerenciador no qml / no plasmawindowed) saem.
rm -rf "$DATA/kubik/manager" "$DATA/kubik/manager.sh" "$DATA/kubik/open.sh" "$DATA/plasma/plasmoids/$APP_ID.manager"
MANAGER=$DATA/kubik/Kubik.AppImage
SRC=${KUBIK_APPIMAGE:-}
if [ -n "$SRC" ] && [ -f "$SRC" ] && [ "$(readlink -f "$SRC")" != "$(readlink -f "$MANAGER")" ]; then
    cp "$SRC" "$MANAGER.new" && chmod 755 "$MANAGER.new" && mv -f "$MANAGER.new" "$MANAGER"
fi
# Ícone do app (menu, Scripts do KWin) e a entrada "Kubik" no menu, que abre o
# gerenciador (só se ele estiver guardado: instalado pelo .tar.gz, não há).
if [ -d ./share ]; then
    install -Dm644 "./share/$APP_ID.svg" "$DATA/icons/hicolor/scalable/apps/$APP_ID.svg"
    if [ -x "$MANAGER" ]; then
        mkdir -p "$DATA/applications"
        sed "s|^Exec=.*|Exec=\"$MANAGER\"|" "./share/$APP_ID.desktop" > "$DATA/applications/$APP_ID.desktop"
    else
        rm -f "$DATA/applications/$APP_ID.desktop"
    fi
    command -v kbuildsycoca6 >/dev/null && { kbuildsycoca6 >/dev/null 2>&1 || true; }
fi

kwin /KWin org.kde.KWin.reconfigure || true
SCRIPT_STARTED=1
kwin /Scripting org.kde.kwin.Scripting.start || SCRIPT_STARTED=""
if [ -n "$SCRIPT_STARTED" ]; then
    sleep 1
    sc_assign_kubik || true
fi
if [ -z "$SCRIPT_STARTED" ]; then
    echo "Instalado. Não consegui recarregar o KWin: ative em Configurações do Sistema › Scripts do KWin / Efeitos."
elif [ -n "$NEEDS_RELOGIN" ]; then
    echo
    echo "ATENÇÃO: instalado, mas${NEEDS_RELOGIN} só ativa depois de SAIR E ENTRAR na sessão."
    echo "         (O KWin só reconhece efeitos novos ao iniciar. Nas próximas atualizações não precisa.)"
else
    echo "Pronto: tudo instalado e ativo."
fi
if [ -n "${TRAY_ID:-}" ]; then
    echo "Ícone na bandeja: clique para ligar/desligar e ajustar; botão direito › Configurar Kubik…"
    echo "  (Se ele não aparecer ou não atualizar: systemctl --user restart plasma-plasmashell)"
fi
if [ -x "$MANAGER" ]; then
    echo "Menu: \"Kubik\" abre o gerenciador (atualizar, reparar, remover, configurações)."
fi
echo "Teclado: Meta+setas focam, Meta+Shift+setas movem, Meta+Alt+setas redimensionam;"
echo "  Meta+O gira a divisão, Meta+F flutua a janela, Meta+M monocle, Meta+Y liga/desliga."
echo "  (O quick tile do KDE nessas teclas foi desligado; o uninstall.sh devolve.)"
echo "Logs: journalctl --user -f | grep kubik"
