import { type Rect, inset } from "../core/rect";
import { type Gaps, Tree } from "../core/tree";
import type { Host, KWinWindow, Output, VirtualDesktop } from "./api";

/** Janela sendo arrastada com o mouse. */
interface Drag {
  id: string;
  mode: "move" | "resize";
}

/** Onde a janela arrastada vai entrar se for solta agora. */
interface DropTarget {
  key: string;
  place: Place;
  /** Janela sob o cursor (null: árvore vazia naquela tela). */
  id: string | null;
  rect: Rect;
}
import { DEFAULT_FLOATING_CLASSES, floatReason } from "./rules";

export interface Config {
  gaps: Gaps;
  floatingClasses: readonly string[];
}

export const DEFAULT_CONFIG: Config = {
  gaps: { outer: 4, inner: 4 },
  floatingClasses: DEFAULT_FLOATING_CLASSES,
};

interface Tracked {
  window: KWinWindow;
  /** Chave da árvore onde a janela está, ou null se flutuante. */
  key: string | null;
  /** Geometria antes do tiling, restaurada ao desligar. */
  saved: Rect | null;
  disconnect: () => void;
}

interface Place {
  output: Output;
  desktop: VirtualDesktop;
}

function idOf(w: KWinWindow): string {
  return String(w.internalId);
}

function keyOf(p: Place): string {
  return `${p.output.name}|${p.desktop.id}`;
}

