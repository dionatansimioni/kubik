# Cenário do mouse: arrastar para trocar de lugar e redimensionar a divisão.
# Layout inicial: Alpha à esquerda (4,4 634×792), Beta à direita (642,4 634×792).
source /work/testenv/lib.sh

# Cores escuras e longe do azul de destaque, para a prévia ser mensurável.
open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
dump_windows start
screenshot start

# Arrasta a Alpha pela barra de título até o meio da Beta.
drag_and_shoot dragging 321 18 960 400 30
dump_windows swapped
screenshot swapped

# Agora a Beta está à esquerda. Puxa a divisa entre as duas 200 px para a direita.
drag 640 400 840 400 20
dump_windows resized
screenshot resized
