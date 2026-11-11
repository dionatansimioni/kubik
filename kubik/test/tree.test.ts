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

  describe("reorganizar (arrastar com o mouse)", () => {
    it("insertBeside: a janela entra ao lado pedido do alvo, dividindo-o ao meio", () => {
      const t = tree("a");
      t.insertBeside("b", "a", "left", AREA, GAPS);
      expect(t.layout(AREA, GAPS).get("b")).toEqual(rect(4, 4, 634, 792));
      t.insertBeside("c", "a", "down", AREA, GAPS);
      const l = t.layout(AREA, GAPS);
      expect(l.get("a")).toEqual(rect(642, 4, 634, 394));
      expect(l.get("c")).toEqual(rect(642, 402, 634, 394));
    });

    it("o exemplo do usuário: 3 sobre a metade de baixo de 1 inverte o layout", () => {
      const t = tree("1", "2", "3"); // 1 | (2 / 3)
      t.remove("3");
      t.insertBeside("3", "1", "down", AREA, GAPS);
      const l = t.layout(AREA, GAPS);
      expect(l.get("1")).toEqual(rect(4, 4, 634, 394));
      expect(l.get("3")).toEqual(rect(4, 402, 634, 394));
      expect(l.get("2")).toEqual(rect(642, 4, 634, 792));
    });

    it("replaceId troca a janela de uma folha sem mudar a forma", () => {
      const t = tree("a", "b");
      t.replaceId("a", "z");
      expect(t.has("a")).toBe(false);
      expect(t.layout(AREA, GAPS).get("z")).toEqual(rect(4, 4, 634, 792));
    });

    it("clone é independente do original", () => {
      const t = tree("a", "b");
      const c = t.clone();
      c.remove("b");
      expect(t.ids()).toEqual(["a", "b"]);
      expect(c.ids()).toEqual(["a"]);
      expect(t.clone().shape()).toEqual(t.shape());
    });
  });

  describe("pilhas (abas)", () => {
    function stacked(): Tree {
      const t = new Tree(28);
      t.insert("a", null, AREA, GAPS);
      t.insert("b", "a", AREA, GAPS); // a | b
      t.stack("c", "b"); // b+c empilhadas à direita, c à vista
      return t;
    }

    it("as janelas da pilha dividem o tile, abaixo da barra de abas", () => {
      const t = stacked();
      const l = t.layout(AREA, GAPS);
      expect(l.get("a")).toEqual(rect(4, 4, 634, 792));
      expect(l.get("b")).toEqual(rect(642, 32, 634, 764));
      expect(l.get("c")).toEqual(rect(642, 32, 634, 764));
      expect(t.stacks(AREA, GAPS)).toEqual([{ bar: rect(642, 4, 634, 28), ids: ["b", "c"], active: "c" }]);
      expect(t.shape()).toEqual({ split: "horizontal", ratio: 0.5, first: "a", second: { stack: ["b", "c"], active: "c" } });
    });

    it("tirar a aba à vista mostra a vizinha; com uma só, a barra some", () => {
      const t = stacked();
      t.remove("c");
      expect(t.activeOf("b")).toBe("b");
      expect(t.stacks(AREA, GAPS)).toEqual([]);
      expect(t.layout(AREA, GAPS).get("b")).toEqual(rect(642, 4, 634, 792));
    });

    it("tirar uma aba escondida mantém a mesma à vista", () => {
      const t = stacked();
      t.stack("d", "b"); // b, c, d (d à vista)
      t.setActive("c");
      t.remove("b");
      expect(t.activeOf("c")).toBe("c");
      expect(t.stackOf("c")).toEqual(["c", "d"]);
    });

    it("a pilha se comporta como um tile só: é dividida inteira e responde no ponto", () => {
      const t = stacked();
      t.insert("d", "c", AREA, GAPS); // divide o tile da pilha
      const l = t.layout(AREA, GAPS);
      expect(l.get("d")).toEqual(rect(642, 402, 634, 394));
      expect(t.stacks(AREA, GAPS)[0].bar).toEqual(rect(642, 4, 634, 28));
      expect(t.idAt({ x: 900, y: 10 }, AREA, GAPS)).toBe("c"); // na barra de abas: a aba à vista
      expect(t.tileRect("b", AREA, GAPS)).toEqual(rect(642, 4, 634, 394));
    });

    it("o mínimo da pilha é o da maior janela, mais a barra", () => {
      const t = stacked();
      const mins = new Map([["c", { width: 100, height: 700 }]]);
      t.insert("d", "c", AREA, GAPS);
      expect(t.layout(AREA, GAPS, mins).get("c")!.height).toBe(700);
    });

    it("trocar uma aba com uma janela de fora troca só aquela aba", () => {
      const t = stacked();
      t.swap("a", "c");
      expect(t.stackOf("b")).toEqual(["b", "a"]);
      expect(t.layout(AREA, GAPS).get("c")).toEqual(rect(4, 4, 634, 792));
    });

    it("clone copia as pilhas", () => {
      const t = stacked();
      expect(t.clone().shape()).toEqual(t.shape());
      expect(t.clone().stacks(AREA, GAPS)).toEqual(t.stacks(AREA, GAPS));
    });
  });
});

describe("Tree: teclado", () => {
  it("rotate: a divisão da janela passa a ser na outra direção", () => {
    const t = tree("a", "b", "c"); // a | (b / c)
    expect(t.rotate("c")).toBe(true);
    const l = t.layout(AREA, GAPS);
    expect(l.get("b")).toEqual(rect(642, 4, 315, 792));
    expect(l.get("c")).toEqual(rect(961, 4, 315, 792));
    expect(t.rotate("a")).toBe(true); // a raiz: a | resto → a / resto
    expect(t.layout(AREA, GAPS).get("a")).toEqual(rect(4, 4, 1272, 394));
    expect(tree("só").rotate("só")).toBe(false);
  });

  it("nudge: a divisa da direita anda; na borda direita, anda a da esquerda", () => {
    const t = tree("a", "b"); // a | b, usável 1268
    expect(t.nudge("a", "horizontal", 64, AREA, GAPS)).toBe(true);
    expect(t.layout(AREA, GAPS).get("a")).toEqual(rect(4, 4, 698, 792));
    expect(t.nudge("b", "horizontal", -128, AREA, GAPS)).toBe(true); // b não tem divisa à direita: usa a da esquerda
    expect(t.layout(AREA, GAPS).get("a")).toEqual(rect(4, 4, 570, 792));
    expect(t.nudge("a", "vertical", 50, AREA, GAPS)).toBe(false); // sem divisa horizontal
  });

  it("nudge respeita o mínimo de cada lado", () => {
    const t = tree("a", "b");
    t.nudge("a", "horizontal", 5000, AREA, GAPS);
    expect(t.layout(AREA, GAPS).get("b")!.width).toBe(60);
  });
});
