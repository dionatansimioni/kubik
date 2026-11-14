# O gerenciador do Kubik (kubik/manager: app Qt com o próprio Qt, dentro do
# AppImage): a janela do AppImage e da entrada "Kubik" do menu. Começa sem
# nada instalado, instala pelo AppImage, depois (pelo menu, que abre o AppImage
# guardado) acha uma versão nova num "GitHub" local, abre as configurações
# (se houver plasmawindowed), atualiza pelo AppImage novo e remove. Os botões
# são achados pela posição que a própria janela registra no log
# ("[kubik-manager] botões install=x,y ...").
source /work/testenv/lib.sh
export APPIMAGE_EXTRACT_AND_RUN=1
AI=$(ls /out/appimage/Kubik-*.AppImage)
DATA=$HOME/.local/share
APP=io.github.dionatansimioni.kubik

# O testenv instala o script antes do KWin iniciar; aqui começamos do zero.
dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript string:kubik >/dev/null
kpackagetool6 -t KWin/Script -r kubik >/dev/null
kwriteconfig6 --file kwinrc --group Plugins --key kubikEnabled false

# O sistema do usuário: em pt-BR (o kpackagetool6 traduz a saída) e com a fonte
# no formato de 19 campos de um Plasma com Qt mais novo que o 6.8 do app.
export LANG=pt_BR.UTF-8 LANGUAGE=pt_BR
kwriteconfig6 --file kdeglobals --group General --key font "DejaVu Sans,10,-1,5,400,0,0,0,0,0,0,0,0,0,0,1,,0,0"
# E o tema escuro (Breeze Dark): o Fusion do QtQuick não pegava a paleta.
kwriteconfig6 --file kdeglobals --group Colors:Window --key BackgroundNormal "32,35,38"
kwriteconfig6 --file kdeglobals --group Colors:Window --key ForegroundNormal "252,252,252"
kwriteconfig6 --file kdeglobals --group Colors:View --key BackgroundNormal "20,22,24"

