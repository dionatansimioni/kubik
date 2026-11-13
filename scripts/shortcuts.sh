# Atalhos de teclado do kubik × atalhos padrão do KDE (source no install.sh
# e no uninstall.sh). Fala com o kglobalaccel (dentro do KWin) por D-Bus.
#
# O kubik usa Meta+setas (focar), Meta+Shift+setas (mover) e Meta+Alt+setas
# (redimensionar). No KDE essas teclas são do quick tile, de "mandar para
# outra tela" e de "trocar de janela por direção": o install.sh guarda o que
# estava lá (KUBIK_SC_BACKUP), libera e dá as teclas ao kubik; o
# uninstall.sh devolve. A tabela do kubik tem que bater com
# kubik/src/kwin/keys.ts (tests/test_build.py confere). O D-Bus vai pelo
# sys.sh (dbus-send ou gdbus, o que a distro tiver).

KUBIK_SC_BACKUP="${XDG_DATA_HOME:-$HOME/.local/share}/kubik/kde-shortcuts.backup"

# Ações do KDE que perdem a tecla (nome no kglobalaccel, componente kwin).
KDE_ACTIONS=(
    "Window Quick Tile Left" "Window Quick Tile Right" "Window Quick Tile Top" "Window Quick Tile Bottom"
    "Window to Previous Screen" "Window to Next Screen"
    "Switch Window Left" "Switch Window Right" "Switch Window Up" "Switch Window Down"
)

# Ações do kubik e a tecla de cada uma, como inteiro do Qt
# (Meta 0x10000000 + Shift 0x02000000 / Alt 0x08000000 + tecla; setas 0x01000012..15).
KUBIK_KEYS=(
    "Kubik: Focus Left=285212690" "Kubik: Focus Right=285212692" "Kubik: Focus Up=285212691" "Kubik: Focus Down=285212693"
    "Kubik: Move Left=318767122" "Kubik: Move Right=318767124" "Kubik: Move Up=318767123" "Kubik: Move Down=318767125"
    "Kubik: Resize Left=419430418" "Kubik: Resize Right=419430420" "Kubik: Resize Up=419430419" "Kubik: Resize Down=419430421"
    "Kubik: Rotate split=268435535" "Kubik: Toggle floating=268435526" "Kubik: Toggle monocle=268435533"
)

# Pelo sys.sh (cliente de D-Bus da distro; Lição 48). O install.sh e o
# uninstall.sh rodam na pasta dele (cd), que tem o sys.sh ao lado.
KUBIK_SYS=${KUBIK_SYS:-./sys.sh}
_sys() { sh "$KUBIK_SYS" "$@"; }

# Teclas atuais de uma ação do KWin, separadas por vírgula ("" se nenhuma).
sc_get() {
    _sys shortcut-get "$1" 2>/dev/null
}

# Define as teclas (lista de inteiros separada por vírgula; "0" = nenhuma).
sc_set() {
    _sys shortcut-set "$1" "${2:-0}" >/dev/null 2>&1
}

# Dá para ler e gravar atalhos? Sem dbus-send nem gdbus, avisa (uma vez) e não.
sc_available() {
    _sys dbus-call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel.allMainComponents >/dev/null 2>&1 || return 1  # sem sessão
    if ! _sys require shortcuts 2>/dev/null; then
        echo "aviso: atalhos de teclado não ajustados: $(_sys require shortcuts 2>&1 | sed 's/^kubik-sys: //' | tail -n1)" >&2
        return 1
    fi
}

# Libera as teclas do KDE (guardando as de antes) e dá as do kubik. Só na
# primeira instalação (sem backup): numa atualização, o usuário pode ter
# devolvido uma tecla ao KDE de propósito (Configurar… › Atalhos de teclado).
# Antes de o script carregar: as ações novas do kubik pegam a tecla padrão.
sc_free_kde() {
    sc_available || return 0
    [ -f "$KUBIK_SC_BACKUP" ] && return 0
    mkdir -p "$(dirname "$KUBIK_SC_BACKUP")"
    for a in "${KDE_ACTIONS[@]}"; do printf '%s\t%s\n' "$a" "$(sc_get "$a")"; done > "$KUBIK_SC_BACKUP"
    for a in "${KDE_ACTIONS[@]}"; do sc_set "$a" 0; done
}

# Depois de o script carregar: ações do kubik sem tecla (ex.: registradas
# quando a tecla ainda era do KDE) ganham a padrão. As que o usuário mudou
# (CustomShortcuts no kwinrc, gravado pela bandeja) ficam como estão, mesmo
# sem tecla.
sc_assign_kubik() {
    sc_available 2>/dev/null || return 0
    local kv name key custom
    custom=",$(kreadconfig6 --file kwinrc --group Script-kubik --key CustomShortcuts 2>/dev/null),"
    for kv in "${KUBIK_KEYS[@]}"; do
        name=${kv%=*}; key=${kv##*=}
        case "$custom" in *",$name,"*) continue ;; esac
        [ -n "$(sc_get "$name")" ] || sc_set "$name" "$key"
    done
}

# Desinstalar: tira as teclas do kubik e devolve as do KDE.
sc_restore_kde() {
    sc_available || return 0
    local kv a keys
    for kv in "${KUBIK_KEYS[@]}"; do
        sc_set "${kv%=*}" 0
        _sys dbus-call org.kde.kglobalaccel /kglobalaccel org.kde.KGlobalAccel.unregister kwin "${kv%=*}" >/dev/null 2>&1 || true
    done
    [ -f "$KUBIK_SC_BACKUP" ] || return 0
    while IFS=$'\t' read -r a keys; do
        [ -n "$keys" ] && sc_set "$a" "$keys"
    done < "$KUBIK_SC_BACKUP"
    rm -f "$KUBIK_SC_BACKUP"
}
