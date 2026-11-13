# Os overlays (borda em volta da janela em foco, prévia e fantasma do arrasto)
# não podem engolir cliques: o clique tem que chegar ao app embaixo deles.
# No KWin < 6.7 o Qt.WindowTransparentForInput é ignorado (Debian 13: 6.3).
# Layout: Alpha (4,4 634×792) | Beta (642,4 634×792).
source /work/testenv/lib.sh

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
sleep 0.5

# Recarrega o Kubik com as janelas já abertas (como ao instalar numa sessão em
# uso): os overlays nascem DEPOIS das janelas, no topo da pilha. Abertas
# depois do Kubik, as janelas ficavam por cima deles e o teste não pegava nada.
dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript string:kubik >/dev/null
sleep 0.5
dbus-send --session --print-reply --dest=org.kde.KWin /KWin org.kde.KWin.reconfigure >/dev/null
sleep 1.5
kwin_eval 'workspace.activeWindow = win("Beta")'
dump_windows tiled

# Beta em foco, com a borda em volta: clique no meio dela e perto da borda.
click 959 400
click 660 60
mark beta_focused
clicks beta_focused Beta

# Clique na Alpha: ela ganha o foco (e a borda).
click 321 400
click 321 400
kwin_eval 'console.warn("ACTIVE " + workspace.activeWindow.caption)'
clicks alpha_clicked Alpha

# Troca por arrasto (prévia e fantasma aparecem e ficam escondidos onde
# estavam): depois, os cliques nos dois lados ainda chegam aos apps.
drag 321 15 959 400 20
sleep 1
dump_windows swapped
click 321 400
click 959 400
clicks after_drag Alpha
clicks after_drag Beta

# Visão geral (KWin < 6.8): ela só esconde janelas com skipSwitcher, e os
# overlays do Kubik apareciam vazios em toda área de trabalho. Cria mais uma
# área de trabalho, como no relato, e lista os overlays com as três marcas.
dbus-send --session --print-reply --dest=org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.createDesktop uint32:1 string:Extra >/dev/null
sleep 1
kwin_eval 'const o = workspace.stackingOrder.filter(w => w.caption === "kubik-overlay"); console.warn("=== OVERLAYS " + o.length + " " + o.map(w => [w.skipSwitcher, w.skipPager, w.skipTaskbar].join("/")).join(" ") + " desktops=" + workspace.desktops.length)'
