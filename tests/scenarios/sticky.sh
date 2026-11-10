# Janelas "em todos os desktops" (ex.: a tela secundária com o plugin
# virtualdesktopsonlyonprimary): entram no tiling e acompanham o desktop.
# Requer 2 desktops virtuais (KUBIK_KWINRC="Desktops/Number=2").
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Sticky 400x300 "#2f6b2f"
kwin_eval 'win("Sticky").onAllDesktops = true'
sleep 0.5
dump_windows desk1
kwin_eval 'workspace.currentDesktop = workspace.desktops[1]'
sleep 1
dump_windows desk2
kwin_eval 'console.warn("CURDESK " + workspace.desktops.indexOf(workspace.currentDesktop) + " of " + workspace.desktops.length)'
open_window Gamma 400x300 "#2f2f8b"
dump_windows desk2_gamma
screenshot desk2_gamma
kwin_eval 'workspace.currentDesktop = workspace.desktops[0]'
sleep 1
dump_windows back
