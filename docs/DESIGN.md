# kubik — Design

Auto-tiling de janelas para o KDE Plasma 6, inspirado no [Pop!_Shell](https://github.com/pop-os/shell).

Decisões fechadas em 2026-11-09.

## Base e tecnologia

| Decisão | Escolha |
|---|---|
| Origem | Escrito do zero. Pop!_Shell e Polonium servem só como referência. |
| Forma | KWin Script (declarativo, QML + JS). |
| Linguagem | TypeScript, compilado com esbuild para um único `.js`. |
| Alvo | Plasma 6.x. Wayland é o alvo principal; X11 em melhor esforço. Plasma 5 fora. |
| Arquitetura | Núcleo puro em TS (árvore BSP, geometria, gaps, minSize, navegação) sem dependência do KWin, mais um adaptador fino para o KWin. |

## Comportamento do tiling

- **Divisão:** BSP no estilo Pop. A janela focada é dividida ao meio pelo lado mais longo.
- **Escopo:** uma árvore por tela × desktop virtual. Activities são ignoradas.
- **Liga/desliga:** toggle global (Super+Y), com exceções por desktop/tela nas configurações. Ao desligar, as janelas voltam à geometria que tinham antes do tiling.
- **Mouse:**
  - Arrastar mostra uma prévia e, ao soltar, troca a janela de lugar ou insere no nó.
  - Redimensionar pela borda ajusta a proporção da divisão.
- **Tamanho mínimo:** a proporção da divisão é redistribuída para a janela caber. Se não couber na tela, ela vira flutuante com uma notificação discreta.
- **Maximizar/tela cheia:** a janela mantém seu nó na árvore e volta ao tile ao sair. Super+M alterna o maximizado.
- **Persistência:** nenhuma no MVP. A árvore é reconstruída ao iniciar.
- **Painéis:** a área de cliente (descontando os painéis do Plasma) é respeitada.
- **Janelas em todos os desktops:** sempre flutuam.

## Recursos do MVP

1. **Navegação por teclado.** Atalhos padrão do Pop (Super+setas/hjkl para focar, Super+Shift para mover, Super+Enter para o modo de ajuste, Super+Y para o toggle). Os atalhos conflitantes do KWin (ex.: Quick Tile) são desativados, com backup para restaurar.
2. **Gaps configuráveis.** Padrão de 4px por dentro e por fora.
3. **Exceções flutuantes.**
   - Flutuam automaticamente: diálogos, transientes, splash, popups e janelas de tamanho fixo.
   - Regras do usuário: classe (`resourceClass`) com título ou regex opcional.
   - Lista padrão embutida (krunner, plasmashell, yakuake…).
4. **Stacking.**
   - Janelas da pilha ocupam a mesma geometria, com a ativa no topo.
   - Barra de abas em overlay QML para trocar entre elas.
   - Nada é minimizado.
5. **Borda ativa.** Contorno com a cor de destaque do tema do KDE, com espessura e raio configuráveis e opção de desligar.

## Bandeja (plasmoid)

Um applet QML no system tray, separado do KWin Script, que oferece:

- liga/desliga;
- "Flutuar esta janela sempre", que captura a janela focada e cria a regra;
- edição das exceções e dos atalhos básicos.

Comunicação com o script: o plasmoid aciona os atalhos globais do script via kglobalaccel/D-Bus. Para mudar configurações, ele grava a config do script e chama o `reconfigure` do KWin.

## Fora do escopo do MVP

- Launcher próprio: o kubik usa o KRunner. O `install.sh` pode sugerir mapear Super+/ para ele.
- Plugin do KRunner.
- Plasma 5.
- Pacotes de distro (AUR/deb/rpm).
- Persistência de layout.

## Entrega

- **Distribuição:** KWin Script e plasmoid na KDE Store, mais um release no GitHub com `install.sh` (kpackagetool6) que instala os dois.
- **Testes:**
  - Vitest sobre o núcleo puro.
  - Checklist manual em sessão aninhada (`kwin_wayland --windowed`).
- **Licença:** GPL-3.0-or-later.
- **Idiomas:** inglês e pt-BR via i18n (`.po`).
- **Repositório:** GitHub.

## Riscos

- **Overlays QML num KWin Script** (borda ativa e barra de abas): ficam acima das janelas certas? Seguem a geometria sem atraso? Recebem clique sem roubar o foco? Isso está sendo validado em `prototype/overlay/` antes da estrutura do projeto.
