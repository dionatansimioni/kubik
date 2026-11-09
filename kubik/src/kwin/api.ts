/**
 * O subconjunto da API de scripts do KWin 6 que o kubik usa.
 * Mantido mínimo de propósito: é o contrato entre o controlador e o KWin, e
 * o que os testes simulam (test/fake-kwin.ts).
 */
import type { Rect } from "../core/rect";
import type { Point } from "../core/tree";

export interface Signal<Args extends unknown[] = []> {
  connect(handler: (...args: Args) => void): void;
  disconnect(handler: (...args: Args) => void): void;
}

export interface Size {
  width: number;
  height: number;
}

export interface Output {
  readonly name: string;
}

export interface VirtualDesktop {
  readonly id: string;
}

export interface KWinWindow {
  /** QUuid no KWin; usar sempre String(internalId). */
  readonly internalId: unknown;
  readonly caption: string;
  readonly resourceClass: string;
  readonly normalWindow: boolean;
  readonly dialog: boolean;
  readonly splash: boolean;
  readonly utility: boolean;
  readonly specialWindow: boolean;
  readonly transient: boolean;
  readonly resizeable: boolean;
  readonly minimized: boolean;
  readonly fullScreen: boolean;
  readonly onAllDesktops: boolean;
  /** Fora do Alt+Tab. Junto com resourceClass vazio, indica janela interna do KWin. */
  readonly skipSwitcher: boolean;
  /** true enquanto o usuário move / redimensiona a janela com o mouse. */
  readonly move: boolean;
  readonly resize: boolean;
  readonly minSize: Size;
  readonly maxSize: Size;
  readonly desktops: VirtualDesktop[];
  readonly output: Output;
  /** Escrever pede a mudança; no Wayland ela só assenta depois. */
  frameGeometry: Rect;

  readonly minimizedChanged: Signal;
  readonly fullScreenChanged: Signal;
  readonly desktopsChanged: Signal;
  readonly outputChanged: Signal;
  readonly interactiveMoveResizeStarted: Signal;
  /** Geometria que o usuário está arrastando (ainda não aplicada). */
  readonly interactiveMoveResizeStepped: Signal<[Rect]>;
  readonly interactiveMoveResizeFinished: Signal;
}

export interface Workspace {
  readonly stackingOrder: KWinWindow[];
  readonly activeWindow: KWinWindow | null;
  readonly cursorPos: Point;
  readonly windowAdded: Signal<[KWinWindow]>;
  readonly windowRemoved: Signal<[KWinWindow]>;
  readonly windowActivated: Signal<[KWinWindow | null]>;
}

/** O que o lado QML entrega ao controlador. */
export interface Host {
  readonly workspace: Workspace;
  /** Área útil (sem painéis) da tela × desktop. */
  clientArea(output: Output, desktop: VirtualDesktop): Rect;
  log(message: string): void;
  /** Mostra (ou esconde, com null) a prévia de onde a janela arrastada vai entrar. */
  preview(rect: Rect | null): void;
}
