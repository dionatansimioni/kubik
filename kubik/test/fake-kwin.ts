/** KWin falso, só com o que o controlador usa (src/kwin/api.ts). */
import type { Rect } from "../src/core/rect";
import type { Host, KWinWindow, Output, Signal, TabBar, VirtualDesktop, Workspace } from "../src/kwin/api";

export class FakeSignal<Args extends unknown[] = []> implements Signal<Args> {
  private handlers: Array<(...a: Args) => void> = [];
  connect(h: (...a: Args) => void): void {
    this.handlers.push(h);
  }
  disconnect(h: (...a: Args) => void): void {
    this.handlers = this.handlers.filter((x) => x !== h);
  }
  emit(...a: Args): void {
    for (const h of [...this.handlers]) h(...a);
  }
  get count(): number {
    return this.handlers.length;
  }
}

export const SCREEN_A: Output = { name: "DP-1" };
export const SCREEN_B: Output = { name: "HDMI-1" };
export const DESK_1: VirtualDesktop = { id: "desk-1" };
export const DESK_2: VirtualDesktop = { id: "desk-2" };

let nextId = 1;

export class FakeWindow implements KWinWindow {
  readonly internalId = `{uuid-${nextId++}}`;
  resourceClass = "org.example.app";
  desktopFileName = "";
  normalWindow = true;
  dialog = false;
  splash = false;
  utility = false;
  specialWindow = false;
  transient = false;
  resizeable = true;
  minSize = { width: 0, height: 0 };
  maxSize = { width: 0, height: 0 };
  onAllDesktops = false;
  skipSwitcher = false;
  /** false nas janelas internas do KWin (overlays de scripts). */
  wantsInput = true;
  skipTaskbar = false;
  skipPager = false;
  opacity = 1;
  maximizeMode = 0;
  /** Como o KWin: 1 = vertical, 2 = horizontal, 3 = as duas. */
  setMaximize(vertically: boolean, horizontally: boolean): void {
    this.maximizeMode = (vertically ? 1 : 0) | (horizontally ? 2 : 0);
    this.maximizedChanged.emit();
  }
  readonly maximizedChanged = new FakeSignal();
  readonly captionChanged = new FakeSignal();
  /** QIcon no KWin; o controlador só repassa ao QML. */
  icon: unknown = "icone-falso";
  /** O app muda o título (ex.: o navegador trocou de página). */
  retitle(c: string): void {
    this.caption = c;
    this.captionChanged.emit();
  }
  readonly frameGeometryChanged = new FakeSignal();
  /** Tamanho da decoração (barra de título etc.); 0 = sem decoração. */
  decoration = { width: 0, height: 0 };
  move = false;
  resize = false;
  readonly interactiveMoveResizeStarted = new FakeSignal();
  readonly interactiveMoveResizeStepped = new FakeSignal<[Rect]>();
  readonly interactiveMoveResizeFinished = new FakeSignal();
  readonly minimizedChanged = new FakeSignal();
  readonly fullScreenChanged = new FakeSignal();
  readonly desktopsChanged = new FakeSignal();
  readonly outputChanged = new FakeSignal();
  /** Histórico de geometrias aplicadas pelo controlador. */
  readonly applied: Rect[] = [];
  private geo: Rect;
  private _minimized = false;
  private _fullScreen = false;
  private _desktops: VirtualDesktop[];
  private _output: Output;

  constructor(
    public caption: string,
    output: Output,
    desktop: VirtualDesktop,
    geo: Rect = { x: 100, y: 100, width: 400, height: 300 },
  ) {
    this._output = output;
    this._desktops = [desktop];
    this.geo = geo;
  }

  get frameGeometry(): Rect {
    return this.geo;
  }
  set frameGeometry(r: Rect) {
    this.geo = r;
    this.applied.push(r);
    this.frameGeometryChanged.emit();
  }

  /** O PRÓPRIO APP muda a geometria (ex.: Chrome restaurando a sessão, X11). */
  appSets(r: Rect): void {
    this.geo = r;
    this.frameGeometryChanged.emit();
  }
  /**
   * Simula o usuário arrastando a janela (mode "move") ou uma borda dela
   * ("resize"), passando pelos retângulos `steps`. Como no KWin, o KWin
   * aplica cada passo à própria janela arrastada.
   */
  dragThrough(mode: "move" | "resize", steps: Rect[], ws?: FakeWorkspace, cursor?: { x: number; y: number }, output?: Output): void {
    this.move = mode === "move";
    this.resize = mode === "resize";
    this.interactiveMoveResizeStarted.emit();
    for (const r of steps) {
      this.geo = r;
      this.frameGeometryChanged.emit();
      if (ws && cursor) ws.cursorPos = cursor;
      if (output && output !== this._output) this.output = output;
      this.interactiveMoveResizeStepped.emit(r);
    }
    this.move = this.resize = false;
    this.interactiveMoveResizeFinished.emit();
  }

  /**
   * Como dragThrough("move"), mas SEGURA o cursor parado sobre o último ponto
   * por `holdMs` antes de soltar (os timers do host disparam nesse tempo).
   */
  dragAndHold(
    steps: Rect[], ws: FakeWorkspace, cursor: { x: number; y: number }, tick: (ms?: number) => void, holdMs: number,
    output?: Output,
  ): void {
    this.move = true;
    this.interactiveMoveResizeStarted.emit();
    for (const r of steps) {
      this.geo = r;
      this.frameGeometryChanged.emit();
      ws.cursorPos = cursor;
      if (output && output !== this._output) this.output = output;
      this.interactiveMoveResizeStepped.emit(r);
    }
    tick(holdMs);
    this.move = false;
    this.interactiveMoveResizeFinished.emit();
  }

