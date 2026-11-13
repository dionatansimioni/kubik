# A bandeja com programas faltando (KUBIK_SYS_DISABLE, lido pelo sys.sh):
# sem o dbus-send, segue pelo próximo cliente; sem nenhum, avisa no popup com
# o comando que instala (e não diz "script parado").
source /work/testenv/lib.sh

placed() {
    local i
    for i in $(seq 30); do
        kwin_eval "const v = workspace.stackingOrder.find(w => w.caption === '$1'); if (v) { v.frameGeometry = {x: 820, y: 40, width: 420, height: 560}; console.warn('PLACED-$i'); }"
        grep -q "PLACED-$i" /out/kwin.log && break
    done
}

mark no_dbus_send
KUBIK_SYS_DISABLE="dbus-send" plasmoidviewer -a io.github.dionatansimioni.kubik -f planar -s 420x560 >&2 2>&1 &
viewer=$!
placed Plasmoidviewer
wait_log "[kubik-tray] estado:" 30
sleep 2
kill $viewer; wait $viewer 2>/dev/null
sleep 1

mark nothing
KUBIK_SYS_DISABLE="dbus-send gdbus qdbus6 qdbus-qt6 qdbus curl wget wget2" plasmoidviewer -a io.github.dionatansimioni.kubik -f planar -s 420x560 >&2 2>&1 &
viewer=$!
placed Plasmoidviewer
wait_log "falta: D-Bus" 30
sleep 3
screenshot nothing
kill $viewer; wait $viewer 2>/dev/null
mark done