function copy(r: Rect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/**
 * Liga a árvore BSP ao KWin: uma árvore por tela × desktop virtual.
 * Reage a janelas abrindo, fechando, minimizando e mudando de tela/desktop,
 * e aplica a geometria calculada pela árvore.
 */
export class Controller {
  private readonly trees = new Map<string, Tree>();
  private readonly places = new Map<string, Place>();
  private readonly tracked = new Map<string, Tracked>();
  /**
   * Ids ativados, do mais recente para o mais antigo. Inclui janelas ainda
   * não conhecidas: no KWin real, windowActivated chega ANTES de windowAdded.
   */
  private focusHistory: string[] = [];
  private enabled = true;
  private drag: Drag | null = null;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly host: Host,
    private readonly config: Config = DEFAULT_CONFIG,
  ) {}

  get isEnabled(): boolean {
    return this.enabled;
  }

  start(): void {
    const ws = this.host.workspace;
    const onAdded = (w: KWinWindow) => this.track(w);
    const onRemoved = (w: KWinWindow) => this.untrack(w);
    const onActivated = (w: KWinWindow | null) => {
      if (w) this.noteFocus(idOf(w));
    };
    ws.windowAdded.connect(onAdded);
    ws.windowRemoved.connect(onRemoved);
    ws.windowActivated.connect(onActivated);
    this.unsubscribe.push(
      () => ws.windowAdded.disconnect(onAdded),
      () => ws.windowRemoved.disconnect(onRemoved),
      () => ws.windowActivated.disconnect(onActivated),
    );
    if (ws.activeWindow) this.noteFocus(idOf(ws.activeWindow));
    for (const w of ws.stackingOrder) this.track(w);
    this.host.log(`iniciado; ${this.tiledCount()} janela(s) no tiling`);
  }

  stop(): void {
    for (const off of this.unsubscribe.splice(0)) off();
    for (const t of this.tracked.values()) t.disconnect();
    this.tracked.clear();
    this.trees.clear();
  }

  /** Liga/desliga o tiling. Ao desligar, as janelas voltam à geometria anterior. */
  toggle(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      for (const t of this.tracked.values()) {
        if (t.key === null) continue;
        this.removeFromTree(t);
        if (t.saved) t.window.frameGeometry = copy(t.saved);
        t.saved = null;
      }
      this.trees.clear();
      this.host.log("tiling desligado");
    } else {
      for (const t of this.tracked.values()) this.refresh(t);
      this.host.log(`tiling ligado; ${this.tiledCount()} janela(s)`);
    }
  }

  /** Estado para testes e diagnóstico: chave → forma da árvore. */
  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, t] of this.trees) if (t.size) out[k] = t.shape();
    return out;
  }

  private noteFocus(id: string): void {
    this.focusHistory = [id, ...this.focusHistory.filter((x) => x !== id)].slice(0, 64);
  }

  private tiledCount(): number {
    let n = 0;
    for (const t of this.tracked.values()) if (t.key !== null) n++;
    return n;
  }

  private track(w: KWinWindow): void {
    const id = idOf(w);
    if (this.tracked.has(id)) return;
    const onChange = () => {
      const t = this.tracked.get(id);
      // Durante um arrasto a tela da janela muda a cada passo; quem decide é o drop.
      if (t && this.drag?.id !== id) this.refresh(t);
    };
    const onStarted = () => this.dragStarted(id);
    const onStepped = (r: Rect) => this.dragStepped(id, r);
    const onFinished = () => this.dragFinished(id);
    const signals = [w.minimizedChanged, w.fullScreenChanged, w.desktopsChanged, w.outputChanged];
    for (const s of signals) s.connect(onChange);
    w.interactiveMoveResizeStarted.connect(onStarted);
    w.interactiveMoveResizeStepped.connect(onStepped);
    w.interactiveMoveResizeFinished.connect(onFinished);
    const t: Tracked = {
      window: w,
      key: null,
      saved: null,
      disconnect: () => {
        signals.forEach((s) => s.disconnect(onChange));
        w.interactiveMoveResizeStarted.disconnect(onStarted);
        w.interactiveMoveResizeStepped.disconnect(onStepped);
        w.interactiveMoveResizeFinished.disconnect(onFinished);
      },
    };
    this.tracked.set(id, t);
    this.refresh(t, true);
  }

  private untrack(w: KWinWindow): void {
    const id = idOf(w);
    const t = this.tracked.get(id);
    if (!t) return;
    t.disconnect();
    this.tracked.delete(id);
    this.focusHistory = this.focusHistory.filter((x) => x !== id);
    if (this.drag?.id === id) {
      this.drag = null;
      this.host.preview(null);
    }
    this.removeFromTree(t);
  }

  /**
   * Recalcula em qual árvore a janela deve estar (ou nenhuma) e reaplica.
   * `isNew`: a janela acabou de ser vista (loga o motivo se ela flutuar).
   */
  private refresh(t: Tracked, isNew = false): void {
    const w = t.window;
    const reason = this.enabled ? floatReason(w, this.config.floatingClasses) : "tiling desligado";
    const place = reason === null ? { output: w.output, desktop: w.desktops[0] } : null;
    const key = place ? keyOf(place) : null;
    if (key === t.key && !isNew) return;

    const wasTiled = t.key !== null;
    this.removeFromTree(t);
    if (key === null || place === null) {
      if ((isNew || wasTiled) && this.enabled) this.host.log(`flutuante '${w.caption}': ${reason}`);
      return;
    }
    if (t.saved === null) t.saved = copy(w.frameGeometry);
    const id = idOf(w);
    const tree = this.treeFor(place);
    const target = this.focusHistory.find((f) => f !== id && tree.has(f)) ?? null;
    this.insertInto(t, place, target);
    this.host.log(`tiling '${w.caption}' em ${key}`);
  }

  private treeFor(place: Place): Tree {
    const key = keyOf(place);
    this.places.set(key, place);
    let tree = this.trees.get(key);
    if (!tree) {
      tree = new Tree();
      this.trees.set(key, tree);
    }
    return tree;
  }

  /** Insere a janela (que não está em árvore nenhuma) dividindo `target`. */
  private insertInto(t: Tracked, place: Place, target: string | null): void {
    const key = keyOf(place);
    this.treeFor(place).insert(idOf(t.window), target, this.area(key), this.config.gaps);
    t.key = key;
    this.retile(key);
  }

  // ---- mouse ---------------------------------------------------------------

  private dragStarted(id: string): void {
    const t = this.tracked.get(id);
    if (!t || t.key === null) return;
    const w = t.window;
    const mode = w.move ? "move" : w.resize ? "resize" : null;
    if (mode) this.drag = { id, mode };
  }

  private dragStepped(id: string, r: Rect): void {
    if (this.drag?.id !== id) return;
    const t = this.tracked.get(id)!;
    if (t.key === null) return;
    if (this.drag.mode === "resize") {
      this.trees.get(t.key)!.resizeTo(id, r, this.area(t.key), this.config.gaps);
      this.retile(t.key, id); // a janela arrastada é do KWin até soltar
    } else {
      this.host.preview(this.dropTarget(t)?.rect ?? null);
    }
  }

  private dragFinished(id: string): void {
    if (this.drag?.id !== id) return;
    const mode = this.drag.mode;
    this.drag = null;
    const t = this.tracked.get(id)!;
    if (t.key === null) return;
    if (mode === "resize") {
      this.retile(t.key);
      return;
    }
    this.host.preview(null);
    const drop = this.dropTarget(t);
    if (!drop) {
      this.retile(t.key); // solto num gap ou sobre si mesma: volta ao lugar
    } else if (drop.key === t.key && drop.id !== null) {
      this.trees.get(t.key)!.swap(id, drop.id);
      this.retile(t.key);
      this.host.log(`trocou '${t.window.caption}' de lugar`);
    } else {
      this.removeFromTree(t);
      this.insertInto(t, drop.place, drop.id);
      this.host.log(`moveu '${t.window.caption}' para ${drop.key}`);
    }
  }

  /** Destino de um drop com o cursor na posição atual, ou null (volta ao lugar). */
  private dropTarget(t: Tracked): DropTarget | null {
    const w = t.window;
    const place = { output: w.output, desktop: w.desktops[0] };
    const key = keyOf(place);
    const area = this.host.clientArea(place.output, place.desktop);
    const tree = this.trees.get(key);
    const cursor = this.host.workspace.cursorPos;
    if (!tree || tree.size === 0) return { key, place, id: null, rect: inset(area, this.config.gaps.outer) };
    const id = tree.idAt(cursor, area, this.config.gaps);
    if (id === null || id === idOf(w)) return null;
    return { key, place, id, rect: tree.layout(area, this.config.gaps).get(id)! };
  }

  private removeFromTree(t: Tracked): void {
    if (t.key === null) return;
    const key = t.key;
    this.trees.get(key)?.remove(idOf(t.window));
    t.key = null;
    this.retile(key);
  }

  private area(key: string): Rect {
    const p = this.places.get(key)!;
    return this.host.clientArea(p.output, p.desktop);
  }

  /** Aplica o layout da árvore `key` (menos `except`, se dado). */
  private retile(key: string, except?: string): void {
    const tree = this.trees.get(key);
    if (!tree || tree.size === 0) return;
    const layout = tree.layout(this.area(key), this.config.gaps);
    for (const [id, r] of layout) {
      const t = this.tracked.get(id);
      if (t && id !== except) t.window.frameGeometry = copy(r);
    }
  }
}
