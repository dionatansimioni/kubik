import QtQuick
import org.kde.plasma.configuration

ConfigModel {
    ConfigCategory {
        name: i18n("Geral")
        icon: "preferences-system-windows-behavior"
        source: "ConfigGeneral.qml"
    }
    ConfigCategory {
        name: i18n("Exceções")
        icon: "window-new"
        source: "ConfigExceptions.qml"
    }
    ConfigCategory {
        name: i18n("Animação")
        icon: "preferences-desktop-animations"
        source: "ConfigAnimation.qml"
    }
}
