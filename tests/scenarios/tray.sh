# Ícone da bandeja (plasmoidviewer com o applet, num KWin real com o Kubik):
# lê o kwinrc que já existe, grava o que o usuário muda no popup e acompanha o
# Meta+Y. O plasmoidviewer é exceção (KUBIK_KWINRC) e vai para um lugar fixo,
# para os cliques caírem nos controles.
source /work/testenv/lib.sh

rc() { kreadconfig6 --file kwinrc --group Script-kubik --key "$1"; }
show_rc() { echo "=== RC $1 Enabled=$(rc Enabled) Gaps=$(rc GapsInner)/$(rc GapsOuter) Border=$(rc BorderEnabled)/$(rc BorderWidth) AllOff=$(rc AllDesktopsOff) Exc=$(rc Exceptions)" >&2; }

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"

plasmoidviewer -a io.github.dionatansimioni.kubik -f planar -s 420x480 >&2 2>&1 &
for i in $(seq 30); do
    kwin_eval "const v = workspace.stackingOrder.find(w => w.caption === 'Plasmoidviewer'); if (v) { v.frameGeometry = {x: 820, y: 40, width: 420, height: 480}; console.warn('VIEWER-PLACED-$i ' + v.resourceClass + ' ' + v.desktopFileName); }"
    grep -q "VIEWER-PLACED-$i" /out/kwin.log && break
done
sleep 3
show_rc start
screenshot popup
dump_windows start

# Coordenadas dos controles com o plasmoidviewer em (820,40) 420×480
# (conferidas no screenshot "popup").
click() { python3 /work/testenv/fakeinput.py click "$1" "$2"; sleep "${3:-1.5}"; }

mark switch_off
click 1104 101
show_rc switch_off
dump_windows off

mark shortcut_on
shortcut "Kubik: Toggle tiling" 1.5
show_rc shortcut_on
dump_windows on

mark gaps
click 972 141 0.2
click 972 141
show_rc gaps
dump_windows gaps

mark border
click 843 176
show_rc border

mark screen
click 843 233
show_rc screen
screenshot popup_after

mark configure
click 1105 268 5
screenshot configure

# Janela "Kubik Settings" em (280,112) 720×576: categorias à esquerda,
# OK/Apply/Cancel embaixo.
apply_settings() { click 868 667 2; }

mark exceptions_page
click 343 250 3
screenshot exceptions_page
click 429 320 0.5   # marca "qml" (as janelas de teste Alpha e Beta)
apply_settings
show_rc exceptions
dump_windows exceptions

mark animation_page
click 343 315 3
click 537 208 0.5   # duração no começo do slider: 0 (sem animação)
screenshot animation_page
apply_settings
echo "=== RC anim AnimDuration=$(rc AnimDuration) AnimCurve=$(rc AnimCurve) EffectDuration=$(kreadconfig6 --file kwinrc --group Effect-kubikanimations --key Duration)" >&2
