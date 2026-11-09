#!/usr/bin/env bash
# Roda comandos do Node (npm, npx, node) num container, sem instalar nada no host.
# Uso: scripts/node.sh <diretório-do-projeto> <comando...>
#   ex.: scripts/node.sh kubik npm test
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IMAGE=node:22.23.4-bookworm-slim
[ $# -ge 2 ] || { echo "uso: $0 <diretório> <comando...>" >&2; exit 2; }
DIR=$1; shift

mkdir -p "$ROOT/.cache/npm"
TTY=(); [ -t 0 ] && [ -t 1 ] && TTY=(-t)
exec docker run --rm -i "${TTY[@]}" \
    -u "$(id -u):$(id -g)" \
    -e HOME=/tmp -e npm_config_cache=/work/.cache/npm -e npm_config_update_notifier=false \
    -v "$ROOT:/work" -w "/work/$DIR" \
    "$IMAGE" "$@"
