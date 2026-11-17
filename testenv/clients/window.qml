// Janela de teste para o KWin headless.
// Uso: qml window.qml -- <título> [<L>x<A>] [<cor>] [selfresize=<L>x<A>] [maximized] [popup=X,Y,<L>x<A>]
//   cor: sem cor (ou "-"), ela é derivada do título
//   maximized: abre maximizada (como um app restaurando a sessão)
//   selfresize: 2 s depois de abrir, o próprio app muda o tamanho da janela
//               (como Chrome/Electron restaurando o tamanho da última sessão)
//   popup: um clique na janela abre um menu (ver abaixo)
// Obs.: limites de tamanho (minimumWidth…) definidos aqui NÃO chegam ao KWin
// via runtime `qml`; para mínimos reais os cenários usam apps (ex.: kcalc).
// Os cliques recebidos saem no stderr: "CLICK <título> <x> <y>".
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
    // Cada clique que CHEGA ao app vai para /tmp/window-<título>.log
    // (open_window); clicks <título> o copia para o kwin.log.
    MouseArea {
        anchors.fill: parent
        onClicked: mouse => {
            console.warn("CLICK " + win.title + " " + Math.round(mouse.x) + " " + Math.round(mouse.y));
            if (win.popupArg)
                menu.visible = true;
        }
    }
    // popup=X,Y,LxA: um clique na janela abre um menu (janela Qt.Popup:
    // xdg_popup no Wayland, que exige um clique recente; override-redirect no
    // X11) em X,Y relativo à janela, como o menu de contexto de um app.
    // Clicar no menu o fecha.
    readonly property var popupArg: {
        const p = (args.find(a => String(a).indexOf("popup=") === 0) || "").slice(6);
        if (!p)
            return null;
        const [x, y, s] = p.split(",");
        const [w, h] = s.split("x");
        return { x: Number(x), y: Number(y), width: Number(w), height: Number(h) };
    }
    Window {
        id: menu
        transientParent: win
        flags: Qt.Popup
        x: win.popupArg ? win.x + win.popupArg.x : 0
        y: win.popupArg ? win.y + win.popupArg.y : 0
        width: win.popupArg ? win.popupArg.width : 1
        height: win.popupArg ? win.popupArg.height : 1
        color: "#202020"
        title: win.title + "-menu"
        Text { anchors.centerIn: parent; text: "menu"; color: "white"; font.pixelSize: 18 }
        // Clicar no menu o fecha, como escolher um item. (Clicar fora também
        // fecha, mas o clique chega à janela e o abre de novo.)
        MouseArea {
            anchors.fill: parent
            onClicked: menu.visible = false
        }
    }
}
