# Compila o gerenciador (kubik/manager) e junta o Qt que vai no AppImage.
# Debian 13: Qt 6.8 LTS e glibc 2.41 (o AppImage roda onde a glibc for igual
# ou mais nova: Fedora 42+, Arch, openSUSE Tumbleweed, Debian 13, Kubuntu 25.04+).
FROM debian:trixie
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    g++ cmake make file binutils patchelf \
    qt6-base-dev qt6-declarative-dev qt6-wayland qt6-svg-plugins \
    qml6-module-qtquick qml6-module-qtquick-controls qml6-module-qtquick-layouts \
    qml6-module-qtquick-templates qml6-module-qtquick-window \
    qml6-module-qtqml-workerscript qml6-module-qtqml-models \
    && rm -rf /var/lib/apt/lists/*
