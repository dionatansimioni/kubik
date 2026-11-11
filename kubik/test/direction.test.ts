import { describe, expect, it } from "vitest";
import { neighbor } from "../src/core/direction";
import { rect } from "../src/core/rect";

// Layout: A metade esquerda; B e C quadrantes à direita (B em cima).
const A = rect(4, 4, 634, 792);
const B = rect(642, 4, 634, 394);
const C = rect(642, 402, 634, 394);
const all = [
  { id: "A", rect: A },
  { id: "B", rect: B },
  { id: "C", rect: C },
];

describe("neighbor", () => {
  it("empate (B e C à direita de A, igualmente): vence a primeira da lista (o controlador passa em ordem de foco recente)", () => {
    expect(neighbor(A, all, "right")).toBe("B");
    expect(neighbor(A, [all[0], all[2], all[1]], "right")).toBe("C");
  });

  it("dos quadrantes, à esquerda é a metade esquerda", () => {
    expect(neighbor(B, all, "left")).toBe("A");
    expect(neighbor(C, all, "left")).toBe("A");
  });

  it("entre os quadrantes, para cima e para baixo", () => {
    expect(neighbor(B, all, "down")).toBe("C");
    expect(neighbor(C, all, "up")).toBe("B");
  });

  it("sem nada naquela direção: null", () => {
    expect(neighbor(A, all, "left")).toBeNull();
    expect(neighbor(B, all, "up")).toBeNull();
    expect(neighbor(B, all, "right")).toBeNull();
  });

  it("ignora a própria janela e as que estão atrás", () => {
    expect(neighbor(B, [{ id: "B", rect: B }], "down")).toBeNull();
  });

  it("prefere quem está na mesma faixa à que está mais perto mas fora dela", () => {
    const from = rect(0, 0, 100, 100);
    const sameRow = { id: "longe", rect: rect(500, 0, 100, 100) };
    const offRow = { id: "perto-fora", rect: rect(120, 300, 100, 100) };
    expect(neighbor(from, [offRow, sameRow], "right")).toBe("longe");
  });

  it("atravessa telas: a janela da tela da direita", () => {
    const other = { id: "D", rect: rect(1284, 4, 992, 992) };
    expect(neighbor(B, [...all, other], "right")).toBe("D");
  });

  it("janelas flutuantes sobrepostas: o centro decide o lado", () => {
    const from = rect(100, 100, 400, 300);
    const over = { id: "sobre", rect: rect(300, 150, 400, 300) };
    expect(neighbor(from, [over], "right")).toBe("sobre");
    expect(neighbor(from, [over], "left")).toBeNull();
  });
});
