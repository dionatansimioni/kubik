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
30. **Instalador sem Qt e sem appimagetool.** Um AppImage tipo 2 é só o runtime (executável estático) seguido de uma imagem squashfs; o `scripts/appimage.sh` faz isso com o `mksquashfs` (zstd, datas e donos fixos: reproduzível) e o runtime oficial em versão fixa, conferido por sha256. Dentro vai também o gerenciador, um app Qt com o próprio Qt (ver 38); se ele não abrir, o AppImage cai num menu do `kdialog`. No Docker o AppImage roda com `APPIMAGE_EXTRACT_AND_RUN=1` (sem FUSE); o teste troca o kdialog por um falso que registra cada janela.
31. **Desinstalar precisa descarregar o script.** Desativar no kwinrc + remover o pacote + `reconfigure` deixava o script rodando até o próximo login. O `uninstall.sh` chama `Scripting.unloadScript`.
32. **Janela do applet flutua.** O `plasmawindowed` é uma janela normal; sem regra, o kubik a colocava em tela cheia. A classe `plasmawindowed` entrou nas classes que sempre flutuam.
33. **Janela QML com a identidade do app.** No Wayland, o Qt monta o app_id com o domínio da organização + o nome do arquivo executável (o caminho real, não o `argv[0]`: `exec -a` não muda nada). No app próprio (38), `QGuiApplication::setDesktopFileName` faz o mesmo.
34. **Janela de tamanho fixo que muda de tamanho.** O sistema escreve em `width`/`height` ao configurar a janela, o que desfaz o binding: os limites (min = max) vêm de propriedades à parte e a altura é reaplicada quando o conteúdo muda. E uma mudança de tamanho logo depois de mapear às vezes se perdia (os botões ficavam fora da janela).
35. **`action` é propriedade FINAL do Button do QtQuick.Controls.** Declarar outra com esse nome impede o QML de carregar ("Cannot override FINAL property").
36. **Nada de `qml` no sistema do usuário.** No Fedora, o `qml` só vem com o `qt6-qtdeclarative-devel`: num desktop comum o gerenciador do 0.11.0 não abria e o AppImage caía no kdialog, que só instala. As imagens do testenv têm o `qml` (para as janelas de teste), por isso os testes passavam: ferramenta presente no testenv não prova que exista num Fedora KDE comum.
37. **O `plasmawindowed` não serve para um app.** (0.11.1) É instância única: um segundo `plasmawindowed <id>` só repassa o id ao processo que já roda, sem argumentos nem ambiente; mostra um plasmoide por vez (a janela é trocada) e ignora um plasmoide que já passou pelo processo. E a janela fica com o app_id e o ícone do `plasmawindowed`. No computador do usuário o AppImage 0.11.1 ainda caiu no kdialog, sem log para saber por quê.
38. **Gerenciador à prova de futuro: app próprio com o Qt dentro.** `kubik/manager` (C++ + QML) compila num Debian 13 (Qt 6.8 LTS, glibc 2.41) e o `scripts/manager-app.sh` junta o executável, as bibliotecas, os plugins (Wayland, xcb, SVG) e os módulos QML (só QtQuick, Controls com o Fusion, Layouts). Ficam de fora o que tem que ser do sistema: glibc, libstdc++, drivers de vídeo (GL/EGL/drm/gbm), Wayland/X11 e fontconfig/freetype. O executável tem DT_RPATH `$ORIGIN/../lib` (não RUNPATH: vale também para as dependências dos plugins) e um `qt.conf`; antes de iniciar o Qt, o app apaga `QT_PLUGIN_PATH`, `QT_QPA_PLATFORMTHEME` & cia. (plugins do Qt do sistema, de outra versão, não podem entrar), mas os comandos que roda recebem o ambiente original. O visual segue o usuário pelo `kdeglobals` (cores → `QPalette`, fonte, tema de ícones). Nada de Kirigami nem plasma5support. Se o app não abrir (saída ≠ 0), o AppImage cai num menu do kdialog com as mesmas ações, e o motivo fica em `~/.cache/kubik/appimage.log`. O AppImage (~40 MB, metade é o ICU) se guarda em `~/.local/share/kubik/Kubik.AppImage` ao instalar (cópia + `mv`: um AppImage aberto continua com o arquivo antigo), e a entrada do menu o abre; atualizar pelo GitHub baixa o AppImage do release.
39. **Ler a saída de ferramentas do KDE sempre com `LC_ALL=C`.** Em pt-BR, o `kpackagetool6 --show` escreve "Caminho" no lugar de "Path". O gerenciador da 0.12.0 nunca via o Kubik instalado (e a bandeja também não mostrava a versão), embora o `diagnose.sh` já soubesse disso. O Fedora do testenv só instalava traduções em en_US (`%_install_langs`); agora instala pt_BR e o `glibc-langpack-pt`, e o cenário do gerenciador roda em pt-BR. Também no `kdeglobals`: o `QSettings` trata o `[General]` do INI como a raiz (a chave é `font`, não `General/font`), e um Plasma com Qt mais novo grava a fonte com 19 campos, que o `QFont` do Qt 6.8 recusa. O app usa os 17 primeiros.
40. **Memória: medir o KWin e contar o que o Kubik guarda.** O script e o efeito rodam dentro do `kwin_wayland`, então o `test_kwin_memory` roda o mesmo cenário (ciclos de abrir 4 janelas, reorganizar pelos atalhos e fechar) num KWin com o Kubik e noutro sem, e compara a RSS. O Kubik custa ~5–12 MB, conforme a rodada, e não cresce com os ciclos. O próprio KWin cresce ~100 kB por ciclo, com ou sem o Kubik, e dois KWins variam centenas de kB por ciclo entre si: pela RSS só dá para pegar um vazamento grande. O teste exato é o `memoryCounts()` do controlador (janelas rastreadas, árvores, histórico de foco, monóculo, sinais), registrado pelo atalho "Kubik: Log state": antes e depois dos ciclos, tem que ser igual.
41. **O Fusion do QtQuick.Controls não herda a paleta do `QGuiApplication`.** O gerenciador lia as cores do `kdeglobals` e chamava `setPalette`, mas a janela continuava no Fusion claro (`#efefef`) num Plasma escuro. O `main.cpp` passa as cores ao QML (`kdeTheme.palette`), que as aplica na `palette` da janela. Isso só apareceu na vitrine (`scripts/showcase.sh`), que grava um Plasma de verdade em Breeze Dark; o teste do gerenciador agora usa um `kdeglobals` escuro e confere a cor no log.
42. **Vitrine (screenshots e GIFs do README e do site).** O testenv "showcase" é o Arch com Konsole, Dolphin, Kate, `plasma-integration` e o `kdeglobals` do Breeze Dark já na imagem (o KWin precisa iniciar escuro, senão as barras de abas do Kubik ficam claras). O cenário roda o `plasmashell` (papel de parede, painel e a bandeja com o Kubik) numa tela de 1600×1000. O `record.py` grava a tela pelo ScreenShot2, em JPEG a até 20 quadros por segundo: em PPM, a 33 por segundo, a gravação encheu o `/tmp` (tmpfs); por isso o trabalho fica em `~/.cache`. O `make_media.py` monta GIFs com uma paleta só por cena (o GIF guarda só o que muda: de 12 MB para 2 MB) e WebPs para o site, com a tecla de cada atalho escrita no quadro (fonte DejaVu: a Noto não tem setas). O `fastfetch` mostra só o desktop (sem CPU, GPU, IP ou kernel da máquina que grava), e o `htop` foi trocado por um `git log`, porque mostrava os processos do testenv.
43. **KWin antes do 6.8: os overlays do Kubik não podem entrar no próprio tiling.** (0.12.2) Relato de um Debian 13 (Plasma 6.3.6): o clique esquerdo parou de funcionar, a bandeja deu erro e as janelas se comportavam de forma estranha. Reproduzido no testenv do Debian com a 0.12.1: o Kubik punha a borda, a prévia e a fantasma no tiling, e elas, invisíveis e acima de tudo, ficavam com metade da tela. As janelas do usuário iam para um canto, e nenhum clique chegava aos apps (nem fora dos overlays). A regra "sem classe e fora do Alt+Tab" dependia do `skipSwitcher`, que o KWin só liga nas janelas internas a partir do 6.8 (commit `735645779`, setembro de 2026): **todo KWin anterior ao 6.8 tinha o bug**. O que as janelas internas têm em toda versão é `wantsInput` falso, e `isInternalWindow` (rules.ts) usa os dois critérios, no tiling e na borda. O `testenv/probe/dump.js` usa a mesma regra. Outras diferenças achadas no caminho:
    - `Qt.WindowTransparentForInput` só entra no `hitTest` do KWin a partir do 6.7; até o 6.6 vale a propriedade `outputOnly`, lida por nome, que os overlays agora também declaram. No 6.3 do testenv o clique atravessou a borda mesmo sem ela, então é só garantia.
    - O `DBus.SignalWatcher` da bandeja só existe no Plasma 6.4+, e um tipo desconhecido derruba o arquivo QML inteiro (a bandeja não aparecia). Ele fica em `ShortcutWatcher.qml`, carregado por um `Loader`: no 6.3 a bandeja só não acompanha o Meta+Y.
    - O Debian não instala o `curl`, só o `wget`: as atualizações (bandeja e gerenciador) caem para o `wget`. A imagem do Debian no testenv tem só o `wget`, para exercitar isso.
    - O kglobalaccel do 6.3 lista "sem tecla" como `[0]` (o 6.8 lista `[]`), e a moldura do Breeze tem 1-2 px de diferença.
    - Do testenv, não do Kubik: a libdrm do KWin 6.3 não reconhece o vgem do kernel 7 (`faux_driver`), então o KWin desenha com QPainter, sem screenshot. Com `KWIN_EFFECTS_FORCE_ANIMATIONS=1` sobre o QPainter, desmaximizar uma janela derruba o KWin (um efeito tenta criar textura OpenGL). Um KWin de verdade com QPainter não liga animações, e por isso o Debian roda sem forçá-las. O `screenshot.py` travava quando o `ScreenShot2` não existe (o `UnixFd` do D-Bus guarda uma cópia do pipe); a thread de leitura agora é daemon.

    O testenv ganhou o Debian 13 (`KUBIK_TESTENV=debian`), e o `test_kwin_click_through` confere que o clique chega ao app debaixo dos overlays, com o Kubik recarregado com as janelas já abertas, como ao instalar numa sessão em uso.
