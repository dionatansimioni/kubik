#!/usr/bin/env bash
# Roda um cenário num KWin real (Plasma do Arch, sem monitor) dentro de um container.
#
# Uso: testenv/run.sh <diretório-do-pacote> <cenário.sh> <diretório-de-saída>
#
# O pacote é empacotado (scripts/build.py) e o arquivo resultante é instalado
# e ativado ANTES do KWin iniciar (testenv/session.sh). O cenário roda como a
# sessão do KWin (--exit-with-session) e pode usar as funções de testenv/lib.sh.
# Saída: <saída>/kwin.log (log completo do KWin, incluindo console.* dos scripts)
#        <saída>/*.png     (screenshots tirados pelo cenário)
#
# KUBIK_KWINRC="Grupo/Chave=Valor ...": kwinrc aplicado antes do KWin iniciar.
# KUBIK_EXTRA_PKGS="dir1 dir2": pacotes (scripts ou efeitos) instalados e
# ativados junto (ex.: o efeito de animação, ou outro script para convivência).
#
# Requisitos no host: docker e o módulo vgem (GPU virtual para o OpenGL por
# software). O script carrega o vgem com modprobe se ele não estiver carregado.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# KUBIK_TESTENV=arch (padrão) ou fedora: escolhe a distro do container.
case "${KUBIK_TESTENV:-arch}" in
    arch)   IMAGE=kubik-testenv;        CONTEXT="$ROOT/testenv" ;;
    fedora) IMAGE=kubik-testenv-fedora; CONTEXT="$ROOT/testenv/fedora" ;;
    *) echo "erro: KUBIK_TESTENV desconhecido: $KUBIK_TESTENV" >&2; exit 2 ;;
esac
[ $# -eq 3 ] || { echo "uso: $0 <pacote> <cenário.sh> <saída>" >&2; exit 2; }
PKG=$(realpath "$1")
SCENARIO=$(realpath "$2")
OUT=$(realpath -m "$3")

case "$PKG/" in "$ROOT"/*) ;; *) echo "erro: o pacote precisa estar dentro de $ROOT" >&2; exit 2;; esac
case "$SCENARIO" in "$ROOT"/*) ;; *) echo "erro: o cenário precisa estar dentro de $ROOT" >&2; exit 2;; esac

vgem_node() {
    for d in /sys/class/drm/renderD*; do
        [ "$(basename "$(readlink -f "$d/device")")" = vgem ] && { basename "$d"; return 0; }
    done
    return 1
}
NODE=$(vgem_node || { modprobe vgem && vgem_node; }) || { echo "erro: módulo vgem indisponível" >&2; exit 1; }

# Sempre: com cache é ~1 s, e mudanças no Dockerfile entram sem passo manual.
docker build -q -t "$IMAGE" "$CONTEXT" >/dev/null

mkdir -p "$OUT"
chmod 777 "$OUT"
# Empacota (scripts/build.py) o pacote principal e os extras e lista o que o
# container deve instalar: "<arquivo> <KPackageStructure> <Id>" por linha.
mkdir -p "$OUT/pkg"
: > "$OUT/pkg/install.list"
for p in "$PKG" ${KUBIK_EXTRA_PKGS:-}; do
    p=$(realpath "$p")
    f=$(KUBIK_DIST="$OUT/pkg" python3 "$ROOT/scripts/build.py" "$p" | head -n1)
    python3 - "$p/metadata.json" "/out/pkg/$(basename "$f")" >> "$OUT/pkg/install.list" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(sys.argv[2], m["KPackageStructure"], m["KPlugin"]["Id"])
PY
done

# O KWin acha a GPU pelo sysfs do host (nome real do nó) mas às vezes tenta o
# primeiro nó (renderD128); expomos o vgem com os dois nomes.
docker run --rm \
    --device "/dev/dri/$NODE:/dev/dri/$NODE" \
    --device "/dev/dri/$NODE:/dev/dri/renderD128" \
    -u root \
    -v "$ROOT:/work:ro" -v "$OUT:/out" \
    -e XDG_RUNTIME_DIR=/tmp/xdg \
    -e QT_FORCE_STDERR_LOGGING=1 \
    -e QT_QUICK_BACKEND=software \
    -e KWIN_WAYLAND_NO_PERMISSION_CHECKS=1 \
    -e KWIN_EFFECTS_FORCE_ANIMATIONS=1 \
    -e SCENARIO="/work/${SCENARIO#"$ROOT"/}" \
    -e KUBIK_KWINRC="${KUBIK_KWINRC:-}" \
    -e KUBIK_MEM_CYCLES="${KUBIK_MEM_CYCLES:-}" \
    "$IMAGE" bash -c 'chmod 666 /dev/dri/renderD* && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix && exec su tester -c "bash /work/testenv/session.sh"'
echo "$OUT/kwin.log"