files() {
    echo "=== FILES $1 script=$(kpackagetool6 -t KWin/Script --show kubik >/dev/null 2>&1 && echo yes || echo no) tray=$(kpackagetool6 -t Plasma/Applet --show $APP >/dev/null 2>&1 && echo yes || echo no) menu=$(test -f "$DATA/applications/$APP.desktop" && echo yes || echo no) manager=$(test -x "$DATA/kubik/Kubik.AppImage" && echo yes || echo no)" >&2
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
# Espera a <n>-ésima abertura do gerenciador no log.
wait_opened() {
    local i
    for i in $(seq 60); do
        [ "$(grep -ac '\[kubik-manager\] aberto' /out/kwin.log)" -ge "$1" ] && return 0
        sleep 0.5
    done
    echo "=== TIMEOUT abertura $1" >&2
    return 1
}
mgr_click() {
    local pos gx gy
    wait_button "$1" || return 1
    pos=$(grep -a "\[kubik-manager\] botões" /out/kwin.log | tail -n1 | grep -o " $1=[0-9]*,[0-9]*" | cut -d= -f2)
    kwin_eval "const m = workspace.stackingOrder.find(w => w.resourceClass === '$APP'); console.warn('=== MGRGEOM ' + Math.round(m.clientGeometry.x) + ' ' + Math.round(m.clientGeometry.y) + ' ' + Math.round(m.width) + 'x' + Math.round(m.height));"
    read -r gx gy < <(grep -a "=== MGRGEOM" /out/kwin.log | tail -n1 | sed 's/.*=== MGRGEOM \([0-9-]*\) \([0-9-]*\).*/\1 \2/')
    echo "=== CLICK $1 at $((gx + ${pos%,*})),$((gy + ${pos#*,}))" >&2
    python3 /work/testenv/fakeinput.py click $((gx + ${pos%,*})) $((gy + ${pos#*,}))
    sleep 0.5
}
running() { ps -eo stat=,comm= | awk '$2 == "kubik-manager" && $1 !~ /Z/' | grep -c . ; }
close_manager() {
    kwin_eval "workspace.stackingOrder.forEach(w => { if (w.resourceClass === '$APP') w.closeWindow(); })"
    local i
    for i in $(seq 20); do [ "$(running)" -gt 0 ] || return 0; sleep 0.5; done
    echo "=== kubik-manager não saiu" >&2
}

mark appimage
files clean
"$AI" >&2 &
# Sem a janela, nada do resto faz sentido (e cada espera custaria 30 s).
wait_opened 1 || exit 1
wait_button install
sleep 1
screenshot fresh
kwin_eval "const m = workspace.stackingOrder.find(w => w.caption === 'Kubik'); console.warn('=== APPID ' + m.resourceClass + ' ' + m.desktopFileName);"
mgr_click install
wait_log "[kubik-manager] concluído: install" 60
wait_button remove
sleep 1
screenshot installed
files installed
close_manager

mark menu
fake_releases 99.0.0
EXEC=$(sed -n 's/^Exec=//p' "$DATA/applications/$APP.desktop")
echo "=== EXEC $EXEC" >&2
eval "$EXEC" >&2 &
wait_opened 2 || exit 1
wait_button update
sleep 1
screenshot update_offered
if command -v plasmawindowed >/dev/null; then
    # Configurações: a bandeja numa janela, ao lado do gerenciador.
    mgr_click settings
    sleep 4
    kwin_eval "console.warn('=== WINDOWS ' + workspace.stackingOrder.filter(w => w.caption === 'Kubik').map(w => w.resourceClass).sort().join(' '));"
    screenshot settings
    kwin_eval "workspace.stackingOrder.forEach(w => { if (w.resourceClass === 'org.kde.plasmawindowed') w.closeWindow(); })"
    sleep 1
fi
mgr_click update
wait_log "[kubik-manager] concluído: update" 120
wait_button remove
files updated
[ "$(sha256sum < "$DATA/kubik/Kubik.AppImage")" = "$(sha256sum < /out/fake/Kubik-99.0.0-x86_64.AppImage)" ] && echo "=== MANAGER is 99.0.0" >&2
mgr_click remove
wait_button confirm
screenshot confirm
mgr_click confirm
wait_log "[kubik-manager] concluído: remove" 60
sleep 1
screenshot removed
files removed
close_manager

# Com o painel rodando (Lição 50): a bandeja nova só vale inteira com o
# plasmashell reiniciado. Instalar pede para reiniciar o painel ou a sessão; o
# botão reinicia o plasmashell e o aviso some.
mark restart
plasmashell >/dev/null 2>&1 &
for i in $(seq 40); do pgrep -x plasmashell >/dev/null && break; sleep 0.5; done
sleep 4
echo "=== PLASMA before $(pgrep -x plasmashell)" >&2
n=$(grep -ac "\[kubik-manager\] botões" /out/kwin.log)
"$AI" >&2 &
wait_opened 3 || exit 1
# Os botões desta janela (a última linha ainda é a da fase anterior).
for i in $(seq 60); do [ "$(grep -ac "\[kubik-manager\] botões" /out/kwin.log)" -gt "$n" ] && break; sleep 0.5; done
mgr_click install
wait_log "[kubik-manager] concluído: install" 60
wait_button restartPanel
sleep 1
screenshot restart_offered
mgr_click logout
wait_log "[kubik-manager] encerrar a sessão" 10
# A tela de saída do KDE (ksmserver-logout-greeter) cobre tudo: fotografa e fecha.
sleep 3
screenshot logout_prompt
echo "=== GREETER $(pgrep -f logout-greeter >/dev/null && echo yes || echo no)" >&2
pkill -f logout-greeter
sleep 1
mgr_click restartPanel
wait_log "[kubik-manager] reiniciar o painel" 10
for i in $(seq 40); do
    p=$(pgrep -x plasmashell)
    [ -n "$p" ] && ! grep -aq "=== PLASMA before $p\$" /out/kwin.log && break
    sleep 0.5
done
echo "=== PLASMA after $(pgrep -x plasmashell)" >&2
# O aviso some quando o estado é relido (4 s depois do clique).
for i in $(seq 30); do
    grep -a "\[kubik-manager\] botões" /out/kwin.log | tail -n1 | grep -q " restartPanel=" || break
    sleep 0.5
done
sleep 1
screenshot restarted
close_manager
pkill -x plasmashell
# A fase seguinte começa sem nada instalado.
bash "$DATA/kubik/uninstall.sh" >/dev/null 2>&1
sleep 1

# Sem nenhum cliente de D-Bus nem de download (sys.sh, Lição 48): o
# gerenciador avisa o que instalar, já antes de instalar.
mark no_tools
KUBIK_SYS_DISABLE="dbus-send gdbus qdbus6 qdbus-qt6 qdbus curl wget wget2" "$AI" >&2 &
wait_opened 4
sleep 2
screenshot no_tools
close_manager