44. **O estado da bandeja era uma foto tirada uma vez só.** Relato na 0.12.2: o popup dizia "O script de tiling não está rodando" com o tiling funcionando. No log, a bandeja (recarregada pelo Plasma quando o `install.sh` trocou o pacote dela) leu o estado no meio da instalação: o script novo já estava instalado, mas descarregado (`unloadScript`, antes do `Scripting.start`), e o efeito ainda era o 0.12.1. Como ela só lia o estado ao carregar, o "parado" ficou. Agora relê ao abrir o popup e, enquanto o script estiver instalado e parado, a cada 5 s, registrando no log só quando o estado muda. No caminho apareceu outro bug: o `exec` guardava **um** callback por comando, então a segunda leitura do estado, igual à primeira, apagava o callback que buscava versão nova. Agora o mesmo comando em andamento só ganha mais um callback na fila. O `tray-update.sh` abre a bandeja com o script descarregado e confere que ela percebe a volta dele.
45. **O plasmashell também guarda o QML em memória pela URL.** (0.12.4) A 0.12.3 não resolveu o aviso no Fedora: o log mostrava uma única leitura do estado depois da atualização, e o código novo leria de novo a cada 5 s. Reproduzido no testenv com um `plasmashell` de verdade: depois do `kpackagetool6 -u`, ele recria o applet (o log volta a aparecer, já com a versão nova do `metadata.json`), mas com o `main.qml` e o `logic.js` antigos. A mesma solução do script (Lição 5): o `main.qml` da bandeja é uma casca fixa (`PlasmoidItem`) que carrega o `Tray.qml` por uma URL única, com a lógica embutida (gerado de `src/qml/Tray.qml` pelo `embed.mjs`). As representações, o tooltip e as ações ficam no `Tray.qml`, e a casca as liga ao `PlasmoidItem`. Cuidado: o Plasma cria as representações no contexto do `main.qml`, onde os ids do `Tray.qml` não existem. Por isso cada uma tem `property var root: shell.impl`. A primeira atualização para a 0.12.4 ainda roda o `main.qml` antigo, então o aviso só some depois de reiniciar a sessão (ou o plasmashell); dali em diante, não. As páginas de "Configurar…" continuam com o cache: depois de atualizar, mostram a versão anterior até reiniciar o plasmashell. O `test_kwin_tray.TrayReloadTest` atualiza a bandeja com o plasmashell rodando e confere que o código novo roda.
46. **Atalhos do tiling na bandeja.** (0.12.4) Os atalhos já eram do kglobalaccel (componente `kwin`, um `ShortcutHandler` por ação), mas ficavam perdidos no meio das ações do KWin. A página Configurar… › Atalhos do tiling (`ConfigShortcuts.qml`) lê e grava direto no kglobalaccel pelo D-Bus (`shortcut` e `setForeignShortcut`, com a tecla como inteiro do Qt). O KWin aplica na hora, e as Configurações do Sistema mostram o mesmo. O `KeySequenceItem` (org.kde.kquickcontrols) grava a tecla e avisa de conflito com outro atalho global. O texto da tecla vem como `String(keySequence)` no formato portável, e `keycodes.ts` converte para inteiro e de volta. Atribuir texto ao `keySequence` só funciona em JavaScript: numa declaração, o Qt 6.8 recusa ("unsupported type QKeySequence"). O Plasma já tem uma categoria "Keyboard Shortcuts" em toda configuração de applet (o atalho para abri-lo), por isso a nossa se chama "Atalhos do tiling". O `install.sh` passou a respeitar o usuário: libera as teclas do KDE só na primeira instalação (sem backup) e não devolve a tecla padrão às ações listadas em `CustomShortcuts` no kwinrc, que a página grava (antes, numa atualização, uma tecla apagada de propósito voltava). Testes: o `tray.sh` grava Meta+H no liga/desliga, aperta Meta+H de verdade (o tiling muda) e volta ao padrão; o `install-bundle.sh` personaliza teclas e confere que a atualização as mantém.
47. **KWin antes do 6.8: os overlays do Kubik apareciam na Visão geral.** (0.12.4) Relato de um Debian 13 (6.3): a Visão geral mostrava janelas vazias, com o ícone do Kubik, e cada área de trabalho nova repetia as mesmas, porque os overlays estão em todas. A Visão geral só esconde janelas com `skipSwitcher` (`WindowHeapDelegate.qml`), que o KWin só liga nas janelas internas a partir do 6.8 (a mesma raiz da Lição 43). Os overlays do Kubik.qml têm o título `kubik-overlay`, e o controlador (`isOwnOverlay` em rules.ts: o título mais as regras de janela interna) liga `skipSwitcher`, `skipPager` e `skipTaskbar` neles ao vê-los. Overlays de outros scripts e apps com o mesmo título não são tocados. O testenv do Debian não roda a Visão geral (sem OpenGL); o `click-through.sh` cria uma área de trabalho e confere as três marcas em todos os overlays, e sem a correção o teste falha.
48. **Programas que mudam de distro: tudo pelo `sys.sh`.** (0.13.0) O cliente de D-Bus e o de download variam: o Fedora pode vir sem o `dbus-send` (pacote `dbus-tools`), o Debian não instala o `gdbus` nem o `curl`. O `scripts/sys.sh` (POSIX) tenta `dbus-send`, `gdbus` e `qdbus6`/`qdbus-qt6`/`qdbus`, nessa ordem, e `curl`, `wget` e `wget2`, e devolve sempre o mesmo formato. O `qdbus` não manda listas como argumento, então serve para o estado, mas não para os atalhos. A bandeja leva uma cópia em `contents/code/sys.sh`, porque pode ser instalada sozinha, e o `.tar.gz` leva outra. Faltando o programa, o `sys.sh tools` dá o comando de instalação da distro (pelo `/etc/os-release`), e a bandeja mostra um aviso com ele em vez de "script parado". Os instaladores (`install.sh`, `uninstall.sh`, `shortcuts.sh`, AppRun), o `diagnose.sh` (que ganhou a seção "programas") e o gerenciador também passam por ele. Sem cliente de D-Bus, o `install.sh` para com a dica. Só com o `qdbus` (Debian sem `dbus-send`), instala, mas avisa que não ajustou os atalhos. O `uninstall.sh`, rodando da cópia guardada em `~/.local/share/kubik`, chama o KWin antes de apagar a pasta (o `sys.sh` mora nela). `KUBIK_SYS_DISABLE` finge a falta nos testes: `test_sys.py` usa programas falsos, `test_kwin_sys.py` compara os backends de verdade num KWin real, e `TrayMissingToolsTest` abre a bandeja sem o `dbus-send` (segue pelo `gdbus` no Arch e pelo `qdbus6` no Debian) e sem nenhum cliente (aparece o aviso). O `InstallWithoutDbusSendTest` instala e desinstala sem o `dbus-send`, e o gerenciador (AppImage) mostra os avisos já antes de instalar.

    Quem traz cada programa numa instalação KDE comum (consultado nos repositórios em 13/11/2026):

    | | Arch | Debian 13 | Fedora 44 |
    |---|---|---|---|
    | `dbus-send` | `dbus`, exigido por vários pacotes do sistema | `dbus-bin`, exigido pelo `dbus` | `dbus-tools`, exigido pelo `dbus-daemon`; no grupo KDE |
    | `qdbus6` | `qt6-tools`, exigido pelo `plasma-workspace` | `qdbus-qt6`, exigido pelo `plasma-workspace` | `qdbus-qt6` (binário `qdbus-qt6`); no grupo KDE |
    | `gdbus` | `glib2` (em todo lugar) | `libglib2.0-bin`: o KDE **não** instala | `glib2` (em todo lugar) |
    | download | `curl` (exigido pelo pacman) | só `wget` | `curl` e `wget2` |

## Riscos

- **Overlays QML num KWin Script** (borda ativa e barra de abas): ficam acima das janelas certas? Seguem a geometria sem atraso? Recebem clique sem roubar o foco? **Validado** no `testenv/`: a borda e a barra de abas aparecem e acompanham o foco. Ainda falta validar numa sessão real o clique na aba sem roubar o foco e a sobreposição com outras janelas.
