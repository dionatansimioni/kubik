import { describe, expect, it } from "vitest";
import { rect } from "../src/core/rect";
import { Tree } from "../src/core/tree";

const AREA = rect(0, 0, 1280, 800);
const GAPS = { outer: 4, inner: 4 };

function tree(...ids: string[]): Tree {
  const t = new Tree();
  let last: string | null = null;
  for (const id of ids) {
    t.insert(id, last, AREA, GAPS);
    last = id;
  }
  return t;
}

describe("Tree", () => {
  it("uma janela ocupa a área inteira menos o gap externo", () => {
    expect(tree("a").layout(AREA, GAPS).get("a")).toEqual(rect(4, 4, 1272, 792));
  });

  it("a segunda janela divide a primeira lado a lado (área mais larga que alta)", () => {
    const l = tree("a", "b").layout(AREA, GAPS);
    expect(l.get("a")).toEqual(rect(4, 4, 634, 792));
    expect(l.get("b")).toEqual(rect(642, 4, 634, 792));
  });

  it("divide a janela alvo pelo lado mais longo: estreita e alta → um sobre o outro", () => {
    const t = tree("a", "b", "c"); // c divide b (634×792, mais alta que larga)
    const l = t.layout(AREA, GAPS);
    expect(l.get("a")).toEqual(rect(4, 4, 634, 792));
    expect(l.get("b")).toEqual(rect(642, 4, 634, 394));
    expect(l.get("c")).toEqual(rect(642, 402, 634, 394));
    expect(t.shape()).toEqual({
      split: "horizontal",
      ratio: 0.5,
      first: "a",
      second: { split: "vertical", ratio: 0.5, first: "b", second: "c" },
    });
  });

  it("sem alvo válido, divide a maior janela", () => {
    const t = tree("a", "b", "c"); // a é a maior (634×792)
    t.insert("d", "nao-existe", AREA, GAPS);
    expect(t.shape()).toMatchObject({ first: { split: "vertical", first: "a", second: "d" } });
  });

  it("remover devolve o espaço ao irmão", () => {
    const t = tree("a", "b", "c");
    t.remove("c");
    expect(t.layout(AREA, GAPS).get("b")).toEqual(rect(642, 4, 634, 792));
    t.remove("a");
    expect(t.layout(AREA, GAPS).get("b")).toEqual(rect(4, 4, 1272, 792));
    t.remove("b");
    expect(t.size).toBe(0);
    expect(t.shape()).toBeNull();
  });

  it("remover um nó interno preserva a subárvore irmã", () => {
    const t = tree("a", "b", "c");
    t.remove("a");
    expect(t.shape()).toEqual({ split: "vertical", ratio: 0.5, first: "b", second: "c" });
  });

  it("ignora inserção duplicada e remoção de id desconhecido", () => {
    const t = tree("a", "b");
    t.insert("a", "b", AREA, GAPS);
    t.remove("zzz");
    expect(t.ids()).toEqual(["a", "b"]);
  });

  it("as janelas nunca se sobrepõem e respeitam os gaps", () => {
    const t = tree("a", "b", "c", "d", "e", "f");
    const rs = [...t.layout(AREA, GAPS).values()];
    for (const r of rs) {
      expect(r.x).toBeGreaterThanOrEqual(4);
      expect(r.y).toBeGreaterThanOrEqual(4);
      expect(r.x + r.width).toBeLessThanOrEqual(1276);
      expect(r.y + r.height).toBeLessThanOrEqual(796);
    }
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const [p, q] = [rs[i], rs[j]];
        const separated =
          p.x + p.width + 4 <= q.x || q.x + q.width + 4 <= p.x ||
          p.y + p.height + 4 <= q.y || q.y + q.height + 4 <= p.y;
        expect(separated).toBe(true);
      }
  });

  it("respeita a origem da área (segundo monitor, painel no topo)", () => {
    const area = rect(1920, 36, 1280, 764);
    const t = new Tree();
    t.insert("a", null, area, GAPS);
    expect(t.layout(area, GAPS).get("a")).toEqual(rect(1924, 40, 1272, 756));
  });
});

