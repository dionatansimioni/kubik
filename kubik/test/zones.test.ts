import { describe, expect, it } from "vitest";
import { rect } from "../src/core/rect";
import { dropZone } from "../src/core/zones";

// Janela-alvo 600×600 em (100, 100): o terço central vai de 300 a 500.
const R = rect(100, 100, 600, 600);

describe("dropZone", () => {
  it("terço central: trocar", () => {
    expect(dropZone(R, { x: 400, y: 400 })).toBe("swap");
    expect(dropZone(R, { x: 301, y: 499 })).toBe("swap");
  });

  it("fora do centro: a borda mais próxima (relativa ao tamanho) divide para aquele lado", () => {
    expect(dropZone(R, { x: 150, y: 400 })).toBe("left");
    expect(dropZone(R, { x: 650, y: 400 })).toBe("right");
    expect(dropZone(R, { x: 400, y: 260 })).toBe("up");
    expect(dropZone(R, { x: 400, y: 690 })).toBe("down");
    expect(dropZone(R, { x: 120, y: 650 })).toBe("left"); // canto: 0,03 da esquerda < 0,08 de baixo
  });

  it("janela larga: a proporção, não os pixels, decide entre lado e cima/baixo", () => {
    const wide = rect(0, 0, 1200, 400);
    // 100 px da esquerda (0,08) vs. 100 px de cima (0,25): esquerda
    expect(dropZone(wide, { x: 100, y: 100 })).toBe("left");
  });

  it("com a faixa do título reservada para as abas, ela vence as outras zonas", () => {
    expect(dropZone(R, { x: 400, y: 120 }, 40)).toBe("stack");
    expect(dropZone(R, { x: 400, y: 120 })).toBe("up");
    expect(dropZone(R, { x: 400, y: 145 }, 40)).toBe("up");
  });
});
