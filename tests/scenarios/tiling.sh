# Cenário do tiling: janelas abrindo, fechando e o toggle (Meta+Y).
source /work/testenv/lib.sh

open_window Alpha 400x300
dump_windows one

open_window Beta 400x300
dump_windows two

open_window Gamma 400x300
dump_windows three
screenshot three

close_window Gamma
dump_windows closed

shortcut "Kubik: Toggle tiling" 1
dump_windows off

open_window Delta 400x300
dump_windows off_new

shortcut "Kubik: Toggle tiling" 1
dump_windows on_again
screenshot on_again

# Diagnóstico (scripts/diagnose.sh): o estado do kubik e as janelas vão pro log.
mark diagnose
bash /work/scripts/diagnose.sh /out/diag.txt >&2
