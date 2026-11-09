# kubik

Auto-tiling no estilo Pop!_Shell para KDE Plasma 6. O design está em `docs/DESIGN.md`.

## Regras de trabalho

- **Git:** versionamento local. Cada commit tem uma mensagem descritiva explicando o quê e por quê.
- **Testes:** rode `python3 -m unittest discover -s tests -v` (e, quando existir, a suíte Vitest do núcleo TS) após **toda** modificação. Se algo falhar, analise o bug, corrija e rode de novo até tudo passar, antes de commitar.
- **Novo recurso testável = novo teste**, no mesmo commit.
- `qmllint` fica em `/usr/lib/qt6/bin/qmllint`.
- **KWin real para testes:** `testenv/` roda o KWin 6 do Arch headless num container (ver `testenv/README.md`). Todo comportamento visível (overlays, geometria, atalhos) ganha um cenário em `tests/scenarios/` e um teste em `tests/test_kwin_*.py` que confere o log e os pixels. **Nunca publique uma versão sem rodá-la no testenv.**
- Armadilhas já encontradas (ver `docs/DESIGN.md` › Lições): `org.kde.kwin` sempre com namespace; overlays criados com `createObject(null)`; geometria no Wayland é assíncrona.
- **Versões de teste:** aumente `KPlugin.Version` no `metadata.json`, commite e rode `scripts/release.sh`. Ele roda os testes, gera o `.kwinscript` e o `.tar.gz` (`scripts/build.py`), cria a tag `<Id>-v<versão>` e publica uma pré-release no repositório privado `dionatansimioni/kubik`.
- Idioma: interface em en/pt-BR. A documentação do projeto é em pt-BR.
