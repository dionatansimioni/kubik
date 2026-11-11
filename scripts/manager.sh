#!/usr/bin/env bash
# Abre o gerenciador do Kubik (manager/Main.qml) no `qml` do sistema.
# Uso: manager.sh [--bundle <diretório-do-pacote>]
#   O AppImage passa o pacote que traz junto (para instalar dele); a entrada
#   "Kubik" do menu chama a cópia em ~/.local/share/kubik, sem pacote.
# Sai com 3 se não der para abrir a janela (sem o qml ou sem os módulos do
# Plasma): quem chamou decide o plano B (o AppImage usa o kdialog).
set -uo pipefail

HERE=$(dirname "$(readlink -f "$0")")
BUNDLE=""
[ "${1:-}" = --bundle ] && BUNDLE=${2:-}

QML=$(command -v qml6 2>/dev/null || true)
for c in /usr/lib/qt6/bin/qml /usr/lib64/qt6/bin/qml /usr/lib/x86_64-linux-gnu/qt6/bin/qml; do
    [ -n "$QML" ] && break
    [ -x "$c" ] && QML=$c
done
[ -n "$QML" ] || exit 3

ARGS=()
if [ -n "$BUNDLE" ]; then
    VERSION=$(sed -n 's/.*"Version": *"\([^"]*\)".*/\1/p' "$BUNDLE/packages/kubik/metadata.json" 2>/dev/null | head -n1)
    ARGS=(--bundle="$BUNDLE" --bundled-version "$VERSION")
fi
# O Qt tira o app_id do Wayland do nome do executável (com o domínio que a
# janela define): rodando por um link chamado "kubik", ele fica
# io.github.dionatansimioni.kubik, o mesmo da entrada do menu (ícone e nome na
# barra de tarefas). `exec -a` não basta: o Qt lê o caminho, não o argv[0].
LINKDIR=${XDG_RUNTIME_DIR:-/tmp}/kubik-manager-$(id -u)
mkdir -p "$LINKDIR" && ln -sfn "$QML" "$LINKDIR/kubik" && QML=$LINKDIR/kubik
"$QML" "$HERE/manager/Main.qml" -- "${ARGS[@]}"
r=$?
# O qml sai com erro quando nem chegou a abrir a janela (módulo faltando).
[ $r -eq 0 ] || exit 3
