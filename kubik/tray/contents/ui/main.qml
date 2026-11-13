// Casca do ícone da bandeja. NÃO coloque lógica aqui.
//
// O plasmashell compila cada arquivo QML (e cada .js importado) uma vez e o
// guarda em memória, indexado pela URL, até reiniciar. Ao atualizar o pacote,
// ele recria a bandeja, mas com o código ANTIGO (Lição 45). Este arquivo
// nunca muda (o cache dele é inofensivo): carrega o código real (Tray.qml,
// gerado de src/qml/Tray.qml) por uma URL única a cada carga e liga a ele o
// que é do PlasmoidItem.
import QtQuick
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore

PlasmoidItem {
    id: shell

    readonly property var impl: loader.item

    Plasmoid.icon: Qt.resolvedUrl("../icons/kubik.svg")
    Plasmoid.status: PlasmaCore.Types.ActiveStatus
    Plasmoid.contextualActions: impl ? impl.actions : []
    toolTipMainText: "Kubik"
    toolTipSubText: impl ? impl.tooltipText : ""
    compactRepresentation: impl ? impl.compact : null
    fullRepresentation: impl ? impl.full : null

    Loader {
        id: loader

        Component.onCompleted: setSource(Qt.resolvedUrl("Tray.qml") + "?load=" + Date.now(), {
            shell: shell
        })
        onStatusChanged: {
            if (status === Loader.Error)
                console.warn("[kubik-tray] falha ao carregar Tray.qml");
        }
    }
}
