#!/usr/bin/env bash
# Roda DENTRO do container (scripts/manager-app/Dockerfile): compila
# /src/kubik/manager e monta /out/usr com o executável, o Qt (bibliotecas,
# plugins, módulos QML) e o qt.conf. Ver scripts/manager-app.sh.
set -euo pipefail

Q=/usr/lib/x86_64-linux-gnu/qt6
SYS=/usr/lib/x86_64-linux-gnu
B=/tmp/build
O=/out/usr

cmake -S /src/kubik/manager -B "$B" -DCMAKE_BUILD_TYPE=Release >/dev/null
# Build reproduzível: o rcc grava no executável a data dos arquivos embutidos.
touch -d @0 "$B/Main.qml" "$B/logic.js" "$B/kubik.svg"
cmake --build "$B" -j"$(nproc)" >/dev/null
rm -rf /out/usr && mkdir -p "$O/bin" "$O/lib" "$O/plugins" "$O/qml"
install -m755 "$B/kubik-manager" "$O/bin/kubik-manager"
strip "$O/bin/kubik-manager"

# O Qt acha os plugins e os módulos QML pelo qt.conf, ao lado do executável.
cat > "$O/bin/qt.conf" <<'CONF'
[Paths]
Prefix = ..
Libraries = lib
Plugins = plugins
QmlImports = qml
CONF

# Plugins: Wayland (e X11, por garantia), SVG (ícones) e teclado (compose).
for p in platforms/libqwayland-generic.so platforms/libqwayland-egl.so platforms/libqxcb.so \
         wayland-shell-integration/libxdg-shell.so \
         wayland-decoration-client/libbradient.so \
         wayland-graphics-integration-client/libqt-plugin-wayland-egl.so \
         wayland-graphics-integration-client/libshm-emulation-server.so \
         wayland-graphics-integration-client/libdmabuf-server.so \
         wayland-graphics-integration-client/libdrm-egl-server.so \
         xcbglintegrations/libqxcb-egl-integration.so xcbglintegrations/libqxcb-glx-integration.so \
         imageformats/libqsvg.so iconengines/libqsvgicon.so \
         platforminputcontexts/libcomposeplatforminputcontextplugin.so; do
    install -Dm644 "$Q/plugins/$p" "$O/plugins/$p"
done
# Módulos QML: QtQuick (sem os estilos que não usamos) e QtQml.
cp -a "$Q/qml/QtQuick" "$Q/qml/QtQml" "$O/qml/"
rm -rf "$O/qml/QtQuick/Controls/"{Imagine,Material,Universal,designer} \
       "$O/qml/QtQuick/"{Dialogs,Effects,Particles,Shapes,VectorImage,LocalStorage,NativeStyle,tooling} \
       "$O/qml/QtQml/XmlListModel"

# Bibliotecas: tudo de que o executável e os plugins dependem, menos o que
# precisa ser o do sistema (glibc, drivers de vídeo, Wayland/X11, fontes).
excluded() {
    case "$1" in
        ld-linux*|libc.so*|libm.so*|libdl.so*|libpthread.so*|librt.so*|libresolv.so*|libutil.so*) return 0 ;;
        libstdc++.so*|libgcc_s.so*) return 0 ;;
        libGL.so*|libEGL.so*|libGLX.so*|libGLdispatch.so*|libOpenGL.so*|libdrm.so*|libgbm.so*|libvulkan.so*) return 0 ;;
        libwayland-*|libX11.so*|libX11-xcb.so*|libxcb.so*|libXau.so*|libXdmcp.so*|libXext.so*|libXrender.so*) return 0 ;;
        libfontconfig.so*|libfreetype.so*|libexpat.so*|libz.so*|libdbus-1.so*|libsystemd.so*|libudev.so*) return 0 ;;
        libcap.so*|libgcrypt.so*|libgpg-error.so*|liblzma.so*|liblz4.so*|libzstd.so*|libbz2.so*) return 0 ;;
    esac
    return 1
}
changed=1
while [ -n "$changed" ]; do
    changed=""
    while read -r lib; do
        name=$(basename "$lib")
        excluded "$name" && continue
        [ -e "$O/lib/$name" ] && continue
        cp -L "$lib" "$O/lib/$name"
        changed=1
    done < <(find "$O" -type f \( -name '*.so*' -o -name kubik-manager \) -exec ldd {} + 2>/dev/null \
             | awk '$2 == "=>" && $3 ~ /^\// {print $3}' | sort -u)
done
# Bibliotecas com caminho de busca próprio (ex.: libproxy → /usr/lib/.../libproxy,
# onde está o libpxbackend) passam a procurar ao lado delas mesmas.
for f in "$O"/lib/*.so*; do
    if [ -n "$(patchelf --print-rpath "$f" 2>/dev/null)" ]; then
        patchelf --set-rpath '$ORIGIN' "$f"
    fi
done
strip --strip-unneeded "$O"/lib/*.so* "$O"/plugins/*/*.so 2>/dev/null || true
find "$O/qml" -name '*.so' -exec strip --strip-unneeded {} + 2>/dev/null || true
# Tudo resolvido com o que está aqui ou no que fica no sistema.
missing=$(LD_LIBRARY_PATH="$O/lib" find "$O" -type f \( -name '*.so*' -o -name kubik-manager \) -exec ldd {} + 2>/dev/null | grep 'not found' | sort -u || true)
[ -z "$missing" ] || { echo "erro: bibliotecas faltando:" >&2; echo "$missing" >&2; exit 1; }
echo "Qt $(basename "$(readlink -f "$SYS/libQt6Core.so.6")")"
