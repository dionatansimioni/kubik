# kubik

Auto-tiling de janelas no estilo Pop!_Shell para o KDE Plasma 6.

## Instalar

Baixe a versão mais recente em **Releases** e escolha uma das formas:

- **Pela interface:** Configurações do Sistema › Scripts do KWin › *Instalar de arquivo…* › `kubik-<versão>.kwinscript`, e marque **Kubik**.
- **Pelo terminal:** `tar xzf kubik-<versão>.tar.gz && ./kubik-<versão>/install.sh`.

Para remover: `./kubik-<versão>/uninstall.sh`.

O `.tar.gz` instala o script **e** o efeito de animação. **Na primeira instalação do efeito, saia e entre na sessão uma vez**: o KWin só reconhece efeitos novos ao iniciar, e o `install.sh` avisa quando é o caso. As atualizações seguintes valem na hora. Para instalar só pela interface, use o `.kwinscript` em *Scripts do KWin*. O efeito vem como `.kwineffect`, que por enquanto só o `install.sh` instala.

### Ajustar as animações

```sh
kwriteconfig6 --file kwinrc --group Effect-kubikanimations --key Duration 300   # ms (1–2000)
kwriteconfig6 --file kwinrc --group Effect-kubikanimations --key Curve OutQuint # Linear, OutQuad, OutCubic, OutQuart, OutQuint, OutExpo, OutCirc, OutBack, InOutCubic
dbus-send --session --dest=org.kde.KWin /Effects org.kde.kwin.Effects.reconfigureEffect string:kubikanimations
```

O padrão é 250 ms com `OutCubic`. Para algo mais próximo do Hyprland, experimente `OutQuint` ou `OutBack` (que tem um leve "quique"). Logs: `journalctl --user -b | grep '\[kubik\]'`.

## O que já funciona (0.3.1)

- Janelas novas são organizadas em árvore BSP: a janela nova divide ao meio, pelo lado mais longo, a **maior** janela (no empate, a focada). Assim, 1 janela fica cheia, 2 ficam lado a lado, 3 ficam com metade + 2 quadrantes e 4 ficam em quadrantes. Minimizadas liberam o espaço.
- Janelas **em todos os desktops** entram no tiling do desktop visível e acompanham a troca de desktop. Com o plugin "Virtual desktops only on primary", isso inclui todas as janelas da tela secundária. Uma opção por monitor na bandeja está planejada.
- Uma janela que abre maximizada (ex.: o Chrome restaurando a sessão) entra no tile desmaximizada.
- Fechar ou minimizar uma janela devolve o espaço às vizinhas.
- Há uma árvore por tela × desktop virtual. Mover uma janela de tela ou de desktop a reorganiza no destino.
- Gaps de 4 px.
- Ficam flutuantes, fora do tiling: janelas internas do KWin (bordas e prévias de scripts), janelas auxiliares ocultas (fora da barra de tarefas e do Alt+Tab, ou com opacidade 0, como a ponte de vídeo do XWayland), diálogos, transientes, splash, janelas de tamanho fixo ou não redimensionáveis, janelas em alguns desktops (2 ou mais, mas não todos), tela cheia, e algumas classes do Plasma (krunner, plasmashell, yakuake…).
- **Mouse:**
  - Arrastar uma janela pela barra de título mostra uma prévia translúcida de **onde ela vai ficar**. O que acontece depende de onde o cursor está sobre a janela-alvo:
    - **centro** (o terço do meio): as duas trocam de lugar, e uma segunda prévia, mais clara, mostra para onde vai a outra;
    - **perto de uma borda**: a janela-alvo é dividida e a arrastada entra daquele lado, o que reorganiza o layout. Exemplo: com 1 à esquerda e 2 e 3 à direita, soltar a 3 na metade de baixo da 1 deixa 1 e 3 à esquerda e a 2 com a direita inteira;
    - **barra de título** (ou a barra de abas de uma pilha): as duas são **empilhadas em abas** no tile do alvo. A prévia ganha uma faixa de abas no topo para mostrar que vai empilhar.
  - Funciona também entre telas. Soltar num gap devolve a janela ao lugar.
  - Puxar a borda entre duas janelas redimensiona as duas ao vivo, e a proporção fica gravada na árvore.
