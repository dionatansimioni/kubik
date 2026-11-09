# Instala o .tar.gz do release com o install.sh numa sessão aberta, como o
# usuário faz, e verifica se o script E o efeito de animação ficaram ativos.
source /work/testenv/lib.sh
mkdir -p /tmp/bundle && cd /tmp/bundle && tar xzf /out/pkg/kubik-*.tar.gz
./kubik-*/install.sh >&2
sleep 1
echo "=== effect loaded: $(dbus-send --session --print-reply --dest=org.kde.KWin /Effects org.kde.kwin.Effects.isEffectLoaded string:kubikanimations | awk '/boolean/ {print $2}')" >&2
echo "=== script loaded: $(dbus-send --session --print-reply --dest=org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded string:kubik | awk '/boolean/ {print $2}')" >&2
