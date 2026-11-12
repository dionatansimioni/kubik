#!/usr/bin/env bash
# Grava os screenshots e GIFs do README e do site: um desktop Plasma de verdade
# (Breeze Dark, Konsole, Dolphin, Kate) com o Kubik, num KWin headless (testenv
# "showcase"). Nada roda no desktop do host.
#
# Uso: scripts/showcase.sh [saída]   (padrão: site/images)
# Os quadros brutos ficam num diretório temporário (KUBIK_KEEP_OUT=1 mantém).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEST=$(realpath -m "${1:-$ROOT/site/images}")
# No disco, não no /tmp (tmpfs): a gravação passa de 1 GB.
mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}"
WORK=$(mktemp -d "${XDG_CACHE_HOME:-$HOME/.cache}/kubik-showcase-XXXX")
trap '[ -n "${KUBIK_KEEP_OUT:-}" ] && echo "$WORK" >&2 || rm -rf "$WORK"' EXIT

# O AppImage, para a foto do gerenciador.
DIST=$(mktemp -d /tmp/kubik-showcase-dist-XXXX)
TARBALL=$(KUBIK_DIST="$DIST" python3 "$ROOT/scripts/build.py" | grep '\.tar\.gz$')
"$ROOT/scripts/appimage.sh" "$TARBALL" "$WORK/appimage" >/dev/null
rm -rf "$DIST"

KUBIK_TESTENV=showcase KUBIK_SCREEN=1600x1000 \
KUBIK_EXTRA_PKGS="kubik/effect kubik/tray" \
KUBIK_KWINRC="Script-kubik/GapsInner=8 Script-kubik/GapsOuter=8" \
    "$ROOT/testenv/run.sh" kubik/package scripts/showcase/scenario.sh "$WORK" >/dev/null
grep -a "^MEDIA " "$WORK/kwin.log" >&2 || { echo "erro: nada gravado (ver $WORK/kwin.log)" >&2; KUBIK_KEEP_OUT=1; exit 1; }
mkdir -p "$DEST"
cp "$WORK"/media/* "$DEST"/
ls -la "$DEST" >&2
