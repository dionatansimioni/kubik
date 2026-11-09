# Ambiente fechado para testar scripts do kubik num KWin real, sem monitor:
# kwin_wayland --virtual + janelas de teste + logs + screenshots.
FROM archlinux:latest

RUN pacman -Syu --noconfirm --needed \
        kwin kpackage kconfig qt6-wayland qt6-declarative \
        dbus python python-dbus python-pillow \
        ttf-dejavu libcap which kcalc xorg-xwayland chromium xdotool \
    && pacman -Scc --noconfirm \
    && setcap -r /usr/bin/kwin_wayland  # cap_sys_nice não existe no container

ENV XDG_RUNTIME_DIR=/tmp/xdg \
    QT_QPA_PLATFORM=wayland \
    KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 \
    QT_LOGGING_RULES="js.debug=true;qml.debug=true"

RUN useradd -m tester
USER tester
WORKDIR /home/tester
