# O instalador AppImage, como o usuário usa: dois cliques (janelas do
# kdialog), de novo com tudo instalado, e as opções de terminal. O kdialog é
# trocado por um falso que registra cada janela no log e responde "sim"
# (ou "fechar", na de três botões).
source /work/testenv/lib.sh

mkdir -p /tmp/shim
cat > /tmp/shim/kdialog <<'SHIM'
#!/bin/bash
printf 'KDIALOG' >&2; printf ' [%s]' "$@" | tr '\n' ' ' >&2; echo >&2
for a in "$@"; do [ "$a" = --yesnocancel ] && exit 2; done
exit 0
SHIM
chmod +x /tmp/shim/kdialog
# As janelas do kdialog são o plano B (sem o plasmawindowed para o
# gerenciador); aqui forçadas, para testar esse caminho também no Arch.
export PATH=/tmp/shim:$PATH APPIMAGE_EXTRACT_AND_RUN=1 KUBIK_KDIALOG=1
AI=$(ls /out/appimage/Kubik-*.AppImage)

DATA=$HOME/.local/share
state() {
    echo "=== STATE $1 script=$(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded string:kubik 2>/dev/null | awk '/boolean/ {print $2}') tray=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik >/dev/null 2>&1 && echo yes || echo no) icon=$(test -f "$DATA/icons/hicolor/scalable/apps/io.github.dionatansimioni.kubik.svg" && echo yes || echo no) menu=$(test -f "$DATA/applications/io.github.dionatansimioni.kubik.desktop" && echo yes || echo no)" >&2
}

# O testenv instala o script antes do KWin iniciar; aqui começamos do zero.
dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript string:kubik >/dev/null
kpackagetool6 -t KWin/Script -r kubik >/dev/null
kwriteconfig6 --file kwinrc --group Plugins --key kubikEnabled false
state clean

mark gui_first
LANG=pt_BR.UTF-8 LANGUAGE=pt_BR "$AI" >&2
state gui_first
# "Abrir o Kubik" abre o gerenciador instalado (se o sistema tem o Plasma).
if command -v plasmawindowed >/dev/null; then
    wait_log "[kubik-manager] aberto" 20
    sleep 1
    kwin_eval "workspace.stackingOrder.forEach(w => { if (w.caption === 'Kubik') { console.warn('=== MANAGER ' + w.resourceClass + ' ' + w.width + 'x' + w.height); w.closeWindow(); } })"
fi

mark gui_again
"$AI" >&2
echo "=== exit $?" >&2

mark cli_uninstall
"$AI" --uninstall --yes >&2
state cli_uninstall

mark cli_install
"$AI" --install --yes >&2
state cli_install

# Sem o plasmawindowed (imagem do Fedora, só com o KWin), o AppImage cai
# sozinho nas janelas do kdialog.
if ! command -v plasmawindowed >/dev/null; then
    mark no_plasmawindowed
    env -u KUBIK_KDIALOG "$AI" >&2
    echo "=== exit $?" >&2
fi
