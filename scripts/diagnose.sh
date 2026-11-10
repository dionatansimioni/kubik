#!/usr/bin/env bash
# Coleta um relatório para diagnosticar o kubik na sessão Plasma atual.
#
# Uso: ./diagnose.sh [arquivo]   (padrão: kubik-diagnostico-<data>.txt)
#
# Junta: versões do Plasma/KWin, pacotes do kubik instalados e ativados,
# efeitos carregados, o estado interno do kubik (árvores e janelas), todas
# as janelas que o KWin conhece (com as propriedades que decidem o tiling)
# e as mensagens do kubik no journal desde o login.
set -uo pipefail

OUT=${1:-kubik-diagnostico-$(date +%Y%m%d-%H%M%S).txt}
STAMP="kubik-diag-$$-$(date +%s)"
START=$(date '+%Y-%m-%d %H:%M:%S')
kwin() { dbus-send --session --print-reply --dest=org.kde.KWin "$@"; }

section() { printf '\n===== %s =====\n' "$1"; }

{
    section "sistema"
    date
    grep -E '^(PRETTY_NAME)=' /etc/os-release
    echo "sessão: ${XDG_SESSION_TYPE:-?}  desktop: ${XDG_CURRENT_DESKTOP:-?}"
    kwin_wayland --version 2>/dev/null || kwin_x11 --version 2>/dev/null
    plasmashell --version 2>/dev/null

    section "telas"
    kscreen-doctor -o 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'Output|Geometry|Scale|enabled|disabled'

    section "pacotes do kubik"
    for t in KWin/Script KWin/Effect; do
        kpackagetool6 --type="$t" --list 2>/dev/null | grep -i kubik | while read -r id; do
            dir=$(kpackagetool6 --type="$t" --show "$id" 2>/dev/null | sed -n 's/^ *Path *: *//p')
            ver=$(sed -n 's/.*"Version": *"\([^"]*\)".*/\1/p' "${dir%/}/metadata.json" 2>/dev/null | head -n1)
            en=$(kreadconfig6 --file kwinrc --group Plugins --key "${id}Enabled")
            echo "$t $id versão=${ver:-?} ativado=${en:-padrão}"
        done
    done
    printf 'efeito kubikanimations carregado: '
    kwin /Effects org.kde.kwin.Effects.isEffectLoaded string:kubikanimations 2>/dev/null | awk '/boolean/ {print $2}'
    echo "efeitos ativos:"
    kwin /Effects org.freedesktop.DBus.Properties.Get string:org.kde.kwin.Effects string:activeEffects 2>/dev/null \
        | grep -o '"[^"]*"' | tr '\n' ' '; echo
    echo "scripts (Plugins no kwinrc):"
    sed -n '/^\[Plugins\]/,/^\[/p' "${XDG_CONFIG_HOME:-$HOME/.config}/kwinrc" 2>/dev/null | grep -i -E 'Enabled' | head -40
} > "$OUT" 2>&1

# Estado do kubik e lista de janelas: vão para o journal, marcados com $STAMP.
dbus-send --session --print-reply --dest=org.kde.kglobalaccel /component/kwin \
    org.kde.kglobalaccel.Component.invokeShortcut "string:Kubik: Log state" >/dev/null 2>&1
JS=$(mktemp --suffix=.js)
cat > "$JS" <<JSEOF
const tag = "$STAMP";
console.warn(tag + " ativa: " + (workspace.activeWindow ? workspace.activeWindow.caption : "nenhuma"));
console.warn(tag + " atividade atual: " + workspace.currentActivity + " desktop atual: " + (workspace.currentDesktop && workspace.currentDesktop.id));
for (const w of workspace.stackingOrder) {
    const g = w.frameGeometry, c = w.clientGeometry;
    console.warn(tag + " JANELA " + JSON.stringify({
        caption: w.caption, cls: w.resourceClass, name: w.resourceName, pid: w.pid,
        wayland: !w.x11, normal: w.normalWindow, dialog: w.dialog, utility: w.utility,
        transient: w.transient, special: w.specialWindow, skipSwitcher: w.skipSwitcher,
        skipTaskbar: w.skipTaskbar, hidden: w.hidden, minimized: w.minimized,
        visible: w.visible, opacity: w.opacity, fullScreen: w.fullScreen, maximize: w.maximizeMode,
        allDesktops: w.onAllDesktops, desktops: (w.desktops || []).map(d => d.id),
        activities: w.activities, output: w.output && w.output.name,
        frame: [g.x, g.y, g.width, g.height], client: [c.x, c.y, c.width, c.height],
        min: [w.minSize.width, w.minSize.height], max: [w.maxSize.width, w.maxSize.height],
        resizeable: w.resizeable,
    }));
}
JSEOF
id=$(kwin /Scripting org.kde.kwin.Scripting.loadScript "string:$JS" "string:$STAMP" 2>/dev/null | awk '/int32/ {print $2}')
if [ -n "$id" ]; then
    kwin "/Scripting/Script$id" org.kde.kwin.Script.run >/dev/null 2>&1
    sleep 1
    kwin /Scripting org.kde.kwin.Scripting.unloadScript "string:$STAMP" >/dev/null 2>&1
fi
rm -f "$JS"
sleep 1

{
    section "estado do kubik"
    journalctl --user --since "$START" --no-pager -o cat | grep -F '[kubik] [estado]'
    section "janelas no KWin"
    journalctl --user -b --no-pager -o cat | grep -F "$STAMP" | sed "s/.*$STAMP //"
    section "log do kubik desde o login (últimas 400 linhas)"
    journalctl --user -b --no-pager -o short-monotonic | grep -E '\[kubik' | grep -v -F '[estado]' | tail -n 400
} >> "$OUT" 2>&1

echo "Relatório salvo em: $OUT"
