# kubik

Auto-tiling de janelas no estilo Pop!_Shell para o KDE Plasma 6.

## Instalar

Baixe a versão mais recente em **Releases** e escolha uma das formas:

- **Instalador (mais fácil):** `Kubik-<versão>-x86_64.AppImage`. Marque como executável (botão direito › Propriedades › Permissões) e abra com dois cliques. Ele mostra o que vai instalar e, no fim, avisa se falta sair e entrar na sessão. Aberto de novo com o Kubik já instalado, oferece abrir o gerenciador ou reinstalar. Pelo terminal: `--install --yes` ou `--uninstall --yes`. Tem ~1 MB e não traz Qt: usa o `kdialog` e as ferramentas do Plasma.
- **Pelo terminal:** `tar xzf kubik-<versão>.tar.gz && ./kubik-<versão>/install.sh`.
- **Só o script, pela interface:** Configurações do Sistema › Scripts do KWin › *Instalar de arquivo…* › `kubik-<versão>.kwinscript`, e marque **Kubik** (sem animações, bandeja e menu).

Para remover: o botão **Desinstalar** do gerenciador, ou `./kubik-<versão>/uninstall.sh`.

### Gerenciador (menu › Kubik)

O instalador põe o ícone do Kubik (também usado em *Scripts do KWin*) e uma entrada **Kubik** no menu. Ela abre o ícone da bandeja numa janela (`plasmawindowed`), com:

- as mesmas opções do popup da bandeja;
- a versão instalada e avisos de estado (efeito que só liga depois de sair e entrar; script parado);
- **versão nova:** o gerenciador consulta os releases do GitHub ao abrir. A bandeja consulta ao iniciar e a cada 6 h, o que se desliga em *Configurar… › Geral › Atualizações*. Com versão nova, aparece **Atualizar**, que baixa o `.tar.gz` do release e roda o `install.sh` dele;
- **Desinstalar…**, com confirmação. Usa a cópia do `uninstall.sh` que o `install.sh` guarda em `~/.local/share/kubik/` e remove tudo, inclusive o ícone, o menu e os atalhos (devolve os do KDE).

O `.tar.gz` instala o script **e** o efeito de animação. **Na primeira instalação do efeito, saia e entre na sessão uma vez**: o KWin só reconhece efeitos novos ao iniciar, e o `install.sh` avisa quando é o caso. As atualizações seguintes valem na hora. Para instalar só pela interface, use o `.kwinscript` em *Scripts do KWin*. O efeito vem como `.kwineffect`, que por enquanto só o `install.sh` instala.

### Ícone na bandeja

O `install.sh` instala também o ícone do Kubik, que aparece sozinho na bandeja do sistema (se não aparecer: `systemctl --user restart plasma-plasmashell`, ou adicione em *Configurar a bandeja do sistema › Entradas*).

- **Clique:** abre o popup com o liga/desliga do tiling, os gaps, a borda (liga/desliga e espessura) e, por tela, se as janelas "em todos os desktops" entram no tiling.
- **Clique do meio:** liga/desliga o tiling. O ícone fica apagado com o tiling desligado.
- **Botão direito › Configurar Kubik…:**
  - *Geral:* gaps entre janelas e nas bordas da tela, separados; borda.
  - *Exceções:* apps que sempre flutuam. Os apps abertos aparecem para marcar com um clique; um campo aceita a classe de um app fechado.
  - *Animação:* duração (0 a 600 ms; 0 desliga) e curva (Suave, Linear, Desacelerar forte, Com rebote), com uma prévia animada. Vale para as janelas e para os fades da borda, da prévia e das abas.

A interface (bandeja e nomes dos atalhos) segue o idioma do sistema: português ou inglês.

Tudo vale na hora e fica gravado no `kwinrc` (grupos `[Script-kubik]` e `[Effect-kubikanimations]`), inclusive o liga/desliga, que é lembrado depois de reiniciar a sessão. O Meta+Y continua funcionando, e o ícone acompanha.

## O que já funciona (0.10.0)

- Janelas novas são organizadas em árvore BSP: a janela nova divide ao meio, pelo lado mais longo, a **maior** janela (no empate, a focada). Assim, 1 janela fica cheia, 2 ficam lado a lado, 3 ficam com metade + 2 quadrantes e 4 ficam em quadrantes. Minimizadas liberam o espaço.
- Janelas **em todos os desktops** entram no tiling do desktop visível e acompanham a troca de desktop. Com o plugin "Virtual desktops only on primary", isso inclui todas as janelas da tela secundária. Dá para desligar isso por tela, na bandeja.
- Uma janela que abre maximizada (ex.: o Chrome restaurando a sessão) entra no tile desmaximizada.
- Fechar ou minimizar uma janela devolve o espaço às vizinhas.
- Há uma árvore por tela × desktop virtual. Mover uma janela de tela ou de desktop a reorganiza no destino.
- Gaps de 4 px (ajustáveis na bandeja).
- Ficam flutuantes, fora do tiling: janelas internas do KWin (bordas e prévias de scripts), janelas auxiliares ocultas (fora da barra de tarefas e do Alt+Tab, ou com opacidade 0, como a ponte de vídeo do XWayland), diálogos, transientes, splash, janelas de tamanho fixo ou não redimensionáveis, janelas em alguns desktops (2 ou mais, mas não todos), tela cheia, algumas classes do Plasma (krunner, plasmashell, yakuake…) e as **exceções** escolhidas na bandeja.
- **Mouse:**
  - Arrastar uma janela pela barra de título mostra uma prévia translúcida de **onde ela vai ficar**. O que acontece depende de onde o cursor está sobre a janela-alvo:
    - **centro** (o terço do meio): as duas trocam de lugar, e uma segunda prévia, mais clara, mostra para onde vai a outra;
    - **perto de uma borda**: a janela-alvo é dividida e a arrastada entra daquele lado, o que reorganiza o layout. Exemplo: com 1 à esquerda e 2 e 3 à direita, soltar a 3 na metade de baixo da 1 deixa 1 e 3 à esquerda e a 2 com a direita inteira;
    - **segurar parado sobre a janela por ~0,8 s** (em qualquer ponto dela, inclusive em apps sem a barra de título do KDE, como o Chrome): as duas são **empilhadas em abas**. A prévia mostra um ícone de pilha. Mexer o cursor cancela. Soltar sobre a barra de abas de uma pilha empilha na hora.
  - Funciona também entre telas. Soltar num gap devolve a janela ao lugar.
  - Puxar a borda entre duas janelas redimensiona as duas ao vivo, e a proporção fica gravada na árvore.
