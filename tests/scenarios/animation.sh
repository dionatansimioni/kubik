# Cenário das animações: a 2ª janela faz a 1ª encolher (tela cheia → metade
# esquerda). Com o efeito (2 s, linear) o encolhimento é visível no meio do
# caminho; sem o efeito, é instantâneo.
source /work/testenv/lib.sh

# (configuração do efeito: KUBIK_KWINRC no teste, aplicada antes do KWin iniciar)
open_window Alpha 400x300 "#8b2f2f"
sleep 2.5   # a Alpha também anima ao entrar no tiling; espera terminar
screenshot alone

"$QML_BIN" /work/testenv/clients/window.qml -- Beta 400x300 "#2f6b2f" >/dev/null 2>&1 &
sleep 0.7
screenshot mid
sleep 3
screenshot end
dump_windows end
