import { type Rect, inset } from "./rect";
import type { Side } from "./zones";

/**
 * "horizontal": filhos lado a lado (divide a largura).
 * "vertical":   filhos um sobre o outro (divide a altura).
 */
export type Orientation = "horizontal" | "vertical";

export interface Point {
  x: number;
  y: number;
}

/** Menor tamanho (px) que um lado de uma divisão pode ter ao redimensionar. */
export const MIN_SIDE = 60;

export interface Size {
  width: number;
  height: number;
}

/** Tamanho mínimo de cada janela (ausente = sem mínimo). */
export type Mins = ReadonlyMap<string, Size>;

const NO_MINS: Mins = new Map();

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

  /**
   * Insere `id` ao lado `side` da janela `target`, dividindo-a ao meio
   * (arrastar e soltar perto da borda do alvo). Sem alvo válido, usa insert().
   */
  insertBeside(id: string, target: string, side: Side, area: Rect, gaps: Gaps): void {
    const victim = this.leaves.get(target);
    if (this.leaves.has(id)) return;
    if (!victim) return this.insert(id, null, area, gaps);
    const leaf: Leaf = { kind: "leaf", id, parent: null };
    this.leaves.set(id, leaf);
    const before = side === "left" || side === "up";
    const split: Split = {
      kind: "split",
      orientation: side === "left" || side === "right" ? "horizontal" : "vertical",
      ratio: 0.5,
      first: before ? leaf : victim,
      second: before ? victim : leaf,
      parent: victim.parent,
    };
    this.replace(victim, split);
    victim.parent = split;
    leaf.parent = split;
  }

  /** A folha de `oldId` passa a ser de `newId` (troca entre árvores). */
  replaceId(oldId: string, newId: string): void {
    const leaf = this.leaves.get(oldId);
    if (!leaf || this.leaves.has(newId)) return;
    this.leaves.delete(oldId);
    leaf.id = newId;
    this.leaves.set(newId, leaf);
  }

  /** Cópia independente (para simular um drop e mostrar a prévia). */
  clone(): Tree {
    const t = new Tree();
    const copy = (n: Node, parent: Split | null): Node => {
      if (n.kind === "leaf") {
        const l: Leaf = { kind: "leaf", id: n.id, parent };
        t.leaves.set(n.id, l);
        return l;
      }
      const s: Split = { kind: "split", orientation: n.orientation, ratio: n.ratio, first: null!, second: null!, parent };
      s.first = copy(n.first, s);
      s.second = copy(n.second, s);
      return s;
    };
    t.root = this.root ? copy(this.root, null) : null;
    return t;
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

  /**
   * Geometria de cada janela dentro de `area`, já com os gaps. Com `mins`, as
   * divisões cedem para cada janela caber no seu mínimo (quando possível).
   */
  layout(area: Rect, gaps: Gaps, mins: Mins = NO_MINS): Map<string, Rect> {
    const out = new Map<string, Rect>();
    if (this.root) this.place(this.root, inset(area, gaps.outer), gaps.inner, out, new Map(), mins);
    return out;
  }

  /** Janelas que, mesmo redistribuindo, ficam abaixo do mínimo (com 1 px de folga). */
  violations(area: Rect, gaps: Gaps, mins: Mins): string[] {
    const out: string[] = [];
    for (const [id, r] of this.layout(area, gaps, mins)) {
      const m = mins.get(id);
      if (m && (r.width + 1 < m.width || r.height + 1 < m.height)) out.push(id);
    }
    return out;
  }

  /** A janela cuja área contém `p` (os gaps não pertencem a ninguém). */
  idAt(p: Point, area: Rect, gaps: Gaps, mins: Mins = NO_MINS): string | null {
    for (const [id, r] of this.layout(area, gaps, mins))
      if (p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height) return id;
    return null;
  }

  /** Troca duas janelas de lugar; a forma da árvore não muda. */
  swap(a: string, b: string): void {
    const la = this.leaves.get(a);
    const lb = this.leaves.get(b);
    if (!la || !lb || la === lb) return;
    la.id = b;
    lb.id = a;
    this.leaves.set(a, lb);
    this.leaves.set(b, la);
  }

  /**
   * Ajusta as proporções das divisões para que a janela `id` fique o mais
   * perto possível de `desired` (o retângulo que o usuário arrastou).
   * Cada borda que mudou move a divisão ancestral que fica naquela borda;
   * bordas sem vizinho (borda da tela) são ignoradas.
   */
  resizeTo(id: string, desired: Rect, area: Rect, gaps: Gaps): void {
    const leaf = this.leaves.get(id);
    if (!leaf) return;
    const edges: Array<[Orientation, "first" | "second", (s: Rect) => number]> = [
      // [orientação, lado em que a janela está, tamanho desejado do 1º filho]
      ["horizontal", "first", (s) => desired.x + desired.width - s.x],
      ["horizontal", "second", (s) => desired.x - gaps.inner - s.x],
      ["vertical", "first", (s) => desired.y + desired.height - s.y],
      ["vertical", "second", (s) => desired.y - gaps.inner - s.y],
    ];
    for (const [orientation, side, firstSize] of edges) {
      const split = this.ancestorAt(leaf, orientation, side);
      if (!split) continue;
      const sr = this.nodeRects(area, gaps).get(split)!;
      const usable = (orientation === "horizontal" ? sr.width : sr.height) - gaps.inner;
      if (usable <= 2 * MIN_SIDE) continue;
      const wanted = Math.min(usable - MIN_SIDE, Math.max(MIN_SIDE, firstSize(sr)));
      split.ratio = wanted / usable;
    }
  }

  shape(): TreeShape | null {
    const s = (n: Node): TreeShape =>
      n.kind === "leaf"
        ? n.id
        : { split: n.orientation, ratio: n.ratio, first: s(n.first), second: s(n.second) };
    return this.root ? s(this.root) : null;
  }

  /** O ancestral mais próximo com essa orientação em que `leaf` está no lado `side`. */
  private ancestorAt(leaf: Leaf, orientation: Orientation, side: "first" | "second"): Split | null {
    let child: Node = leaf;
    for (let p = leaf.parent; p; child = p, p = p.parent)
      if (p.orientation === orientation && p[side] === child) return p;
    return null;
  }

  private nodeRects(area: Rect, gaps: Gaps): Map<Node, Rect> {
    const nodes = new Map<Node, Rect>();
    if (this.root) this.place(this.root, inset(area, gaps.outer), gaps.inner, new Map(), nodes, NO_MINS);
    return nodes;
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

  /** Mínimo de uma subárvore: soma no eixo da divisão, máximo no outro. */
  private minOf(n: Node, inner: number, mins: Mins): Size {
    if (n.kind === "leaf") return mins.get(n.id) ?? { width: 0, height: 0 };
    const a = this.minOf(n.first, inner, mins);
    const b = this.minOf(n.second, inner, mins);
    return n.orientation === "horizontal"
      ? { width: a.width + inner + b.width, height: Math.max(a.height, b.height) }
      : { width: Math.max(a.width, b.width), height: a.height + inner + b.height };
  }

  /** Tamanho do 1º filho: a proporção, cedendo para os mínimos dos dois lados. */
  private firstSize(usable: number, ratio: number, minFirst: number, minSecond: number): number {
    if (minFirst + minSecond > usable && minFirst + minSecond > 0)
      return Math.round((usable * minFirst) / (minFirst + minSecond)); // impossível: proporcional
    const wanted = Math.round(usable * ratio);
    return Math.min(usable - minSecond, Math.max(minFirst, wanted));
  }

  private place(
    n: Node,
    r: Rect,
    inner: number,
    out: Map<string, Rect>,
    nodes: Map<Node, Rect>,
    mins: Mins,
  ): void {
    nodes.set(n, r);
    if (n.kind === "leaf") {
      out.set(n.id, r);
      return;
    }
    const mf = this.minOf(n.first, inner, mins);
    const ms = this.minOf(n.second, inner, mins);
    // Math.round (não floor): proporções vindas de um resize (ex.: 534/1268)
    // multiplicadas de volta precisam dar exatamente o tamanho pedido.
    if (n.orientation === "horizontal") {
      const usable = Math.max(0, r.width - inner);
      const a = Math.max(1, this.firstSize(usable, n.ratio, mf.width, ms.width));
      const b = Math.max(1, usable - a);
      this.place(n.first, { x: r.x, y: r.y, width: a, height: r.height }, inner, out, nodes, mins);
      this.place(n.second, { x: r.x + a + inner, y: r.y, width: b, height: r.height }, inner, out, nodes, mins);
    } else {
      const usable = Math.max(0, r.height - inner);
      const a = Math.max(1, this.firstSize(usable, n.ratio, mf.height, ms.height));
      const b = Math.max(1, usable - a);
      this.place(n.first, { x: r.x, y: r.y, width: r.width, height: a }, inner, out, nodes, mins);
      this.place(n.second, { x: r.x, y: r.y + a + inner, width: r.width, height: b }, inner, out, nodes, mins);
    }
  }
}
