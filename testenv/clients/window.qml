// Janela de teste para o KWin headless.
// Uso: qml window.qml -- <título> [<largura>x<altura>] [<cor>]
// Sem cor, ela é derivada do título.
import QtQuick
import QtQuick.Window
Window {
    id: win
    readonly property var args: {
        const a = Qt.application.arguments;
        const i = a.indexOf("--");
        return i >= 0 ? a.slice(i + 1) : [];
    }
    readonly property var size: (args[1] || "400x300").split("x").map(Number)
    visible: true
    width: size[0]
    height: size[1]
    title: args[0] || "window"
    color: args[2] || Qt.hsla((win.title.length * 0.13) % 1, 0.5, 0.5, 1)
    Text { anchors.centerIn: parent; text: win.title; font.pixelSize: 32; color: "white" }
}
