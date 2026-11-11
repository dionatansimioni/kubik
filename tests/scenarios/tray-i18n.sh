# O ícone da bandeja segue o idioma do sistema: inglês por padrão,
# português com LANGUAGE=pt_BR (catálogo em contents/locale do plasmoid).
source /work/testenv/lib.sh

# O KDE só aplica uma tradução se o APLICATIVO (aqui o plasmoidviewer; no
# usuário, o plasmashell) também tem catálogo naquele idioma. A imagem do
# Arch remove as traduções do sistema: um catálogo vazio faz o papel dele.
python3 - <<'PY'
import os, struct
d = os.path.expanduser("~/.local/share/locale/pt_BR/LC_MESSAGES")
os.makedirs(d, exist_ok=True)
hdr = b"Content-Type: text/plain; charset=UTF-8\n"
data = struct.pack("<7I", 0x950412DE, 0, 1, 28, 36, 0, 0)
data += struct.pack("<2I", 0, 44) + struct.pack("<2I", len(hdr), 45) + b"\0" + hdr + b"\0"
open(os.path.join(d, "plasmoidviewer.mo"), "wb").write(data)
PY

# LANG precisa ser um locale que existe (en_US, gerado no Dockerfile): com
# "C", o gettext do glibc ignora o LANGUAGE.
viewer() {
    mark "viewer ${1:-default}"
    LANGUAGE=$1 LANG=en_US.UTF-8 LC_ALL= plasmoidviewer -a io.github.dionatansimioni.kubik -f planar -s 420x480 >&2 2>&1 &
    local pid=$!
    sleep 6
    screenshot "popup_${1:-default}"
    kill "$pid"
    sleep 1
}
viewer ""
viewer pt_BR
