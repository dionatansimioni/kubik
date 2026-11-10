# Borda de destaque (cor de destaque do sistema) em volta da janela em foco.
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
sleep 0.5
screenshot beta_focused

kwin_eval 'workspace.activeWindow = win("Alpha")'
sleep 0.5
screenshot alpha_focused

# Fecha a Beta: a Alpha cresce animada (efeito instalado); print no meio.
kill "$(cat /tmp/window-Beta.pid)"
sleep 0.1
screenshot growing
sleep 1
dump_windows alone
screenshot alpha_alone

kwin_eval 'win("Alpha").minimized = true'
sleep 0.5
screenshot none
