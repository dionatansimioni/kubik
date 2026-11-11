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

- **Divisão:** BSP. A janela nova divide sempre uma das **maiores** janelas, ao meio e pelo lado mais longo. No empate, divide a focada. Resultado: 1 janela fica cheia, 2 ficam lado a lado, 3 ficam com uma metade e dois quadrantes, 4 ficam em quadrantes, e assim por diante. Decisão do usuário em 2026-11-10; antes a regra era dividir sempre a focada.
- **Janelas minimizadas** saem do tiling e liberam o espaço; ao restaurar, voltam.
- **Janelas em todos os desktops** entram na árvore do desktop visível daquela tela. Ao trocar de desktop, uma tela que só tem janelas assim leva a árvore inteira junto, com o mesmo arranjo; nas outras, cada uma muda de árvore. O padrão é ligado, e a bandeja terá uma opção por monitor. Decisão do usuário em 2026-11-10.
- **Escopo:** uma árvore por tela × desktop virtual. Activities são ignoradas.
- **Liga/desliga:** toggle global (Super+Y), com exceções por desktop/tela nas configurações. Ao desligar, as janelas voltam à geometria que tinham antes do tiling.
- **Mouse:**
  - Arrastar mostra uma prévia da posição final. As zonas sobre a janela-alvo, inspiradas no COSMIC e decididas pelo usuário em 2026-11-10:
    - segurar parado sobre a janela por 800 ms empilha em abas (mudança do usuário em 2026-11-11: a faixa da barra de título era difícil de acertar e não existe em apps como o Chrome); a barra de abas de uma pilha empilha na hora;
    - o terço central troca de lugar (com uma segunda prévia, mais clara, para a outra janela);
    - fora do centro, a borda mais próxima (relativa ao tamanho) divide o alvo e a arrastada entra daquele lado.
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
4. **Stacking** (feito na 0.6.0). Soltar na barra de título empilha; arrastar para fora desempilha; atalhos de próxima e anterior aba (Meta+Ctrl+Tab e Meta+Ctrl+Shift+Tab).
   - Janelas da pilha ocupam a mesma geometria, com a ativa no topo.
   - Barra de abas em overlay QML para trocar entre elas.
   - Nada é minimizado.
5. **Borda ativa** (feita na 0.5.0). Contorno com a cor de destaque do tema do KDE, em volta da janela em foco, tanto no tiling quanto flutuante, exceto diálogos, tela cheia e maximizadas. O controlador decide quando mostrar; o QML só desenha. A borda some enquanto a janela se move e volta 300 ms depois da última mudança (pedido do usuário: animada, ela parecia arrastada pela janela). A espessura (3 px) e o liga/desliga já estão na `Config`; a bandeja vai expô-los.

## Bandeja (plasmoid)

Um applet QML na bandeja do sistema (`kubik/tray`, id `io.github.dionatansimioni.kubik`), separado do KWin Script. Desenho aprovado pelo usuário:

- **Popup** (clique): liga/desliga, gaps (um valor), borda (liga/desliga + espessura) e, por tela, se as janelas "em todos os desktops" entram no tiling. Clique do meio liga/desliga.
- **Configurar…** (páginas do plasmoide): *Geral* (gaps internos e externos separados, borda), *Exceções* (apps abertos para marcar + campo para classe de app fechado + as embutidas, só leitura) e *Animação* (duração 0–600 ms e curva nomeada, com prévia animada).

Comunicação:

- **Fonte da verdade: o `kwinrc`.** A bandeja lê `[Script-kubik]` ao iniciar (com o mesmo `parseSettings` do script) e espelha os valores na própria configuração. A cada mudança, grava tudo com `kwriteconfig6` e chama `org.kde.KWin.reconfigure` (o script ouve `Options.configChanged`) e `reconfigureEffect kubikanimations` (o efeito só ouve esse).
- **Meta+Y** muda o estado direto no script. A bandeja ouve o sinal `globalShortcutPressed` do kglobalaccel (D-Bus) e grava o estado novo. O script só aplica `Enabled` do kwinrc quando o valor **muda**, para que um reconfigure qualquer não desfaça o atalho.
- A animação é uma só: o efeito usa a duração e a curva, e os fades dos overlays duram 60% dela com a mesma curva. A borda espera a duração + 50 ms para voltar.

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
  - Integração num KWin real e headless (`testenv/`, Arch e Fedora 44), com mouse simulado, conferindo a geometria aplicada e os pixels.
- **Licença:** GPL-3.0-or-later.
- **Idiomas:** inglês e pt-BR via i18n (`.po`).
- **Repositório:** GitHub.

## Lições técnicas (KWin 6.8 / Qt 6.10+)

Validadas no `testenv/`:

