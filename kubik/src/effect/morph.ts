/**
 * Lógica pura do efeito de animação (sem KWin): decide se uma mudança de
 * geometria deve ser animada e calcula de onde a animação parte.
 */
import type { Rect } from "../core/rect";

/** O que o efeito lê de uma EffectWindow do KWin 6. */
export interface MorphWindow {
  readonly windowClass: string;
  readonly normalWindow: boolean;
  readonly managed: boolean;
  readonly specialWindow: boolean;
  readonly dialog: boolean;
  readonly popupWindow: boolean;
  /** O usuário está movendo / redimensionando com o mouse. */
  readonly move: boolean;
  readonly resize: boolean;
  readonly fullScreen: boolean;
  readonly minimized: boolean;
  readonly visible: boolean;
  readonly deleted: boolean;
}

export interface MorphContext {
  /** Alguma janela está sendo redimensionada pelo usuário agora. */
  resizingSomething: boolean;
  /** Esta mudança foi marcada para não animar (maximizar, tela cheia). */
  skipNext: boolean;
}

export function skipReason(w: MorphWindow, old: Rect, now: Rect, ctx: MorphContext): string | null {
  if (w.deleted) return "fechada";
  if (!w.visible || w.minimized) return "invisível";
  if (!w.managed || !w.normalWindow || w.specialWindow || w.dialog || w.popupWindow) return "não é janela normal";
  if (!w.windowClass.trim()) return "overlay interno";
  if (w.fullScreen) return "tela cheia";
  if (w.move || w.resize) return "o usuário está arrastando";
  // Num resize ao vivo as vizinhas mudam a cada passo: animar daria atraso elástico.
  if (ctx.resizingSomething) return "resize em andamento";
  if (ctx.skipNext) return "marcada para pular";
  if (old.width <= 0 || old.height <= 0) return "janela nova";
  const delta = Math.max(
    Math.abs(old.x - now.x), Math.abs(old.y - now.y),
    Math.abs(old.width - now.width), Math.abs(old.height - now.height),
  );
  if (delta < 2) return "mudança pequena";
  return null;
}

export interface Morph {
  fromSize: { width: number; height: number };
  toSize: { width: number; height: number };
  /** Deslocamento inicial da janela (já na geometria nova) até 0. */
  fromOffset: { x: number; y: number };
}

/**
 * A janela já está na geometria nova quando o efeito roda. A animação de
 * tamanho (Effect.Size) escala em torno do centro, então a translação parte
 * da diferença entre o centro antigo e o novo.
 */
export function morph(old: Rect, now: Rect): Morph {
  return {
    fromSize: { width: old.width, height: old.height },
    toSize: { width: now.width, height: now.height },
    fromOffset: {
      x: old.x + old.width / 2 - (now.x + now.width / 2),
      y: old.y + old.height / 2 - (now.y + now.height / 2),
    },
  };
}

/** Curvas oferecidas (nomes do QEasingCurve). */
export const CURVES = ["Linear", "OutQuad", "OutCubic", "OutQuart", "OutQuint", "OutExpo", "OutCirc", "OutBack", "InOutCubic"] as const;
export type CurveName = (typeof CURVES)[number];

export interface EffectConfig {
  /** Duração base em ms (o KWin ainda aplica a velocidade de animação global). */
  duration: number;
  curve: CurveName;
}

export const DEFAULT_EFFECT_CONFIG: EffectConfig = { duration: 250, curve: "OutCubic" };

export function parseConfig(duration: unknown, curve: unknown): EffectConfig {
  const d = Number(duration);
  return {
    duration: Number.isFinite(d) && d > 0 ? Math.min(2000, Math.round(d)) : DEFAULT_EFFECT_CONFIG.duration,
    curve: (CURVES as readonly string[]).includes(String(curve)) ? (curve as CurveName) : DEFAULT_EFFECT_CONFIG.curve,
  };
}