  get clientGeometry(): Rect {
    const g = this.geo;
    return {
      x: g.x,
      y: g.y + this.decoration.height,
      width: g.width - this.decoration.width,
      height: g.height - this.decoration.height,
    };
  }

  get minimized(): boolean {
    return this._minimized;
  }
  set minimized(v: boolean) {
    this._minimized = v;
    this.minimizedChanged.emit();
  }
  get fullScreen(): boolean {
    return this._fullScreen;
  }
  set fullScreen(v: boolean) {
    this._fullScreen = v;
    this.fullScreenChanged.emit();
  }
  get desktops(): VirtualDesktop[] {
    return this._desktops;
  }
  set desktops(v: VirtualDesktop[]) {
    this._desktops = v;
    // Como no KWin 6: "em todos os desktops" = lista vazia.
    this.onAllDesktops = v.length === 0;
    this.desktopsChanged.emit();
  }
  get output(): Output {
    return this._output;
  }
  set output(v: Output) {
    this._output = v;
    this.outputChanged.emit();
  }
}

export class FakeWorkspace implements Workspace {
  stackingOrder: FakeWindow[] = [];
  private _active: FakeWindow | null = null;
  readonly screens = [SCREEN_A, SCREEN_B];
  /** Quick tiles pedidos ao KWin (janela, direção). */
  readonly quickTiles: Array<[string, string]> = [];
  slotWindowQuickTileLeft(): void {
    this.quickTiles.push([this.activeWindow?.caption ?? "", "left"]);
  }
  slotWindowQuickTileRight(): void {
    this.quickTiles.push([this.activeWindow?.caption ?? "", "right"]);
  }
  slotWindowQuickTileTop(): void {
    this.quickTiles.push([this.activeWindow?.caption ?? "", "up"]);
  }
  slotWindowQuickTileBottom(): void {
    this.quickTiles.push([this.activeWindow?.caption ?? "", "down"]);
  }
  /** Janelas que o controlador mandou para a frente (raiseWindow). */
  readonly raised: FakeWindow[] = [];
  /** Como no KWin: escrever ativa a janela (e emite windowActivated). */
  get activeWindow(): FakeWindow | null {
    return this._active;
  }
  set activeWindow(w: FakeWindow | null) {
    this.activate(w);
  }
  raiseWindow(w: KWinWindow): void {
    this.raised.push(w as FakeWindow);
  }
  cursorPos = { x: 0, y: 0 };
  readonly windowAdded = new FakeSignal<[KWinWindow]>();
  readonly windowRemoved = new FakeSignal<[KWinWindow]>();
  readonly windowActivated = new FakeSignal<[KWinWindow | null]>();
  currentDesktop: VirtualDesktop = DESK_1;
  readonly currentDesktopChanged = new FakeSignal();

  switchTo(d: VirtualDesktop): void {
    this.currentDesktop = d;
    this.currentDesktopChanged.emit();
  }

  /**
   * Abre a janela e a ativa na MESMA ORDEM do KWin 6 real (observada no
   * testenv): windowActivated chega ANTES de windowAdded.
   */
  open(w: FakeWindow): FakeWindow {
    this.stackingOrder.push(w);
    this.activate(w);
    this.windowAdded.emit(w);
    return w;
  }
  close(w: FakeWindow): void {
    this.stackingOrder = this.stackingOrder.filter((x) => x !== w);
    this.windowRemoved.emit(w);
  }
  activate(w: FakeWindow | null): void {
    this._active = w;
    this.windowActivated.emit(w);
  }
}


export function fakeHost(ws: FakeWorkspace) {
  const logs: string[] = [];
  const previews: Array<Rect | null> = [];
  const ghosts: Array<Rect | null> = [];
  const stackHints: boolean[] = [];
  const borders: Array<Rect | null> = [];
  const tabs: TabBar[][] = [];
  const timers: Array<{ ms: number; fn: () => void }> = [];
  const areas: Record<string, Rect> = {
    "DP-1": { x: 0, y: 0, width: 1280, height: 800 },
    "HDMI-1": { x: 1280, y: 0, width: 1000, height: 1000 },
  };
  const host: Host = {
    workspace: ws,
    clientArea: (o) => areas[o.name],
    log: (m) => logs.push(m),
    preview: (r, ghost = null, stack = false) => {
      previews.push(r);
      ghosts.push(ghost);
      stackHints.push(stack);
    },
    later: (ms, fn) => timers.push({ ms, fn }),
    border: (rect) => borders.push(rect),
    tabs: (bars) => tabs.push(bars),
  };
  /** Dispara os timers de até `upTo` ms (como se esse tempo tivesse passado). */
  const tick = (upTo = 1000) => {
    const due = timers.filter((t) => t.ms <= upTo);
    timers.splice(0, timers.length, ...timers.filter((t) => t.ms > upTo));
    for (const t of due) t.fn();
  };
  return { host, logs, previews, ghosts, stackHints, borders, tabs, tick };
}
