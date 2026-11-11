# Teclado no estilo Pop!_Shell (ações disparadas pelo kglobalaccel, como uma
# tecla faria): focar, mover/trocar, redimensionar, girar, flutuar, monocle.
source /work/testenv/lib.sh

active() { kwin_eval "console.warn('=== ACTIVE $1 ' + workspace.activeWindow.caption)"; }

open_window Alpha 400x300 "#8b2f2f"
open_window Beta 400x300 "#2f6b2f"
open_window Gamma 400x300 "#2f2f8b"
dump_windows start           # Alpha | (Beta / Gamma), Gamma em foco

shortcut "Kubik: Focus Up"
active up                    # Beta
shortcut "Kubik: Focus Left"
active left                  # Alpha

shortcut "Kubik: Move Right" 1
dump_windows moved           # Alpha trocou com Beta (a vizinha à direita mais recente)
active moved                 # continua na Alpha

shortcut "Kubik: Resize Right" 1
dump_windows resized         # a Alpha está na borda direita: anda a divisa da esquerda dela

shortcut "Kubik: Rotate split" 1
dump_windows rotated

shortcut "Kubik: Toggle floating" 1
dump_windows floating
shortcut "Kubik: Toggle floating" 1

shortcut "Kubik: Toggle monocle" 1
dump_windows monocle
screenshot monocle
shortcut "Kubik: Focus Right"
active monocle_next
shortcut "Kubik: Toggle monocle" 1
dump_windows back
