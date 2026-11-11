# Gerenciador (a bandeja numa janela, como a entrada "Kubik" do menu abre):
# mostra a versão, acha a versão nova num "GitHub" local, atualiza com o
# botão e desinstala com o botão (com confirmação).
source /work/testenv/lib.sh

fake_releases 99.0.0

placed() {
    local i
    for i in $(seq 30); do
        kwin_eval "const v = workspace.stackingOrder.find(w => w.caption === '$1'); if (v) { v.frameGeometry = {x: 820, y: 40, width: 420, height: 560}; console.warn('PLACED-$i'); }"
        grep -q "PLACED-$i" /out/kwin.log && break
    done
}
plasmoidviewer -a io.github.dionatansimioni.kubik -f planar -s 420x560 >&2 2>&1 &
placed Plasmoidviewer
wait_log "[kubik-tray] nova versão: 99.0.0"
sleep 2
screenshot manager
DATA=$HOME/.local/share
files() {
    echo "=== FILES $1 icon=$(test -f "$DATA/icons/hicolor/scalable/apps/io.github.dionatansimioni.kubik.svg" && echo yes || echo no) desktop=$(test -f "$DATA/applications/io.github.dionatansimioni.kubik.desktop" && echo yes || echo no) uninstaller=$(test -x "$DATA/kubik/uninstall.sh" && echo yes || echo no) script=$(kpackagetool6 -t KWin/Script --show kubik >/dev/null 2>&1 && echo yes || echo no) tray=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik >/dev/null 2>&1 && echo yes || echo no)" >&2
}
click() { python3 /work/testenv/fakeinput.py click "$1" "$2"; sleep "${3:-1.5}"; }

# Coordenadas com o plasmoidviewer em (820,40) 420×560 (screenshot "manager").
mark update
click 1118 311 0.5
screenshot updating
wait_log "[kubik-tray] atualizado para 99.0.0" 60
sleep 1
screenshot updated
files updated
echo "=== desktop exec: $(sed -n 's/^Exec=//p' "$DATA/applications/io.github.dionatansimioni.kubik.desktop")" >&2

mark uninstall
click 1110 345
screenshot confirm
click 1048 345 0.5
wait_log "[kubik-tray] desinstalado" 30
sleep 1
screenshot removed
files removed
echo "=== keys after uninstall quicktile=[$(dbus-send --session --print-reply --dest=org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel.shortcut 'array:string:kwin,Window Quick Tile Left,KWin,Window Quick Tile Left' | awk '/int32/ {print $2}' | paste -sd, -)]" >&2
