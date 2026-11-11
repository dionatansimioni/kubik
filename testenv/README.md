# testenv: KWin real, sem monitor

Ambiente fechado para testar os scripts do kubik num **KWin 6 real**, igual ao do Plasma do Arch (hoje 6.8.2). Ele roda dentro de um container, com `kwin_wayland --virtual`: não precisa de monitor nem de sessão gráfica.

```sh
testenv/run.sh <pacote> <cenário.sh> <saída>
# ex.: testenv/run.sh prototype/overlay tests/scenarios/overlay.sh /tmp/ov
```

1. Instala e ativa o pacote **antes** de o KWin iniciar.
2. Roda o cenário como sessão do KWin. O cenário usa `testenv/lib.sh`:
   - `open_window <título> [LxA]` abre uma janela de teste;
   - `screenshot <nome>` captura a tela;
   - `shortcut "<ação>"` dispara um atalho global;
   - `mark <fase>` escreve uma marca no log;
   - `dump_windows <tag>` imprime no log a geometria real das janelas (`WINDOW <tag> {json}`);
   - `close_window <título>` fecha uma janela de teste;
   - `drag X1 Y1 X2 Y2 [passos]` / `drag_and_shoot <nome> …` arrastam com o mouse simulado (`fakeinput.py`, protocolo `org_kde_kwin_fake_input`);
   - `kwin_eval '<js>'` executa JavaScript dentro do KWin (`win("<título>")` acha uma janela pelo título);
   - `open_app <comando>` abre um app real (as imagens têm o KCalc, que declara tamanho mínimo; janelas QML pelo runtime `qml` não repassam limites de tamanho ao KWin).
3. Salva em `<saída>/`:
   - `kwin.log`, o log completo do KWin, incluindo `console.*` dos scripts;
   - `<nome>.png` (para olhar) e `<nome>.ppm` (para os testes lerem sem Pillow).

Os testes de integração (`tests/test_kwin_*.py`) usam esse fluxo e verificam o log e os pixels dos screenshots.

## Distros

- `KUBIK_TESTENV=arch` (padrão): `testenv/Dockerfile`.
- Os dois têm XWayland (o KWin sobe com `--xwayland`), KCalc, Chromium e `xdotool`, para testar apps X11 e apps com barra de título própria.
- `KUBIK_TESTENV=fedora`: Fedora 44, a distro do usuário, em `testenv/fedora/Dockerfile`. Também tem KWin 6.8.2, mas com Qt 6.11.

`KUBIK_KWINRC="Grupo/Chave=Valor …"` aplica configuração no `kwinrc` antes de o KWin iniciar (ex.: duração do efeito).

`KUBIK_EXTRA_PKGS="prototype/overlay"` instala e ativa outros scripts junto, para testar a convivência.

O `run.sh` instala o `.kwinscript` gerado pelo `scripts/build.py`, ou seja, o mesmo arquivo que vai para o release.

## Requisitos do host

- `docker`. A imagem `kubik-testenv` é construída automaticamente a partir do `Dockerfile` na primeira execução.
- Módulo de kernel `vgem`, uma GPU virtual sem hardware. O `run.sh` faz `modprobe vgem` se precisar, e `rmmod vgem` desfaz.

## Por que cada ajuste existe

| Ajuste | Motivo |
|---|---|
| `setcap -r kwin_wayland` na imagem | O binário pede `cap_sys_nice`, que o Docker não concede: o exec falhava com *Operation not permitted*. |
| `vgem` exposto como `renderD128` **e** com o nome real | Sem um render node, o KWin cai para QPainter e trava no screenshot. O KWin procura o nó pelo sysfs do host, com o nome real, mas às vezes tenta o primeiro (`renderD128`). |
| `QT_QUICK_BACKEND=software` | As janelas QtQuick internas do KWin (nossos overlays) não conseguem alocar buffers OpenGL no vgem. |
| `QT_FORCE_STDERR_LOGGING=1` | Sem isso o Qt manda os logs para o journald, que não existe no container, e `console.log` some. |
| `KWIN_WAYLAND_NO_PERMISSION_CHECKS=1` | Libera o protocolo de entrada simulada (`org_kde_kwin_fake_input`) para o `fakeinput.py`. |
| `plasma-breeze` na imagem Fedora | Sem a decoração Breeze, as alças de redimensionar não se estendem para fora da janela, e o arrasto da divisa não pega. O Fedora KDE do usuário tem Breeze. |
| `plasma-workspace`, `plasma-desktop` e `plasma-sdk` na imagem Arch | O ícone da bandeja roda no `plasmoidviewer` (precisa da contêiner `org.kde.desktopcontainment` do plasma-desktop) e usa módulos QML do plasma-workspace (D-Bus, barra de tarefas). Só o Arch tem isso: o teste da bandeja é pulado no Fedora. |
| `KWIN_EFFECTS_FORCE_ANIMATIONS=1` | Com renderização por software (llvmpipe), o KWin desativa animações e nenhum efeito em JavaScript carrega. |
| `KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1` | Libera a API D-Bus `ScreenShot2` para o `screenshot.py`. |

## Limites

- A renderização é por software. Ela serve para validar o que aparece e onde, não desempenho ou animações.
- Só Wayland, com uma tela virtual de 1280×800 e um único monitor.
- A cor de destaque é a padrão do Breeze (`#3daee9`), não a do tema do usuário.
