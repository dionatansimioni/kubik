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
