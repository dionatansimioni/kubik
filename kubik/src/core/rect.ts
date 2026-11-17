/** Retângulo em pixels lógicos, na mesma convenção do KWin (x, y no canto superior esquerdo). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/** Encolhe o retângulo `amount` px de cada lado (nunca abaixo de 1×1). */
export function inset(r: Rect, amount: number): Rect {
  return {
    x: r.x + amount,
    y: r.y + amount,
    width: Math.max(1, r.width - 2 * amount),
    height: Math.max(1, r.height - 2 * amount),
  };
}

export function sameRect(a: Rect, b: Rect, tolerance = 0): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

/** Os dois retângulos têm alguma área em comum. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** `inner` cabe inteiro em `outer`. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * O que sobra de `r` sem os buracos: retângulos que não se sobrepõem e cobrem
 * exatamente essa área (nenhum: os buracos cobrem tudo). Cada buraco corta
 * cada pedaço em até quatro: as faixas acima e abaixo dele, e à esquerda e à
 * direita, na altura dele.
 */
export function subtract(r: Rect, holes: readonly Rect[]): Rect[] {
  let parts: Rect[] = [copyRect(r)];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const p of parts) {
      if (!intersects(p, h)) {
        next.push(p);
        continue;
      }
      const top = Math.max(p.y, h.y);
      const bottom = Math.min(p.y + p.height, h.y + h.height);
      if (h.y > p.y) next.push({ x: p.x, y: p.y, width: p.width, height: h.y - p.y });
      if (h.y + h.height < p.y + p.height)
        next.push({ x: p.x, y: bottom, width: p.width, height: p.y + p.height - bottom });
      if (h.x > p.x) next.push({ x: p.x, y: top, width: h.x - p.x, height: bottom - top });
      if (h.x + h.width < p.x + p.width)
        next.push({ x: h.x + h.width, y: top, width: p.x + p.width - (h.x + h.width), height: bottom - top });
    }
    parts = next;
  }
  return parts;
}

function copyRect(r: Rect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}
