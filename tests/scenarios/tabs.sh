# Abas (pilhas): empilhar segurando uma janela sobre a outra, clicar na aba,
# atalho de próxima aba, o × da aba e arrastar para fora da pilha.
# Início: Alpha à esquerda, Beta em cima à direita, Gamma embaixo à direita.
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
open_window Gamma 400x300 "#8b8b2f"
dump_windows start

# Gamma pela barra de título até o meio da Beta, e segura ~1 s: empilha.
drag_hold_and_shoot stack_holding 1.0 900 420 960 200 30
dump_windows stacked
sleep 0.5
screenshot stacked
kwin_eval 'console.warn("ACTIVE stacked " + workspace.activeWindow.caption)'

# Barra de abas (642..1276, y 4..36): ícone de pilha (30 px) e duas abas.
# Clica no título da aba da Beta (1ª aba).
python3 /work/testenv/fakeinput.py click 760 20
sleep 0.5
kwin_eval 'console.warn("ACTIVE clicked " + workspace.activeWindow.caption)'
screenshot clicked

shortcut "Kubik: Next tab" 0.5
kwin_eval 'console.warn("ACTIVE next " + workspace.activeWindow.caption)'

# O × da aba da Beta (canto direito da 1ª aba): sai da pilha, vai para baixo da Gamma.
python3 /work/testenv/fakeinput.py click 961 20
sleep 1
dump_windows closed_x
screenshot closed_x
