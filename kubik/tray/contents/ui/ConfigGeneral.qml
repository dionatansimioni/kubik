// Configurar… › Geral: gaps (internos e externos), borda e o liga/desliga.
import QtQuick
import QtQuick.Controls as QQC2
import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

import "../code/logic.js" as Logic

KCM.SimpleKCM {
    readonly property var logic: Logic.KubikTray

    property alias cfg_enabled: enabledCheck.checked
    property alias cfg_gapsInner: gapsInner.value
    property alias cfg_gapsOuter: gapsOuter.value
    property alias cfg_borderEnabled: borderCheck.checked
    property alias cfg_borderWidth: borderWidth.value

    Kirigami.FormLayout {
        QQC2.CheckBox {
            id: enabledCheck

            Kirigami.FormData.label: i18n("Tiling:")
            text: i18n("On (shortcut: Meta+Y)")
        }

        Item {
            Kirigami.FormData.isSection: true
        }

        QQC2.SpinBox {
            id: gapsInner

            Kirigami.FormData.label: i18n("Gaps between windows:")
            from: logic.LIMITS.gaps.min
            to: logic.LIMITS.gaps.max
            textFromValue: (v, locale) => i18n("%1 px", v)
            valueFromText: (t, locale) => parseInt(t)
        }
        QQC2.SpinBox {
            id: gapsOuter

            Kirigami.FormData.label: i18n("Gaps at the screen edges:")
            from: logic.LIMITS.gaps.min
            to: logic.LIMITS.gaps.max
            textFromValue: (v, locale) => i18n("%1 px", v)
            valueFromText: (t, locale) => parseInt(t)
        }

        Item {
            Kirigami.FormData.isSection: true
        }

        QQC2.CheckBox {
            id: borderCheck

            Kirigami.FormData.label: i18n("Highlight border:")
            text: i18n("Around the focused window (system accent color)")
        }
        QQC2.SpinBox {
            id: borderWidth

            Kirigami.FormData.label: i18n("Border width:")
            enabled: borderCheck.checked
            from: logic.LIMITS.borderWidth.min
            to: logic.LIMITS.borderWidth.max
            textFromValue: (v, locale) => i18n("%1 px", v)
            valueFromText: (t, locale) => parseInt(t)
        }
    }
}
