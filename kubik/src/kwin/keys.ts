/**
 * Atalhos de teclado do kubik (estilo Pop!_Shell). O Kubik.qml registra um
 * KWin.ShortcutHandler por ação; o install.sh libera as teclas que o KDE usa
 * por padrão (quick tile, mandar para outra tela, trocar de janela por
 * direção) e as atribui a estas ações. A tabela do install.sh tem que bater
 * com esta (tests/test_build.py confere).
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

const ARROW: Record<Direction, string> = { left: "Left", right: "Right", up: "Up", down: "Down" };
const WORD: Record<Direction, string> = { left: "à esquerda", right: "à direita", up: "acima", down: "abaixo" };
const DIRS: Direction[] = ["left", "right", "up", "down"];
const cap = (d: Direction) => ARROW[d];

export const KEY_BINDINGS: KeyBinding[] = [
  ...DIRS.map((dir) => ({
    name: `Kubik: Focus ${cap(dir)}`,
    text: `Kubik: focar a janela ${WORD[dir]}`,
    sequence: `Meta+${ARROW[dir]}`,
    action: { kind: "focus" as const, dir },
  })),
  ...DIRS.map((dir) => ({
    name: `Kubik: Move ${cap(dir)}`,
    text: `Kubik: mover a janela para ${dir === "up" ? "cima" : dir === "down" ? "baixo" : WORD[dir].replace("à ", "a ")}`,
    sequence: `Meta+Shift+${ARROW[dir]}`,
    action: { kind: "move" as const, dir },
  })),
  ...DIRS.map((dir) => ({
    name: `Kubik: Resize ${cap(dir)}`,
    text: `Kubik: mover a divisa da janela para ${dir === "up" ? "cima" : dir === "down" ? "baixo" : WORD[dir].replace("à ", "a ")}`,
    sequence: `Meta+Alt+${ARROW[dir]}`,
    action: { kind: "resize" as const, dir },
  })),
  { name: "Kubik: Rotate split", text: "Kubik: girar a divisão (lado a lado ↔ um sobre o outro)", sequence: "Meta+O", action: { kind: "rotate" } },
  { name: "Kubik: Toggle floating", text: "Kubik: flutuar/voltar ao tiling (janela em foco)", sequence: "Meta+F", action: { kind: "float" } },
  { name: "Kubik: Toggle monocle", text: "Kubik: monocle (janelas em tela inteira)", sequence: "Meta+M", action: { kind: "monocle" } },
];
