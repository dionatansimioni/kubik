# Variante Fedora do testenv (mesma interface que ../Dockerfile).
FROM fedora:44

RUN dnf -y install --setopt=install_weak_deps=False \
        kwin-wayland kf6-kpackage kf6-kconfig qt6-qtwayland qt6-qtdeclarative-devel \
        dbus-daemon dbus-tools python3 python3-dbus python3-pillow \
        dejavu-sans-fonts libcap which util-linux \
    && dnf clean all \
    && (setcap -r /usr/bin/kwin_wayland || true)

ENV XDG_RUNTIME_DIR=/tmp/xdg \
    QT_QPA_PLATFORM=wayland \
    KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1

RUN useradd -m tester
WORKDIR /home/tester
