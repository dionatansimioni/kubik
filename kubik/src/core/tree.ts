import { type Rect, inset } from "./rect";

/**
 * "horizontal": filhos lado a lado (divide a largura).
 * "vertical":   filhos um sobre o outro (divide a altura).
 */
export type Orientation = "horizontal" | "vertical";

export interface Gaps {
  /** Espaço entre as janelas e a borda da área de trabalho. */
  outer: number;
  /** Espaço entre janelas vizinhas. */
  inner: number;
}

interface Leaf {
  kind: "leaf";
  id: string;
  parent: Split | null;
}

interface Split {
  kind: "split";
  orientation: Orientation;
  /** Fração do espaço útil que vai para o primeiro filho (0..1). */
  ratio: number;
  first: Node;
  second: Node;
  parent: Split | null;
}

type Node = Leaf | Split;

/** Representação serializável da árvore, para testes e diagnóstico. */
export type TreeShape =
  | string
  | { split: Orientation; ratio: number; first: TreeShape; second: TreeShape };

/**
 * Árvore BSP de uma área de trabalho (uma tela × um desktop virtual).
 * É a fonte da verdade do layout: a geometria das janelas é derivada dela,
 * nunca o contrário (no Wayland a geometria aplicada só assenta depois).
 */
export class Tree {
  private root: Node | null = null;
  private readonly leaves = new Map<string, Leaf>();

  get size(): number {
    return this.leaves.size;
  }

  has(id: string): boolean {
    return this.leaves.has(id);
  }

  /** Ids na ordem da árvore (primeiro filho antes do segundo). */
  ids(): string[] {
    const out: string[] = [];
    const walk = (n: Node | null): void => {
      if (!n) return;
      if (n.kind === "leaf") out.push(n.id);
      else {
        walk(n.first);
        walk(n.second);
      }
    };
    walk(this.root);
    return out;
  }

  /**
   * Insere `id` dividindo a janela `target` ao meio pelo lado mais longo
   * (estilo Pop!_Shell). A janela nova fica à direita/embaixo.
   * Sem `target` válido, divide a maior janela da árvore.
   */
  insert(id: string, target: string | null, area: Rect, gaps: Gaps): void {
    if (this.leaves.has(id)) return;
    const leaf: Leaf = { kind: "leaf", id, parent: null };
    this.leaves.set(id, leaf);
    if (!this.root) {
      this.root = leaf;
      return;
    }
    const rects = this.layout(area, gaps);
    const victim = this.pickTarget(target, rects);
    const r = rects.get(victim.id)!;
    const split: Split = {
      kind: "split",
      orientation: r.width >= r.height ? "horizontal" : "vertical",
      ratio: 0.5,
      first: victim,
      second: leaf,
      parent: victim.parent,
    };
    this.replace(victim, split);
    victim.parent = split;
    leaf.parent = split;
  }

  /** Remove `id`; o irmão ocupa o espaço que era do pai. */
  remove(id: string): void {
    const leaf = this.leaves.get(id);
    if (!leaf) return;
    this.leaves.delete(id);
    const parent = leaf.parent;
    if (!parent) {
      this.root = null;
      return;
    }
    const sibling = parent.first === leaf ? parent.second : parent.first;
    sibling.parent = parent.parent;
    this.replace(parent, sibling);
  }

  /** Geometria de cada janela dentro de `area`, já com os gaps. */
  layout(area: Rect, gaps: Gaps): Map<string, Rect> {
    const out = new Map<string, Rect>();
    if (this.root) this.place(this.root, inset(area, gaps.outer), gaps.inner, out);
    return out;
  }

  shape(): TreeShape | null {
    const s = (n: Node): TreeShape =>
      n.kind === "leaf"
        ? n.id
        : { split: n.orientation, ratio: n.ratio, first: s(n.first), second: s(n.second) };
    return this.root ? s(this.root) : null;
  }

  private pickTarget(target: string | null, rects: Map<string, Rect>): Leaf {
    const chosen = target !== null ? this.leaves.get(target) : undefined;
    if (chosen) return chosen;
    let best: Leaf | null = null;
    let bestArea = -1;
    for (const id of this.ids()) {
      const r = rects.get(id)!;
      if (r.width * r.height > bestArea) {
        bestArea = r.width * r.height;
        best = this.leaves.get(id)!;
      }
    }
    return best!;
  }

  private replace(old: Node, next: Node): void {
    const p = old.parent;
    if (!p) this.root = next;
    else if (p.first === old) p.first = next;
    else p.second = next;
  }

  private place(n: Node, r: Rect, inner: number, out: Map<string, Rect>): void {
    if (n.kind === "leaf") {
      out.set(n.id, r);
      return;
    }
    if (n.orientation === "horizontal") {
      const usable = Math.max(0, r.width - inner);
      const a = Math.max(1, Math.floor(usable * n.ratio));
      const b = Math.max(1, usable - a);
      this.place(n.first, { x: r.x, y: r.y, width: a, height: r.height }, inner, out);
      this.place(n.second, { x: r.x + a + inner, y: r.y, width: b, height: r.height }, inner, out);
    } else {
      const usable = Math.max(0, r.height - inner);
      const a = Math.max(1, Math.floor(usable * n.ratio));
      const b = Math.max(1, usable - a);
      this.place(n.first, { x: r.x, y: r.y, width: r.width, height: a }, inner, out);
      this.place(n.second, { x: r.x, y: r.y + a + inner, width: r.width, height: b }, inner, out);
    }
  }
}
