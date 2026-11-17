# Menus (xdg_popup) por cima da borda e da barra de abas (Lição 51). O KWin
# põe os overlays acima até dos menus: a borda ganha um buraco onde o menu
# passa, e a barra de abas some enquanto um menu a cobre.
# Os menus abrem com um clique na janela e fecham com um clique neles
# (window.qml, popup=X,Y,LxA).
source /work/testenv/lib.sh

# Beta (direita, em foco): menu cruzando a beira esquerda dela (493..793, 240..440).
open_window Alpha 400x300 "#8b2f2f" popup=600,-20,300x150
open_window Beta 400x300 "#2f6b2f" popup=-150,200,300x200
click 960 600
sleep 1
kwin_eval 'workspace.stackingOrder.forEach(w => { if (w.popupWindow) console.warn("=== POPUP border " + w.frameGeometry.x + "," + w.frameGeometry.y + " " + w.frameGeometry.width + "x" + w.frameGeometry.height); })'
screenshot menu
# Clicar no menu o fecha (como escolher um item).
click 700 400
sleep 1
screenshot menu_closed

# Pilha Beta+Gamma à direita (como no tabs.sh) e um menu da Alpha cruzando a
# barra de abas (605..905, ~20..170; a barra: 642..1276, 4..36).
open_window Gamma 400x300 "#8b8b2f"
drag_hold_and_shoot stack_holding 1.0 900 420 960 200 30
sleep 0.5
screenshot tabs
click 300 500
sleep 1
kwin_eval 'workspace.stackingOrder.forEach(w => { if (w.popupWindow) console.warn("=== POPUP tabs " + w.frameGeometry.x + "," + w.frameGeometry.y + " " + w.frameGeometry.width + "x" + w.frameGeometry.height); })'
screenshot tabs_menu
click 750 150
sleep 1
screenshot tabs_closed
