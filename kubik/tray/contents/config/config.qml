import QtQuick
import org.kde.plasma.configuration

ConfigModel {
    ConfigCategory {
        name: i18n("General")
        icon: "preferences-system-windows-behavior"
        source: "ConfigGeneral.qml"
    }
    ConfigCategory {
        name: i18n("Exceptions")
        icon: "window-new"
        source: "ConfigExceptions.qml"
    }
    ConfigCategory {
        name: i18n("Animation")
        icon: "preferences-desktop-animations"
        source: "ConfigAnimation.qml"
    }
    ConfigCategory {
        name: i18n("Tiling Shortcuts")
        icon: "preferences-desktop-keyboard-shortcut"
        source: "ConfigShortcuts.qml"
    }
}
