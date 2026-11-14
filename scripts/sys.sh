#!/bin/sh
# Auxiliar do Kubik para as ferramentas do sistema que mudam de distro para
# distro (ver docs/DESIGN.md, Lição 48): o cliente de D-Bus e o de download. Cada
# subcomando tenta os programas em ordem e devolve a saída sempre no mesmo
# formato. Faltando todos: código 127 e, no stderr,
# "kubik-sys: falta <o quê>; instale: <comando>".
#
# POSIX sh: chamado como `sh sys.sh …` (a bandeja não depende do bit de
# execução). KUBIK_SYS_DISABLE="dbus-send gdbus" finge que esses programas não
# existem (testes).
#
#   sys.sh tools
#   sys.sh dbus-bool <serviço> <caminho> <interface.método> <texto>   → true|false
#   sys.sh dbus-call <serviço> <caminho> <interface.método> [<texto>…]
#   sys.sh shortcut-get <ação do KWin>                                → 1,2 (ou vazio)
#   sys.sh shortcut-set <ação do KWin> <inteiro>[,<inteiro>…]        (0 = sem tecla)
#   sys.sh fetch <url> <arquivo|-> [<header>]
#   sys.sh dbus-int <serviço> <caminho> <interface.método> [<texto>…]  → o inteiro devolvido
#   sys.sh require dbus|shortcuts|fetch    (sai com 127 e a dica se faltar)
#   sys.sh session-mark        anota que o painel precisa reiniciar (Lição 50)
#   sys.sh session-pending     → plasmaRestart=true|false
#   sys.sh plasma-restart      reinicia o plasmashell (o painel some por 2 a 3 s)
#   sys.sh logout              abre a tela de encerrar a sessão do KDE

has() {
    case " ${KUBIK_SYS_DISABLE:-} " in *" $1 "*) return 1 ;; esac
    command -v "$1" >/dev/null 2>&1
}

# O qdbus tem um nome em cada distro (Arch/Debian: qdbus6; Fedora: qdbus-qt6).
qdbus_bin() {
    for q in qdbus6 qdbus-qt6 qdbus; do has "$q" && { echo "$q"; return 0; }; done
    return 1
}

# KUBIK_OS_RELEASE: outro os-release (testes).
distro() {
    f=${KUBIK_OS_RELEASE:-/etc/os-release}
    [ -r "$f" ] || return 0
    # shellcheck disable=SC1090
    (. "$f"; echo "${ID:-} ${ID_LIKE:-}")
}

# Comando que instala o que falta, na distro atual: hint dbus|fetch
hint() {
    d=" $(distro) "
    case "$1:$d" in
        dbus:*" fedora "*|dbus:*" rhel "*) echo "sudo dnf install dbus-tools" ;;
        dbus:*" debian "*|dbus:*" ubuntu "*) echo "sudo apt install dbus-bin" ;;
        dbus:*" arch "*) echo "sudo pacman -S dbus" ;;
        dbus:*" opensuse"*|dbus:*" suse "*) echo "sudo zypper install dbus-1-tools" ;;
        dbus:*) echo "dbus-send" ;;
        fetch:*" fedora "*|fetch:*" rhel "*) echo "sudo dnf install curl" ;;
        fetch:*" debian "*|fetch:*" ubuntu "*) echo "sudo apt install wget" ;;
        fetch:*" arch "*) echo "sudo pacman -S curl" ;;
        fetch:*" opensuse"*|fetch:*" suse "*) echo "sudo zypper install curl" ;;
        fetch:*) echo "curl" ;;
    esac
}

# Faltando: missing dbus|shortcuts|fetch (sai com 127).
missing() {
    case "$1" in
        dbus) echo "kubik-sys: falta um cliente de D-Bus (dbus-send, gdbus ou qdbus6); instale: $(hint dbus)" >&2 ;;
        shortcuts) echo "kubik-sys: falta dbus-send ou gdbus para os atalhos (o qdbus não serve); instale: $(hint dbus)" >&2 ;;
        fetch) echo "kubik-sys: falta um programa de download (curl ou wget); instale: $(hint fetch)" >&2 ;;
    esac
    exit 127
}

