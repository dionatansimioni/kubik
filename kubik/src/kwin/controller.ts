import { type Rect } from "../core/rect";
import { type Gaps, Tree } from "../core/tree";
import type { Host, KWinWindow, Output, VirtualDesktop } from "./api";
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
      if (t) this.refresh(t);
    };
    const signals = [w.minimizedChanged, w.fullScreenChanged, w.desktopsChanged, w.outputChanged];
    for (const s of signals) s.connect(onChange);
    const t: Tracked = {
      window: w,
      key: null,
      saved: null,
      disconnect: () => signals.forEach((s) => s.disconnect(onChange)),
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
    const key = place ? `${place.output.name}|${place.desktop.id}` : null;
    if (key === t.key && !isNew) return;

    const wasTiled = t.key !== null;
    this.removeFromTree(t);
    if (key === null || place === null) {
      if ((isNew || wasTiled) && this.enabled) this.host.log(`flutuante '${w.caption}': ${reason}`);
      return;
    }
    if (t.saved === null) t.saved = copy(w.frameGeometry);
    this.places.set(key, place);
    let tree = this.trees.get(key);
    if (!tree) {
      tree = new Tree();
      this.trees.set(key, tree);
    }
    const id = idOf(w);
    const target = this.focusHistory.find((f) => f !== id && tree!.has(f)) ?? null;
    tree.insert(id, target, this.area(key), this.config.gaps);
    t.key = key;
    this.host.log(`tiling '${w.caption}' em ${key}`);
    this.retile(key);
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

  private retile(key: string): void {
    const tree = this.trees.get(key);
    if (!tree || tree.size === 0) return;
    const layout = tree.layout(this.area(key), this.config.gaps);
    for (const [id, r] of layout) {
      const t = this.tracked.get(id);
      if (t) t.window.frameGeometry = copy(r);
    }
  }
}
