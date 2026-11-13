/**
 * Atalhos de teclado do kubik (estilo Pop!_Shell). O Kubik.qml registra um
 * KWin.ShortcutHandler por ação; o install.sh libera as teclas que o KDE usa
 * por padrão (quick tile, mandar para outra tela, trocar de janela por
 * direção) e as atribui a estas ações. A tabela do install.sh tem que bater
 * com esta (tests/test_build.py confere).
 *
 * O texto (o que aparece em Configurações › Atalhos) segue o idioma do
 * sistema: português ou inglês. O `name` nunca é traduzido: é a chave.
 */
import type { Direction } from "../core/direction";

export type KeyAction =
  | { kind: "focus" | "move" | "resize"; dir: Direction }
  | { kind: "rotate" | "float" | "monocle" };

export interface KeyBinding {
  /** Nome da ação no kglobalaccel (não traduzir: é a chave da configuração). */
  name: string;
  text: string;
  sequence: string;
  action: KeyAction;
}

export type Lang = "en" | "pt";

/** "pt_BR", "pt-BR", "pt" → português; o resto, inglês. */
export function langOf(locale: string | null | undefined): Lang {
  return /^pt([_-]|$)/i.test(String(locale ?? "")) ? "pt" : "en";
}

const ARROW: Record<Direction, string> = { left: "Left", right: "Right", up: "Up", down: "Down" };
const DIRS: Direction[] = ["left", "right", "up", "down"];

const TEXT: Record<Lang, Record<string, (d?: Direction) => string>> = {
  en: {
    focus: (d) => `Kubik: focus the window ${{ left: "to the left", right: "to the right", up: "above", down: "below" }[d!]}`,
    move: (d) => `Kubik: move the window ${{ left: "left", right: "right", up: "up", down: "down" }[d!]}`,
    resize: (d) => `Kubik: move the window's border ${{ left: "left", right: "right", up: "up", down: "down" }[d!]}`,
    rotate: () => "Kubik: rotate the split (side by side ↔ stacked)",
    float: () => "Kubik: float / tile the focused window",
    monocle: () => "Kubik: monocle (windows fill the screen)",
    toggle: () => "Kubik: toggle tiling",
    nextTab: () => "Kubik: next tab in the stack",
    prevTab: () => "Kubik: previous tab in the stack",
    logState: () => "Kubik: log the state (diagnostics)",
  },
  pt: {
    focus: (d) => `Kubik: focar a janela ${{ left: "à esquerda", right: "à direita", up: "acima", down: "abaixo" }[d!]}`,
    move: (d) => `Kubik: mover a janela para ${{ left: "a esquerda", right: "a direita", up: "cima", down: "baixo" }[d!]}`,
    resize: (d) => `Kubik: mover a divisa da janela para ${{ left: "a esquerda", right: "a direita", up: "cima", down: "baixo" }[d!]}`,
    rotate: () => "Kubik: girar a divisão (lado a lado ↔ um sobre o outro)",
    float: () => "Kubik: flutuar/voltar ao tiling (janela em foco)",
    monocle: () => "Kubik: monocle (janelas em tela inteira)",
    toggle: () => "Kubik: liga/desliga o tiling",
    nextTab: () => "Kubik: próxima aba da pilha",
    prevTab: () => "Kubik: aba anterior da pilha",
    logState: () => "Kubik: registra o estado no log (diagnóstico)",
  },
};

/** Texto de um atalho fixo do Kubik.qml (toggle, abas, log) no idioma dado. */
export function shortcutText(lang: Lang, key: "toggle" | "nextTab" | "prevTab" | "logState"): string {
  return TEXT[lang][key]();
}

export function keyBindings(lang: Lang = "en"): KeyBinding[] {
  const t = TEXT[lang];
  return [
    ...DIRS.map((dir) => ({
      name: `Kubik: Focus ${ARROW[dir]}`,
      text: t.focus(dir),
      sequence: `Meta+${ARROW[dir]}`,
      action: { kind: "focus" as const, dir },
    })),
    ...DIRS.map((dir) => ({
      name: `Kubik: Move ${ARROW[dir]}`,
      text: t.move(dir),
      sequence: `Meta+Shift+${ARROW[dir]}`,
      action: { kind: "move" as const, dir },
    })),
    ...DIRS.map((dir) => ({
      name: `Kubik: Resize ${ARROW[dir]}`,
      text: t.resize(dir),
      sequence: `Meta+Alt+${ARROW[dir]}`,
      action: { kind: "resize" as const, dir },
    })),
    { name: "Kubik: Rotate split", text: t.rotate(), sequence: "Meta+O", action: { kind: "rotate" } },
    { name: "Kubik: Toggle floating", text: t.float(), sequence: "Meta+F", action: { kind: "float" } },
    { name: "Kubik: Toggle monocle", text: t.monocle(), sequence: "Meta+M", action: { kind: "monocle" } },
  ];
}

/** Os atalhos fixos do Kubik.qml (fora da tabela acima), com a tecla padrão. */
export const FIXED_SHORTCUTS = [
  { name: "Kubik: Toggle tiling", key: "toggle", sequence: "Meta+Y" },
  { name: "Kubik: Next tab", key: "nextTab", sequence: "Meta+Ctrl+Tab" },
  { name: "Kubik: Previous tab", key: "prevTab", sequence: "Meta+Ctrl+Shift+Tab" },
] as const;

/** Todos os atalhos que o usuário pode mudar (o "Log state", de diagnóstico, fica de fora). */
export function allShortcuts(lang: Lang = "en"): Array<{ name: string; text: string; sequence: string }> {
  const fixed = FIXED_SHORTCUTS.map((f) => ({ name: f.name, text: shortcutText(lang, f.key), sequence: f.sequence }));
  return [fixed[0], ...keyBindings(lang).map(({ name, text, sequence }) => ({ name, text, sequence })), fixed[1], fixed[2]];
}
