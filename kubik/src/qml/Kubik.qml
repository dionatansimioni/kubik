// Modelo do Kubik.qml. O build (tools/embed.mjs) troca o marcador abaixo pelo
// bundle do TypeScript e grava o resultado em package/contents/ui/Kubik.qml.
//
// Por que embutir em vez de `import "kubik.js"`: o KWin guarda em memória o
// QML/JS compilado, indexado pela URL, até reiniciar. Um .js importado teria
// URL fixa e, ao atualizar o pacote com a sessão aberta, rodaria o código
// antigo. Este arquivo é carregado pelo main.qml com uma URL única por carga.
pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Window
// Namespace obrigatório: org.kde.kwin exporta um tipo 'Window' que esconderia
// o do QtQuick.
import org.kde.kwin as KWin

Item {
    id: root

    property var controller: null
    // Overlays: Components instanciados com createObject(null) (um Window
    // declarado dentro deste Item nunca apareceria: Qt 6.7+) e destruídos no
    // onDestruction (senão sobrevivem ao descarregamento do script).
    property var previewWin: null
    // Na troca: para onde vai a OUTRA janela (mais clara que a prévia principal).
    property var ghostWin: null
    // Borda de destaque em volta da janela em foco (o controlador decide onde).
    property var borderWin: null
    // Barras de abas das pilhas à vista (reaproveitadas; as sobrando ficam escondidas).
    property var tabWins: []

    SystemPalette {
        id: pal
        colorGroup: SystemPalette.Active
    }

    Component {
        id: previewComponent

        Window {
            id: previewWindow

            flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: false

            property bool ghost: false
            // O drop empilha: uma faixa de abas no topo diferencia de "dividir".
            property bool stack: false

            Rectangle {
                anchors.fill: parent
                radius: 8
                color: Qt.alpha(pal.highlight, previewWindow.ghost ? 0.10 : 0.25)
                border.width: 2
                border.color: Qt.alpha(pal.highlight, previewWindow.ghost ? 0.5 : 1)
            }

            Rectangle {
                visible: previewWindow.stack
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: 28
                radius: 8
                color: Qt.alpha(pal.highlight, 0.7)
            }
        }
    }

    Component {
        id: borderComponent

        Window {
            id: borderWindow

            // true: desliza até a geometria nova (mesma curva padrão do efeito
            // kubikanimations); false: pula direto (foco mudou, arrasto).
            property bool animated: false

            flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: false

            Behavior on x {
                enabled: borderWindow.animated
                NumberAnimation {
                    duration: 250
                    easing.type: Easing.OutCubic
                }
            }
            Behavior on y {
                enabled: borderWindow.animated
                NumberAnimation {
                    duration: 250
                    easing.type: Easing.OutCubic
                }
            }
            Behavior on width {
                enabled: borderWindow.animated
                NumberAnimation {
                    duration: 250
                    easing.type: Easing.OutCubic
                }
            }
            Behavior on height {
                enabled: borderWindow.animated
                NumberAnimation {
                    duration: 250
                    easing.type: Easing.OutCubic
                }
            }

            Rectangle {
                anchors.fill: parent
                color: "transparent"
                radius: 8
                border.width: 3
                border.color: pal.highlight
            }
        }
    }

    Component {
        id: tabBarComponent

        Window {
            id: tabBar

            property var tabs: []

            // Recebe clique, mas sem roubar o foco da janela.
            flags: Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: false

            Row {
                anchors.fill: parent

                Repeater {
                    model: tabBar.tabs

                    Rectangle {
                        id: tab

                        required property var modelData
                        required property int index

                        width: tabBar.width / Math.max(1, tabBar.tabs.length)
                        height: tabBar.height
                        color: tab.modelData.active ? pal.highlight : (tabArea.containsMouse ? Qt.lighter(pal.window, 1.1) : pal.window)
                        border.width: 1
                        border.color: Qt.alpha(pal.windowText, 0.15)
                        radius: 4

                        Text {
                            anchors.fill: parent
                            anchors.leftMargin: 10
                            anchors.rightMargin: 10
                            verticalAlignment: Text.AlignVCenter
                            horizontalAlignment: Text.AlignHCenter
                            elide: Text.ElideRight
                            text: tab.modelData.caption
                            color: tab.modelData.active ? pal.highlightedText : pal.windowText
                            font.bold: tab.modelData.active
                        }

                        MouseArea {
                            id: tabArea

                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: {
                                if (root.controller)
                                    root.controller.activateTab(tab.modelData.id);
                            }
                        }
                    }
                }
            }
        }
    }

    function showTabs(bars) {
        const wins = tabWins.slice();
        while (wins.length < bars.length)
            wins.push(tabBarComponent.createObject(null));
        tabWins = wins;
        for (let i = 0; i < wins.length; i++) {
            const b = bars[i];
            if (!b) {
                wins[i].visible = false;
                continue;
            }
            wins[i].tabs = b.tabs;
            wins[i].x = b.rect.x;
            wins[i].y = b.rect.y;
            wins[i].width = Math.max(1, b.rect.width);
            wins[i].height = Math.max(1, b.rect.height);
            wins[i].visible = true;
        }
    }

    function showBorder(r, animate) {
        if (!borderWin)
            return;
        if (!r) {
            borderWin.visible = false;
            return;
        }
        borderWin.animated = animate && borderWin.visible;
        borderWin.x = r.x;
        borderWin.y = r.y;
        borderWin.width = Math.max(1, r.width);
        borderWin.height = Math.max(1, r.height);
        borderWin.visible = true;
    }

    Component {
        id: timerComponent

        Timer {
            repeat: false
        }
    }

    // Agenda fn para daqui a ms milissegundos (o núcleo TS não tem relógio).
    function later(ms, fn) {
        const t = timerComponent.createObject(root, {
            interval: ms
        });
        t.triggered.connect(() => {
            fn();
            t.destroy();
        });
        t.start();
    }

    function place(win, r) {
        if (!win)
            return;
        if (!r) {
            win.visible = false;
            return;
        }
        win.x = r.x;
        win.y = r.y;
        win.width = Math.max(1, r.width);
        win.height = Math.max(1, r.height);
        win.visible = true;
    }

    function showPreview(r, ghost, stack) {
        if (previewWin)
            previewWin.stack = !!stack;
        place(ghostWin, r ? ghost : null);
        place(previewWin, r);
    }

    function log(msg) {
        // console.warn: o Plasma costuma esconder console.log do journal.
        console.warn("[kubik] " + msg);
    }

    function loadCore() {
        /* @@KUBIK_BUNDLE@@ */
        return Kubik;
    }

    KWin.ShortcutHandler {
        name: "Kubik: Toggle tiling"
        text: "Kubik: liga/desliga o tiling"
        sequence: "Meta+Y"
        onActivated: {
            if (root.controller)
                root.controller.toggle();
        }
    }

    KWin.ShortcutHandler {
        name: "Kubik: Next tab"
        text: "Kubik: próxima aba da pilha"
        sequence: "Meta+Ctrl+Tab"
        onActivated: {
            if (root.controller)
                root.controller.cycleTab(1);
        }
    }

    KWin.ShortcutHandler {
        name: "Kubik: Previous tab"
        text: "Kubik: aba anterior da pilha"
        sequence: "Meta+Ctrl+Shift+Tab"
        onActivated: {
            if (root.controller)
                root.controller.cycleTab(-1);
        }
    }

    // Sem tecla padrão: usado pelo scripts/diagnose.sh (kglobalaccel invokeShortcut).
    KWin.ShortcutHandler {
        name: "Kubik: Log state"
        text: "Kubik: registra o estado no log (diagnóstico)"
        sequence: ""
        onActivated: {
            if (root.controller)
                root.controller.describe().forEach(l => root.log("[estado] " + l));
        }
    }

    Component.onCompleted: {
        previewWin = previewComponent.createObject(null);
        ghostWin = previewComponent.createObject(null, {
            ghost: true
        });
        borderWin = borderComponent.createObject(null);
        const core = loadCore();
        const maximizeArea = KWin.Workspace.MaximizeArea !== undefined ? KWin.Workspace.MaximizeArea : 2;
        controller = core.start({
            workspace: KWin.Workspace,
            clientArea: (output, desktop) => KWin.Workspace.clientArea(maximizeArea, output, desktop),
            log: root.log,
            preview: root.showPreview,
            border: root.showBorder,
            tabs: root.showTabs,
            later: root.later
        });
    }

    Component.onDestruction: {
        if (controller)
            controller.stop();
        if (previewWin)
            previewWin.destroy();
        if (ghostWin)
            ghostWin.destroy();
        if (borderWin)
            borderWin.destroy();
        for (const w of tabWins)
            w.destroy();
        log("descarregado");
    }
}
