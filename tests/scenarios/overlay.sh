# Cenário do protótipo de overlay: borda ativa e stacking com barra de abas.
source /work/testenv/lib.sh

open_window Alpha 400x300
mark single
screenshot single

open_window Beta 600x420
mark two
screenshot two

shortcut "Kubik Proto: Stack next window" 1
mark stacked
screenshot stacked
