// Modelo do Kubik.qml. O build (tools/embed.mjs) troca o marcador abaixo pelo
// bundle do TypeScript e grava o resultado em package/contents/ui/Kubik.qml.
//
// Por que embutir em vez de `import "kubik.js"`: o KWin guarda em memória o
// QML/JS compilado, indexado pela URL, até reiniciar. Um .js importado teria
// URL fixa e, ao atualizar o pacote com a sessão aberta, rodaria o código
// antigo. Este arquivo é carregado pelo main.qml com uma URL única por carga.
pragma ComponentBehavior: Bound

import QtQml
import QtQuick
import QtQuick.Window
// Namespace obrigatório: org.kde.kwin exporta um tipo 'Window' que esconderia
// o do QtQuick. E NÃO pode se chamar "KWin": esse nome é o objeto global do
// script (KWin.readConfig), que o namespace esconderia.
import org.kde.kwin as KWinQml
import org.kde.kirigami as Kirigami

Item {
    id: root

    property var controller: null
    property var core: null
    // Animação escolhida na bandeja (a mesma do efeito): os fades dos overlays
    // duram 60% dela (250 ms → 150 ms) e usam a mesma curva.
    property int fadeMs: 150
    property int fadeEasing: Easing.OutCubic
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

    // IMPORTANTE: os overlays são criados uma vez e NUNCA fechados (visible
    // fica true). Esconder = conteúdo transparente. Cada vez que um overlay
    // reabria, o KWin o tratava como janela nova e aplicava a animação de
    // abrir janela do usuário (ex.: crescer do centro), o que parecia um glitch.
    // O que aparece, aparece com um fade curto nosso (fadeIn).

    // Ícone de "janelas empilhadas": duas janelas sobrepostas.
    component StackGlyph: Item {
        id: glyph

        property color color: pal.highlight
        property real unit: 1

        implicitWidth: 22 * unit
        implicitHeight: 18 * unit

        Rectangle {
            x: 6 * glyph.unit
            y: 0
            width: 16 * glyph.unit
            height: 12 * glyph.unit
            radius: 3 * glyph.unit
            color: "transparent"
            border.width: Math.max(1.5, 1.6 * glyph.unit)
            border.color: Qt.alpha(glyph.color, 0.6)
        }
        Rectangle {
            x: 0
            y: 6 * glyph.unit
            width: 16 * glyph.unit
            height: 12 * glyph.unit
            radius: 3 * glyph.unit
            color: glyph.color
        }
    }

    // Conteúdo que aparece com fade (fadeIn) e some na hora (hideNow).
    component FadingItem: Item {
        id: fading

        property int fadeMs: root.fadeMs

        function fadeIn() {
            fadeAnim.stop();
            opacity = 0;
            fadeAnim.start();
        }
        function hideNow() {
            fadeAnim.stop();
            opacity = 0;
        }

        anchors.fill: parent
        opacity: 0

        NumberAnimation {
            id: fadeAnim

            target: fading
            property: "opacity"
            from: 0
            to: 1
            duration: fading.fadeMs
            easing.type: root.fadeEasing
        }
    }

    Component {
        id: previewComponent

        Window {
            id: previewWindow

            property bool ghost: false
            // O drop empilha: ícone de pilha e faixa de abas no topo.
            property bool stack: false
            property bool shown: false
            readonly property alias content: previewContent

            flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: true
            width: 1
            height: 1

            FadingItem {
                id: previewContent

                Rectangle {
                    anchors.fill: parent
                    radius: 10
                    color: Qt.alpha(pal.highlight, previewWindow.ghost ? 0.10 : (previewWindow.stack ? 0.30 : 0.22))
                    border.width: 2
                    border.color: Qt.alpha(pal.highlight, previewWindow.ghost ? 0.5 : 1)
                }

                Rectangle {
                    visible: previewWindow.stack
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: 6
                    height: 26
                    radius: 7
                    color: Qt.alpha(pal.highlight, 0.75)
                }

                Rectangle {
                    visible: previewWindow.stack
                    anchors.centerIn: parent
                    width: 112
                    height: 96
                    radius: 18
                    color: Qt.alpha(pal.window, 0.85)

                    StackGlyph {
                        anchors.centerIn: parent
                        unit: 3
                    }
                }
            }
        }
    }

    Component {
        id: borderComponent

        Window {
            property bool shown: false
            readonly property alias content: borderContent

            flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: true
            width: 1
            height: 1

            FadingItem {
                id: borderContent


                Rectangle {
                    anchors.fill: parent
                    color: "transparent"
                    radius: 10
                    border.width: 3
                    border.color: pal.highlight
                }
            }
        }
    }

    Component {
        id: tabBarComponent

        Window {
            id: tabBar

            property var tabs: []
            property bool shown: false
            readonly property alias content: tabContent

            // Recebe clique, mas sem roubar o foco da janela. Escondida, vai
            // para fora da tela (transparente ainda receberia cliques).
            flags: Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: true
            width: 1
            height: 1

            FadingItem {
                id: tabContent

                Rectangle {
                    anchors.fill: parent
                    radius: 9
                    color: Qt.alpha(pal.window, 0.97)
                    border.width: 1
                    border.color: Qt.alpha(pal.windowText, 0.12)
                }

                Row {
                    anchors.fill: parent
                    anchors.margins: 3
                    spacing: 3

                    // Iconografia: deixa claro que é uma pilha de janelas.
                    Item {
                        width: 30
                        height: parent.height

                        StackGlyph {
                            anchors.centerIn: parent
                        }
                    }

                    Repeater {
                        model: tabBar.tabs

                        Rectangle {
                            id: tab

                            required property var modelData

                            readonly property bool active: tab.modelData.active
                            readonly property bool hovered: tabArea.containsMouse || closeArea.containsMouse
                            readonly property color fg: tab.active ? pal.highlightedText : pal.windowText

                            width: (tabBar.width - 6 - 30 - 3 * tabBar.tabs.length) / Math.max(1, tabBar.tabs.length)
                            height: parent.height
                            radius: 7
                            color: tab.active ? pal.highlight : (tab.hovered ? Qt.alpha(pal.highlight, 0.16) : "transparent")

                            Behavior on color {
                                ColorAnimation {
                                    duration: 100
                                }
                            }

                            MouseArea {
                                id: tabArea

                                anchors.fill: parent
                                hoverEnabled: true
                                acceptedButtons: Qt.LeftButton | Qt.MiddleButton
                                onClicked: mouse => {
                                    if (!root.controller)
                                        return;
                                    // Botão do meio: tira da pilha (como fechar aba no navegador).
                                    if (mouse.button === Qt.MiddleButton)
                                        root.controller.unstack(tab.modelData.id);
                                    else
                                        root.controller.activateTab(tab.modelData.id);
                                }
                            }

                            Kirigami.Icon {
                                id: appIcon

                                anchors.left: parent.left
                                anchors.leftMargin: 8
                                anchors.verticalCenter: parent.verticalCenter
                                width: 16
                                height: 16
                                source: tab.modelData.icon ? tab.modelData.icon : "application-x-executable"
                            }

                            Text {
                                anchors.left: appIcon.right
                                anchors.leftMargin: 7
                                anchors.right: closeButton.left
                                anchors.rightMargin: 4
                                anchors.verticalCenter: parent.verticalCenter
                                elide: Text.ElideRight
                                text: tab.modelData.caption
                                color: tab.fg
                                font.pixelSize: 12
                                font.weight: tab.active ? Font.DemiBold : Font.Normal
                            }

                            // ×: tira a janela da pilha (ela volta ao tiling, ao lado).
                            Rectangle {
                                id: closeButton

                                anchors.right: parent.right
                                anchors.rightMargin: 5
                                anchors.verticalCenter: parent.verticalCenter
                                width: 18
                                height: 18
                                radius: 9
                                opacity: tab.hovered || tab.active ? 1 : 0
                                color: closeArea.containsMouse ? Qt.alpha(tab.fg, 0.22) : "transparent"

                                Text {
                                    anchors.centerIn: parent
                                    text: "\u2715"
                                    color: tab.fg
                                    font.pixelSize: 10
                                }

                                MouseArea {
                                    id: closeArea

                                    anchors.fill: parent
                                    hoverEnabled: true
                                    onClicked: {
                                        if (root.controller)
                                            root.controller.unstack(tab.modelData.id);
                                    }
                                }
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
            const w = wins[i];
            const b = bars[i];
            if (!b) {
                w.content.hideNow();
                w.shown = false;
                w.x = -20000;
                w.y = -20000;
                w.width = 1;
                w.height = 1;
                continue;
            }
            w.tabs = b.tabs;
            w.x = b.rect.x;
            w.y = b.rect.y;
            w.width = Math.max(1, b.rect.width);
            w.height = Math.max(1, b.rect.height);
            if (!w.shown)
                w.content.fadeIn();
            w.shown = true;
        }
    }

    // O controlador só mostra a borda com a janela parada (nunca a persegue):
    // cada borda nova surge com fade.
    function showBorder(r) {
        place(borderWin, r, true);
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

    // Mostra o overlay em r (fade se estava escondido, ou sempre com
    // `refade`) ou o esconde (r null). Nunca fecha a janela (ver acima).
    function place(win, r, refade) {
        if (!win)
            return;
        if (!r) {
            win.content.hideNow();
            win.shown = false;
            return;
        }
        win.x = r.x;
        win.y = r.y;
        win.width = Math.max(1, r.width);
        win.height = Math.max(1, r.height);
        if (!win.shown || refade)
            win.content.fadeIn();
        win.shown = true;
    }

    function showPreview(r, ghost, stack) {
        if (previewWin)
            previewWin.stack = !!stack;
        place(ghostWin, r ? ghost : null, false);
        place(previewWin, r, false);
    }

    function log(msg) {
        // console.warn: o Plasma costuma esconder console.log do journal.
        console.warn("[kubik] " + msg);
    }

    // Preferências do kwinrc ([Script-kubik]), gravadas pela bandeja.
    function readSettings() {
        const s = core.parseSettings((key, fallback) => KWin.readConfig(key, fallback));
        fadeMs = Math.round(s.animation.duration * 0.6);
        fadeEasing = Easing[s.animation.curve] !== undefined ? Easing[s.animation.curve] : Easing.OutCubic;
        return s;
    }

    // A bandeja grava o kwinrc e pede um reconfigure ao KWin, que emite isto.
    Connections {
        target: KWinQml.Options
        function onConfigChanged() {
            if (root.controller)
                root.controller.applySettings(root.readSettings());
        }
    }

    function loadCore() {
        /* @@KUBIK_BUNDLE@@ */
        return Kubik;
    }

    KWinQml.ShortcutHandler {
        name: "Kubik: Toggle tiling"
        text: "Kubik: liga/desliga o tiling"
        sequence: "Meta+Y"
        onActivated: {
            if (root.controller)
                root.controller.toggle();
        }
    }

    KWinQml.ShortcutHandler {
        name: "Kubik: Next tab"
        text: "Kubik: próxima aba da pilha"
        sequence: "Meta+Ctrl+Tab"
        onActivated: {
            if (root.controller)
                root.controller.cycleTab(1);
        }
    }

    KWinQml.ShortcutHandler {
        name: "Kubik: Previous tab"
        text: "Kubik: aba anterior da pilha"
        sequence: "Meta+Ctrl+Shift+Tab"
        onActivated: {
            if (root.controller)
                root.controller.cycleTab(-1);
        }
    }

    // Teclado no estilo Pop!_Shell (focar, mover, redimensionar, girar,
    // flutuar, monocle): a lista fica em src/kwin/keys.ts.
    Instantiator {
        model: root.core ? root.core.keyBindings() : []

        delegate: KWinQml.ShortcutHandler {
            required property var modelData

            name: modelData.name
            text: modelData.text
            sequence: modelData.sequence
            onActivated: {
                if (root.controller)
                    root.controller.runKey(modelData.action);
            }
        }
    }

    // Sem tecla padrão: usado pelo scripts/diagnose.sh (kglobalaccel invokeShortcut).
    KWinQml.ShortcutHandler {
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
        core = loadCore();
        const settings = readSettings();
        log("configuração: " + core.describeSettings(settings));
        const maximizeArea = KWinQml.Workspace.MaximizeArea !== undefined ? KWinQml.Workspace.MaximizeArea : 2;
        controller = core.start({
            workspace: KWinQml.Workspace,
            clientArea: (output, desktop) => KWinQml.Workspace.clientArea(maximizeArea, output, desktop),
            log: root.log,
            preview: root.showPreview,
            border: root.showBorder,
            tabs: root.showTabs,
            later: root.later
        }, settings);
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
