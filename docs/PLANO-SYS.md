# Plano: um auxiliar único para as ferramentas do sistema (`sys.sh`)

Objetivo: o Kubik depender menos do que muda de distro para distro. Hoje os
programas externos estão espalhados (bandeja, instaladores, AppImage) e, quando
um falta, a falha é silenciosa: sem o `dbus-send`, a bandeja diria "script
parado" sem motivo.

## O que muda entre distros

Levantamento (13/11/2026) do que o Kubik chama:

- **Sempre presentes com o Plasma:** `kreadconfig6`, `kwriteconfig6`, `kpackagetool6`.
- **POSIX, em todo Linux:** `sed`, `grep`, `awk`, `tar`, `mktemp`.
- **Variam:** o cliente de D-Bus e o de download. O `paste` (só na leitura de
  atalhos) sai.

Quem traz cada um numa instalação KDE comum (consultado nos repositórios de
cada distro, pelas imagens do testenv):

| | Arch | Debian 13 | Fedora 44 |
|---|---|---|---|
| `dbus-send` | `dbus`, exigido por vários pacotes do sistema | `dbus-bin`, exigido pelo `dbus` | `dbus-tools`, exigido pelo `dbus-daemon`; no grupo KDE |
| `qdbus6` | `qt6-tools`, exigido pelo `plasma-workspace` | `qdbus-qt6`, exigido pelo `plasma-workspace` | `qdbus-qt6` (binário `qdbus-qt6`); no grupo KDE |
| `gdbus` | `glib2` (em todo lugar) | `libglib2.0-bin`: o KDE **não** instala | `glib2` (em todo lugar) |
| download | `curl` (exigido pelo pacman) | só `wget` | `curl` e `wget2` |

O `qdbus` não manda listas como argumento (`as`, `ai`): serve para chamadas
simples (`isScriptLoaded`), não para gravar atalhos.

## Desenho

`scripts/sys.sh`: POSIX `sh` (chamado com `sh`, sem depender do bit de
execução), com saída sempre no mesmo formato, qualquer que seja o programa por
baixo:

- `sys.sh tools`: o que existe e o backend escolhido para D-Bus e download.
- `sys.sh dbus-bool <serviço> <caminho> <interface.método> <texto>`: imprime
  `true`/`false` (estado do script e do efeito). Backends: `dbus-send`,
  `gdbus`, `qdbus6`/`qdbus-qt6`/`qdbus`.
- `sys.sh dbus-call <serviço> <caminho> <interface.método> [<texto>…]`: chamada
  sem resposta (`reconfigure`, `unloadScript`, `start`).
- `sys.sh shortcut-get <ação>`: teclas da ação do KWin no kglobalaccel, como
  inteiros separados por vírgula. Backends: `dbus-send`, `gdbus`.
- `sys.sh shortcut-set <ação> <inteiro>[,<inteiro>…]` (0 = sem tecla).
- `sys.sh fetch <url> <saída|-> [<header>]`: `curl`, `wget`, `wget2`.

Sem nenhum backend: sai com o código 127 e escreve no stderr
`kubik-sys: falta <o quê>; instale: <comando>`, com o pacote da distro
(`/etc/os-release`: `ID`/`ID_LIKE`).

`KUBIK_SYS_DISABLE="dbus-send gdbus"`: finge que esses programas não existem
(para os testes).

O `build.py` coloca o mesmo arquivo no pacote da bandeja
(`contents/code/sys.sh`, que pode ser instalada sozinha) e no `.tar.gz`.

## Etapas (cada uma num commit, com teste)

1. **`sys.sh` e testes.** Testes de unidade em Python com programas falsos no
   PATH (saída e argumentos de cada backend, a mensagem quando falta tudo) e
   um teste no KWin real que compara os backends entre si (Arch, que tem os
   três; Debian, sem `gdbus`).
2. **Bandeja.** Estado, página de atalhos e download de versões pelo
   `sys.sh`. Faltando o programa, o popup avisa com o comando de instalação.
   Testenv com `KUBIK_SYS_DISABLE`: sem `dbus-send` funciona pelo `gdbus`;
   sem nenhum, aparece o aviso.
3. **Instaladores e diagnóstico.** `install.sh`, `uninstall.sh`,
   `shortcuts.sh` e AppRun pelo `sys.sh`; o `diagnose.sh` lista o que tem e o
   que falta. O `test_kwin_install` roda uma vez sem o `dbus-send`.
4. **Gerenciador (AppImage).** Os comandos do QProcess pelo mesmo `sys.sh`.

Versão: 0.13.0 (o comportamento visível muda).
