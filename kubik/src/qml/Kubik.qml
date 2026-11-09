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

    SystemPalette {
        id: pal
        colorGroup: SystemPalette.Active
    }

    Component {
        id: previewComponent

        Window {
            flags: Qt.FramelessWindowHint | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus | Qt.BypassWindowManagerHint
            color: "transparent"
            visible: false

            Rectangle {
                anchors.fill: parent
                radius: 8
                color: Qt.alpha(pal.highlight, 0.25)
                border.width: 2
                border.color: pal.highlight
            }
        }
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

    function showPreview(r) {
        if (!previewWin)
            return;
        if (!r) {
            previewWin.visible = false;
            return;
        }
        previewWin.x = r.x;
        previewWin.y = r.y;
        previewWin.width = Math.max(1, r.width);
        previewWin.height = Math.max(1, r.height);
        previewWin.visible = true;
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

    Component.onCompleted: {
        previewWin = previewComponent.createObject(null);
        const core = loadCore();
        const maximizeArea = KWin.Workspace.MaximizeArea !== undefined ? KWin.Workspace.MaximizeArea : 2;
        controller = core.start({
            workspace: KWin.Workspace,
            clientArea: (output, desktop) => KWin.Workspace.clientArea(maximizeArea, output, desktop),
            log: root.log,
            preview: root.showPreview,
            later: root.later
        });
    }

    Component.onDestruction: {
        if (controller)
            controller.stop();
        if (previewWin)
            previewWin.destroy();
        log("descarregado");
    }
}