1. **Import `org.kde.kwin` sempre com namespace** (`import org.kde.kwin as KWin`). O módulo exporta um tipo `Window` (não criável) que esconde o `Window` do QtQuick.
2. **Overlays não podem ser declarados dentro do Item raiz.** Desde o Qt 6.7, um `Window` filho de um `Item` vira janela embutida na janela daquele Item, e num KWin Script o Item raiz não tem janela. Por isso os overlays são criados com `Component.createObject(null)`.
3. **Escrever `frameGeometry` é assíncrono no Wayland.** Ler de volta em seguida devolve o valor antigo. **A árvore de tiling é a fonte da verdade**: nunca derive estado da geometria lida logo após aplicá-la.
4. O Plasma esconde `console.log` do journal. Para logs de diagnóstico, use `console.warn`.
5. **O KWin guarda em memória o QML compilado, indexado pela URL, até reiniciar.** Atualizar o pacote com a sessão aberta recarregava o código antigo. O `main.qml` é só um carregador fixo que abre o código real por uma URL única (`Overlay.qml?load=<Date.now()>`). O caminho alternativo, um diretório por versão via `X-Plasma-MainScript`, não serve: o KPackage exige `contents/ui/main.qml`.
6. **Overlays criados com `createObject(null)` precisam ser destruídos em `Component.onDestruction`.** Caso contrário, sobrevivem ao descarregamento do script como bordas fantasma.

7. **JavaScript também é guardado em cache pela URL.** Por isso o bundle do TypeScript é embutido no `Kubik.qml`, carregado com URL única, em vez de importado de um `.js`.
8. **Para uma janela nova, `windowActivated` chega ANTES de `windowAdded`.** O alvo da divisão vem de um histórico de foco, não de "a última ativa que eu conheço".

9. **Overlays de scripts aparecem como janelas normais.** Eles chegam como `normalWindow: true`, com `resourceClass` vazio e `skipSwitcher: true`. Sem uma regra, entram no tiling: a borda do protótipo ocupou metade da tela do usuário.
10. **Durante um arrasto, `outputChanged` dispara a cada passo.** O kubik ignora esses sinais da janela arrastada, e quem decide o destino é o drop.

11. **API de efeitos em JavaScript no 6.8:** `windowFrameGeometryChanged`, `windowStartUserMovedResized` e afins ficam **em cada janela**, não no objeto global `effects`. As propriedades são `geometry`, `move` e `resize`.
12. **Configuração de efeito em script:** o `readConfig()` só lê chaves declaradas em `contents/config/main.xml`, e o `<group name="">` tem que ficar **vazio**, porque o KWin já posiciona a leitura em `[Effect-<id>]`.
13. **`minSize` é do conteúdo, não da moldura.** A árvore distribui molduras, então o mínimo efetivo é `minSize + (frame − client)`. Sem isso, o app recusa o tile e invade o vizinho (achado no estresse com o KCalc).
14. **Reconstruções em massa (início, religar) dividem sempre a maior janela.** Dividir a focada em cadeia gera tiles minúsculos. Uma janela nova que não cabe dividindo a focada tenta a maior antes de virar flutuante.

