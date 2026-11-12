# kubik

Auto-tiling no estilo Pop!_Shell para KDE Plasma 6. O design está em `docs/DESIGN.md`.

## Estrutura

- `kubik/`: o script principal (TypeScript → bundle embutido em QML), o efeito de animação (`kubik/effect`) e o ícone da bandeja (`kubik/tray`, plasmoid). Ver `kubik/README.md`.
- `prototype/overlay/`: protótipo dos overlays (borda e abas), referência para a borda ativa e o stacking.
- `testenv/`: KWin real headless (Arch e Fedora 44) para os testes de integração.
- `scripts/`: `build.py` (artefatos), `release.sh` (publica), `node.sh` (Node em container), `install.sh`/`uninstall.sh`.
- `site/`: o site (GitHub Pages, `.github/workflows/pages.yml`). O botão de download busca o release mais novo na API do GitHub (`site/download.js`). As imagens (`site/images/`, usadas também nos READMEs) saem de `scripts/showcase.sh`: rode de novo quando a interface mudar.

## Regras de trabalho

- **Git:** versionamento local. Cada commit tem uma mensagem descritiva explicando o quê e por quê.
- **Testes:** rode `python3 -m unittest discover -s tests -v` (e, quando existir, a suíte Vitest do núcleo TS) após **toda** modificação. Se algo falhar, analise o bug, corrija e rode de novo até tudo passar, antes de commitar.
- **Novo recurso testável = novo teste**, no mesmo commit.
- `qmllint` fica em `/usr/lib/qt6/bin/qmllint`.
- **KWin real para testes:** `testenv/` roda o KWin 6 do Arch headless num container (ver `testenv/README.md`). Todo comportamento visível (overlays, geometria, atalhos) ganha um cenário em `tests/scenarios/` e um teste em `tests/test_kwin_*.py` que confere o log e os pixels. **Nunca publique uma versão sem rodá-la no testenv.**
- Armadilhas já encontradas (ver `docs/DESIGN.md` › Lições): `org.kde.kwin` sempre com namespace; overlays criados com `createObject(null)` e destruídos em `onDestruction`; geometria no Wayland é assíncrona; `main.qml` é só um carregador com URL única (cache do KWin).
- O testenv tem duas distros: `KUBIK_TESTENV=arch` (padrão) e `KUBIK_TESTENV=fedora` (Fedora 44, a do usuário). O `release.sh` roda os testes do KWin nas duas.
- **Versões de teste:** aumente `KPlugin.Version` no `metadata.json`, commite e rode `scripts/release.sh`. Ele roda os testes, gera o `.kwinscript` e o `.tar.gz` (`scripts/build.py`), cria a tag `<Id>-v<versão>` e publica uma pré-release no repositório privado `dionatansimioni/kubik`.
- **Node:** sempre via `scripts/node.sh <dir> <cmd>`. Nada de Node no host.
- **Vitest fica na v3:** a CPU virtual deste servidor (QEMU, sem AVX) derruba o Vitest 5 com *Illegal instruction* (binário nativo do rolldown).
- **O KWin falso (`kubik/test/fake-kwin.ts`) tem que imitar a ordem real de sinais do KWin.** Quando o testenv revelar uma diferença, corrija o falso primeiro (teste vermelho) e depois o código.
- Idioma: interface em en/pt-BR. A documentação do projeto é em pt-BR.
