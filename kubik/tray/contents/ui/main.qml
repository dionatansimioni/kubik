// Ícone do Kubik na bandeja do sistema.
//
// Fonte da verdade: o kwinrc ([Script-kubik]). Ao iniciar, lê o kwinrc e
// espelha os valores em Plasmoid.configuration (que o popup e as páginas de
// "Configurar…" editam); cada mudança é gravada de volta no kwinrc, junto com
// um reconfigure do KWin, e o script aplica na hora (Options.configChanged).
// A lógica (comandos, listas, validação) fica em src/tray/logic.ts.
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.extras as PlasmaExtras
import org.kde.plasma.plasma5support as P5Support
import org.kde.plasma.workspace.dbus as DBus
import org.kde.kirigami as Kirigami

import "../code/logic.js" as Logic

PlasmoidItem {
    id: root

    readonly property var logic: Logic.KubikTray
    readonly property var cfg: Plasmoid.configuration
    // Até ler o kwinrc, nada é gravado (senão os padrões da bandeja apagariam
    // o que o usuário já tinha).
    property bool loaded: false
    property bool syncing: false
    // O último comando gravado (ou o equivalente ao kwinrc lido): o mesmo de
    // novo não é gravado (cada gravação faz o KWin reler a configuração).
    property string lastWritten: ""

    Plasmoid.icon: Qt.resolvedUrl("../icons/kubik.svg")
    Plasmoid.status: PlasmaCore.Types.ActiveStatus
    toolTipMainText: "Kubik"
    toolTipSubText: tooltip()

    function tooltip() {
        const s = logic.toSettings(trayConfig());
        if (!s.enabled)
            return i18n("Tiling off (Meta+Y turns it on)");
        return i18n("Tiling on · gaps %1 px · border %2", s.gaps.inner, s.border.enabled ? i18n("%1 px", s.border.width) : i18n("off"));
    }

    function trayConfig() {
        return {
            enabled: cfg.enabled,
            gapsInner: cfg.gapsInner,
            gapsOuter: cfg.gapsOuter,
            borderEnabled: cfg.borderEnabled,
            borderWidth: cfg.borderWidth,
            allDesktopsOff: cfg.allDesktopsOff,
            exceptions: cfg.exceptions,
            animDuration: cfg.animDuration,
            animCurve: cfg.animCurve
        };
    }

    function log(msg) {
        console.warn("[kubik-tray] " + msg);
    }

    // ---- comandos (kreadconfig6 / kwriteconfig6 / dbus-send) ------------------

    P5Support.DataSource {
        id: exec

        property var callbacks: ({})

        function run(cmd, cb) {
            callbacks[cmd] = cb;
            connectSource(cmd);
        }

        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            const cb = callbacks[source];
            delete callbacks[source];
            disconnectSource(source);
            if (data["exit code"] !== 0)
                root.log("comando falhou (" + data["exit code"] + "): " + data.stderr);
            if (cb)
                cb(data["exit code"], data.stdout);
        }
    }

    function load() {
        exec.run(logic.readCommand(), (code, stdout) => {
            const settings = logic.parseRead(stdout);
            const c = logic.toTrayConfig(settings);
            lastWritten = logic.writeCommand(settings);
            syncing = true;
            for (const k in c)
                cfg[k] = c[k];
            syncing = false;
            loaded = true;
            log("configuração lida do kwinrc: " + logic.statusText(c));
            log("tooltip: " + tooltip()); // no idioma do sistema (o teste confere a tradução)
        });
    }

    // Junta mudanças seguidas (slider, spinbox) numa gravação só.
    Timer {
        id: saveTimer

        interval: 250
        onTriggered: {
            const cmd = root.logic.writeCommand(root.logic.toSettings(root.trayConfig()));
            if (cmd === root.lastWritten)
                return;
            root.lastWritten = cmd;
            exec.run(cmd, code => {
                if (code === 0)
                    root.log("gravado: " + root.logic.statusText(root.trayConfig()));
            });
        }
    }

    Connections {
        target: Plasmoid.configuration
        function onValueChanged(key, value) {
            if (root.loaded && !root.syncing)
                saveTimer.restart();
        }
    }

    // Meta+Y liga/desliga direto no script, sem passar por aqui: o atalho
    // aparece no D-Bus do kglobalaccel e a bandeja acompanha (e grava, para o
    // estado valer depois de reiniciar a sessão).
    DBus.SignalWatcher {
        service: "org.kde.kglobalaccel"
        path: "/component/kwin"
        iface: "org.kde.kglobalaccel.Component"

        function dbusglobalShortcutPressed(component, action, timestamp) {
            // Os argumentos chegam como objetos do D-Bus, não como texto.
            if (String(action) === root.logic.TOGGLE_SHORTCUT && root.loaded) {
                root.cfg.enabled = !root.cfg.enabled;
                root.log("atalho: tiling " + (root.cfg.enabled ? "ligado" : "desligado"));
            }
        }
    }

    function toggleTiling() {
        cfg.enabled = !cfg.enabled;
    }

    Component.onCompleted: load()

    Plasmoid.contextualActions: [
        PlasmaCore.Action {
            text: i18n("Tiling on")
            icon.name: "view-grid"
            checkable: true
            checked: root.cfg.enabled
            onTriggered: root.toggleTiling()
        }
    ]

    // ---- ícone -----------------------------------------------------------------

    compactRepresentation: MouseArea {
        id: compact

        acceptedButtons: Qt.LeftButton | Qt.MiddleButton
        hoverEnabled: true
        onClicked: mouse => {
            if (mouse.button === Qt.MiddleButton)
                root.toggleTiling();
            else
                root.expanded = !root.expanded;
        }

        Kirigami.Icon {
            anchors.fill: parent
            source: Plasmoid.icon
            isMask: true
            color: Kirigami.Theme.textColor
            active: compact.containsMouse
            opacity: root.cfg.enabled ? 1 : 0.4
        }
    }

    // ---- popup -----------------------------------------------------------------

    fullRepresentation: PlasmaExtras.Representation {
        id: popup

        Layout.minimumWidth: Kirigami.Units.gridUnit * 18
        Layout.minimumHeight: content.implicitHeight + header.implicitHeight + Kirigami.Units.largeSpacing * 2
        Layout.preferredHeight: Layout.minimumHeight
        collapseMarginsHint: true

        header: PlasmaExtras.PlasmoidHeading {
            RowLayout {
                anchors.fill: parent

                Kirigami.Heading {
                    Layout.fillWidth: true
                    level: 1
                    text: "Kubik"
                }
                PlasmaComponents3.Switch {
                    id: enabledSwitch

                    objectName: "enabledSwitch"
                    text: i18n("Tiling")
                    checked: root.cfg.enabled
                    onToggled: root.cfg.enabled = checked
                }
            }
        }

        ColumnLayout {
            id: content

            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Kirigami.Units.largeSpacing
            spacing: Kirigami.Units.smallSpacing

            GridLayout {
                Layout.fillWidth: true
                columns: 3
                columnSpacing: Kirigami.Units.largeSpacing

                PlasmaComponents3.Label {
                    text: i18n("Gaps")
                }
                PlasmaComponents3.SpinBox {
                    id: gapsSpin

                    objectName: "gapsSpin"
                    from: root.logic.LIMITS.gaps.min
                    to: root.logic.LIMITS.gaps.max
                    value: root.cfg.gapsInner
                    // Aqui um valor só: vale para os gaps internos e externos
                    // (separados em Configurar… › Geral).
                    onValueModified: {
                        root.cfg.gapsInner = value;
                        root.cfg.gapsOuter = value;
                    }
                }
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: i18n("px")
                    opacity: 0.7
                }

                PlasmaComponents3.CheckBox {
                    id: borderCheck

                    objectName: "borderCheck"
                    text: i18n("Border")
                    checked: root.cfg.borderEnabled
                    onToggled: root.cfg.borderEnabled = checked
                }
                PlasmaComponents3.SpinBox {
                    objectName: "borderSpin"
                    enabled: root.cfg.borderEnabled
                    from: root.logic.LIMITS.borderWidth.min
                    to: root.logic.LIMITS.borderWidth.max
                    value: root.cfg.borderWidth
                    onValueModified: root.cfg.borderWidth = value
                }
                PlasmaComponents3.Label {
                    Layout.fillWidth: true
                    text: i18n("px")
                    opacity: 0.7
                }
            }

            Kirigami.Heading {
                Layout.topMargin: Kirigami.Units.largeSpacing
                level: 4
                text: i18n("Tile windows that are on all desktops")
                wrapMode: Text.Wrap
                Layout.fillWidth: true
            }

            Repeater {
                model: Qt.application.screens

                PlasmaComponents3.CheckBox {
                    required property var modelData

                    objectName: "screen-" + modelData.name
                    Layout.fillWidth: true
                    text: modelData.model ? modelData.name + " — " + modelData.model : modelData.name
                    checked: !root.logic.inList(root.cfg.allDesktopsOff, modelData.name)
                    onToggled: root.cfg.allDesktopsOff = root.logic.toggleInList(root.cfg.allDesktopsOff, modelData.name, !checked)
                }
            }

            PlasmaComponents3.Button {
                Layout.topMargin: Kirigami.Units.largeSpacing
                Layout.alignment: Qt.AlignRight
                icon.name: "configure"
                text: i18n("Configure…")
                onClicked: Plasmoid.internalAction("configure").trigger()
            }
        }
    }
}
