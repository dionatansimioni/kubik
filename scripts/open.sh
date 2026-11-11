#!/usr/bin/env bash
# Abre um plasmoide do Kubik numa janela (plasmawindowed): o gerenciador, por
# padrão, ou as configurações (o ícone da bandeja).
# Uso: open.sh [<id do plasmoide>]
#
# O plasmawindowed é instância única e mostra um plasmoide por vez: um pedido
# novo vai para o processo que já roda e troca a janela. Mas um plasmoide que
# já passou por aquele processo não abre de novo (o pedido é ignorado): depois
# de gerenciador → configurações, o "Kubik" do menu não fazia nada. Então, se
# o processo que roda é do Kubik, ele é fechado e um novo começa (na tela, o
# mesmo que a troca de janela). Um plasmawindowed de outro widget fica.
set -uo pipefail

ID=${1:-io.github.dionatansimioni.kubik.manager}

# Vivo: existe e não é zumbi (um processo morto fica em /proc até o pai o
# recolher, e o pai pode nem estar esperando).
alive() { [ -r "/proc/$1/stat" ] && ! sed 's/.*) //' "/proc/$1/stat" 2>/dev/null | grep -q '^Z'; }

ours=()
for d in /proc/[0-9]*; do
    [ "$(cat "$d/comm" 2>/dev/null)" = plasmawindowed ] || continue
    alive "${d#/proc/}" || continue
    tr '\0' ' ' < "$d/cmdline" 2>/dev/null | grep -q 'io\.github\.dionatansimioni\.kubik' && ours+=("${d#/proc/}")
done
if [ ${#ours[@]} -gt 0 ]; then
    kill "${ours[@]}" 2>/dev/null
    for _ in $(seq 50); do
        left=""
        for p in "${ours[@]}"; do alive "$p" && left=1; done
        [ -z "$left" ] && break
        sleep 0.1
    done
fi
exec plasmawindowed "$ID"
