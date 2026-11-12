# Vitrine: um desktop Plasma de verdade (plasmashell, Breeze Dark, apps reais)
# com o Kubik, gravado para o README e o site. Roda no testenv "showcase"
# (scripts/showcase.sh). Grava em /out/rec/<cena>/ (quadros + legendas) e tira
# screenshots em /out/*.png; o make_media.py monta os GIFs no fim.
source /work/testenv/lib.sh

export QT_QPA_PLATFORMTHEME=kde LANG=en_US.UTF-8
# Prompt e pastas com cara de computador de alguém (sem o id do container).
cat >> ~/.bashrc <<'RC'
PS1='\[\e[1;36m\]you@plasma\[\e[0m\]:\[\e[1;34m\]\w\[\e[0m\]\$ '
RC
mkdir -p ~/Documents ~/Downloads ~/Music ~/Pictures ~/Projects ~/Videos
cp -r /work/kubik/src ~/Projects/kubik
# O ícone e a entrada do menu: a barra de título do gerenciador mostra o cubo.
mkdir -p ~/.local/share/icons/hicolor/scalable/apps ~/.local/share/applications
cp /work/assets/kubik.svg ~/.local/share/icons/hicolor/scalable/apps/io.github.dionatansimioni.kubik.svg
cp /work/assets/io.github.dionatansimioni.kubik.desktop ~/.local/share/applications/
# Só o que é do desktop (nada da máquina que grava: CPU, GPU, IP, kernel).
FETCH="fastfetch -s OS:DE:WM:WMTheme:Theme:Icons:Font:Terminal:Shell:Break:Colors"

plasma-apply-lookandfeel -a org.kde.breezedark.desktop >/dev/null 2>&1
plasma-apply-colorscheme BreezeDark >/dev/null 2>&1
plasmashell >/tmp/plasmashell.log 2>&1 &
sleep 15

# ---- ajudantes ---------------------------------------------------------------
now() { date +%s%3N; }
REC="" RECPID=""
rec_start() {
    REC=$1
    mkdir -p "/out/rec/$REC"
    python3 /work/scripts/showcase/record.py "/out/rec/$REC" "/tmp/stop-$REC" &
    RECPID=$!
    sleep 0.6
}
# Legenda mostrada no GIF a partir de agora: label "Meta+M" "monocle"
label() { printf '%s\t%s\t%s\n' "$(now)" "$1" "${2:-}" >> "/out/rec/$REC/labels.tsv"; }
rec_stop() {
    sleep "${1:-1.2}"
    touch "/tmp/stop-$REC"
    wait "$RECPID"
}
# Espera uma janela cujo título contém <texto> e o layout assentar.
wait_app() {
    local i
    for i in $(seq 40); do
        kwin_eval "if (workspace.stackingOrder.some(w => w.caption.includes('$1'))) console.warn('SEEN-APP-$i')"
        grep -q "SEEN-APP-$i\$" /out/kwin.log && break
        sleep 0.2
    done
    sleep 0.8
}
# x y largura altura da janela cujo título contém <texto>.
geom() {
    local tag="GEOM$RANDOM"
    kwin_eval "const w = workspace.stackingOrder.find(w => w.caption.includes('$1')); console.warn('$tag ' + [w.x, w.y, w.width, w.height].map(Math.round).join(' '))"
    grep -a "$tag " /out/kwin.log | tail -n1 | sed "s/.*$tag //"
}
focus() { kwin_eval "workspace.activeWindow = workspace.stackingOrder.find(w => w.caption.includes('$1'))"; sleep 0.4; }
# Arrasta devagar (para o GIF) a barra de título de <de> até x,y.
drag_title() {  # drag_title <de> X Y [segurar]
    local x y w h
    read -r x y w h <<< "$(geom "$1")"
    FAKEINPUT_BEFORE_RELEASE="sleep ${4:-0.4}" \
        python3 /work/testenv/fakeinput.py drag $((x + w / 2 - 120)) $((y + 14)) "$2" "$3" 45
    sleep 0.8
}
center() { local x y w h; read -r x y w h <<< "$(geom "$1")"; echo "$((x + w / 2)) $((y + h / 2))"; }

