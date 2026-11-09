// Protótipo DESCARTÁVEL do kubik: valida overlays QML dentro de um KWin Script.
//  - Borda ativa ao redor da janela focada (cor de destaque do tema).
//  - Barra de abas clicável sobre uma "pilha" de janelas com a mesma geometria.
// Atalhos (Configurações do Sistema > Atalhos > KWin):
//  Meta+Ctrl+S   empilha a próxima janela sobre a focada
//  Meta+Ctrl+Tab alterna para a próxima aba da pilha
//  Meta+Ctrl+B   liga/desliga a borda
pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
import org.kde.kwin

Item {
    id: root

    readonly property int borderWidth: 3
    readonly property int borderRadius: 6
    readonly property int tabHeight: 28
    readonly property real tolerance: 2

    property bool borderEnabled: true
    property var active: Workspace.activeWindow
    // Janelas que compartilham a geometria da ativa (inclui a ativa).
    property var stack: []
    // Retângulo da pilha inteira (barra de abas + área das janelas).
    property rect stackRect: Qt.rect(0, 0, 0, 0)

    SystemPalette { id: pal; colorGroup: SystemPalette.Active }

    function log(msg) { console.log("[kubik-proto] " + msg); }

    function tileable(w) {
        return w && w.normalWindow && !w.minimized && !w.fullScreen && !w.onAllDesktops;
    }

    function sameRect(a, b) {
        return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
            && Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
    }

    function sameDesktop(a, b) {
        if (a.output !== b.output) return false;
        for (const d of a.desktops) if (b.desktops.indexOf(d) >= 0) return true;
        return false;
    }

    function refreshStack() {
        const a = active;
        if (!tileable(a)) { stack = []; return; }
        const g = a.frameGeometry;
        const members = Workspace.stackingOrder.filter(w =>
            tileable(w) && sameDesktop(w, a) && sameRect(w.frameGeometry, g));
        stack = members.length >= 2 ? members : [];
        if (stack.length)
            stackRect = Qt.rect(g.x, g.y - tabHeight, g.width, g.height + tabHeight);
    }

    function stackNext() {
        const a = active;
        if (!tileable(a)) return;
        const t0 = Date.now();
        // A primeira vez abre espaço para a barra de abas no topo da janela ativa.
        if (stack.length === 0) {
            const g = a.frameGeometry;
            a.frameGeometry = Qt.rect(g.x, g.y + tabHeight, g.width, g.height - tabHeight);
        }
        const target = a.frameGeometry;
        const order = Workspace.stackingOrder;
        let candidate = null;
        for (let i = order.length - 1; i >= 0; --i) {
            const w = order[i];
            if (w !== a && tileable(w) && sameDesktop(w, a) && stack.indexOf(w) < 0) { candidate = w; break; }
        }
        if (!candidate) { log("nenhuma janela para empilhar"); return; }
        candidate.frameGeometry = Qt.rect(target.x, target.y, target.width, target.height);
        Workspace.activeWindow = candidate;
        refreshStack();
        log("empilhou '" + candidate.caption + "' em " + (Date.now() - t0) + "ms; pilha=" + stack.length);
    }

    function nextTab() {
        if (stack.length < 2) return;
        const sorted = stack.slice().sort((x, y) => x.caption.localeCompare(y.caption));
        const i = sorted.indexOf(active);
        Workspace.activeWindow = sorted[(i + 1) % sorted.length];
    }

    Connections {
        target: Workspace
        function onWindowActivated() { root.refreshStack(); }
        function onWindowAdded() { root.refreshStack(); }
        function onWindowRemoved() { Qt.callLater(root.refreshStack); }
    }
    Connections {
        target: root.active
        ignoreUnknownSignals: true
        function onFrameGeometryChanged() { root.refreshStack(); }
        function onFullScreenChanged() { root.refreshStack(); }
    }

    ShortcutHandler {
        name: "Kubik Proto: Stack next window"
        text: "Kubik Proto: empilhar a próxima janela"
        sequence: "Meta+Ctrl+S"
        onActivated: root.stackNext()
    }
    ShortcutHandler {
        name: "Kubik Proto: Next tab"
        text: "Kubik Proto: próxima aba"
        sequence: "Meta+Ctrl+Tab"
        onActivated: root.nextTab()
    }
    ShortcutHandler {
        name: "Kubik Proto: Toggle border"
        text: "Kubik Proto: liga/desliga borda"
        sequence: "Meta+Ctrl+B"
        onActivated: root.borderEnabled = !root.borderEnabled
    }

    // ---- Borda ativa -------------------------------------------------------
    Window {
        id: borderWin
        readonly property rect g: root.active ? root.active.frameGeometry : Qt.rect(0, 0, 0, 0)
        flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput
             | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
        color: "transparent"
        visible: root.borderEnabled && root.tileable(root.active)
        x: g.x - root.borderWidth
        y: g.y - root.borderWidth
        width: Math.max(1, g.width + 2 * root.borderWidth)
        height: Math.max(1, g.height + 2 * root.borderWidth)

        Rectangle {
            anchors.fill: parent
            color: "transparent"
            radius: root.borderRadius
            border.width: root.borderWidth
            border.color: pal.highlight
        }
    }

    // ---- Barra de abas -----------------------------------------------------
    Window {
        id: tabWin
        flags: Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
        color: "transparent"
        visible: root.stack.length >= 2
        x: root.stackRect.x
        y: root.stackRect.y
        width: Math.max(1, root.stackRect.width)
        height: root.tabHeight

        Rectangle {
            anchors.fill: parent
            color: pal.window
            Row {
                anchors.fill: parent
                Repeater {
                    model: root.stack.slice().sort((x, y) => x.caption.localeCompare(y.caption))
                    delegate: Rectangle {
                        id: tab
                        required property var modelData
                        readonly property bool current: modelData === root.active
                        width: tabWin.width / Math.max(1, root.stack.length)
                        height: tabWin.height
                        color: current ? pal.highlight : pal.button
                        border.color: pal.mid
                        Text {
                            anchors.fill: parent
                            anchors.margins: 6
                            text: tab.modelData.caption
                            elide: Text.ElideRight
                            verticalAlignment: Text.AlignVCenter
                            color: tab.current ? pal.highlightedText : pal.buttonText
                        }
                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                root.log("clique na aba '" + tab.modelData.caption + "'");
                                Workspace.activeWindow = tab.modelData;
                            }
                        }
                    }
                }
            }
        }
    }

    Component.onCompleted: log("carregado; activeWindow=" + (active ? active.caption : "nenhuma"))
}
