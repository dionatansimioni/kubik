// Script de inspeção (carregado por dump_windows em testenv/lib.sh): imprime
// a geometria real de cada janela normal, com a marca @TAG@.
for (const w of workspace.stackingOrder) {
    if (!w.normalWindow) continue;
    // Overlay interno (borda, prévia): sem classe e fora do Alt+Tab ou, no
    // KWin < 6.8, sem aceitar foco (mesma regra do isInternalWindow do Kubik).
    if (!w.resourceClass && (w.skipSwitcher || w.wantsInput === false)) continue;
    const g = w.frameGeometry;
    console.warn("WINDOW @TAG@ " + JSON.stringify({
        caption: w.caption, x: g.x, y: g.y, width: g.width, height: g.height,
        active: workspace.activeWindow === w, minimized: w.minimized,
        minWidth: w.minSize.width, minHeight: w.minSize.height,
    }));
}
