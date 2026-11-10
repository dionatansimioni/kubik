# Empilhar sobre um app sem a barra de título do KDE (Chromium = base do
# Chrome): segurando a janela sobre ele, em qualquer ponto.
source /work/testenv/lib.sh
CHROMIUM=$(command -v chromium-browser chromium | head -n1)

open_window Alpha 400x300 "#8b2f2f"
"$CHROMIUM" --no-sandbox --ozone-platform=x11 --user-data-dir=/tmp/chx --no-first-run \
    --no-default-browser-check --disable-gpu \
    "data:text/html,<title>Chrome</title><body style='background:%23c0f'></body>" >/dev/null 2>&1 &
for _ in $(seq 30); do xdotool search --name '^Chrome' >/dev/null 2>&1 && break; sleep 1; done
sleep 3
dump_windows start

# Alpha pela barra de título até o meio do Chromium, segura ~1 s.
drag_hold_and_shoot holding 1.0 321 18 960 450 30
sleep 1
dump_windows stacked
screenshot stacked
