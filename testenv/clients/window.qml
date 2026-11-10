// Janela de teste para o KWin headless.
// Uso: qml window.qml -- <título> [<L>x<A>] [<cor>] [selfresize=<L>x<A>] [maximized]
//   cor: sem cor (ou "-"), ela é derivada do título
//   maximized: abre maximizada (como um app restaurando a sessão)
//   selfresize: 2 s depois de abrir, o próprio app muda o tamanho da janela
//               (como Chrome/Electron restaurando o tamanho da última sessão)
// Obs.: limites de tamanho (minimumWidth…) definidos aqui NÃO chegam ao KWin
// via runtime `qml`; para mínimos reais os cenários usam apps (ex.: kcalc).
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
    visibility: args.indexOf("maximized") >= 0 ? Window.Maximized : Window.AutomaticVisibility
    width: size[0]
    height: size[1]
    title: args[0] || "window"
    readonly property string selfResize: (args.find(a => String(a).indexOf("selfresize=") === 0) || "").slice(11)
    Timer {
        interval: 2000
        running: win.selfResize !== ""
        onTriggered: {
            const s = win.selfResize.split("x").map(Number);
            win.width = s[0];
            win.height = s[1];
        }
    }
    color: (args[2] && args[2] !== "-") ? args[2] : Qt.hsla((win.title.length * 0.13) % 1, 0.5, 0.5, 1)
    Text { anchors.centerIn: parent; text: win.title; font.pixelSize: 24; color: "white" }
}