15. **O KWin só descobre efeitos NOVOS ao iniciar a sessão.** Na primeira instalação, o `loadEffect` falha até o próximo login (o `install.sh` avisa). Atualizações de um efeito já conhecido recarregam na hora.
16. **Apps X11 (Chrome, Electron) mudam a própria geometria depois de abrir** (ConfigureRequest), por exemplo ao restaurar a sessão anterior. O kubik observa `frameGeometryChanged`; se uma janela no tiling sair do tile sozinha (fora de arrasto ou maximização), ele a devolve depois de 250 ms. Se o app insistir mais de 3 vezes, ela vira flutuante. No Wayland o KWin já impõe o tamanho do tile.
17. **Apps com barra de título própria (CSD):** o "conteúdo" inclui as sombras e é **maior** que a moldura. Por isso a soma da decoração no mínimo é limitada a ≥ 0.
18. **Janelas auxiliares invisíveis parecem normais.** A ponte de vídeo do XWayland (`xwaylandvideobridge`, presente no Fedora) é `normalWindow`, tem classe, opacidade 0 e `skipTaskbar` + `skipSwitcher`. Sem uma regra própria, ela ocupava metade da tela vazia (achado pelo `diagnose.sh` no Fedora do usuário).
19. **Apps abrem maximizados e continuam com `maximizeMode = 3` dentro do tile.** O Chrome, o FileZilla e o Konsole restauram a sessão maximizados. O Breeze não desenha contorno em janela maximizada, e o "devolver ao tile" ignora maximizadas. Ao entrar no tile, o kubik chama `setMaximize(false, false)`.
20. **Plugins mexem na janela durante o arrasto.** O `virtualdesktopsonlyonprimary` põe em todos os desktops a janela que entra na tela secundária (`desktops` fica vazio). Ao soltar, o kubik reavalia se a janela ainda pode entrar no tiling antes de procurar o destino.
21. **Overlay que segue janela em movimento sempre fica para trás.** A borda é uma janela à parte, atualizada um quadro depois da janela. Primeiro tentamos animá-la com a mesma curva do efeito: ficava de 8 a 12 px atrás, e o usuário via a borda "seguindo" a janela. Solução: esconder enquanto a janela se move (arrasto ou mudança de layout) e redesenhar quando ela parar por 300 ms (a animação padrão de 250 ms mais uma folga).
22. **Pilhas sem esconder janelas.** O KWin não tem como esconder uma janela por script sem minimizá-la, e minimizada ela sairia do tiling. As abas de uma pilha ficam todas na mesma geometria, e a à vista fica na frente: ativar (`workspace.activeWindow = w`) também traz para a frente. Quando a aba à vista sai, a nova vem com `workspace.raiseWindow`. Uma aba escondida ativada por fora (Alt+Tab) vira a aba à vista.
23. **Nunca feche e reabra um overlay.** Cada vez que um overlay (borda, prévia, barra de abas) voltava a ficar visível, o KWin o tratava como janela nova e aplicava a animação de abrir janela do usuário (no Fedora dele, crescendo do centro), o que parecia um glitch. Os overlays são criados uma vez e ficam sempre abertos: escondidos, ficam transparentes (a barra de abas, que recebe clique, vai para fora da tela). O que aparece, aparece com um fade nosso. O teste conta quantas vezes cada overlay é aberto.
24. **No QML do script, o import `org.kde.kwin` NÃO pode se chamar `KWin`.** O objeto global do script (`KWin.readConfig`, `KWin.registerShortcut`) se chama `KWin`, e um namespace com o mesmo nome o esconde (`readConfig` de undefined). O Kubik.qml importa como `KWinQml`.
25. **Configuração ao vivo:** `reconfigure` (D-Bus `/KWin`) faz o KWin reler o kwinrc e emitir `Options.configChanged`, que o script pode ouvir; o `readConfig` já devolve o valor novo. Os efeitos em JavaScript **não** recebem esse reconfigure, só `org.kde.kwin.Effects.reconfigureEffect <id>`.
26. **Palavras reservadas no bundle.** Funções chamadas `int` ou `bool` passam no TypeScript, mas o QML não as compila. Os nomes ficam `toInt`/`toBool`.
27. **Bandeja que aparece sozinha:** o applet precisa de `X-Plasma-NotificationAreaCategory` e `EnabledByDefault: true`. A bandeja adiciona automaticamente plugins novos (que ainda não estão em `knownItems`); se o usuário tirar, ele não volta sozinho.
28. **Atalho padrão ocupado fica sem tecla para sempre.** Um `ShortcutHandler` cuja tecla padrão já é de outra ação (Meta+← do quick tile) é registrado SEM tecla, e isso fica gravado. O `install.sh` (scripts/shortcuts.sh) libera as teclas do KDE com `setForeignShortcut` (D-Bus do kglobalaccel, dentro do KWin) antes de recarregar o script e, depois, dá a tecla às ações do kubik que ficaram vazias. As teclas vão como inteiro do Qt (Meta 0x10000000 + tecla; ← = 0x01000012); um teste confere a tabela contra `keys.ts`.
29. **Idioma.** A interface segue o idioma do sistema: inglês, ou português com o sistema em pt. O ícone da bandeja usa o gettext padrão do KDE (`i18n()` com o texto-fonte em inglês e `contents/locale/pt_BR/LC_MESSAGES/plasma_applet_<id>.mo`, que o libplasma registra sozinho); o .po fica em `kubik/tray/po/` e vira .mo no build (`tools/msgfmt.mjs`). Os textos dos atalhos do script vêm de `keys.ts` pelo idioma do Qt. Os logs ficam em português (diagnóstico). Para testar: o KDE só traduz se o APLICATIVO também tem catálogo no idioma, e o gettext do glibc ignora `LANGUAGE` com o locale "C"; o testenv gera o `en_US.UTF-8` e cria um catálogo vazio para o plasmoidviewer.

## Riscos

- **Overlays QML num KWin Script** (borda ativa e barra de abas): ficam acima das janelas certas? Seguem a geometria sem atraso? Recebem clique sem roubar o foco? **Validado** no `testenv/`: a borda e a barra de abas aparecem e acompanham o foco. Ainda falta validar numa sessão real o clique na aba sem roubar o foco e a sobreposição com outras janelas.
