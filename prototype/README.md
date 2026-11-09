# Protótipo: overlays QML no KWin

Este protótipo é **descartável**. Ele existe para responder ao maior risco técnico do kubik (ver `docs/DESIGN.md`): um KWin Script consegue desenhar a borda ativa e a barra de abas do stacking de forma aceitável?

## Instalar e ativar

```sh
kpackagetool6 --type=KWin/Script -i prototype/overlay      # use -u para atualizar
kwriteconfig6 --file kwinrc --group Plugins --key kubikoverlayprotoEnabled true
qdbus6 org.kde.KWin /KWin reconfigure
```

Para ver os logs: `journalctl --user -f | grep kubik-proto`

Para testar com segurança, use uma sessão aninhada: `dbus-run-session kwin_wayland --windowed konsole`

Para remover:

```sh
kpackagetool6 --type=KWin/Script -r kubikoverlayproto
```

## Atalhos

| Atalho | Ação |
|---|---|
| Meta+Ctrl+S | empilha a próxima janela sobre a focada |
| Meta+Ctrl+Tab | próxima aba da pilha |
| Meta+Ctrl+B | liga/desliga a borda |

## Checklist de validação

Anote ✅ ou ❌ e observações em cada item.

**Borda ativa**
1. A borda aparece ao redor da janela focada, com a cor de destaque do tema?
2. Ela troca de janela imediatamente ao mudar o foco (clique, Alt+Tab)?
3. Ao mover ou redimensionar a janela, a borda acompanha sem atraso visível?
4. A borda fica por cima de outras janelas que sobrepõem a focada? (É esperado que sim. Isso é aceitável em tiling?)
5. A borda some em tela cheia e com a janela minimizada?
6. A borda bloqueia cliques? Ela não deveria, porque é transparente para input.

**Barra de abas**
7. Meta+Ctrl+S empilha uma janela e a barra de abas aparece acima da pilha?
8. Clicar numa aba ativa a janela correta **sem** a barra roubar o foco?
9. Meta+Ctrl+Tab cicla entre as abas, e a aba destacada acompanha?
10. Fechar uma janela da pilha atualiza a barra? Com só uma janela restante, a barra some?

**Geral**
11. Comportamento em X11: o mesmo do Wayland?
12. Comportamento com dois monitores?
13. Apareceu algum erro no journal?
