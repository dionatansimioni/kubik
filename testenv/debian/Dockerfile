# Variante Debian 13 (trixie) do testenv: Plasma 6.3, o mais antigo que o
# Kubik suporta (mesma interface que ../Dockerfile). Pega o que só existe em
# KWin/Plasma novos (ex.: Qt.WindowTransparentForInput, só no KWin 6.7+).
FROM debian:trixie

# Sem curl, com wget: como um Debian instalado (o wget é prioridade
# "important", o curl não vem por padrão). Exercita o fallback das atualizações.

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        kwin-wayland kwin-style-breeze breeze libkf6config-bin kpackagetool6 \
        plasma-workspace plasma-desktop plasma-sdk breeze-icon-theme \
        qml6-module-qtquick qml6-module-qtquick-window qt6-declarative-dev-tools qml-qt6 qt6-wayland \
        dbus dbus-x11 python3 python3-dbus python3-pil \
        libgl1-mesa-dri libegl-mesa0 libgbm1 mesa-libgallium \
        fonts-dejavu-core libcap2-bin kcalc xwayland chromium xdotool locales wget \
    && rm -rf /var/lib/apt/lists/* \
    && (setcap -r /usr/bin/kwin_wayland || true) \
    && sed -i 's/^# *\(en_US.UTF-8\|pt_BR.UTF-8\)/\1/' /etc/locale.gen && locale-gen

ENV XDG_RUNTIME_DIR=/tmp/xdg \
    QT_QPA_PLATFORM=wayland \
    KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 \
    QT_LOGGING_RULES="js.debug=true;qml.debug=true"

RUN useradd -m tester
WORKDIR /home/tester
