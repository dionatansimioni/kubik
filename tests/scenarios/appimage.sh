# O AppImage sem o gerenciador em Qt: o menu de reserva do kdialog (forçado
# com KUBIK_KDIALOG=1, ou porque o app não abriu) e as opções de terminal.
# O kdialog é trocado por um falso que registra cada janela no log; no
# --menu, responde com a próxima linha de /tmp/kd-answers (sem nenhuma:
# Cancelar).
source /work/testenv/lib.sh

mkdir -p /tmp/shim
cat > /tmp/shim/kdialog <<'SHIM'
#!/bin/bash
# Uma escrita só: o log do KWin vai para o mesmo lugar e se intercalava.
line="KDIALOG$(printf ' [%s]' "$@" | tr '\n' ' ')"
echo "$line" >&2
for a in "$@"; do
    if [ "$a" = --menu ]; then
        ans=$(head -n1 /tmp/kd-answers 2>/dev/null)
        [ -n "$ans" ] || exit 1
        sed -i 1d /tmp/kd-answers
        echo "$ans"
        exit 0
    fi
done
exit 0
SHIM
chmod +x /tmp/shim/kdialog
export PATH=/tmp/shim:$PATH APPIMAGE_EXTRACT_AND_RUN=1
AI=$(ls /out/appimage/Kubik-*.AppImage)
answers() { printf '%s\n' "$@" > /tmp/kd-answers; }

DATA=$HOME/.local/share
state() {
    echo "=== STATE $1 script=$(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded string:kubik 2>/dev/null | awk '/boolean/ {print $2}') tray=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik >/dev/null 2>&1 && echo yes || echo no) icon=$(test -f "$DATA/icons/hicolor/scalable/apps/io.github.dionatansimioni.kubik.svg" && echo yes || echo no) menu=$(test -f "$DATA/applications/io.github.dionatansimioni.kubik.desktop" && echo yes || echo no) manager=$(test -x "$DATA/kubik/Kubik.AppImage" && echo yes || echo no)" >&2
}

# O testenv instala o script antes do KWin iniciar; aqui começamos do zero.
dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript string:kubik >/dev/null
kpackagetool6 -t KWin/Script -r kubik >/dev/null
kwriteconfig6 --file kwinrc --group Plugins --key kubikEnabled false
state clean

# Menu do kdialog (forçado): instalar e sair.
mark gui_first
answers install
LANG=pt_BR.UTF-8 LANGUAGE=pt_BR KUBIK_KDIALOG=1 "$AI" >&2
echo "=== exit $?" >&2
state gui_first
echo "=== desktop exec: $(sed -n 's/^Exec=//p' "$DATA/applications/io.github.dionatansimioni.kubik.desktop" 2>/dev/null)" >&2

# De novo: o menu sabe que está instalado; remover (com confirmação).
mark gui_again
answers remove
KUBIK_KDIALOG=1 "$AI" >&2
echo "=== exit $?" >&2
state gui_again

mark cli_install
"$AI" --install --yes >&2
state cli_install

mark cli_uninstall
"$AI" --uninstall --yes >&2
state cli_uninstall

# O gerenciador em Qt não abre (aqui: plataforma inexistente): cai no menu, e
# o motivo fica no log.
mark broken_manager
answers
QT_QPA_PLATFORM=nenhuma "$AI" >&2
echo "=== exit $?" >&2
echo "=== RUNLOG" >&2
cat "$HOME/.cache/kubik/appimage.log" >&2
