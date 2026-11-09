# Cenário: atualizar o script com o KWin rodando (como o install.sh e o
# "Instalar de arquivo…" fazem na sessão do usuário). O pacote novo é
# preparado pelo teste em /out/upgrade/*.tar.gz.
source /work/testenv/lib.sh

open_window Alpha 400x300
mark before

mkdir -p /tmp/upgrade && cd /tmp/upgrade && tar xzf /out/upgrade/*.tar.gz
./*/install.sh >&2
sleep 1

open_window Beta 600x420
mark after
screenshot upgraded
