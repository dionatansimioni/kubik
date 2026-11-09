# Troca de lugar com o mouse, com o efeito ativo (duração longa via KUBIK_KWINRC):
# logo depois de soltar, as duas janelas devem estar no meio do caminho.
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
sleep 2.5
dump_windows start
screenshot start

python3 /work/testenv/fakeinput.py drag 321 18 960 400 30
sleep 0.5
screenshot mid
sleep 3
dump_windows end
screenshot end
