# scripts/sys.sh contra os programas de verdade num KWin real: cada backend
# presente na imagem (dbus-send, gdbus, qdbus6) tem que dar a mesma resposta,
# e o que um grava o outro lê. test_kwin_sys.py compara as linhas.
source /work/testenv/lib.sh
S=/work/scripts/sys.sh
sh $S tools | sed 's/^/=== TOOL /' >&2
T='Kubik: Toggle tiling'
for d in "" "dbus-send" "dbus-send gdbus"; do
    export KUBIK_SYS_DISABLE="$d"
    get=$(sh $S shortcut-get "$T" 2>/dev/null); rc=$?
    echo "=== SYS [$d] loaded=$(sh $S dbus-bool org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded kubik 2>/dev/null) other=$(sh $S dbus-bool org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded nao-existe 2>/dev/null) get=$get getrc=$rc" >&2
done
unset KUBIK_SYS_DISABLE
# Grava por um, lê pelo outro.
KUBIK_SYS_DISABLE=dbus-send sh $S shortcut-set "$T" 268435528
echo "=== SET gdbus->dbus-send $(sh $S shortcut-get "$T")" >&2
sh $S shortcut-set "$T" 268435545
echo "=== SET dbus-send->gdbus $(KUBIK_SYS_DISABLE=dbus-send sh $S shortcut-get "$T" 2>/dev/null)" >&2
# dbus-call por cada backend: descarrega o script e carrega de novo.
for d in "" "dbus-send" "dbus-send gdbus"; do
    export KUBIK_SYS_DISABLE="$d"
    sh $S dbus-call org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript kubik 2>/dev/null
    a=$(sh $S dbus-bool org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded kubik 2>/dev/null)
    sh $S dbus-call org.kde.KWin /Scripting org.kde.kwin.Scripting.start 2>/dev/null
    sleep 1
    b=$(sh $S dbus-bool org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded kubik 2>/dev/null)
    echo "=== CALL [$d] after_unload=$a after_start=$b" >&2
done

# Gravar a configuração e mandar o KWin reler (o que a bandeja faz) sem o
# dbus-send: o Kubik aplica os gaps novos.
mark reconfigure
kwriteconfig6 --file kwinrc --group Script-kubik --key GapsInner 9
for d in "dbus-send" "dbus-send gdbus"; do
    KUBIK_SYS_DISABLE="$d" sh $S dbus-call org.kde.KWin /KWin org.kde.KWin.reconfigure 2>/dev/null
    sleep 1
    echo "=== RECONF [$d] done" >&2
    kwriteconfig6 --file kwinrc --group Script-kubik --key GapsInner 7
done