# Ações do kglobalaccel do KWin: nome sem aspas, vírgulas ou barras.
check_action() {
    case "$1" in
        ""|*[\'\",\\\[\]]*) echo "kubik-sys: nome de ação inválido: $1" >&2; exit 2 ;;
    esac
}

check_keys() {
    case "$1" in
        ""|*[!0-9,]*) echo "kubik-sys: teclas inválidas: $1" >&2; exit 2 ;;
    esac
}

KGA_DEST=org.kde.kglobalaccel
KGA_PATH=/kglobalaccel
KGA_IFACE=org.kde.KGlobalAccel

cmd_tools() {
    for t in dbus-send gdbus qdbus6 qdbus-qt6 qdbus curl wget wget2 kreadconfig6 kwriteconfig6 kpackagetool6; do
        if has "$t"; then echo "$t=yes"; else echo "$t=no"; fi
    done
    if has dbus-send; then echo "dbus=dbus-send"
    elif has gdbus; then echo "dbus=gdbus"
    elif q=$(qdbus_bin); then echo "dbus=$q"
    else echo "dbus=none"; fi
    if has dbus-send; then echo "shortcuts=dbus-send"
    elif has gdbus; then echo "shortcuts=gdbus"
    else echo "shortcuts=none"; echo "dbus_hint=$(hint dbus)"; fi
    if has curl; then echo "fetch=curl"
    elif has wget; then echo "fetch=wget"
    elif has wget2; then echo "fetch=wget2"
    else echo "fetch=none"; echo "fetch_hint=$(hint fetch)"; fi
}

cmd_dbus_bool() {
    [ $# -eq 4 ] || { echo "uso: sys.sh dbus-bool <serviço> <caminho> <interface.método> <texto>" >&2; exit 2; }
    if has dbus-send; then
        out=$(dbus-send --session --print-reply --dest="$1" "$2" "$3" "string:$4" 2>/dev/null) || out=""
        case "$out" in *"boolean true"*) echo true ;; *) echo false ;; esac
    elif has gdbus; then
        out=$(gdbus call --session --dest "$1" --object-path "$2" --method "$3" "$4" 2>/dev/null) || out=""
        case "$out" in "(true,)"*) echo true ;; *) echo false ;; esac
    elif q=$(qdbus_bin); then
        out=$("$q" "$1" "$2" "$3" "$4" 2>/dev/null) || out=""
        case "$out" in true*) echo true ;; *) echo false ;; esac
    else
        missing dbus
    fi
}

cmd_dbus_call() {
    [ $# -ge 3 ] || { echo "uso: sys.sh dbus-call <serviço> <caminho> <interface.método> [<texto>…]" >&2; exit 2; }
    dest=$1 path=$2 method=$3
    shift 3
    if has dbus-send; then
        # Cada texto vira "string:<texto>" (com espaços preservados).
        n=$#
        for a do set -- "$@" "string:$a"; done
        shift "$n"
        dbus-send --session --print-reply --dest="$dest" "$path" "$method" "$@" >/dev/null
    elif has gdbus; then
        gdbus call --session --dest "$dest" --object-path "$path" --method "$method" "$@" >/dev/null
    elif q=$(qdbus_bin); then
        "$q" "$dest" "$path" "$method" "$@" >/dev/null
    else
        missing dbus
    fi
}

cmd_dbus_int() {
    [ $# -ge 3 ] || { echo "uso: sys.sh dbus-int <serviço> <caminho> <interface.método> [<texto>…]" >&2; exit 2; }
    dest=$1 path=$2 method=$3
    shift 3
    if has dbus-send; then
        n=$#
        for a do set -- "$@" "string:$a"; done
        shift "$n"
        dbus-send --session --print-reply --dest="$dest" "$path" "$method" "$@" 2>/dev/null \
            | sed -n 's/^ *int32 \(-\{0,1\}[0-9][0-9]*\).*/\1/p' | sed -n 1p
    elif has gdbus; then
        gdbus call --session --dest "$dest" --object-path "$path" --method "$method" "$@" 2>/dev/null \
            | sed -n 's/^(\(int32 \)\{0,1\}\(-\{0,1\}[0-9][0-9]*\),)$/\2/p'
    elif q=$(qdbus_bin); then
        "$q" "$dest" "$path" "$method" "$@" 2>/dev/null | sed -n 's/^\(-\{0,1\}[0-9][0-9]*\)$/\1/p' | sed -n 1p
    else
        missing dbus
    fi
}

cmd_require() {
    t=$(cmd_tools)
    case "${1:-}" in
        dbus) case "$t" in *"dbus=none"*) missing dbus ;; esac ;;
        shortcuts) case "$t" in *"shortcuts=none"*) missing shortcuts ;; esac ;;
        fetch) case "$t" in *"fetch=none"*) missing fetch ;; esac ;;
        *) echo "uso: sys.sh require dbus|shortcuts|fetch" >&2; exit 2 ;;
    esac
}

