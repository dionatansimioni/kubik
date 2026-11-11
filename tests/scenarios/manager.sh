# O gerenciador do Kubik (kubik/manager, plasmoide oculto no plasmawindowed):
# a janela do AppImage e da entrada "Kubik" do menu. Começa sem nada
# instalado, instala pelo AppImage, depois (pelo menu, com as configurações já
# abertas: o plasmawindowed é instância única) acha uma versão nova num
# "GitHub" local, abre as configurações, reabre pelo menu, atualiza e remove. Os botões são
# achados pela posição que a própria janela registra no log
# ("[kubik-manager] botões install=x,y ...").
source /work/testenv/lib.sh
export APPIMAGE_EXTRACT_AND_RUN=1
AI=$(ls /out/appimage/Kubik-*.AppImage)
DATA=$HOME/.local/share

# O testenv instala o script antes do KWin iniciar; aqui começamos do zero.
dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript string:kubik >/dev/null
kpackagetool6 -t KWin/Script -r kubik >/dev/null
kwriteconfig6 --file kwinrc --group Plugins --key kubikEnabled false

files() {
    echo "=== FILES $1 script=$(kpackagetool6 -t KWin/Script --show kubik >/dev/null 2>&1 && echo yes || echo no) tray=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik >/dev/null 2>&1 && echo yes || echo no) menu=$(test -f "$DATA/applications/io.github.dionatansimioni.kubik.desktop" && echo yes || echo no) manager=$(test -f "$DATA/plasma/plasmoids/io.github.dionatansimioni.kubik.manager/metadata.json" && echo yes || echo no)" >&2
}
# Espera a última linha de botões ter <ação> (até ~30 s).
wait_button() {
    local i
    for i in $(seq 60); do
        grep -a "\[kubik-manager\] botões" /out/kwin.log | tail -n1 | grep -q " $1=" && return 0
        sleep 0.5
    done
    echo "=== TIMEOUT botão $1" >&2
    return 1
}
mgr_click() {
    local pos gx gy
    wait_button "$1" || return 1
    pos=$(grep -a "\[kubik-manager\] botões" /out/kwin.log | tail -n1 | grep -o " $1=[0-9]*,[0-9]*" | cut -d= -f2)
    kwin_eval "const m = workspace.stackingOrder.find(w => w.caption === 'Kubik'); console.warn('=== MGRGEOM ' + Math.round(m.clientGeometry.x) + ' ' + Math.round(m.clientGeometry.y) + ' ' + Math.round(m.width) + 'x' + Math.round(m.height));"
    read -r gx gy < <(grep -a "=== MGRGEOM" /out/kwin.log | tail -n1 | sed 's/.*=== MGRGEOM \([0-9-]*\) \([0-9-]*\).*/\1 \2/')
    echo "=== CLICK $1 at $((gx + ${pos%,*})),$((gy + ${pos#*,}))" >&2
    python3 /work/testenv/fakeinput.py click $((gx + ${pos%,*})) $((gy + ${pos#*,}))
    sleep 0.5
}
# Processos do plasmawindowed vivos (sem os zumbis que o open.sh deixa ao
# fechar um que este script abriu e não recolheu).
running() { ps -eo stat=,comm= | awk '$2 == "plasmawindowed" && $1 !~ /Z/' | grep -c . ; }
close_manager() {
    kwin_eval "workspace.stackingOrder.forEach(w => { if (w.caption === 'Kubik') w.closeWindow(); })"
    # Espera o plasmawindowed sair: senão o próximo pedido vai para ele, com
    # o ambiente antigo (sem o "GitHub" local).
    local i
    for i in $(seq 20); do [ "$(running)" -gt 0 ] || return 0; sleep 0.5; done
    echo "=== plasmawindowed não saiu" >&2
    kwin_eval "workspace.stackingOrder.forEach(w => console.warn('=== LEFT ' + w.caption + ' | ' + w.resourceClass + ' ' + w.hidden + ' ' + w.minimized));"
    ps -eo pid,args | grep -a plasmawindowed | grep -v grep >&2
}

mark appimage
files clean
"$AI" >&2 &
wait_button install
sleep 1
screenshot fresh
kwin_eval "const m = workspace.stackingOrder.find(w => w.caption === 'Kubik'); console.warn('=== APPID ' + m.resourceClass + ' ' + m.desktopFileName);"
echo "=== STAGE $(ls "$XDG_RUNTIME_DIR/kubik-appimage-$(id -u)")" | tr '\n' ' ' >&2; echo >&2
mgr_click install
wait_log "[kubik-manager] concluído: install" 60
wait_button remove
sleep 1
screenshot installed
files installed
close_manager

mark menu
fake_releases 99.0.0
# Conta as janelas do Kubik no plasmawindowed: windows <rótulo>.
windows() {
    kwin_eval "console.warn('=== WINDOWS $1 ' + workspace.stackingOrder.filter(w => w.caption === 'Kubik').map(w => Math.round(w.width) + 'x' + Math.round(w.height)).join(' '));"
}
# Espera a <n>-ésima abertura do gerenciador no log.
wait_opened() {
    local i
    for i in $(seq 40); do
        [ "$(grep -ac '\[kubik-manager\] aberto' /out/kwin.log)" -ge "$1" ] && { sleep 1.5; return 0; }
        sleep 0.5
    done
    echo "=== TIMEOUT abertura $1" >&2
    return 1
}
# As configurações abertas antes (o plasmawindowed já rodando). A saída dele
# vai para o log, como a de todo processo aberto daqui.
"$DATA/kubik/open.sh" io.github.dionatansimioni.kubik >&2 &
sleep 4
windows before
EXEC=$(sed -n 's/^Exec=//p' "$DATA/applications/io.github.dionatansimioni.kubik.desktop")
echo "=== EXEC $EXEC" >&2
eval "$EXEC" >&2 &
wait_opened 2
wait_button update
sleep 1
screenshot update_offered
windows manager
echo "=== PROCESSES $(running)" >&2
# Configurações: a janela da bandeja no lugar da do gerenciador.
mgr_click settings
sleep 4
windows settings
screenshot settings
# E o "Kubik" do menu abre o gerenciador de novo (antes do open.sh, não abria).
eval "$EXEC" >&2 &
wait_opened 3
wait_button update
windows reopened
mgr_click update
wait_log "[kubik-manager] concluído: update" 90
wait_button remove
files updated
mgr_click remove
wait_button confirm
screenshot confirm
mgr_click confirm
wait_log "[kubik-manager] concluído: remove" 60
sleep 1
screenshot removed
files removed
close_manager
