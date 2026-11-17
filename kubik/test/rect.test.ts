import { describe, expect, it } from "vitest";
import { contains, intersects, rect, subtract } from "../src/core/rect";

/** Área total dos pedaços. */
const area = (rs: ReturnType<typeof rect>[]) => rs.reduce((n, r) => n + r.width * r.height, 0);

describe("rect", () => {
  it("intersects: só com área em comum (encostar não conta)", () => {
    expect(intersects(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
    expect(intersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
    expect(intersects(rect(0, 0, 10, 10), rect(20, 20, 5, 5))).toBe(false);
  });

  it("contains: o de dentro cabe inteiro", () => {
    expect(contains(rect(0, 0, 10, 10), rect(2, 2, 8, 8))).toBe(true);
    expect(contains(rect(0, 0, 10, 10), rect(2, 2, 9, 8))).toBe(false);
  });

  describe("subtract", () => {
    it("sem buracos (ou buracos fora): o retângulo inteiro", () => {
      expect(subtract(rect(0, 0, 100, 50), [])).toEqual([rect(0, 0, 100, 50)]);
      expect(subtract(rect(0, 0, 100, 50), [rect(200, 0, 10, 10)])).toEqual([rect(0, 0, 100, 50)]);
    });

    it("um menu cruzando a beira esquerda: sobram as faixas acima, abaixo e à direita dele", () => {
      // A borda 639,1 640×798 e um menu em 493,240 300×200 (o testenv).
      const parts = subtract(rect(639, 1, 640, 798), [rect(493, 240, 300, 200)]);
      expect(parts).toEqual([rect(639, 1, 640, 239), rect(639, 440, 640, 359), rect(793, 240, 486, 200)]);
      expect(area(parts)).toBe(640 * 798 - 154 * 200);
    });

    it("um buraco no meio corta em quatro, sem sobreposição", () => {
      const parts = subtract(rect(0, 0, 100, 100), [rect(40, 40, 20, 20)]);
      expect(parts).toHaveLength(4);
      expect(area(parts)).toBe(100 * 100 - 20 * 20);
      for (const p of parts) expect(intersects(p, rect(40, 40, 20, 20))).toBe(false);
    });

    it("vários buracos, um sobre o outro: nada coberto duas vezes nem esquecido", () => {
      const holes = [rect(10, 10, 30, 30), rect(25, 25, 30, 30), rect(90, 0, 50, 10)];
      const parts = subtract(rect(0, 0, 100, 100), holes);
      // Pixel a pixel: cada ponto está em exatamente um pedaço, ou em algum buraco.
      for (let x = 0; x < 100; x += 3)
        for (let y = 0; y < 100; y += 3) {
          const p = rect(x, y, 1, 1);
          const inParts = parts.filter((r) => intersects(r, p)).length;
          const inHole = holes.some((h) => intersects(h, p));
          expect(inParts).toBe(inHole ? 0 : 1);
        }
    });

    it("buraco maior que tudo: nada sobra", () => {
      expect(subtract(rect(10, 10, 20, 20), [rect(0, 0, 100, 100)])).toEqual([]);
    });
  });
});
