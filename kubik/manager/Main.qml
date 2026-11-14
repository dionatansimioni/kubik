// Gerenciador do Kubik: a janela que abre pelo AppImage e pela entrada
// "Kubik" do menu. Mostra o estado no sistema e só oferece o que faz sentido
// (instalar, atualizar, reparar, remover, configurações).
// Roda no app próprio (main.cpp), com o Qt que vem no AppImage: só QtQuick e
// QtQuick.Controls, nada do Plasma (Kirigami, plasma5support), que muda entre
// versões. Do main.cpp vêm: shell (roda comandos), bundleDir/bundledVersion
// (o pacote que vem no AppImage), kdeTheme (cores de aviso) e qtVersion.
// A lógica (estado → ações, comandos, textos) fica em src/manager/logic.ts.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

import "logic.js" as Logic

ApplicationWindow {
    id: root

    readonly property var logic: Logic.KubikManager
    readonly property string lang: logic.langOf(Qt.locale().name)
    readonly property string bundled: bundledVersion

    property var status: null
    property var release: null
    property bool checked: false     // a consulta ao GitHub já respondeu (ou falhou)
    property string busy: ""         // ação em andamento
    property string message: ""      // resultado da última ação
    property bool failed: false
    property bool confirming: false
    readonly property var plan: logic.plan(status, bundled, release)

    // Medidas a partir da fonte (como as Units do Kirigami).
    readonly property int gridUnit: Math.round(fontMetrics.height)
    readonly property int spacing: Math.round(gridUnit / 3)
    readonly property int margin: Math.round(gridUnit * 1.2)

    function t(key, a) {
        return a === undefined ? logic.tr(lang, key) : logic.tr(lang, key, a);
    }
    function log(msg) {
        console.warn("[kubik-manager] " + msg);
    }

    FontMetrics {
        id: fontMetrics
    }

    title: "Kubik"
    color: palette.window
    // Tamanho fixo (o Kubik não põe no tiling: janela pequena, flutuando), que
    // acompanha o conteúdo. O sistema escreve em width/height ao configurar a
    // janela, então os limites vêm de propriedades à parte.
    readonly property int fixedWidth: gridUnit * 26
    readonly property int fixedHeight: Math.ceil(body.implicitHeight) + margin * 2
    width: fixedWidth
    height: fixedHeight
    minimumWidth: fixedWidth
    maximumWidth: fixedWidth
    minimumHeight: fixedHeight
    maximumHeight: fixedHeight
    visible: false

    // ---- comandos (main.cpp: shell.run / shell.finished) ------------------------
    property var callbacks: ({})
    function exec(cmd, cb) {
        const id = shell.run(cmd);
        callbacks[id] = cb;
    }
    Connections {
        target: shell

        function onFinished(id, code, out, err) {
            const cb = root.callbacks[id];
            delete root.callbacks[id];
            if (cb)
                cb(code, out, err);
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
        exec(logic.statusCommand(logic.sysPath(bundleDir)), (code, stdout) => {
            status = logic.parseStatus(stdout);
            if (!visible)
                Qt.callLater(() => {
                    showTimer.stop();
                    visible = true;
                });
            log("estado: instalado " + plan.installed + ", disponível " + plan.available + " (" + plan.source + "), ações " + plan.actions.join(",") + (plan.warnings.length ? ", avisos " + plan.warnings.join(",") : ""));
        });
    }

    function checkReleases() {
        exec(logic.releasesCommand(logic.sysPath(bundleDir)), (code, stdout) => {
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
        exec(cmd, (code, stdout, stderr) => {
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

    // Concluir a atualização (Lição 50): reiniciar o painel ou encerrar a sessão.
    function restartPanel() {
        log("reiniciar o painel");
        exec(logic.restartPanelCommand(bundleDir), () => restartCheck.start());
    }
    function logout() {
        log("encerrar a sessão");
        exec(logic.logoutCommand(bundleDir), null);
    }
    // O plasmashell novo leva uns segundos para subir: só então o aviso some.
    Timer {
        id: restartCheck

        interval: 4000
        onTriggered: root.refresh()
    }

    function trigger(action) {
        if (action === "settings") {
            exec(logic.settingsCommand(), null);
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
        for (const b of [confirmButton, cancelButton, restartPanelButton, logoutButton])
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
    onMessageChanged: buttonsTimer.restart()
    onVisibleChanged: buttonsTimer.restart()
    // O sistema escreve em height ao configurar a janela, e isso desfaz o
    // binding acima: sem reaplicar, a janela não crescia quando aparecia um aviso.
    onFixedHeightChanged: {
        height = fixedHeight;
        buttonsTimer.restart();
    }

    // As cores do KDE (main.cpp): o Fusion não as pega do QGuiApplication.
    function applyKdePalette() {
        const roles = kdeTheme.palette || {};
        for (const role in roles)
            palette[role] = roles[role];
        if (kdeTheme.disabledText) {
            palette.disabled.windowText = kdeTheme.disabledText;
            palette.disabled.text = kdeTheme.disabledText;
            palette.disabled.buttonText = kdeTheme.disabledText;
        }
    }

    Component.onCompleted: {
        applyKdePalette();
        showTimer.start();
        log("aberto (Qt " + qtVersion + ")" + (bundled ? ", pacote " + bundled : ", sem pacote") + ", fonte " + Qt.application.font.family + " " + Qt.application.font.pointSize + ", cores " + (kdeTheme.fromKde ? "do KDE" : "padrão") + " (janela " + palette.window + ")");
        refresh();
        checkReleases();
    }

    // Aviso em faixa colorida (no lugar do InlineMessage do Kirigami).
    component Notice: Rectangle {
        id: notice

        property string text
        property color tint: kdeTheme.neutral

        Layout.fillWidth: true
        implicitHeight: noticeLabel.implicitHeight + root.spacing * 3
        radius: 4
        color: Qt.rgba(tint.r, tint.g, tint.b, 0.15)
        border.color: tint

        Label {
            id: noticeLabel

            anchors.fill: parent
            anchors.margins: root.spacing * 1.5
            verticalAlignment: Text.AlignVCenter
            wrapMode: Text.Wrap
            text: notice.text
        }
    }

    ColumnLayout {
        id: body

        // Sem anchors.fill: a altura da janela vem da altura do conteúdo.
        x: root.margin
        y: root.margin
        width: root.fixedWidth - root.margin * 2
        spacing: root.spacing * 2

        RowLayout {
            spacing: root.spacing * 2

            Image {
                source: "qrc:/kubik.svg"
                sourceSize.width: root.gridUnit * 3
                sourceSize.height: root.gridUnit * 3
            }
            ColumnLayout {
                spacing: 0
                Label {
                    text: root.t("title")
                    font.pointSize: Qt.application.font.pointSize * 1.6
                }
                Label {
                    text: root.t("tagline")
                    opacity: 0.7
                }
            }
        }

        GridLayout {
            columns: 2
            columnSpacing: root.spacing * 2
            rowSpacing: root.spacing

            Label {
                text: root.t("installed")
                opacity: 0.7
            }
            Label {
                objectName: "installedLabel"
                font.bold: true
                text: root.status === null ? root.t("checking") : (root.plan.installed || root.t("notInstalled"))
            }
            Label {
                text: root.t("available")
                opacity: 0.7
            }
            Label {
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

        Notice {
            visible: root.plan.missing.length > 0
            text: root.t("missing", root.logic.missingText(root.lang, root.plan.missing))
        }
        Notice {
            visible: root.plan.warnings.indexOf("dbus") >= 0
            text: root.t("warn_dbus", root.plan.hints.dbus || "")
        }
        Notice {
            visible: root.plan.warnings.indexOf("fetch") >= 0
            text: root.t("warn_fetch", root.plan.hints.fetch || "")
        }
        Notice {
            visible: root.plan.warnings.indexOf("effect") >= 0
            text: root.t("warn_effect")
        }
        Notice {
            visible: root.plan.warnings.indexOf("script") >= 0
            text: root.t("warn_script")
        }
        Notice {
            objectName: "restartNotice"
            visible: root.plan.warnings.indexOf("restart") >= 0
            text: root.t("warn_restart")
        }
        // Concluir: reiniciar o painel (só quando a bandeja mudou) ou a sessão
        // (também para as animações, que o KWin só descobre no login).
        RowLayout {
            Layout.fillWidth: true
            // Pela condição, não pelo visible dos botões (dentro de um pai
            // invisível, eles também ficam invisíveis: nunca apareceria).
            visible: root.busy === "" && !root.confirming && (root.plan.warnings.indexOf("restart") >= 0 || root.plan.warnings.indexOf("effect") >= 0)

            Item {
                Layout.fillWidth: true
            }
            Button {
                id: restartPanelButton

                objectName: "restartPanel"
                visible: root.busy === "" && root.plan.warnings.indexOf("restart") >= 0
                icon.name: "view-refresh"
                text: root.t("restartPanel")
                onClicked: root.restartPanel()
            }
            Button {
                id: logoutButton

                objectName: "logout"
                visible: root.busy === "" && !root.confirming && (root.plan.warnings.indexOf("restart") >= 0 || root.plan.warnings.indexOf("effect") >= 0)
                icon.name: "system-log-out"
                text: root.t("logout")
                onClicked: root.logout()
            }
        }
        Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            opacity: 0.7
            visible: root.status !== null && !root.plan.installed
            text: root.plan.actions.length ? root.t("keys") : root.t("nothing")
        }
        Notice {
            objectName: "resultMessage"
            visible: root.message !== ""
            tint: root.failed ? kdeTheme.negative : kdeTheme.positive
            text: root.message
        }

        // Ações (ou a confirmação de remover), alinhadas à direita.
        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: root.spacing

            BusyIndicator {
                Layout.preferredHeight: root.gridUnit * 1.5
                Layout.preferredWidth: root.gridUnit * 1.5
                visible: root.busy !== ""
                running: visible
            }
            Label {
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

                Button {
                    required property string modelData
                    // `action` é FINAL no Button (DESIGN.md, lição 35).
                    readonly property string act: modelData

                    text: root.logic.actionText(root.lang, modelData, root.plan)
                    icon.name: ({ install: "download", update: "update-none", repair: "tools-wizard", remove: "edit-delete", settings: "configure" })[modelData]
                    highlighted: modelData === "install" || modelData === "update" || modelData === "repair"
                    onClicked: root.trigger(modelData)
                }
            }
            Button {
                id: confirmButton

                objectName: "confirm"
                visible: root.confirming
                icon.name: "edit-delete"
                text: root.t("remove")
                onClicked: root.run("remove")
            }
            Button {
                id: cancelButton

                objectName: "cancel"
                visible: root.confirming
                text: root.t("cancel")
                onClicked: root.confirming = false
            }
        }
    }
}
