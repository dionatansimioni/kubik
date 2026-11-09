# Funções para cenários do testenv (source /work/testenv/lib.sh).
# Rodam DENTRO do container, como sessão do KWin.

# Abre uma janela de teste e espera ela mapear: open_window <título> [LxA]
QML_BIN=$(command -v /usr/lib/qt6/bin/qml /usr/lib64/qt6/bin/qml | head -n1)
open_window() {
    "$QML_BIN" /work/testenv/clients/window.qml -- "$1" "${2:-400x300}" >/dev/null 2>&1 &
    sleep 1
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
