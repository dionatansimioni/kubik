# Atualizar a bandeja com o plasmashell rodando: ele recria o applet depois do
# kpackagetool6 -u, mas guarda o QML (e o .js) em memória pela URL. Sem a casca
# (main.qml carregando o Tray.qml por URL única), rodava o código antigo
# (Lição 45). A "versão nova" aqui é a instalada com uma marca no Tray.qml.
source /work/testenv/lib.sh
plasmashell >&2 2>&1 &
wait_log "[kubik-tray] estado:" 60
sleep 3
mark reinstall
src=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik | sed -n 's/^ *Path *: *//p')
new=/tmp/newtray; rm -rf $new; cp -r "${src%/}" $new
sed -i 's/"Version": "[^"]*"/"Version": "99.0.0"/' $new/metadata.json
sed -i 's|^    Component.onCompleted: {|&\n        console.warn("[kubik-tray] CODIGO-NOVO");|' $new/contents/ui/Tray.qml
kpackagetool6 -t Plasma/Applet -u $new >&2 2>&1
wait_log "bandeja 99.0.0" 30
sleep 3
mark done
