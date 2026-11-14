// Modelo do Tray.qml, o código do ícone da bandeja. O build (tools/embed.mjs)
// troca o marcador em loadLogic() pela lógica gerada de src/tray/logic.ts.
//
// Carregado pelo main.qml (a casca fixa) por uma URL única a cada carga: o
// plasmashell guarda em memória o QML (e o .js importado) pela URL e, ao
// recarregar a bandeja depois de uma atualização, rodaria o código antigo
// (Lição 45). O que é do PlasmoidItem (representações, tooltip, ações,
// expanded) a casca liga ao que este arquivo expõe; o resto mora aqui.
//
// Fonte da verdade: o kwinrc ([Script-kubik]). Ao iniciar, lê o kwinrc e
// espelha os valores em Plasmoid.configuration (que o popup e as páginas de
// "Configurar…" editam); cada mudança é gravada de volta no kwinrc, junto com
// um reconfigure do KWin, e o script aplica na hora (Options.configChanged).
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PlasmaComponents3
import org.kde.plasma.extras as PlasmaExtras
import org.kde.plasma.plasma5support as P5Support
import org.kde.kirigami as Kirigami

Item {
    id: root

    // O PlasmoidItem do main.qml (passado pelo Loader).
    property var shell: null
    readonly property var logic: loadLogic()
    readonly property var cfg: Plasmoid.configuration
    // scripts/sys.sh, que vem dentro do pacote: escolhe o cliente de D-Bus e o
    // de download que a distro tiver (docs/DESIGN.md, Lição 48).
    readonly property string sysPath: decodeURIComponent(Qt.resolvedUrl("../code/sys.sh").toString().replace(/^file:\/\//, ""))
    // O que falta no sistema (logic.Status.missing), com o comando que instala.
    readonly property var missing: status ? status.missing : ({})
    // Até ler o kwinrc, nada é gravado (senão os padrões da bandeja apagariam
    // o que o usuário já tinha).
    property bool loaded: false
    property bool syncing: false
    // O último comando gravado (ou o equivalente ao kwinrc lido): o mesmo de
    // novo não é gravado (cada gravação faz o KWin reler a configuração).
    property string lastWritten: ""

    // ---- estado e versão nova (o gerenciador completo é kubik/manager) -------
    // "Configurações" do gerenciador abre esta bandeja numa janela
    // (plasmawindowed, formFactor Planar): lá ela sempre procura versão nova.
    readonly property bool windowed: Plasmoid.formFactor === PlasmaCore.Types.Planar
    property var status: null       // logic.Status
    property var update: null       // logic.Release mais novo que o instalado
    property string lastStatusLine: ""
    // "", "updating", "updated", "failed"
    property string managerState: ""
    property string updatedTo: ""

    // Para a casca.
    readonly property string tooltipText: tooltip()
    readonly property Component compact: compactComponent
    readonly property Component full: fullComponent
    readonly property var actions: [toggleAction]

    function loadLogic() {
        /* @@KUBIK_BUNDLE@@ */
        return KubikTray;
    }

    function tooltip() {
        const s = logic.toSettings(trayConfig());
        const text = s.enabled ? i18n("Tiling on · gaps %1 px · border %2", s.gaps.inner, s.border.enabled ? i18n("%1 px", s.border.width) : i18n("off")) : i18n("Tiling off (Meta+Y turns it on)");
        return update ? text + "\n" + i18n("New version %1 available", update.version) : text;
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

    // ---- comandos (kreadconfig6 / kwriteconfig6 / sys.sh) ---------------------

    P5Support.DataSource {
        id: exec

        property var callbacks: ({})

        property var quiet: ({})

        // quiet: falha esperada (sem rede, etc.), não vai ao log como erro.
        // O mesmo comando de novo enquanto o primeiro roda (ex.: reler o estado
        // ao abrir o popup) não roda outra vez: o callback entra na fila dele.
        function run(cmd, cb, isQuiet) {
            const pending = callbacks[cmd];
            callbacks[cmd] = (pending || []).concat(cb ? [cb] : []);
            quiet[cmd] = !!isQuiet;
            if (!pending)
                connectSource(cmd);
        }

        engine: "executable"
        connectedSources: []
        onNewData: (source, data) => {
            const cbs = callbacks[source] || [];
            const isQuiet = quiet[source];
            delete callbacks[source];
            delete quiet[source];
            disconnectSource(source);
            if (data["exit code"] !== 0 && !isQuiet)
                root.log("comando falhou (" + data["exit code"] + "): " + data.stderr);
            for (const cb of cbs)
                cb(data["exit code"], data.stdout);
        }
    }

    function load() {
        exec.run(logic.readCommand(), (code, stdout) => {
            const settings = logic.parseRead(stdout);
            const c = logic.toTrayConfig(settings);
            lastWritten = logic.writeCommand(settings, sysPath);
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
            const cmd = root.logic.writeCommand(root.logic.toSettings(root.trayConfig()), root.sysPath);
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
    // estado valer depois de reiniciar a sessão). O DBus.SignalWatcher só
    // existe no Plasma 6.4+: num arquivo à parte, a falha fica só nele (no
    // 6.3, um tipo desconhecido aqui derrubava a bandeja inteira).
    Loader {
        id: shortcutWatcher

        source: "ShortcutWatcher.qml"
        onStatusChanged: {
            if (status === Loader.Error)
                root.log("sem DBus.SignalWatcher (Plasma < 6.4): a bandeja não acompanha o Meta+Y");
        }
    }

    Connections {
        target: shortcutWatcher.item
        function onPressed(action) {
            if (action === root.logic.TOGGLE_SHORTCUT && root.loaded) {
                root.cfg.enabled = !root.cfg.enabled;
                root.log("atalho: tiling " + (root.cfg.enabled ? "ligado" : "desligado"));
            }
        }
    }

    function toggleTiling() {
        cfg.enabled = !cfg.enabled;
    }

    function refreshStatus(then) {
        exec.run(logic.statusCommand(sysPath), (code, stdout) => {
            status = logic.parseStatus(stdout);
            let line = "estado: script " + status.script + (status.scriptLoaded ? " (ativo)" : " (parado)") + ", efeito " + status.effect + (status.effectLoaded ? " (ativo)" : " (parado)") + ", bandeja " + status.tray;
            const m = status.missing;
            if (status.plasmaRestart)
                line += "; reiniciar o painel ou a sessão";
            if (m.dbus || m.shortcuts || m.fetch)
                line += "; falta: " + [m.dbus ? "D-Bus (" + m.dbus + ")" : "", m.shortcuts && !m.dbus ? "atalhos (" + m.shortcuts + ")" : "", m.fetch ? "download (" + m.fetch + ")" : ""].filter(x => x).join(", ");
            if (line !== lastStatusLine)
                log(line);
            lastStatusLine = line;
            if (then)
                then();
        });
    }

    // Concluir a atualização (Lição 50). O sys.sh reinicia o plasmashell num
    // processo à parte: esta bandeja morre junto com o painel.
    function restartPanel() {
        log("reiniciar o painel");
        exec.run(logic.restartPanelCommand(sysPath), null);
    }
    function logout() {
        log("encerrar a sessão");
        exec.run(logic.logoutCommand(sysPath), null);
    }

    function checkUpdates() {
        if (managerState === "updating")
            return;
        exec.run(logic.releasesCommand(sysPath), (code, stdout) => {
            const current = logic.installedVersion(status);
            update = logic.newerRelease(stdout, current);
            if (update)
                log("nova versão: " + update.version + " (instalada: " + current + ")");
            else
                log(String(stdout).trim() ? "versão em dia: " + current : "verificação de versão sem resposta");
        }, true);
    }

    function runUpdate() {
        if (!update)
            return;
        const target = update.version;
        managerState = "updating";
        log("atualizando para " + target);
        exec.run(logic.updateCommand(update, sysPath), (code, stdout) => {
            refreshStatus(() => {
                if (code === 0 && logic.installedVersion(status) === target) {
                    managerState = "updated";
                    updatedTo = target;
                    update = null;
                    log("atualizado para " + target);
                } else {
                    managerState = "failed";
                    log("atualização falhou (" + code + ")");
                }
            });
        });
    }

    // O estado é uma foto: lido no meio de uma instalação (o install.sh
    // descarrega o script antes de carregar o novo, e o Plasma recarrega a
    // bandeja nesse meio-tempo), ficava "parado" para sempre. Relê ao abrir o
    // popup e, enquanto o script estiver instalado mas parado, a cada 5 s.
    Connections {
        target: root.shell
        function onExpandedChanged() {
            if (root.shell.expanded && root.managerState !== "updating")
                root.refreshStatus();
        }
    }

    Timer {
        interval: 5000
        repeat: true
        running: !!root.status && !root.missing.dbus && !!root.status.script && !root.status.scriptLoaded && root.managerState !== "updating"
        onTriggered: root.refreshStatus()
    }

    // Na janela (o usuário abriu o gerenciador) sempre verifica; na bandeja,
    // ao iniciar e a cada 6 h, se "Procurar versões novas" estiver marcado.
    Timer {
        id: updateTimer

        interval: root.logic.UPDATE_INTERVAL_MS
        repeat: true
        running: root.windowed || root.cfg.checkUpdates
        onTriggered: root.checkUpdates()
    }

    Component.onCompleted: {
        load();
        refreshStatus(() => {
            if (windowed || cfg.checkUpdates)
                checkUpdates();
        });
    }

    PlasmaCore.Action {
        id: toggleAction

        text: i18n("Tiling on")
        icon.name: "view-grid"
        checkable: true
        checked: root.cfg.enabled
        onTriggered: root.toggleTiling()
    }

    // ---- ícone -----------------------------------------------------------------

    Component {
        id: compactComponent

        MouseArea {
            id: compact

            // O Plasma cria as representações no contexto do main.qml (só
            // o id "shell" existe lá), não neste: daí o root explícito.
            readonly property var root: shell.impl

            acceptedButtons: Qt.LeftButton | Qt.MiddleButton
            hoverEnabled: true
            onClicked: mouse => {
                if (mouse.button === Qt.MiddleButton)
                    root.toggleTiling();
                else
                    root.shell.expanded = !root.shell.expanded;
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
    }

    // ---- popup -----------------------------------------------------------------

    Component {
        id: fullComponent

        PlasmaExtras.Representation {
            id: popup

            // O Plasma cria as representações no contexto do main.qml (só
            // o id "shell" existe lá), não neste: daí o root explícito.
            readonly property var root: shell.impl

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

                Kirigami.Separator {
                    Layout.fillWidth: true
                    Layout.topMargin: Kirigami.Units.smallSpacing
                }

                // Avisos do estado: programa faltando no sistema, componente parado.
                Kirigami.InlineMessage {
                    objectName: "dbusMissing"
                    Layout.fillWidth: true
                    type: Kirigami.MessageType.Error
                    visible: !!root.missing.dbus
                    text: i18n("Kubik can't talk to KWin: a D-Bus tool is missing. Install it with: %1", root.missing.dbus || "")
                }
                Kirigami.InlineMessage {
                    objectName: "fetchMissing"
                    Layout.fillWidth: true
                    type: Kirigami.MessageType.Information
                    visible: !!root.missing.fetch && (root.windowed || root.cfg.checkUpdates)
                    text: i18n("Can't check for new versions: a download tool is missing. Install it with: %1", root.missing.fetch || "")
                }
                Kirigami.InlineMessage {
                    objectName: "restartNotice"
                    Layout.fillWidth: true
                    type: Kirigami.MessageType.Warning
                    visible: !!root.status && root.status.plasmaRestart
                    text: i18n("To finish updating Kubik, restart the panel (it disappears for 2 or 3 seconds) or log out and back in.")
                    actions: [
                        Kirigami.Action {
                            text: i18n("Restart panel")
                            icon.name: "view-refresh"
                            onTriggered: root.restartPanel()
                        },
                        Kirigami.Action {
                            text: i18n("Log out")
                            icon.name: "system-log-out"
                            onTriggered: root.logout()
                        }
                    ]
                }
                Kirigami.InlineMessage {
                    objectName: "effectWarning"
                    Layout.fillWidth: true
                    type: Kirigami.MessageType.Warning
                    visible: !!root.status && !root.missing.dbus && !!root.status.effect && !root.status.effectLoaded
                    text: i18n("Animations start after you log out and back in.")
                    actions: [
                        Kirigami.Action {
                            text: i18n("Log out")
                            icon.name: "system-log-out"
                            onTriggered: root.logout()
                        }
                    ]
                }
                Kirigami.InlineMessage {
                    objectName: "scriptWarning"
                    Layout.fillWidth: true
                    type: Kirigami.MessageType.Warning
                    visible: !!root.status && !root.missing.dbus && !!root.status.script && !root.status.scriptLoaded
                    text: i18n("The tiling script is not running. Turn it on in System Settings › Window Management › KWin Scripts.")
                }

                RowLayout {
                    Layout.fillWidth: true

                    PlasmaComponents3.Label {
                        id: versionLabel

                        objectName: "versionLabel"
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                        opacity: root.update ? 1 : 0.7
                        text: {
                            const v = root.logic.installedVersion(root.status);
                            switch (root.managerState) {
                            case "updating":
                                return i18n("Updating to %1…", root.update ? root.update.version : "");
                            case "updated":
                                return i18n("Updated to %1.", root.updatedTo);
                            case "failed":
                                return i18n("Something went wrong. Check your internet connection and try again.");
                            }
                            if (root.update)
                                return i18n("New version %1 available", root.update.version);
                            return v ? i18n("Version %1", v) : "";
                        }
                    }
                    PlasmaComponents3.BusyIndicator {
                        Layout.preferredHeight: Kirigami.Units.iconSizes.small
                        Layout.preferredWidth: Kirigami.Units.iconSizes.small
                        visible: root.managerState === "updating"
                        running: visible
                    }
                    PlasmaComponents3.Button {
                        objectName: "updateButton"
                        visible: !!root.update && root.managerState !== "updating"
                        icon.name: "update-none"
                        text: i18n("Update")
                        onClicked: root.runUpdate()
                    }
                }
            }
        }
    }
}
