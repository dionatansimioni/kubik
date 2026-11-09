// Script de inspeção (carregado por dump_windows em testenv/lib.sh): imprime
// a geometria real de cada janela normal, com a marca @TAG@.
for (const w of workspace.stackingOrder) {
    if (!w.normalWindow) continue;
    if (!w.resourceClass && w.skipSwitcher) continue; // overlay interno (borda, prévia)
    const g = w.frameGeometry;
    console.warn("WINDOW @TAG@ " + JSON.stringify({
        caption: w.caption, x: g.x, y: g.y, width: g.width, height: g.height,
        active: workspace.activeWindow === w,
    }));
}
