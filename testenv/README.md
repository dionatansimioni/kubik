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
   - `mark <fase>` escreve uma marca no log.
3. Salva em `<saída>/`:
   - `kwin.log`, o log completo do KWin, incluindo `console.*` dos scripts;
   - `<nome>.png` (para olhar) e `<nome>.ppm` (para os testes lerem sem Pillow).

Os testes de integração (`tests/test_kwin_*.py`) usam esse fluxo e verificam o log e os pixels dos screenshots.

## Distros

- `KUBIK_TESTENV=arch` (padrão): `testenv/Dockerfile`.
- `KUBIK_TESTENV=fedora`: Fedora 44, a distro do usuário, em `testenv/fedora/Dockerfile`. Também tem KWin 6.8.2, mas com Qt 6.11.

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
| `KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1` | Libera a API D-Bus `ScreenShot2` para o `screenshot.py`. |

## Limites

- A renderização é por software. Ela serve para validar o que aparece e onde, não desempenho ou animações.
- Só Wayland, com uma tela virtual de 1280×800 e um único monitor.
- A cor de destaque é a padrão do Breeze (`#3daee9`), não a do tema do usuário.
