// Modelo do Kubik.qml. O build (tools/embed.mjs) troca o marcador abaixo pelo
// bundle do TypeScript e grava o resultado em package/contents/ui/Kubik.qml.
//
// Por que embutir em vez de `import "kubik.js"`: o KWin guarda em memória o
// QML/JS compilado, indexado pela URL, até reiniciar. Um .js importado teria
// URL fixa e, ao atualizar o pacote com a sessão aberta, rodaria o código
// antigo. Este arquivo é carregado pelo main.qml com uma URL única por carga.
pragma ComponentBehavior: Bound

import QtQuick
// Namespace obrigatório: org.kde.kwin exporta um tipo 'Window' que esconderia
// o do QtQuick.
import org.kde.kwin as KWin

Item {
    id: root

    property var controller: null

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
        const core = loadCore();
        const maximizeArea = KWin.Workspace.MaximizeArea !== undefined ? KWin.Workspace.MaximizeArea : 2;
        controller = core.start({
            workspace: KWin.Workspace,
            clientArea: (output, desktop) => KWin.Workspace.clientArea(maximizeArea, output, desktop),
            log: root.log
        });
    }

    Component.onDestruction: {
        if (controller)
            controller.stop();
        log("descarregado");
    }
}
