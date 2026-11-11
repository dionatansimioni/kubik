# Configuração ao vivo: o que a bandeja faz (grava o kwinrc e pede um
# reconfigure ao KWin) tem que valer na hora, sem recarregar o script.
source /work/testenv/lib.sh

set_kubik() { kwriteconfig6 --file kwinrc --group Script-kubik --key "$1" "$2"; }
set_effect() { kwriteconfig6 --file kwinrc --group Effect-kubikanimations --key "$1" "$2"; }
# O mesmo que a bandeja: o efeito não ouve o reconfigure geral, só o dele.
reconfigure() {
    dbus-send --session --print-reply --dest=org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null
    dbus-send --session --print-reply --dest=org.kde.KWin /Effects \
        org.kde.kwin.Effects.reconfigureEffect string:kubikanimations >/dev/null
    sleep 1.2
}

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
sleep 0.5
dump_windows start

mark gaps
set_kubik GapsInner 20
set_kubik GapsOuter 0
reconfigure
dump_windows gaps

mark exception
kcalc >/dev/null 2>&1 &
KCALC=$!  # pelo PID: a imagem do Fedora não tem pkill
sleep 2.5
dump_windows with_kcalc
set_kubik Exceptions "org.kde.kcalc"
reconfigure
dump_windows kcalc_exception
kill "$KCALC"
sleep 1

mark border
kwin_eval 'workspace.activeWindow = win("Alpha")'
set_kubik BorderWidth 8
reconfigure
screenshot border8

mark off
set_kubik Enabled false
reconfigure
dump_windows off
# Um reconfigure sem mudar Enabled (ex.: tema) não desfaz o Meta+Y.
shortcut "Kubik: Toggle tiling" 1
reconfigure
dump_windows toggled_on

mark animation
set_kubik AnimDuration 0
set_effect Duration 0
reconfigure
kill "$(cat /tmp/window-Beta.pid)"
sleep 0.15
screenshot no_animation
sleep 1
dump_windows alone
