# Apps com barra de título própria em X11 (Chromium = base do Chrome e do
# Electron, ex.: Podman Desktop) que mudam a própria geometria depois de abrir.
source /work/testenv/lib.sh
CHROMIUM=$(command -v chromium-browser chromium | head -n1)

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
"$CHROMIUM" --no-sandbox --ozone-platform=x11 --user-data-dir=/tmp/chx --no-first-run \
    --no-default-browser-check --disable-gpu \
    "data:text/html,<title>Chrome</title><body style='background:%23c0f'></body>" >/dev/null 2>&1 &
for _ in $(seq 30); do xdotool search --name '^Chrome' >/dev/null 2>&1 && break; sleep 1; done
sleep 2
dump_windows tiled
wid=$(xdotool search --name '^Chrome' | head -1)

# 1) O app "restaura a sessão anterior" uma vez: deve voltar ao tile.
xdotool windowsize "$wid" 1000 700 windowmove "$wid" 60 40
sleep 2
dump_windows restored
screenshot restored

# 2) O app insiste (como um app que recusa o tamanho do tile).
for _ in 1 2 3 4 5; do
    xdotool windowsize "$wid" 1000 700 windowmove "$wid" 60 40
    sleep 0.6
done
sleep 1
dump_windows rebel