- **Tamanhos mínimos:** as divisões cedem para cada app caber no mínimo dele (conteúdo + barra de título). Se a janela nova não couber em nenhuma divisão possível couber, ela fica flutuante, com o motivo no log.
- **Abas (pilhas):** as janelas de uma pilha dividem o mesmo tile, abaixo de uma barra de abas com a aba à vista na cor de destaque. A pilha se comporta como uma janela só: divide, troca e redimensiona inteira.
  - Clique numa aba para trazer a janela dela; Alt+Tab ou a barra de tarefas também funcionam.
  - **Meta+Ctrl+Tab**: próxima aba; **Meta+Ctrl+Shift+Tab**: anterior. As teclas podem ser trocadas em Configurações do Sistema › Atalhos › KWin.
  - Para tirar uma janela da pilha, arraste-a pela barra de título dela (abaixo da barra de abas) e solte em outro lugar.
- **Borda de destaque:** um contorno de 3 px, na cor de destaque do sistema, envolve a janela em foco, seja ela do tiling ou uma janela flutuante comum. Ela nunca persegue a janela: enquanto a janela se move (arrasto com o mouse ou animação de layout), a borda some e é redesenhada com a janela já no lugar. Ao trocar o foco, muda na hora. Não aparece em diálogos, em tela cheia nem em janelas maximizadas.
- **Animações** (efeito *Kubik: animações*, instalado junto): as janelas deslizam e redimensionam suavemente quando o layout muda. Ficam de fora o arrasto com o mouse, a tela cheia e o maximizar, que têm animação própria do KWin. A velocidade global de animação do Plasma também vale.
- **Apps que mudam a própria geometria** (Chrome e apps Electron como o Podman Desktop, em X11, ao restaurar o tamanho da sessão anterior) voltam ao tile. Se o app insistir, ele fica flutuante e as outras janelas se reorganizam.
- **Meta+Y** liga e desliga o tiling. Ao religar, a árvore é reconstruída equilibrada. Ao desligar, as janelas voltam à posição e ao tamanho de antes.

## Ainda não

Ícone na bandeja com as configurações, navegação e movimento por teclado. Ver `docs/DESIGN.md`.

## Desenvolvimento

O núcleo é TypeScript em `src/` e roda via `scripts/node.sh` (Node em container):

```sh
scripts/node.sh kubik npm test        # Vitest
scripts/node.sh kubik npm run build   # gera package/contents/ui/Kubik.qml
python3 -m unittest discover -s tests # tudo, inclusive o KWin real do testenv
```

- `src/core/`: a árvore BSP e a geometria, sem nenhuma dependência do KWin.
- `src/kwin/`: o controlador, que liga a árvore ao KWin por meio da interface mínima de `api.ts`. É testado contra o KWin falso de `test/fake-kwin.ts`.
- `src/effect/`: o efeito de animação. A decisão e o cálculo ficam em `morph.ts`, que é puro e testado; `main.ts` liga isso à API de efeitos. O resultado vai para `effect/`.
- `src/qml/Kubik.qml`: o modelo em que o build embute o bundle.
- `package/`: o pacote do KWin. O `main.qml` é só um carregador.

## Diagnóstico

Se o tiling se comportar de um jeito estranho, rode `./diagnose.sh` (vem no `.tar.gz`) na sessão onde o problema aparece. Ele gera `kubik-diagnostico-<data>.txt` com:

- as versões do Plasma e do KWin, as telas e os pacotes do kubik instalados;
- o estado interno do kubik: cada árvore, com o tile calculado e a geometria real de cada janela;
- todas as janelas que o KWin conhece;
- o log do kubik desde o login.

O estado também pode ir para o log pelo atalho "Kubik: registra o estado no log", que não tem tecla padrão.
