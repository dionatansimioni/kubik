# kubik

Auto-tiling de janelas no estilo Pop!_Shell para o KDE Plasma 6.

## Instalar

Baixe a versão mais recente em **Releases** e escolha uma das formas:

- **Pela interface:** Configurações do Sistema › Scripts do KWin › *Instalar de arquivo…* › `kubik-<versão>.kwinscript`, e marque **Kubik**.
- **Pelo terminal:** `tar xzf kubik-<versão>.tar.gz && ./kubik-<versão>/install.sh`.

Para remover: `./kubik-<versão>/uninstall.sh`. Logs: `journalctl --user -b | grep '\[kubik\]'`.

## O que já funciona (0.1.0)

- Janelas novas são organizadas em árvore BSP. A janela focada é dividida ao meio pelo lado mais longo.
- Fechar ou minimizar uma janela devolve o espaço às vizinhas.
- Há uma árvore por tela × desktop virtual. Mover uma janela de tela ou de desktop a reorganiza no destino.
- Gaps de 4 px.
- Ficam flutuantes, fora do tiling: diálogos, transientes, splash, janelas de tamanho fixo ou não redimensionáveis, janelas em todos os desktops, tela cheia, e algumas classes do Plasma (krunner, plasmashell, yakuake…).
- **Meta+Y** liga e desliga o tiling. Ao desligar, as janelas voltam à posição e ao tamanho de antes.

## Ainda não

Navegação e movimento por teclado, redimensionar e arrastar com o mouse, stacking, borda ativa, ícone na bandeja, configurações. Ver `docs/DESIGN.md`.

## Desenvolvimento

O núcleo é TypeScript em `src/` e roda via `scripts/node.sh` (Node em container):

```sh
scripts/node.sh kubik npm test        # Vitest
scripts/node.sh kubik npm run build   # gera package/contents/ui/Kubik.qml
python3 -m unittest discover -s tests # tudo, inclusive o KWin real do testenv
```

- `src/core/`: a árvore BSP e a geometria, sem nenhuma dependência do KWin.
- `src/kwin/`: o controlador, que liga a árvore ao KWin por meio da interface mínima de `api.ts`. É testado contra o KWin falso de `test/fake-kwin.ts`.
- `src/qml/Kubik.qml`: o modelo em que o build embute o bundle.
- `package/`: o pacote do KWin. O `main.qml` é só um carregador.
