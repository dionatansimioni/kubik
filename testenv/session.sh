#!/bin/bash
# Roda DENTRO do container, como o usuário tester (chamado por run.sh):
# instala e ativa os pacotes de /out/pkg/install.list e inicia o KWin com o
# cenário como sessão.
set -e
mkdir -p "$XDG_RUNTIME_DIR"
while read -r file type id; do
    kpackagetool6 -t "$type" -i "$file" >/dev/null
    kwriteconfig6 --file kwinrc --group Plugins --key "${id}Enabled" true
done < /out/pkg/install.list
# KUBIK_KWINRC="Grupo/Chave=Valor ...": configuração aplicada antes do KWin iniciar.
for kv in ${KUBIK_KWINRC:-}; do
    group=${kv%%/*}; rest=${kv#*/}
    kwriteconfig6 --file kwinrc --group "$group" --key "${rest%%=*}" "${rest#*=}"
done
dbus-run-session -- kwin_wayland --virtual --xwayland --width 1280 --height 800 \
    --exit-with-session "bash $SCENARIO" > /out/kwin.log 2>&1 || true
