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

            Rectangle {
                anchors.fill: parent
                radius: 8
                color: Qt.alpha(pal.highlight, previewWindow.ghost ? 0.10 : 0.25)
                border.width: 2
                border.color: Qt.alpha(pal.highlight, previewWindow.ghost ? 0.5 : 1)
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

    function showPreview(r, ghost) {
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
        if (ghostWin)
            ghostWin.destroy();
        log("descarregado");
    }
}
