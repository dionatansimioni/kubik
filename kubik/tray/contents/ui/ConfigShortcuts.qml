// Configurar… › Atalhos do tiling: as ações globais do Kubik, com a tecla
// atual e a padrão. Lê e grava direto no kglobalaccel (D-Bus): é o mesmo
// lugar de Configurações do Sistema › Atalhos › KWin, então vale nos dois, e
// o KWin aplica na hora. Quem o usuário mudou fica em CustomShortcuts no
// kwinrc, para o install.sh não devolver a tecla padrão numa atualização.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.kquickcontrols as KQuickControls
import org.kde.plasma.plasma5support as P5Support

import "../code/logic.js" as Logic

KCM.SimpleKCM {
    id: page

    readonly property var logic: Logic.KubikTray
    readonly property var rows: logic.shortcutRows(Qt.locale().name)
    // name → tecla ("Meta+Y"), como está no kglobalaccel.
    property var saved: ({})
    // name → tecla escolhida aqui e ainda não aplicada.
    property var edits: ({})
    // Ações cuja tecla o kglobalaccel recusou (já era de outra ação).
    property var refused: []

    signal configurationChanged
    signal reloaded

    function log(msg) {
        console.warn("[kubik-tray] " + msg);
    }

    function current(name) {
        return name in edits ? edits[name] : (saved[name] || "");
    }

    function setEdit(name, text) {
        const e = Object.assign({}, edits);
        if (logic.keyCode(text) === logic.keyCode(saved[name] || ""))
            delete e[name];
        else
            e[name] = text;
        edits = e;
        configurationChanged();
    }

    function reload(then) {
        exec.run(logic.shortcutsReadCommand(rows.map(r => r.name)), (code, stdout) => {
            saved = logic.parseShortcuts(stdout);
            log("atalhos lidos: " + rows.map(r => r.name.replace("Kubik: ", "") + "=" + (saved[r.name] || "-")).join(", "));
            if (then)
                then();
            reloaded();
        });
    }

    // Chamado pelo diálogo de configuração no Aplicar/OK.
    function saveConfig() {
        const changes = Object.keys(edits).map(name => ({
            name: name,
            code: logic.keyCode(edits[name])
        }));
        if (!changes.length)
            return;
        const custom = rows.filter(r => logic.keyCode(current(r.name)) !== logic.keyCode(r.sequence)).map(r => r.name);
        const wanted = Object.assign({}, edits);
        exec.run(logic.shortcutsWriteCommand(changes, custom), () => {
            edits = {};
            reload(() => {
                refused = changes.filter(c => logic.keyCode(saved[c.name] || "") !== c.code).map(c => c.name);
                for (const c of changes)
                    log((refused.indexOf(c.name) < 0 ? "atalho gravado: " : "atalho recusado: ") + c.name + "=" + (wanted[c.name] || "-"));
            });
        });
    }

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
                page.log("comando falhou (" + data["exit code"] + "): " + data.stderr);
            if (cb)
                cb(data["exit code"], data.stdout);
        }
    }

    Component.onCompleted: reload()

    ColumnLayout {
        spacing: Kirigami.Units.largeSpacing

        QQC2.Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            text: i18n("Global shortcuts for Kubik's actions. They are also in System Settings › Keyboard › Shortcuts › KWin.")
            opacity: 0.8
        }

        Kirigami.InlineMessage {
            objectName: "refusedWarning"
            Layout.fillWidth: true
            type: Kirigami.MessageType.Warning
            visible: page.refused.length > 0
            text: i18n("Some keys were not saved because another shortcut already uses them: %1", page.refused.map(n => page.rows.find(r => r.name === n).text).join(", "))
        }

        Kirigami.FormLayout {
            Layout.fillWidth: true

            Repeater {
                model: page.rows

                RowLayout {
                    id: row

                    required property var modelData
                    readonly property bool isDefault: page.logic.keyCode(page.current(modelData.name)) === page.logic.keyCode(modelData.sequence)

                    function sync() {
                        keys.keySequence = page.current(modelData.name);
                    }

                    Kirigami.FormData.label: modelData.text + ":"
                    Component.onCompleted: sync()

                    Connections {
                        target: page
                        function onReloaded() {
                            row.sync();
                        }
                    }

                    KQuickControls.KeySequenceItem {
                        id: keys

                        objectName: "keys-" + row.modelData.name
                        checkForConflictsAgainst: KQuickControls.ShortcutType.GlobalShortcuts
                        onKeySequenceModified: page.setEdit(row.modelData.name, String(keySequence))
                    }

                    QQC2.ToolButton {
                        objectName: "reset-" + row.modelData.name
                        icon.name: "edit-undo"
                        enabled: !row.isDefault
                        display: QQC2.AbstractButton.IconOnly
                        text: i18n("Reset to default (%1)", row.modelData.sequence || i18n("none"))
                        QQC2.ToolTip.text: text
                        QQC2.ToolTip.visible: hovered
                        onClicked: {
                            page.setEdit(row.modelData.name, row.modelData.sequence);
                            row.sync();
                        }
                    }
                }
            }
        }

        QQC2.Button {
            Layout.alignment: Qt.AlignRight
            icon.name: "edit-undo"
            text: i18n("Restore all defaults")
            onClicked: {
                for (const r of page.rows)
                    page.setEdit(r.name, r.sequence);
                page.reloaded();
            }
        }
    }
}
