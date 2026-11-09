/**
 * Efeito KWin "kubikanimations": anima as mudanças de geometria das janelas
 * (o kubik reorganizando o layout) deslizando e redimensionando suavemente.
 * Empacotado como KWin/Effect em kubik/effect/ (o esbuild gera contents/code/main.js).
 */
import type { Rect } from "../core/rect";
import { type EffectConfig, type MorphWindow, morph, parseConfig, skipReason } from "./morph";

// ---- Globais da API de efeitos em JavaScript do KWin 6 ----------------------
interface KSignal<A extends unknown[]> {
  connect(f: (...a: A) => void): void;
}
interface EffectWindow extends MorphWindow {
  readonly geometry: Rect;
  readonly windowFrameGeometryChanged: KSignal<[EffectWindow, Rect]>;
  readonly windowStartUserMovedResized: KSignal<[EffectWindow]>;
  readonly windowFinishUserMovedResized: KSignal<[EffectWindow]>;
  readonly windowMaximizedStateChanged: KSignal<[EffectWindow, boolean, boolean]>;
  readonly windowFullScreenChanged: KSignal<[EffectWindow]>;
  /** Estado nosso, guardado no próprio objeto da janela. */
  kubikAnimation?: number;
  kubikSkipNext?: boolean;
  kubikResizing?: boolean;
}
declare const effects: {
  readonly stackingOrder: EffectWindow[];
  readonly windowAdded: KSignal<[EffectWindow]>;
};
declare const effect: {
  readConfig(key: string, fallback: unknown): unknown;
  readonly configChanged: KSignal<[]>;
};
declare const Effect: { Size: number; Translation: number };
declare const QEasingCurve: Record<string, number>;
declare function animate(args: object): number;
declare function cancel(id: number): boolean;
declare function animationTime(ms: number): number;
declare const console: { warn(msg: string): void };
// ------------------------------------------------------------------------------

let config: EffectConfig = parseConfig(undefined, undefined);
let resizing = 0;

function loadConfig(): void {
  config = parseConfig(effect.readConfig("Duration", 250), effect.readConfig("Curve", "OutCubic"));
  console.warn(`[kubik-animations] configuração: ${config.duration}ms ${config.curve}`);
}

function onGeometryChanged(w: EffectWindow, old: Rect): void {
  const now = w.geometry;
  const skip = skipReason(w, old, now, { resizingSomething: resizing > 0, skipNext: !!w.kubikSkipNext });
  w.kubikSkipNext = false;
  if (skip) return;
  // Uma mudança nova no meio da anterior: recomeça a partir da geometria anterior.
  if (w.kubikAnimation !== undefined) cancel(w.kubikAnimation);
  const m = morph(old, now);
  w.kubikAnimation = animate({
    window: w,
    duration: animationTime(config.duration),
    curve: QEasingCurve[config.curve],
    animations: [
      {
        type: Effect.Size,
        from: { value1: m.fromSize.width, value2: m.fromSize.height },
        to: { value1: m.toSize.width, value2: m.toSize.height },
      },
      {
        type: Effect.Translation,
        from: { value1: m.fromOffset.x, value2: m.fromOffset.y },
        to: { value1: 0, value2: 0 },
      },
    ],
  });
}

function watch(w: EffectWindow): void {
  w.windowFrameGeometryChanged.connect(onGeometryChanged);
  w.windowStartUserMovedResized.connect((win) => {
    if (win.resize && !win.kubikResizing) {
      win.kubikResizing = true;
      resizing++;
    }
  });
  w.windowFinishUserMovedResized.connect((win) => {
    if (win.kubikResizing) {
      win.kubikResizing = false;
      resizing--;
    }
  });
  // Maximizar e tela cheia têm animação própria do KWin: não brigar com elas.
  w.windowMaximizedStateChanged.connect((win) => (win.kubikSkipNext = true));
  w.windowFullScreenChanged.connect((win) => (win.kubikSkipNext = true));
}

loadConfig();
effect.configChanged.connect(loadConfig);
effects.stackingOrder.forEach(watch);
effects.windowAdded.connect(watch);
console.warn("[kubik-animations] carregado");