describe("Tree: operações do mouse", () => {
  it("idAt encontra a janela sob o cursor (gaps não contam)", () => {
    const t = tree("a", "b", "c");
    expect(t.idAt({ x: 100, y: 100 }, AREA, GAPS)).toBe("a");
    expect(t.idAt({ x: 900, y: 100 }, AREA, GAPS)).toBe("b");
    expect(t.idAt({ x: 900, y: 700 }, AREA, GAPS)).toBe("c");
    expect(t.idAt({ x: 640, y: 100 }, AREA, GAPS)).toBeNull(); // no gap entre a e b
    expect(t.idAt({ x: 2000, y: 100 }, AREA, GAPS)).toBeNull();
  });

  it("swap troca duas janelas de lugar e mantém a forma", () => {
    const t = tree("a", "b", "c");
    t.swap("a", "c");
    expect(t.shape()).toEqual({
      split: "horizontal",
      ratio: 0.5,
      first: "c",
      second: { split: "vertical", ratio: 0.5, first: "b", second: "a" },
    });
    const l = t.layout(AREA, GAPS);
    expect(l.get("c")).toEqual(rect(4, 4, 634, 792));
    expect(l.get("a")).toEqual(rect(642, 402, 634, 394));
  });

  it("swap com id desconhecido não faz nada", () => {
    const t = tree("a", "b");
    t.swap("a", "zzz");
    expect(t.ids()).toEqual(["a", "b"]);
  });

  it("resizeTo: puxar a borda direita da janela da esquerda move a divisão", () => {
    const t = tree("a", "b");
    t.resizeTo("a", rect(4, 4, 834, 792), AREA, GAPS);
    const l = t.layout(AREA, GAPS);
    expect(l.get("a")).toEqual(rect(4, 4, 834, 792));
    expect(l.get("b")).toEqual(rect(842, 4, 434, 792));
  });

  it("resizeTo: puxar a borda esquerda da janela da direita move a mesma divisão", () => {
    const t = tree("a", "b");
    t.resizeTo("b", rect(442, 4, 834, 792), AREA, GAPS);
    const l = t.layout(AREA, GAPS);
    expect(l.get("a")).toEqual(rect(4, 4, 434, 792));
    expect(l.get("b")).toEqual(rect(442, 4, 834, 792));
  });

  it("resizeTo ajusta a divisão certa em árvore aninhada (horizontal e vertical juntas)", () => {
    const t = tree("a", "b", "c"); // a | (b / c)
    // c cresce para a esquerda (divisão a|bc) e para cima (divisão b/c)
    t.resizeTo("c", rect(542, 302, 734, 494), AREA, GAPS);
    const l = t.layout(AREA, GAPS);
    expect(l.get("a")).toEqual(rect(4, 4, 534, 792));
    expect(l.get("b")).toEqual(rect(542, 4, 734, 294));
    expect(l.get("c")).toEqual(rect(542, 302, 734, 494));
  });

  it("resizeTo ignora bordas sem vizinho (borda da tela) e limita a proporção", () => {
    const t = tree("a", "b");
    t.resizeTo("a", rect(-500, 4, 1276, 792), AREA, GAPS); // borda esquerda: sem vizinho
    const l = t.layout(AREA, GAPS);
    expect(l.get("a")!.x).toBe(4);
    t.resizeTo("a", rect(4, 4, 5000, 792), AREA, GAPS); // não pode engolir b
    const l2 = t.layout(AREA, GAPS);
    expect(l2.get("b")!.width).toBeGreaterThanOrEqual(60);
  });
});

describe("Tree: tamanhos mínimos", () => {
  it("a divisão cede para a janela caber no mínimo dela", () => {
    const t = tree("a", "b");
    const l = t.layout(AREA, GAPS, new Map([["b", { width: 900, height: 0 }]]));
    expect(l.get("b")!.width).toBe(900);
    expect(l.get("a")).toEqual(rect(4, 4, 368, 792));
  });

  it("o mínimo de uma subárvore soma os filhos no eixo da divisão", () => {
    const t = tree("a", "b", "c"); // a | (b / c)
    const mins = new Map([["b", { width: 700, height: 0 }], ["c", { width: 750, height: 0 }]]);
    const l = t.layout(AREA, GAPS, mins);
    expect(l.get("b")!.width).toBe(750); // a subárvore b/c precisa de max(700, 750)
    expect(l.get("a")!.width).toBe(1268 - 750);
  });

  it("mínimos impossíveis: divide proporcionalmente, sem sobrepor", () => {
    const t = tree("a", "b");
    const l = t.layout(AREA, GAPS, new Map([["a", { width: 1000, height: 0 }], ["b", { width: 1000, height: 0 }]]));
    expect(l.get("a")!.width + l.get("b")!.width).toBe(1268);
    expect(l.get("b")!.x).toBe(l.get("a")!.x + l.get("a")!.width + 4);
  });

  it("fits() aponta quem ficou abaixo do mínimo", () => {
    const t = tree("a", "b");
    const mins = new Map([["a", { width: 1000, height: 0 }], ["b", { width: 1000, height: 0 }]]);
    expect(t.violations(AREA, GAPS, mins).sort()).toEqual(["a", "b"]);
    expect(t.violations(AREA, GAPS, new Map([["a", { width: 500, height: 500 }]]))).toEqual([]);
  });
});
