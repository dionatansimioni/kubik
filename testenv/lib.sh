# Funções para cenários do testenv (source /work/testenv/lib.sh).
# Rodam DENTRO do container, como sessão do KWin.

# A bandeja procura versões novas no GitHub: nos testes, nunca na internet
# (um endereço que não responde). O cenário do gerenciador troca por um
# servidor local (fake_releases).
export KUBIK_RELEASES_URL=${KUBIK_RELEASES_URL:-http://127.0.0.1:9/offline}

# Abre uma janela de teste e espera ela mapear: open_window <título> [LxA] [cor] [extras…]
QML_BIN=$(command -v /usr/lib/qt6/bin/qml /usr/lib64/qt6/bin/qml | head -n1)
open_window() {
    "$QML_BIN" /work/testenv/clients/window.qml -- "$@" >/dev/null 2>&1 &
    echo $! > "/tmp/window-$1.pid"
    wait_window "$1"
}

# Espera o KWin conhecer a janela <título> (até ~10 s) e o layout assentar.
# Um sleep fixo falhava com a máquina carregada (a suíte inteira rodando).
wait_window() {
    local i
    sleep 0.4
    for i in $(seq 20); do
        kwin_eval "if (win('$1')) console.warn('SEEN-WINDOW-$i ' + win('$1').caption)"
        grep -q "SEEN-WINDOW-$i $1\$" /out/kwin.log && break
    done
    sleep 0.5
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

# Arrasta e SEGURA parado no destino por <segundos> antes de soltar,
# tirando o screenshot <nome> no fim da espera (botão ainda pressionado):
#   drag_hold_and_shoot <nome> <segundos> X1 Y1 X2 Y2 [passos]
drag_hold_and_shoot() {
    local name=$1 secs=$2; shift 2
    FAKEINPUT_BEFORE_RELEASE="sleep $secs; python3 /work/testenv/screenshot.py /out/$name.png >/dev/null" \
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

# Servidor local com um "release" mais novo, para a bandeja achar e instalar:
# fake_releases <versão>. Reempacota o .tar.gz do build com a versão trocada e
# serve releases.json no formato da API do GitHub em 127.0.0.1:8765. Se o teste
# deixou /out/fake/Kubik-<versão>-x86_64.AppImage, ele vai junto no release.
fake_releases() {
    local v=$1 srv=/tmp/releases src
    rm -rf "$srv" && mkdir -p "$srv/build"
    tar xzf /out/pkg/kubik-*.tar.gz -C "$srv/build"
    src=$(find "$srv/build" -maxdepth 1 -type d -name 'kubik-*' | head -n1)
    sed -i "s/\"Version\": *\"[^\"]*\"/\"Version\": \"$v\"/" "$src"/packages/*/metadata.json
    mv "$src" "$srv/build/kubik-$v"
    tar czf "$srv/kubik-$v.tar.gz" -C "$srv/build" "kubik-$v"
    local ai="" name="Kubik-$v-x86_64.AppImage"
    if [ -f "/out/fake/$name" ]; then
        cp "/out/fake/$name" "$srv/$name"
        ai=", {\"name\": \"$name\", \"browser_download_url\": \"http://127.0.0.1:8765/$name\"}"
    fi
    cat > "$srv/releases.json" <<JSON
[{"tag_name": "kubik-v$v", "draft": false, "prerelease": true,
  "html_url": "http://127.0.0.1:8765/kubik-v$v",
  "assets": [{"name": "kubik-$v.tar.gz", "browser_download_url": "http://127.0.0.1:8765/kubik-$v.tar.gz"}$ai]},
 {"tag_name": "kubik-v0.0.1", "draft": false, "prerelease": true, "html_url": "", "assets": []}]
JSON
    (cd "$srv" && exec python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1) &
    sleep 1
    export KUBIK_RELEASES_URL=http://127.0.0.1:8765/releases.json
}

# Espera uma linha aparecer no kwin.log: wait_log <texto> [segundos]
wait_log() {
    local i
    for i in $(seq "${2:-20}"); do
        grep -qF "$1" /out/kwin.log && return 0
        sleep 1
    done
    echo "=== TIMEOUT esperando: $1" >&2
    return 1
}
