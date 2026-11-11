source /work/testenv/lib.sh
sleep 1
python3 - >&2 <<'PY'
import dbus
b = dbus.SessionBus()
o = b.get_object("org.kde.kglobalaccel", "/component/kwin")
for i in o.allShortcutInfos(dbus_interface="org.kde.kglobalaccel.Component"):
    f = [x for x in i]
    if len(f) > 6 and (f[6] or f[7]):
        print("SC", str(f[0]), "keys=", f[6], "default=", f[7])
intro = dbus.Interface(b.get_object('org.kde.kglobalaccel','/kglobalaccel'),'org.freedesktop.DBus.Introspectable').Introspect()
import re
for m in re.finditer(r'<method name="(\w+)">(.*?)</method>', intro, re.S):
    print("METHOD", m.group(1), re.findall(r'type="([^"]+)"', m.group(2)))
PY
