# Funções para cenários do testenv (source /work/testenv/lib.sh).
# Rodam DENTRO do container, como sessão do KWin.

# Abre uma janela de teste e espera ela mapear: open_window <título> [LxA] [cor]
QML_BIN=$(command -v /usr/lib/qt6/bin/qml /usr/lib64/qt6/bin/qml | head -n1)
open_window() {
    "$QML_BIN" /work/testenv/clients/window.qml -- "$1" "${2:-400x300}" ${3:+"$3"} >/dev/null 2>&1 &
    echo $! > "/tmp/window-$1.pid"
    sleep 1
}

# Fecha a janela de teste aberta com open_window <título>.
close_window() {
    kill "$(cat "/tmp/window-$1.pid")"
    sleep 1
}

# Imprime no kwin.log a geometria real de cada janela: "WINDOW <tag> {json}".
dump_windows() {
    local tag=$1 file="/tmp/dump-$1.js" id
    sed "s/@TAG@/$tag/" /work/testenv/probe/dump.js > "$file"
    id=$(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting \
        org.kde.kwin.Scripting.loadScript "string:$file" "string:dump-$tag" | awk '/int32/ {print $2}')
    dbus-send --session --print-reply --dest=org.kde.KWin "/Scripting/Script$id" org.kde.kwin.Script.run >/dev/null
    sleep 0.3
    dbus-send --session --print-reply --dest=org.kde.KWin /Scripting \
        org.kde.kwin.Scripting.unloadScript "string:dump-$tag" >/dev/null
}

# Salva um screenshot da tela inteira em /out/<nome>.png.
screenshot() {
    python3 /work/testenv/screenshot.py "/out/$1.png" >/dev/null
}

# Dispara um atalho global registrado pelo KWin (pelo nome da ação).
shortcut() {
    dbus-send --session --print-reply --dest=org.kde.kglobalaccel /component/kwin \
        org.kde.kglobalaccel.Component.invokeShortcut "string:$1" >/dev/null
    sleep "${2:-0.5}"
}

# Marca um ponto no kwin.log, para o teste saber em que fase está.
mark() {
    echo "=== MARK $1 ===" >&2
}

# Mouse simulado (testenv/fakeinput.py): drag X1 Y1 X2 Y2 [passos]
drag() {
    python3 /work/testenv/fakeinput.py drag "$@"
    sleep 0.5
}

# Como drag, mas tira o screenshot <nome> com o botão ainda pressionado.
drag_and_shoot() {
    local name=$1; shift
    FAKEINPUT_BEFORE_RELEASE="python3 /work/testenv/screenshot.py /out/$name.png >/dev/null" \
        python3 /work/testenv/fakeinput.py drag "$@"
    sleep 0.5
}

mouse_move() {
    python3 /work/testenv/fakeinput.py move "$@"
}

# Executa JavaScript dentro do KWin (API de scripts: workspace, etc.).
#   kwin_eval 'workspace.activeWindow.minimized = true'
# Atalho: win("<título>") devolve a janela com aquele título.
kwin_eval() {
    local file; file=$(mktemp /tmp/eval-XXXX.js)
    {
        echo 'function win(t) { return workspace.stackingOrder.find(w => w.caption === t); }'
        echo "$1"
    } > "$file"
    local name; name=$(basename "$file" .js)
    local id; id=$(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting \
        org.kde.kwin.Scripting.loadScript "string:$file" "string:$name" | awk '/int32/ {print $2}')
    dbus-send --session --print-reply --dest=org.kde.KWin "/Scripting/Script$id" org.kde.kwin.Script.run >/dev/null
    sleep 0.3
    dbus-send --session --print-reply --dest=org.kde.KWin /Scripting \
        org.kde.kwin.Scripting.unloadScript "string:$name" >/dev/null
}

# Abre um app real e espera ele mapear: open_app <comando> [espera]
open_app() {
    $1 >/dev/null 2>&1 &
    sleep "${2:-2.5}"
}
