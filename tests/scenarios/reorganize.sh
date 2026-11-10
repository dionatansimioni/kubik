# Reorganizar pelo mouse (zonas de drop): o exemplo do usuário.
# Início: Alpha (1) à esquerda, Beta (2) em cima à direita, Gamma (3) embaixo à direita.
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
open_window Gamma 400x300 "#8b8b2f"
dump_windows start
screenshot start

# Gamma pela barra de título até a metade de baixo da Alpha: divide a Alpha.
drag_and_shoot split_dragging 900 420 300 700 30
dump_windows split
screenshot split

# Beta pela barra de título até o centro da Alpha (canto superior esquerdo): troca.
drag_and_shoot swap_dragging 960 22 321 200 30
dump_windows swapped
