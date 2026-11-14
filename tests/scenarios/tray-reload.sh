# Atualizar a bandeja com o plasmashell rodando: ele recria o applet depois do
# kpackagetool6 -u, mas guarda o QML (e o .js) em memória pela URL. Sem a casca
# (main.qml carregando o Tray.qml por URL única), rodava o código antigo
# (Lição 45). A "versão nova" aqui é a instalada com uma marca no Tray.qml.
source /work/testenv/lib.sh
plasmashell >&2 2>&1 &
wait_log "[kubik-tray] estado:" 60
sleep 3
# O ícone no painel (Lição 49: sem representação ao criar, a bandeja o descartava).
screenshot panel
mark reinstall
src=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik | sed -n 's/^ *Path *: *//p')
new=/tmp/newtray; rm -rf $new; cp -r "${src%/}" $new
sed -i 's/"Version": "[^"]*"/"Version": "99.0.0"/' $new/metadata.json
sed -i 's|^    Component.onCompleted: {|&\n        console.warn("[kubik-tray] CODIGO-NOVO");|' $new/contents/ui/Tray.qml
kpackagetool6 -t Plasma/Applet -u $new >&2 2>&1
wait_log "bandeja 99.0.0" 30
sleep 3
screenshot panel-new

# Concluir a atualização (Lição 50): com o pedido anotado (o install.sh faz
# isso), o popup oferece reiniciar o painel; reiniciado, o pedido some.
mark restart
sys=$(kpackagetool6 -t Plasma/Applet --show io.github.dionatansimioni.kubik | sed -n 's/^ *Path *: *//p')
sys=${sys%/}/contents/code/sys.sh
sh "$sys" session-mark
echo "=== PENDING $(sh "$sys" session-pending)" >&2
click 1050 771
wait_log "reiniciar o painel ou a sessão" 20
sleep 2
screenshot popup-restart
echo "=== PLASMA before $(pgrep -x plasmashell)" >&2
# O botão "Restart panel" do popup (posição do Plasma 6.8; a bandeja reinicia
# o processo em que ela mesma roda). Se o clique errar (Debian: outro layout),
# reinicia pelo sys.sh.
click 1135 608
new_plasma() {
    local i p
    for i in $(seq "$1"); do
        p=$(pgrep -x plasmashell)
        [ -n "$p" ] && ! grep -aq "=== PLASMA before $p\$" /out/kwin.log && return 0
        sleep 0.5
    done
    return 1
}
if ! new_plasma 20; then
    echo "=== CLICK MISSED" >&2
    sh "$sys" plasma-restart
    new_plasma 40
fi
echo "=== PLASMA after $(pgrep -x plasmashell)" >&2
sleep 10
screenshot panel-restarted
echo "=== PENDING $(sh "$sys" session-pending)" >&2
mark done
