import type { Rect } from "./rect";
import type { Point } from "./tree";

/** Lado da janela-alvo em que a janela arrastada vai entrar, dividindo-a. */
export type Side = "left" | "right" | "up" | "down";

/** O que acontece ao soltar uma janela sobre outra. */
export type Zone = Side | "swap" | "stack";

/**
 * Zona de drop sobre a janela-alvo `r` com o cursor em `p` (inspirado no
 * COSMIC): o terço central troca as duas de lugar; fora dele, a borda mais
 * próxima, relativa ao tamanho, divide o alvo para aquele lado. Com
 * `titleBand` > 0, a faixa do topo (a barra de título) empilha em abas.
 */
export function dropZone(r: Rect, p: Point, titleBand = 0): Zone {
  if (titleBand > 0 && p.y < r.y + titleBand) return "stack";
  const fx = (p.x - r.x) / r.width;
  const fy = (p.y - r.y) / r.height;
  if (fx > 1 / 3 && fx < 2 / 3 && fy > 1 / 3 && fy < 2 / 3) return "swap";
  const [h, dh]: [Side, number] = fx < 0.5 ? ["left", fx] : ["right", 1 - fx];
  const [v, dv]: [Side, number] = fy < 0.5 ? ["up", fy] : ["down", 1 - fy];
  return dh < dv ? h : v;
}
