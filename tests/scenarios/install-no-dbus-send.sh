# O mesmo install-bundle.sh, mas o install.sh/uninstall.sh sem o dbus-send
# (KUBIK_SYS_DISABLE, lido pelo sys.sh): o Fedora pode vir sem o dbus-tools.
# As conferências do cenário seguem pelo dbus-send de verdade (independentes).
export KUBIK_SYS_DISABLE=dbus-send
source /work/tests/scenarios/install-bundle.sh
