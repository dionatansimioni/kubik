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
