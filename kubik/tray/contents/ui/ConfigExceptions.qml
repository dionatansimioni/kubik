// Configurar… › Exceções: apps que sempre flutuam (fora do tiling).
// Lista os apps abertos agora (barra de tarefas) para marcar com um clique,
// as exceções de apps fechados, um campo para digitar a classe e, só para
// leitura, as exceções embutidas.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.taskmanager as TaskManager

import "../code/logic.js" as Logic

KCM.ScrollViewKCM {
    id: page

    readonly property var logic: Logic.KubikTray

    property var cfg_exceptions: []
    property var cfg_exceptionsDefault: []
    property var apps: []
    readonly property var others: logic.otherExceptions(cfg_exceptions, apps)

    function setException(id, on) {
        cfg_exceptions = logic.toggleInList(cfg_exceptions, id, on);
    }

    TaskManager.TasksModel {
        id: tasks

        groupMode: TaskManager.TasksModel.GroupDisabled
        filterByVirtualDesktop: false
        filterByScreen: false
        filterByActivity: false
        filterMinimized: false

        onCountChanged: rebuild.restart()
        onDataChanged: rebuild.restart()
        onModelReset: rebuild.restart()
    }

    Timer {
        id: rebuild

        interval: 50
        onTriggered: {
            const rows = [];
            for (let i = 0; i < tasks.count; i++) {
                const ix = tasks.index(i, 0);
                rows.push({
                    appId: String(tasks.data(ix, TaskManager.AbstractTasksModel.AppId) || ""),
                    appName: String(tasks.data(ix, TaskManager.AbstractTasksModel.AppName) || ""),
                    icon: tasks.data(ix, Qt.DecorationRole)
                });
            }
            page.apps = page.logic.openApps(rows);
        }
    }

    Component.onCompleted: rebuild.start()

    header: ColumnLayout {
        spacing: Kirigami.Units.smallSpacing

        QQC2.Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            text: i18n("Check the apps that should always float, outside the tiling.")
        }
        RowLayout {
            Layout.fillWidth: true

            QQC2.TextField {
                id: manual

                objectName: "manualException"
                Layout.fillWidth: true
                placeholderText: i18n("Class of an app that is not open (e.g. steam)")
                onAccepted: addButton.clicked()
            }
            QQC2.Button {
                id: addButton

                icon.name: "list-add"
                text: i18n("Add")
                enabled: page.logic.isValidName(manual.text.trim())
                onClicked: {
                    page.setException(manual.text, true);
                    manual.text = "";
                }
            }
        }
    }

    view: ListView {
        id: list

        clip: true
        model: page.apps.length + page.others.length

        delegate: QQC2.ItemDelegate {
            id: row

            required property int index
            readonly property bool open: index < page.apps.length
            readonly property var app: open ? page.apps[index] : null
            readonly property string appId: open ? app.id : page.others[index - page.apps.length]

            width: ListView.view.width
            onClicked: {
                check.toggle();
                check.toggled();
            }

            contentItem: RowLayout {
                spacing: Kirigami.Units.largeSpacing

                QQC2.CheckBox {
                    id: check

                    checked: page.logic.inList(page.cfg_exceptions, row.appId)
                    onToggled: page.setException(row.appId, checked)
                }
                Kirigami.Icon {
                    implicitWidth: Kirigami.Units.iconSizes.medium
                    implicitHeight: Kirigami.Units.iconSizes.medium
                    source: row.open && row.app.icon ? row.app.icon : "application-x-executable"
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0

                    QQC2.Label {
                        Layout.fillWidth: true
                        text: row.open ? row.app.name : row.appId
                        elide: Text.ElideRight
                    }
                    QQC2.Label {
                        Layout.fillWidth: true
                        text: row.open ? row.appId : i18n("not open")
                        opacity: 0.6
                        font: Kirigami.Theme.smallFont
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }

    footer: QQC2.Label {
        wrapMode: Text.Wrap
        opacity: 0.6
        text: i18n("Always floating (built-in): %1. Also dialogs, fixed-size windows and windows on some desktops.",
                   page.logic.DEFAULT_FLOATING_CLASSES.join(", "))
    }
}