# ---- 1. janelas novas se organizam sozinhas -------------------------------------
rec_start tiling
label "New window" "fills the screen"
konsole -e bash -c "$FETCH; exec bash" >/dev/null 2>&1 &
wait_app Konsole
sleep 0.8
label "Another one" "splits side by side"
dolphin ~ >/dev/null 2>&1 &
wait_app Dolphin
sleep 0.8
label "And another" "always splits the largest"
kate ~/Projects/kubik/core/tree.ts >/dev/null 2>&1 &
wait_app Kate
sleep 0.8
label "Four windows" "four quarters, no overlap"
konsole --workdir ~/Projects -e bash -c "git -c safe.directory='*' -C /work log --graph --oneline --color=always -n 40 | cat; exec bash" >/dev/null 2>&1 &
wait_app 'Projects :'
rec_stop 1.5

focus Kate
sleep 1.5
screenshot hero

# Antes das pilhas: a barra de abas do Kubik ainda fica por cima de janelas
# flutuantes (pendência conhecida) e apareceria sobre o gerenciador.
# ---- 2. bandeja ------------------------------------------------------------------
# O ícone do Kubik fica na bandeja do painel (achado pelo nome do plasmoide).
python3 /work/testenv/fakeinput.py click "${KUBIK_TRAY_X:-1420}" "${KUBIK_TRAY_Y:-977}"
sleep 3
screenshot tray
python3 /work/testenv/fakeinput.py key 1   # Esc
sleep 1
mouse_move 400 300   # sem dica de ferramenta na foto do gerenciador
sleep 1

# ---- 3. gerenciador (o AppImage) -------------------------------------------------
if ls /out/appimage/Kubik-*.AppImage >/dev/null 2>&1; then
    APPIMAGE_EXTRACT_AND_RUN=1 "$(ls /out/appimage/Kubik-*.AppImage)" >/dev/null 2>&1 &
    for i in $(seq 40); do
        kwin_eval "if (workspace.stackingOrder.some(w => w.caption === 'Kubik' && w.resourceClass === 'io.github.dionatansimioni.kubik')) console.warn('SEEN-MANAGER-$i')"
        grep -q "SEEN-MANAGER-$i\$" /out/kwin.log && break
        sleep 0.5
    done
    sleep 2
    screenshot manager
    kwin_eval "const w = workspace.stackingOrder.find(w => w.caption === 'Kubik' && w.resourceClass === 'io.github.dionatansimioni.kubik'); console.warn('MANAGER ' + [w.x, w.y, w.width, w.height].map(Math.round).join(' '))"
    kwin_eval "workspace.stackingOrder.forEach(w => { if (w.caption === 'Kubik' && w.resourceClass === 'io.github.dionatansimioni.kubik') w.closeWindow(); })"
    sleep 1
fi


# ---- 4. teclado ---------------------------------------------------------------
focus '~ :'
rec_start keyboard
label "Meta+→" "focus the neighbor"
shortcut "Kubik: Focus Right" 1.0
label "Meta+Shift+←" "move / swap"
shortcut "Kubik: Move Left" 1.2
label "Meta+Alt+→" "resize"
shortcut "Kubik: Resize Right" 0.5
shortcut "Kubik: Resize Right" 0.5
shortcut "Kubik: Resize Right" 1.0
label "Meta+O" "rotate the split"
shortcut "Kubik: Rotate split" 1.2
label "Meta+M" "monocle"
shortcut "Kubik: Toggle monocle" 1.4
shortcut "Kubik: Toggle monocle" 1.0
rec_stop 0.8

# ---- 5. mouse: arrastar para trocar ou dividir ----------------------------------
rec_start drag
read -r cx cy <<< "$(center 'Projects :')"
label "Drag onto the center" "swap the two windows"
drag_title Dolphin "$cx" "$cy" 0.25
sleep 0.6
read -r x y w h <<< "$(geom Kate)"
label "Drag onto an edge" "split right there"
drag_title Dolphin $((x + w - 40)) $((y + h / 2)) 0.25
rec_stop 1.2

# ---- 6. pilhas (abas) -------------------------------------------------------------
rec_start stack
read -r cx cy <<< "$(center Dolphin)"
label "Hold over a window" "stack them into tabs"
drag_title 'Projects :' "$cx" "$cy" 1.4
sleep 1.0
label "Meta+Ctrl+Tab" "next tab"
shortcut "Kubik: Next tab" 1.2
shortcut "Kubik: Next tab" 1.2
rec_stop 0.8
screenshot tabs

python3 /work/scripts/showcase/make_media.py /out >&2
