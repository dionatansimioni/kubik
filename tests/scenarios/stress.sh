# Estresse: 12 janelas (10 de teste, de tamanhos variados, e 2 KCalc reais,
# que têm tamanho mínimo de verdade), com o efeito de animação ativo. Cada
# fase termina num checkpoint (geometria real + screenshot) conferido pelo
# teste depois das animações assentarem.
source /work/testenv/lib.sh

checkpoint() {  # checkpoint <nome>
    sleep 1.2   # animações (250 ms) + clientes confirmarem o tamanho
    dump_windows "$1"
    screenshot "$1"
}

# Fase 1: 6 janelas de tamanhos bem diferentes, uma delas KCalc.
open_window W01 300x200 "#c0392b"
open_window W02 900x650 "#27ae60"
open_app kcalc
open_window W04 220x160 "#8e44ad"
open_window W05 320x220 "#f39c12"
open_window W06 640x480 "#16a085"
checkpoint six

# Fase 2: foco na W01 (a mais antiga) e mais 3 janelas, uma delas outra KCalc.
kwin_eval 'workspace.activeWindow = win("W01")'
open_window W07 400x300 "#d35400"
open_app kcalc
open_window W09 800x200 "#7f8c8d"
checkpoint nine

# Fase 3: minimiza duas, fecha duas.
kwin_eval 'win("W02").minimized = true; win("W06").minimized = true'
close_window W07
close_window W01
checkpoint shrunk

# Fase 4: restaura as minimizadas e abre mais 3 (12 abertas no total).
kwin_eval 'win("W02").minimized = false; win("W06").minimized = false'
open_window W10 350x350 "#e84393"
open_window W11 700x500 "#6c5ce7"
open_window W12 450x250 "#00b894"
checkpoint twelve

# Fase 5: desliga e religa o tiling com tudo aberto.
shortcut "Kubik: Toggle tiling" 1
checkpoint off
shortcut "Kubik: Toggle tiling" 1
checkpoint on_again
