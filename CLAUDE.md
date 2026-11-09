# kubik

Auto-tiling no estilo Pop!_Shell para KDE Plasma 6. O design está em `docs/DESIGN.md`.

## Regras de trabalho

- **Git:** versionamento local. Cada commit tem uma mensagem descritiva explicando o quê e por quê.
- **Testes:** rode `python3 -m unittest discover -s tests -v` (e, quando existir, a suíte Vitest do núcleo TS) após **toda** modificação. Se algo falhar, analise o bug, corrija e rode de novo até tudo passar, antes de commitar.
- **Novo recurso testável = novo teste**, no mesmo commit.
- `qmllint` fica em `/usr/lib/qt6/bin/qmllint`. O KWin não está disponível neste ambiente, então os testes de integração são manuais (`prototype/README.md`).
- Idioma: interface em en/pt-BR. A documentação do projeto é em pt-BR.
