# Instala o .tar.gz do release com o install.sh numa sessão aberta, como o
# usuário faz, e verifica se o script E o efeito de animação ficaram ativos.
source /work/testenv/lib.sh
mkdir -p /tmp/bundle && cd /tmp/bundle && tar xzf /out/pkg/kubik-*.tar.gz
./kubik-*/install.sh >&2
sleep 1
echo "=== effect loaded: $(dbus-send --session --print-reply --dest=org.kde.KWin /Effects org.kde.kwin.Effects.isEffectLoaded string:kubikanimations | awk '/boolean/ {print $2}')" >&2
echo "=== script loaded: $(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded string:kubik | awk '/boolean/ {print $2}')" >&2
D=$HOME/.local/share
files() { echo "=== files $1 icon=$(test -f "$D/icons/hicolor/scalable/apps/io.github.dionatansimioni.kubik.svg" && echo yes || echo no) menu=$(test -f "$D/applications/io.github.dionatansimioni.kubik.desktop" && echo yes || echo no) uninstaller=$(test -x "$D/kubik/uninstall.sh" && echo yes || echo no) list=[$(paste -sd, "$D/kubik/installed.list" 2>/dev/null)]" >&2; }
files installed
echo "=== tray installed: $(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik >/dev/null 2>&1 && echo true || echo false)" >&2

# Teclado: o install.sh tira Meta+setas do quick tile do KDE e dá ao kubik.
sc() {
    dbus-send --session --print-reply --dest=org.kde.kglobalaccel /kglobalaccel \
        org.kde.KGlobalAccel.shortcut "array:string:kwin,$1,KWin,$1" | awk '/int32/ {print $2}' | paste -sd, -
}
echo "=== keys quicktile=[$(sc 'Window Quick Tile Left')] switchwin=[$(sc 'Switch Window Left')] focus=[$(sc 'Kubik: Focus Left')] resize=[$(sc 'Kubik: Resize Left')] monocle=[$(sc 'Kubik: Toggle monocle')]" >&2
open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
python3 /work/testenv/fakeinput.py key 125 105   # Meta+← de verdade
sleep 0.5
kwin_eval 'console.warn("=== active after Meta+Left: " + workspace.activeWindow.caption)'
./kubik-*/uninstall.sh >&2
sleep 0.5
echo "=== after uninstall quicktile=[$(sc 'Window Quick Tile Left')] switchwin=[$(sc 'Switch Window Left')] backup=$(test -f ~/.local/share/kubik/kde-shortcuts.backup && echo yes || echo no)" >&2
files uninstalled
echo "=== script loaded after uninstall: $(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded string:kubik | awk '/boolean/ {print $2}')" >&2
