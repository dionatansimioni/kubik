// Configurar… › Animação: duração e curva, as mesmas para o movimento das
// janelas (efeito kubikanimations) e para os fades da borda, prévia e abas.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

import "../code/logic.js" as Logic

KCM.SimpleKCM {
    id: page

    readonly property var logic: Logic.KubikTray

    property alias cfg_animDuration: durationSlider.value
    property string cfg_animCurve: "OutCubic"

    Kirigami.FormLayout {
        RowLayout {
            Kirigami.FormData.label: i18n("Duração:")

            QQC2.Slider {
                id: durationSlider

                objectName: "durationSlider"
                Layout.preferredWidth: Kirigami.Units.gridUnit * 12
                from: logic.LIMITS.duration.min
                to: logic.LIMITS.duration.max
                stepSize: 10
                snapMode: QQC2.Slider.SnapAlways
            }
            QQC2.Label {
                text: durationSlider.value === 0 ? i18n("sem animação") : i18n("%1 ms", durationSlider.value)
            }
        }

        QQC2.ComboBox {
            id: curve

            Kirigami.FormData.label: i18n("Curva:")
            enabled: durationSlider.value > 0
            textRole: "label"
            valueRole: "value"
            model: logic.CURVE_CHOICES
            // Uma curva fora da lista (editada à mão no kwinrc) aparece como "Suave".
            currentIndex: Math.max(0, indexOfValue(page.cfg_animCurve))
            onActivated: page.cfg_animCurve = currentValue
        }

        // Prévia: um bloco vai e volta com a duração e a curva escolhidas.
        Rectangle {
            id: track

            Kirigami.FormData.label: i18n("Prévia:")
            implicitWidth: Kirigami.Units.gridUnit * 16
            implicitHeight: Kirigami.Units.gridUnit * 2.5
            radius: Kirigami.Units.cornerRadius
            color: Qt.alpha(Kirigami.Theme.textColor, 0.08)

            Rectangle {
                id: block

                y: Kirigami.Units.smallSpacing
                width: Kirigami.Units.gridUnit * 3
                height: parent.height - 2 * Kirigami.Units.smallSpacing
                radius: Kirigami.Units.cornerRadius
                color: Kirigami.Theme.highlightColor
                x: Kirigami.Units.smallSpacing
            }

            SequentialAnimation {
                running: page.visible
                loops: Animation.Infinite

                NumberAnimation {
                    target: block
                    property: "x"
                    to: track.width - block.width - Kirigami.Units.smallSpacing
                    duration: durationSlider.value
                    easing.type: Easing[page.cfg_animCurve] !== undefined ? Easing[page.cfg_animCurve] : Easing.OutCubic
                }
                PauseAnimation {
                    duration: 600
                }
                NumberAnimation {
                    target: block
                    property: "x"
                    to: Kirigami.Units.smallSpacing
                    duration: durationSlider.value
                    easing.type: Easing[page.cfg_animCurve] !== undefined ? Easing[page.cfg_animCurve] : Easing.OutCubic
                }
                PauseAnimation {
                    duration: 600
                }
            }
        }

        QQC2.Label {
            Layout.maximumWidth: Kirigami.Units.gridUnit * 22
            wrapMode: Text.Wrap
            opacity: 0.7
            text: i18n("Vale para as janelas se reorganizando e para os fades da borda, da prévia e das abas. A velocidade de animação global do Plasma também se aplica.")
        }
    }
}
