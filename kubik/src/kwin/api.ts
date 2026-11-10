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
  /** Em todos os desktops (no KWin 6, `desktops` fica vazio). */
  readonly onAllDesktops: boolean;
  /** Fora do Alt+Tab. Junto com resourceClass vazio, indica janela interna do KWin. */
  readonly skipSwitcher: boolean;
  /** Fora da barra de tarefas. Junto com skipSwitcher: janela auxiliar oculta. */
  readonly skipTaskbar: boolean;
  /** 0 = invisível (ex.: xwaylandvideobridge). */
  readonly opacity: number;
  /** true enquanto o usuário move / redimensiona a janela com o mouse. */
  readonly move: boolean;
  readonly resize: boolean;
  /** Mínimo do CONTEÚDO (sem a decoração), como o app declara. */
  readonly minSize: Size;
  readonly maxSize: Size;
  readonly desktops: VirtualDesktop[];
  readonly output: Output;
  /** Escrever pede a mudança; no Wayland ela só assenta depois. */
  frameGeometry: Rect;
  /** Área do conteúdo (moldura sem a decoração). */
  readonly clientGeometry: Rect;

  readonly minimizedChanged: Signal;
  readonly fullScreenChanged: Signal;
  readonly desktopsChanged: Signal;
  readonly outputChanged: Signal;
  /** 0 = não maximizada (KWin: MaximizeRestore). */
  readonly maximizeMode: number;
  setMaximize(vertically: boolean, horizontally: boolean): void;
  readonly maximizedChanged: Signal;
  readonly captionChanged: Signal;
  /** Qualquer mudança de geometria: nossas, do usuário ou do próprio app. */
  readonly frameGeometryChanged: Signal;
  readonly interactiveMoveResizeStarted: Signal;
  /** Geometria que o usuário está arrastando (ainda não aplicada). */
  readonly interactiveMoveResizeStepped: Signal<[Rect]>;
  readonly interactiveMoveResizeFinished: Signal;
}

export interface Workspace {
  readonly stackingOrder: KWinWindow[];
  /** Escrever ativa a janela (e a traz para a frente). */
  activeWindow: KWinWindow | null;
  /** Traz para a frente sem ativar. */
  raiseWindow?(w: KWinWindow): void;
  readonly cursorPos: Point;
  readonly windowAdded: Signal<[KWinWindow]>;
  readonly windowRemoved: Signal<[KWinWindow]>;
  readonly windowActivated: Signal<[KWinWindow | null]>;
  /** Desktop visível; janelas "em todos os desktops" entram na árvore dele. */
  readonly currentDesktop: VirtualDesktop;
  readonly currentDesktopChanged: Signal;
}

/** Barra de abas de uma pilha, para o QML desenhar. */
export interface TabBar {
  rect: Rect;
  tabs: Array<{ id: string; caption: string; active: boolean }>;
}

/** O que o lado QML entrega ao controlador. */
export interface Host {
  readonly workspace: Workspace;
  /** Área útil (sem painéis) da tela × desktop. */
  clientArea(output: Output, desktop: VirtualDesktop): Rect;
  log(message: string): void;
  /** Agenda `fn` para daqui a `ms` milissegundos. */
  later(ms: number, fn: () => void): void;
  /**
   * Mostra (ou esconde, com null) a prévia de onde a janela arrastada vai
   * ficar. `ghost`: na troca, para onde vai a OUTRA janela (prévia mais clara).
   * `stack`: o drop empilha (a prévia ganha uma faixa de abas no topo).
   */
  preview(rect: Rect | null, ghost?: Rect | null, stack?: boolean): void;
  /**
   * Borda de destaque (cor de destaque do sistema) em `rect`, ou nenhuma.
   * `animate`: deslizar até lá (o layout mudou e o efeito anima a janela);
   * false: pular direto (foco mudou, arrasto com o mouse).
   */
  border(rect: Rect | null, animate: boolean): void;
  /** As barras de abas à vista agora (lista vazia: nenhuma). */
  tabs(bars: TabBar[]): void;
}
