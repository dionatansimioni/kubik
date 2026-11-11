# Memória: ciclos de abrir 4 janelas, reorganizar pelos atalhos do Kubik
# (foco, mover, girar, monóculo) e fechar tudo, medindo a memória do
# kwin_wayland (o script e o efeito do Kubik rodam dentro dele) a cada 4 ciclos:
# "=== MEM <fase> rss=<kB> pss=<kB>". O teste roda isto duas vezes, com e sem
# o Kubik (KUBIK_KWINRC desativa os dois), e compara. Antes e depois dos
# ciclos, o Kubik registra o tamanho do que guarda ("[estado] memória: ...").
source /work/testenv/lib.sh

CYCLES=${KUBIK_MEM_CYCLES:-28}
# Sem ps: a imagem do Fedora não tem o procps.
KPID=$(grep -lx kwin_wayland /proc/[0-9]*/comm 2>/dev/null | head -n1 | cut -d/ -f3)
mem() {
    echo "=== MEM $1 rss=$(awk '/^VmRSS/ {print $2}' "/proc/$KPID/status") pss=$(awk '/^Pss:/ {print $2}' "/proc/$KPID/smaps_rollup")" >&2
}
loaded=$(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded string:kubik 2>/dev/null | grep -c 'boolean true')
echo "=== KUBIK loaded=$loaded" >&2

cycle() {
    local w pids=""
    for w in MA MB MC MD; do
        "$QML_BIN" /work/testenv/clients/window.qml -- "$w" 400x300 >/dev/null 2>&1 &
        pids="$pids $!"
    done
    wait_window MD
    shortcut "Kubik: Focus Left" 0.2
    shortcut "Kubik: Move Right" 0.3
    shortcut "Kubik: Rotate split" 0.3
    shortcut "Kubik: Toggle monocle" 0.3
    shortcut "Kubik: Toggle monocle" 0.3
    # shellcheck disable=SC2086
    kill $pids
    wait $pids 2>/dev/null
    sleep 0.8
}

sleep 2
mem start
# Um ciclo de aquecimento: a árvore da tela × desktop passa a existir (e fica).
cycle
mark state_start
shortcut "Kubik: Log state" 0.5
for i in $(seq "$CYCLES"); do
    cycle
    [ $((i % 4)) -eq 0 ] && mem "cycle$i"
done
sleep 2
mem end
mark state_end
shortcut "Kubik: Log state" 0.5