cmd_shortcut_get() {
    [ $# -eq 1 ] || { echo "uso: sys.sh shortcut-get <ação>" >&2; exit 2; }
    check_action "$1"
    if has dbus-send; then
        dbus-send --session --print-reply --dest=$KGA_DEST $KGA_PATH $KGA_IFACE.shortcut \
            "array:string:kwin,$1,KWin,$1" 2>/dev/null \
            | sed -n 's/^ *int32 \([0-9][0-9]*\).*/\1/p' | grep -vx 0 | tr '\n' ',' | sed 's/,$//'
        echo
    elif has gdbus; then
        gdbus call --session --dest $KGA_DEST --object-path $KGA_PATH --method $KGA_IFACE.shortcut \
            "['kwin', '$1', 'KWin', '$1']" 2>/dev/null \
            | tr -c '0-9\n' ' ' | tr -s ' ' '\n' | grep -v '^$' | grep -vx 0 | tr '\n' ',' | sed 's/,$//'
        echo
    else
        # O qdbus não manda listas como argumento: não serve para atalhos.
        missing shortcuts
    fi
}

cmd_shortcut_set() {
    [ $# -eq 2 ] || { echo "uso: sys.sh shortcut-set <ação> <inteiro>[,<inteiro>…]" >&2; exit 2; }
    check_action "$1"
    check_keys "$2"
    if has dbus-send; then
        dbus-send --session --print-reply --dest=$KGA_DEST $KGA_PATH $KGA_IFACE.setForeignShortcut \
            "array:string:kwin,$1,KWin,$1" "array:int32:$2" >/dev/null
    elif has gdbus; then
        gdbus call --session --dest $KGA_DEST --object-path $KGA_PATH --method $KGA_IFACE.setForeignShortcut \
            "['kwin', '$1', 'KWin', '$1']" "[$2]" >/dev/null
    else
        missing shortcuts
    fi
}

cmd_fetch() {
    [ $# -ge 2 ] && [ $# -le 3 ] || { echo "uso: sys.sh fetch <url> <arquivo|-> [<header>]" >&2; exit 2; }
    url=$1 out=$2 header=${3:-}
    if has curl; then
        if [ -n "$header" ]; then curl -fsSL --max-time "${KUBIK_FETCH_TIMEOUT:-600}" -H "$header" -o "$out" "$url"
        else curl -fsSL --max-time "${KUBIK_FETCH_TIMEOUT:-600}" -o "$out" "$url"; fi
    elif has wget; then
        if [ -n "$header" ]; then wget -q -T "${KUBIK_FETCH_TIMEOUT:-600}" --header="$header" -O "$out" "$url"
        else wget -q -T "${KUBIK_FETCH_TIMEOUT:-600}" -O "$out" "$url"; fi
    elif has wget2; then
        if [ -n "$header" ]; then wget2 -q -T "${KUBIK_FETCH_TIMEOUT:-600}" --header="$header" -O "$out" "$url"
        else wget2 -q -T "${KUBIK_FETCH_TIMEOUT:-600}" -O "$out" "$url"; fi
    else
        missing fetch
    fi
}

# ---- reiniciar o painel ou a sessão (Lição 50) -------------------------------
# O plasmashell guarda o QML da bandeja em memória: depois de atualizá-la, o
# código novo só vale inteiro com o painel reiniciado. O install.sh anota o PID
# do plasmashell no XDG_RUNTIME_DIR (o login seguinte o esvazia); o pedido vale
# enquanto esse plasmashell estiver rodando.

mark_file() {
    echo "${XDG_RUNTIME_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}}/kubik-plasma-restart"
}

# PID do plasmashell deste usuário. Sem o pgrep (procps), lê o /proc
# (KUBIK_PROC: outro /proc, nos testes).
plasma_pid() {
    if has pgrep; then
        pgrep -u "$(id -u)" -x plasmashell 2>/dev/null | sed -n 1p
        return
    fi
    for d in "${KUBIK_PROC:-/proc}"/[0-9]*; do
        [ -O "$d" ] && [ "$(cat "$d/comm" 2>/dev/null)" = plasmashell ] && { echo "${d##*/}"; return; }
    done
}

cmd_session_mark() {
    p=$(plasma_pid)
    [ -n "$p" ] || return 0
    f=$(mark_file)
    mkdir -p "${f%/*}" && echo "$p" > "$f"
}

cmd_session_pending() {
    f=$(mark_file)
    r=false
    if [ -f "$f" ]; then
        p=$(plasma_pid)
        if [ -n "$p" ] && [ "$(cat "$f" 2>/dev/null)" = "$p" ]; then r=true; else rm -f "$f"; fi
    fi
    echo "plasmaRestart=$r"
}

cmd_plasma_restart() {
    if has systemctl && systemctl --user -q is-active plasma-plasmashell.service 2>/dev/null; then
        systemctl --user --no-block restart plasma-plasmashell.service
        return
    fi
    # Sem o serviço do systemd: encerra e abre de novo num processo à parte
    # (quem chama pode ser a própria bandeja, que morre junto com o painel).
    p=$(plasma_pid)
    case "$p" in ""|*[!0-9]*) p=0 ;; esac
    script="[ $p -gt 0 ] && kill $p 2>/dev/null; i=0; while [ $p -gt 0 ] && kill -0 $p 2>/dev/null && [ \$i -lt 50 ]; do sleep 0.2; i=\$((i + 1)); done; exec plasmashell"
    if has setsid; then
        setsid sh -c "$script" </dev/null >/dev/null 2>&1 &
    else
        nohup sh -c "$script" </dev/null >/dev/null 2>&1 &
    fi
}

cmd_logout() {
    cmd_dbus_call org.kde.LogoutPrompt /LogoutPrompt org.kde.LogoutPrompt.promptLogout
}

cmd="${1:-}"
[ $# -gt 0 ] && shift
case "$cmd" in
    tools) cmd_tools ;;
    dbus-bool) cmd_dbus_bool "$@" ;;
    dbus-call) cmd_dbus_call "$@" ;;
    shortcut-get) cmd_shortcut_get "$@" ;;
    shortcut-set) cmd_shortcut_set "$@" ;;
    fetch) cmd_fetch "$@" ;;
    dbus-int) cmd_dbus_int "$@" ;;
    require) cmd_require "$@" ;;
    session-mark) cmd_session_mark ;;
    session-pending) cmd_session_pending ;;
    plasma-restart) cmd_plasma_restart ;;
    logout) cmd_logout ;;
    *) echo "uso: sys.sh tools|require|dbus-bool|dbus-call|dbus-int|shortcut-get|shortcut-set|fetch|session-mark|session-pending|plasma-restart|logout …" >&2; exit 2 ;;
esac
