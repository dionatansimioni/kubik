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

# Faltando: missing dbus|fetch (sai com 127).
missing() {
    case "$1" in
        dbus) echo "kubik-sys: falta um cliente de D-Bus (dbus-send, gdbus ou qdbus6); instale: $(hint dbus)" >&2 ;;
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
        qdbus_bin >/dev/null && echo "kubik-sys: o qdbus não lê atalhos; falta dbus-send ou gdbus" >&2
        missing dbus
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
        qdbus_bin >/dev/null && echo "kubik-sys: o qdbus não grava atalhos; falta dbus-send ou gdbus" >&2
        missing dbus
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

cmd="${1:-}"
[ $# -gt 0 ] && shift
case "$cmd" in
    tools) cmd_tools ;;
    dbus-bool) cmd_dbus_bool "$@" ;;
    dbus-call) cmd_dbus_call "$@" ;;
    shortcut-get) cmd_shortcut_get "$@" ;;
    shortcut-set) cmd_shortcut_set "$@" ;;
    fetch) cmd_fetch "$@" ;;
    *) echo "uso: sys.sh tools|dbus-bool|dbus-call|shortcut-get|shortcut-set|fetch …" >&2; exit 2 ;;
esac
