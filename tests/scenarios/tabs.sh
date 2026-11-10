# Abas (pilhas): empilhar arrastando até a barra de título, clicar na aba,
# atalho de próxima aba e arrastar para fora da pilha.
# Início: Alpha à esquerda, Beta em cima à direita, Gamma embaixo à direita.
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
open_window Gamma 400x300 "#8b8b2f"
dump_windows start

# Gamma pela barra de título até a barra de título da Beta: empilha.
drag_and_shoot stack_dragging 900 420 960 20 30
dump_windows stacked
screenshot stacked
kwin_eval 'console.warn("ACTIVE stacked " + workspace.activeWindow.caption)'

# Clica na aba da Beta (metade esquerda da barra de abas, y 4..32).
python3 /work/testenv/fakeinput.py click 800 18
sleep 0.5
kwin_eval 'console.warn("ACTIVE clicked " + workspace.activeWindow.caption)'
screenshot clicked

shortcut "Kubik: Next tab" 0.5
kwin_eval 'console.warn("ACTIVE next " + workspace.activeWindow.caption)'

# Gamma (à vista) pela barra de título dela (abaixo da barra de abas) até a
# metade de baixo da Alpha: sai da pilha.
drag 960 50 300 700 30
dump_windows unstacked
screenshot unstacked
