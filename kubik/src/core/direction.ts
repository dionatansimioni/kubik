/**
 * Navegação por direção (Meta+setas): qual janela fica "à direita" de outra.
 * Puro, só geometria: serve para o foco e para mover janelas, entre telas também.
 */
import type { Rect } from "./rect";

export type Direction = "left" | "right" | "up" | "down";

export const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];

export const OPPOSITE: Record<Direction, Direction> = { left: "right", right: "left", up: "down", down: "up" };

export interface Candidate {
  id: string;
  rect: Rect;
}

/** Quanto [a0,a1) e [b0,b1) se sobrepõem (0 se não se tocam). */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * A vizinha de `from` na direção `dir`, ou null.
 *
 * Só contam janelas cujo centro está do lado certo do centro de `from`
 * (assim janelas flutuantes sobrepostas também têm direção). Entre elas, ganha primeiro quem está "na mesma faixa"
 * (sobreposição no outro eixo); depois, a mais próxima pela borda; no
 * empate, a de maior sobreposição, a mais perto do centro e, por fim, a
 * primeira da lista (o controlador passa as janelas em ordem de foco recente,
 * como o Pop!_Shell: volta-se para a janela de onde se veio).
 */
export function neighbor(from: Rect, candidates: readonly Candidate[], dir: Direction): string | null {
  const horizontal = dir === "left" || dir === "right";
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let best: { id: string; key: number[] } | null = null;
  for (const c of candidates) {
    const r = c.rect;
    let gap: number;
    if (dir === "right") gap = r.x - (from.x + from.width);
    else if (dir === "left") gap = from.x - (r.x + r.width);
    else if (dir === "down") gap = r.y - (from.y + from.height);
    else gap = from.y - (r.y + r.height);
    // O centro tem que estar do lado certo (vale para flutuantes sobrepostas).
    const rcx = r.x + r.width / 2;
    const rcy = r.y + r.height / 2;
    if (dir === "right" && rcx <= cx) continue;
    if (dir === "left" && rcx >= cx) continue;
    if (dir === "down" && rcy <= cy) continue;
    if (dir === "up" && rcy >= cy) continue;
    const ov = horizontal
      ? overlap(from.y, from.y + from.height, r.y, r.y + r.height)
      : overlap(from.x, from.x + from.width, r.x, r.x + r.width);
    const offAxis = horizontal ? Math.abs(rcy - cy) : Math.abs(rcx - cx);
    const key = [ov > 0 ? 0 : 1, Math.max(0, gap), -ov, offAxis];
    if (!best || less(key, best.key)) best = { id: c.id, key };
  }
  return best?.id ?? null;
}

function less(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
