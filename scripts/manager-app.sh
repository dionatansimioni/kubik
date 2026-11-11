#!/usr/bin/env bash
# Compila o gerenciador do Kubik (kubik/manager: C++ + QML) com o Qt 6.8 LTS
# do Debian 13 e monta <saída>/usr com o executável e o Qt que ele usa, para ir
# dentro do AppImage (scripts/appimage.sh). Tudo num container: nada de Qt ou
# compilador no host.
#
# Uso: scripts/manager-app.sh <saída>
# O resultado fica em cache (~/.cache/kubik-build/manager-<hash das fontes>).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ $# -eq 1 ] || { echo "uso: $0 <saída>" >&2; exit 2; }
OUT=$(realpath -m "$1")

# O logic.js vem do TypeScript (src/manager/logic.ts).
[ -f "$ROOT/kubik/manager/logic.js" ] || "$ROOT/scripts/node.sh" kubik npm run --silent build >&2

IMAGE=kubik-build-qt
docker build -q -t "$IMAGE" "$ROOT/scripts/manager-app" >/dev/null

HASH=$( (cd "$ROOT" && cat scripts/manager-app/Dockerfile scripts/manager-app/collect.sh \
        kubik/manager/CMakeLists.txt kubik/manager/main.cpp kubik/manager/Main.qml kubik/manager/logic.js \
        assets/kubik.svg) | sha256sum | cut -c1-16)
CACHE=${XDG_CACHE_HOME:-$HOME/.cache}/kubik-build/manager-$HASH
if [ ! -x "$CACHE/usr/bin/kubik-manager" ]; then
    rm -rf "$CACHE.tmp" && mkdir -p "$CACHE.tmp"
    docker run --rm -u "$(id -u):$(id -g)" -v "$ROOT:/src:ro" -v "$CACHE.tmp:/out" "$IMAGE" \
        bash /src/scripts/manager-app/collect.sh >&2
    rm -rf "$CACHE" && mv "$CACHE.tmp" "$CACHE"
fi
mkdir -p "$OUT"
rm -rf "$OUT/usr"
cp -a "$CACHE/usr" "$OUT/usr"
echo "$OUT/usr"
