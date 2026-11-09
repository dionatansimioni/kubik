/** KWin falso, só com o que o controlador usa (src/kwin/api.ts). */
import type { Rect } from "../src/core/rect";
import type { Host, KWinWindow, Output, Signal, VirtualDesktop, Workspace } from "../src/kwin/api";

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

let nextId = 1;

export class FakeWindow implements KWinWindow {
  readonly internalId = `{uuid-${nextId++}}`;
  resourceClass = "org.example.app";
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
    readonly caption: string,
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
  activeWindow: FakeWindow | null = null;
  readonly windowAdded = new FakeSignal<[KWinWindow]>();
  readonly windowRemoved = new FakeSignal<[KWinWindow]>();
  readonly windowActivated = new FakeSignal<[KWinWindow | null]>();

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
    this.activeWindow = w;
    this.windowActivated.emit(w);
  }
}

export const SCREEN_A: Output = { name: "DP-1" };
export const SCREEN_B: Output = { name: "HDMI-1" };
export const DESK_1: VirtualDesktop = { id: "desk-1" };
export const DESK_2: VirtualDesktop = { id: "desk-2" };

export function fakeHost(ws: FakeWorkspace) {
  const logs: string[] = [];
  const areas: Record<string, Rect> = {
    "DP-1": { x: 0, y: 0, width: 1280, height: 800 },
    "HDMI-1": { x: 1280, y: 0, width: 1000, height: 1000 },
  };
  const host: Host = {
    workspace: ws,
    clientArea: (o) => areas[o.name],
    log: (m) => logs.push(m),
  };
  return { host, logs };
}
