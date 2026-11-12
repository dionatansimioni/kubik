// Avisa quando um atalho global do KWin é disparado (D-Bus do kglobalaccel).
// Fica num arquivo à parte porque o DBus.SignalWatcher só existe no Plasma
// 6.4+: no 6.3, o Loader do main.qml falha só aqui e a bandeja segue.
import QtQuick
import org.kde.plasma.workspace.dbus as DBus

DBus.SignalWatcher {
    // O nome da ação (ex.: "Kubik: Toggle tiling").
    signal pressed(string action)

    service: "org.kde.kglobalaccel"
    path: "/component/kwin"
    iface: "org.kde.kglobalaccel.Component"

    function dbusglobalShortcutPressed(component, action, timestamp) {
        // Os argumentos chegam como objetos do D-Bus, não como texto.
        pressed(String(action));
    }
}
