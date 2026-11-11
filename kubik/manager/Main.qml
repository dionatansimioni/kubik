// Gerenciador do Kubik: a janela que abre pelo AppImage e pela entrada
// "Kubik" do menu. Mostra o estado no sistema e só oferece o que faz sentido
// (instalar, atualizar, reparar, remover, configurações). Roda no `qml` do
// sistema (scripts/manager.sh), com os módulos do Plasma; nada de Qt próprio.
// A lógica (estado → ações, comandos, textos) fica em src/manager/logic.ts.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami
import org.kde.plasma.plasma5support as P5Support

import "logic.js" as Logic

QQC2.ApplicationWindow {
    id: root

    readonly property var logic: Logic.KubikManager
    readonly property string lang: logic.langOf(Qt.locale().name)
    // O pacote que veio junto (AppImage) ou "" (aberto pelo menu).
    readonly property string bundleDir: logic.bundleArg(Qt.application.arguments)
    readonly property string bundled: Qt.application.arguments.indexOf("--bundled-version") >= 0 ? Qt.application.arguments[Qt.application.arguments.indexOf("--bundled-version") + 1] : ""

    property var status: null
    property var release: null
    property bool checked: false     // a consulta ao GitHub já respondeu (ou falhou)
    property string busy: ""         // ação em andamento
    property string message: ""      // resultado da última ação
    property bool failed: false
    property bool confirming: false
    readonly property var plan: logic.plan(status, bundled, release)
    readonly property int margin: Kirigami.Units.largeSpacing * 2

    function t(key, a) {
        return a === undefined ? logic.tr(lang, key) : logic.tr(lang, key, a);
    }
    function log(msg) {
        console.warn("[kubik-manager] " + msg);
    }

    title: "Kubik"
    // Tamanho fixo (o Kubik não põe no tiling: janela pequena, flutuando),
    // que acompanha o conteúdo. O sistema escreve em width/height ao
    // redimensionar, então os limites vêm de propriedades à parte.
    readonly property int fixedWidth: Kirigami.Units.gridUnit * 26
    readonly property int fixedHeight: Math.ceil(body.implicitHeight) + margin * 2
    width: fixedWidth
    height: fixedHeight
    minimumWidth: fixedWidth
    maximumWidth: fixedWidth
    minimumHeight: fixedHeight
    maximumHeight: fixedHeight
    // Só aparece depois de definir o domínio: no Wayland, o app_id (que liga
    // a janela à entrada do menu e ao ícone) é domínio + nome do executável
    // (o manager.sh roda o qml por um link chamado "kubik").
    visible: false

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
            if (cb)
                cb(data["exit code"], data.stdout, data.stderr);
        }
    }

    // Aparece com o estado já lido (o tamanho certo desde o início): mudar o
    // tamanho logo depois de mapear às vezes não pegava. No máximo 2 s.
    Timer {
        id: showTimer

        interval: 2000
        onTriggered: root.visible = true
    }

    function refresh() {
        exec.run(logic.statusCommand(), (code, stdout) => {
            status = logic.parseStatus(stdout);
            if (!visible)
                Qt.callLater(() => {
                    showTimer.stop();
                    visible = true;
                });
            log("estado: instalado " + plan.installed + ", disponível " + plan.available + " (" + plan.source + "), ações " + plan.actions.join(","));
        });
    }

    function checkReleases() {
        exec.run(logic.releasesCommand(), (code, stdout) => {
            release = logic.newerRelease(stdout, null);
            checked = true;
            log("GitHub: " + (release ? release.version : "nada"));
        });
    }

    function run(action) {
        confirming = false;
        message = "";
        failed = false;
        busy = action;
        const target = plan.available;
        let cmd;
        if (action === "remove")
            cmd = logic.removeCommand(bundleDir);
        else
            cmd = logic.installCommand(plan.source, bundleDir, release);
        log("ação: " + action + (action === "remove" ? "" : " " + target + " (" + plan.source + ")"));
        exec.run(cmd, (code, stdout, stderr) => {
            busy = "";
            failed = code !== 0;
            if (failed) {
                message = t("failed", code);
                log("falhou (" + code + "): " + String(stderr).trim().split("\n").slice(-3).join(" | "));
            } else {
                message = action === "remove" ? t("done_remove") : action === "repair" ? t("done_repair") : action === "update" ? t("done_update", target) : t("done_install", target);
                log("concluído: " + action);
            }
            refresh();
        });
    }

    function trigger(action) {
        if (action === "settings") {
            exec.run(logic.settingsCommand(), null);
            log("configurações");
        } else if (action === "remove") {
            confirming = true;
        } else {
            run(action);
        }
    }

    // Para os testes clicarem nos botões: posição de cada um na janela.
    function logButtons() {
        const parts = [];
        for (let i = 0; i < buttons.count; i++) {
            const b = buttons.itemAt(i);
            if (b && b.visible) {
                const p = b.mapToItem(null, b.width / 2, b.height / 2);
                parts.push(b.act + "=" + Math.round(p.x) + "," + Math.round(p.y));
            }
        }
        for (const b of [confirmButton, cancelButton])
            if (b.visible) {
                const p = b.mapToItem(null, b.width / 2, b.height / 2);
                parts.push(b.objectName + "=" + Math.round(p.x) + "," + Math.round(p.y));
            }
        log("botões " + parts.join(" "));
    }
    Timer {
        id: buttonsTimer

        interval: 300
        onTriggered: root.logButtons()
    }
    onPlanChanged: buttonsTimer.restart()
    onConfirmingChanged: buttonsTimer.restart()
    onBusyChanged: buttonsTimer.restart()
    // O sistema escreve em height ao configurar a janela, e isso desfaz o
    // binding acima: sem reaplicar, a janela não crescia quando aparecia um aviso.
    onFixedHeightChanged: {
        height = fixedHeight;
        buttonsTimer.restart();
    }
    onMessageChanged: buttonsTimer.restart()

    Component.onCompleted: {
        Qt.application.organizationDomain = "dionatansimioni.github.io";
        Qt.application.domain = "dionatansimioni.github.io";
        Qt.application.name = "kubik";
        Qt.application.displayName = "Kubik";
        showTimer.start();
        log("aberto " + (bundleDir ? "pelo instalador " + bundled : "pelo menu"));
        refresh();
        checkReleases();
    }

    ColumnLayout {
        id: body

        // Sem anchors.fill: a altura da janela vem da altura do conteúdo.
        x: root.margin
        y: root.margin
        width: root.fixedWidth - root.margin * 2
        spacing: Kirigami.Units.largeSpacing

        RowLayout {
            spacing: Kirigami.Units.largeSpacing

            Image {
                source: "kubik.svg"
                sourceSize.width: Kirigami.Units.iconSizes.huge
                sourceSize.height: Kirigami.Units.iconSizes.huge
            }
            ColumnLayout {
                spacing: 0
                Kirigami.Heading {
                    text: root.t("title")
                    level: 1
                }
                QQC2.Label {
                    text: root.t("tagline")
                    opacity: 0.7
                }
            }
        }

        GridLayout {
            columns: 2
            columnSpacing: Kirigami.Units.largeSpacing
            rowSpacing: Kirigami.Units.smallSpacing

            QQC2.Label {
                text: root.t("installed")
                opacity: 0.7
            }
            QQC2.Label {
                objectName: "installedLabel"
                font.bold: true
                text: root.status === null ? root.t("checking") : (root.plan.installed || root.t("notInstalled"))
            }
            QQC2.Label {
                text: root.t("available")
                opacity: 0.7
            }
            QQC2.Label {
                text: {
                    const p = root.plan;
                    if (p.available && (!p.installed || root.logic.compareVersions(p.available, p.installed) > 0))
                        return p.source === "github" ? root.t("fromGithub", p.available) : p.available;
                    if (!root.checked)
                        return root.t("checking");
                    return p.installed ? root.t("upToDate") : "—";
                }
            }
        }

        Kirigami.InlineMessage {
            Layout.fillWidth: true
            type: Kirigami.MessageType.Warning
            visible: root.plan.missing.length > 0
            text: root.t("missing", root.logic.missingText(root.lang, root.plan.missing))
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            type: Kirigami.MessageType.Warning
            visible: root.plan.warnings.indexOf("effect") >= 0
            text: root.t("warn_effect")
        }
        Kirigami.InlineMessage {
            Layout.fillWidth: true
            type: Kirigami.MessageType.Warning
            visible: root.plan.warnings.indexOf("script") >= 0
            text: root.t("warn_script")
        }
        QQC2.Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            opacity: 0.7
            visible: root.status !== null && !root.plan.installed
            text: root.plan.actions.length ? root.t("keys") : root.t("nothing")
        }
        Kirigami.InlineMessage {
            objectName: "resultMessage"
            Layout.fillWidth: true
            type: root.failed ? Kirigami.MessageType.Error : Kirigami.MessageType.Positive
            visible: root.message !== ""
            text: root.message
        }

        // Ações (ou a confirmação de remover), alinhadas à direita.
        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: Kirigami.Units.largeSpacing

            QQC2.BusyIndicator {
                Layout.preferredHeight: Kirigami.Units.iconSizes.medium
                visible: root.busy !== ""
                running: visible
            }
            QQC2.Label {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                visible: root.busy !== "" || root.confirming
                text: root.confirming ? root.t("confirmRemove") : root.busy ? root.t("busy_" + root.busy) : ""
            }
            Item {
                Layout.fillWidth: true
                visible: root.busy === "" && !root.confirming
            }
            Repeater {
                id: buttons

                model: root.busy === "" && !root.confirming ? root.plan.actions : []

                QQC2.Button {
                    required property string modelData
                    readonly property string act: modelData

                    text: root.logic.actionText(root.lang, modelData, root.plan)
                    icon.name: ({ install: "download", update: "update-none", repair: "tools-wizard", remove: "edit-delete", settings: "configure" })[modelData]
                    highlighted: modelData === "install" || modelData === "update" || modelData === "repair"
                    onClicked: root.trigger(modelData)
                }
            }
            QQC2.Button {
                id: confirmButton

                objectName: "confirm"
                visible: root.confirming
                icon.name: "edit-delete"
                text: root.t("remove")
                onClicked: root.run("remove")
            }
            QQC2.Button {
                id: cancelButton

                objectName: "cancel"
                visible: root.confirming
                text: root.t("cancel")
                onClicked: root.confirming = false
            }
        }
    }
}