- **Tamanhos mínimos:** as divisões cedem para cada app caber no mínimo dele (conteúdo + barra de título). Se a janela nova não couber em nenhuma divisão possível couber, ela fica flutuante, com o motivo no log.
- **Abas (pilhas):** as janelas de uma pilha dividem o mesmo tile, abaixo de uma barra de abas com a aba à vista na cor de destaque. A pilha se comporta como uma janela só: divide, troca e redimensiona inteira.
  - Cada aba mostra o ícone e o título do app. Clique numa aba para trazer a janela dela; Alt+Tab ou a barra de tarefas também funcionam.
  - O **×** da aba (ou o clique do meio) tira a janela da pilha e a devolve ao tiling, ao lado da pilha.
  - **Meta+Ctrl+Tab**: próxima aba; **Meta+Ctrl+Shift+Tab**: anterior. As teclas podem ser trocadas em Configurações do Sistema › Atalhos › KWin.
  - Também dá para tirá-la arrastando pela barra de título dela (abaixo da barra de abas) e soltando em outro lugar.
- **Borda de destaque:** um contorno de 3 px, na cor de destaque do sistema, envolve a janela em foco, seja ela do tiling ou uma janela flutuante comum. Ela nunca persegue a janela: enquanto a janela se move (arrasto com o mouse ou animação de layout), a borda some e é redesenhada com a janela já no lugar. Ao trocar o foco, muda na hora. Não aparece em diálogos, em tela cheia nem em janelas maximizadas.
- **Animações** (efeito *Kubik: animações*, instalado junto): as janelas deslizam e redimensionam suavemente quando o layout muda. Ficam de fora o arrasto com o mouse, a tela cheia e o maximizar, que têm animação própria do KWin. A velocidade global de animação do Plasma também vale.
- **Apps que mudam a própria geometria** (Chrome e apps Electron como o Podman Desktop, em X11, ao restaurar o tamanho da sessão anterior) voltam ao tile. Se o app insistir, ele fica flutuante e as outras janelas se reorganizam.
- **Teclado** (estilo Pop!_Shell):

  | Tecla | O quê |
  |---|---|
  | Meta+setas | foca a janela vizinha naquela direção (tiling ou flutuante, em qualquer tela; no empate, a usada por último) |
  | Meta+Shift+setas | troca a janela de lugar com a vizinha; em outra tela, entra ao lado dela; sem vizinha, vai para a tela daquele lado. Janela flutuante: quick tile do KDE |
  | Meta+Alt+setas | a divisa da janela anda na direção da seta (5% da tela): a da direita (ou de baixo); na borda, a do outro lado |
  | Meta+O | gira a divisão da janela (lado a lado ↔ um sobre o outro) |
  | Meta+F | flutua a janela em foco (volta ao tamanho de antes); de novo, ela volta ao tiling |
  | Meta+M | monocle: todas as janelas da tela ocupam a tela inteira; Meta+←/→ passam por elas |

  Essas teclas são, no KDE, do quick tile, de "mandar para outra tela" e de "trocar de janela por direção". O `install.sh` guarda os atalhos do KDE, libera essas teclas e as dá ao Kubik; o `uninstall.sh` devolve tudo. Dá para trocar qualquer uma em Configurações do Sistema › Atalhos › KWin (as ações começam com "Kubik:").
- **Meta+Y** liga e desliga o tiling. Ao religar, a árvore é reconstruída equilibrada. Ao desligar, as janelas voltam à posição e ao tamanho de antes.

## Ainda não

Layout guardado entre sessões. Ver `docs/DESIGN.md`.

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
- `src/kwin/settings.ts`: as preferências do `kwinrc`, com padrões e limites. O script e a bandeja usam o mesmo leitor.
- `src/tray/logic.ts`: a lógica do ícone da bandeja e do gerenciador (comandos, listas, validação, estado, releases do GitHub). O resultado vai para `tray/contents/code/logic.js`; o QML do plasmoide fica em `tray/contents/ui/`.
- `src/qml/Kubik.qml`: o modelo em que o build embute o bundle.
- `package/`: o pacote do KWin. O `main.qml` é só um carregador.
- `scripts/appimage.sh` + `scripts/appimage/AppRun`: o instalador AppImage, feito do `.tar.gz` (runtime oficial do AppImage em versão fixa, conferido por sha256, + squashfs).

## Diagnóstico

Se o tiling se comportar de um jeito estranho, rode `./diagnose.sh` (vem no `.tar.gz`) na sessão onde o problema aparece. Ele gera `kubik-diagnostico-<data>.txt` com:

- as versões do Plasma e do KWin, as telas e os pacotes do kubik instalados;
- o estado interno do kubik: cada árvore, com o tile calculado e a geometria real de cada janela;
- todas as janelas que o KWin conhece;
- o log do kubik desde o login.

O estado também pode ir para o log pelo atalho "Kubik: registra o estado no log", que não tem tecla padrão.
