# Variante Fedora do testenv (mesma interface que ../Dockerfile).
FROM fedora:44

# As traduções em pt-BR (o Fedora do contêiner só instala en_US) e o locale:
# o kpackagetool6 traduz a saída ("Caminho"), e o gerenciador precisa aguentar.
RUN echo '%_install_langs en_US:pt_BR:pt' > /etc/rpm/macros.image-language-conf
RUN dnf -y install --setopt=install_weak_deps=False \
        kwin-wayland plasma-breeze plasma-workspace plasma-desktop plasma-sdk breeze-icon-theme kf6-kpackage kf6-kconfig qt6-qtwayland qt6-qtdeclarative-devel \
        dbus-daemon dbus-tools python3 python3-dbus python3-pillow \
        dejavu-sans-fonts glibc-langpack-pt libcap which util-linux kcalc \
        xorg-x11-server-Xwayland chromium xdotool xwaylandvideobridge \
    && dnf clean all \
    && (setcap -r /usr/bin/kwin_wayland || true)

ENV XDG_RUNTIME_DIR=/tmp/xdg \
    QT_QPA_PLATFORM=wayland \
    KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1

RUN useradd -m tester
WORKDIR /home/tester
