# Regras de layout pedidas pelo usuário: 1 cheia, 2 lado a lado, 3 = metade +
# 2 quadrantes, 4 = quadrantes; minimizada libera o espaço; janelas ocultas
# (xwaylandvideobridge real) e janelas que abrem maximizadas.
source /work/testenv/lib.sh

# A ponte de vídeo do XWayland: janela transparente, fora da barra e do Alt+Tab.
# Só a imagem Fedora tem o pacote (o Arch não distribui mais).
if command -v xwaylandvideobridge >/dev/null; then
    xwaylandvideobridge >/dev/null 2>&1 &
    sleep 3
else
    echo "VIDEOBRIDGE ausente" >&2
fi
kwin_eval 'for (const w of workspace.stackingOrder) console.warn("BRIDGE " + JSON.stringify({c: w.caption, cls: w.resourceClass, normal: w.normalWindow, st: w.skipTaskbar, ss: w.skipSwitcher, op: w.opacity}))'

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
open_window Gamma 400x300 "#2f2f8b"
dump_windows three
open_window Delta 400x300 "#8b8b2f"
dump_windows four
screenshot four

kwin_eval 'win("Delta").minimized = true'
sleep 0.5
dump_windows minimized
kwin_eval 'win("Delta").minimized = false'
sleep 0.5
dump_windows restored

open_window Max 400x300 "#555555" maximized
sleep 1
dump_windows maximized
kwin_eval 'console.warn("MAXMODE " + win("Max").maximizeMode)'
screenshot maximized
