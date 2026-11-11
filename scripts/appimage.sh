#!/usr/bin/env bash
# Gera o instalador AppImage a partir do .tar.gz do release.
# Uso: scripts/appimage.sh <kubik-<versão>.tar.gz> <diretório-de-saída>
# Imprime o caminho do Kubik-<versão>-x86_64.AppImage.
#
# Um AppImage tipo 2 é o runtime (um executável estático que monta ou extrai
# o resto) + uma imagem squashfs com AppRun, o .desktop e o ícone. Fazemos
# isso direto com o mksquashfs (é o que o appimagetool faz), com o runtime
# oficial numa versão fixa e conferida por sha256. Nada de Qt dentro: o
# instalador usa o kdialog e as ferramentas do próprio Plasma.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ $# -eq 2 ] || { echo "uso: $0 <kubik-versão.tar.gz> <saída>" >&2; exit 2; }
TARBALL=$(realpath "$1")
OUT=$(realpath -m "$2")
APP_ID=io.github.dionatansimioni.kubik

RUNTIME_VERSION=20251108
RUNTIME_SHA256=2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/kubik-build
RUNTIME=$CACHE/runtime-$RUNTIME_VERSION-x86_64

command -v mksquashfs >/dev/null || { echo "erro: mksquashfs não encontrado (squashfs-tools)" >&2; exit 1; }
if [ ! -f "$RUNTIME" ]; then
    mkdir -p "$CACHE"
    curl -fsSL -o "$RUNTIME.part" \
        "https://github.com/AppImage/type2-runtime/releases/download/$RUNTIME_VERSION/runtime-x86_64"
    mv "$RUNTIME.part" "$RUNTIME"
fi
echo "$RUNTIME_SHA256  $RUNTIME" | sha256sum -c --quiet - || { echo "erro: sha256 do runtime não confere" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
APPDIR=$WORK/AppDir
mkdir -p "$APPDIR"
tar xzf "$TARBALL" -C "$APPDIR"
BUNDLE=$(find "$APPDIR" -maxdepth 1 -type d -name 'kubik-*' | head -n1)
VERSION=${BUNDLE##*/kubik-}

install -m755 "$ROOT/scripts/appimage/AppRun" "$APPDIR/AppRun"
install -m644 "$ROOT/assets/kubik.svg" "$APPDIR/$APP_ID.svg"
install -m644 "$ROOT/assets/kubik-256.png" "$APPDIR/.DirIcon"
cat > "$APPDIR/$APP_ID.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Kubik Installer
Name[pt_BR]=Instalador do Kubik
Comment=Install, update or open Kubik, the auto-tiling for KDE Plasma
Comment[pt_BR]=Instala, atualiza ou abre o Kubik, o auto-tiling do KDE Plasma
Exec=AppRun
Icon=$APP_ID
Categories=Utility;
Terminal=false
X-AppImage-Version=$VERSION
DESKTOP

mkdir -p "$OUT"
DEST=$OUT/Kubik-$VERSION-x86_64.AppImage
# Datas e donos fixos: o mesmo .tar.gz gera o mesmo AppImage.
find "$APPDIR" -exec touch -h -d @0 {} +
mksquashfs "$APPDIR" "$WORK/image.squashfs" -root-owned -noappend -no-progress -quiet \
    -comp zstd -mkfs-time 0 -all-time 0 >/dev/null
cat "$RUNTIME" "$WORK/image.squashfs" > "$DEST.part"
chmod 755 "$DEST.part"
mv "$DEST.part" "$DEST"
echo "$DEST"
