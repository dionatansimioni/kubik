import { type Rect, inset, sameRect } from "../core/rect";

/** Espera antes de conferir se uma janela saiu do tile (mudanças assentarem). */
const ENFORCE_DELAY_MS = 250;
/** Quantas vezes seguidas o kubik devolve a janela antes de desistir dela. */
const MAX_FIGHTS = 3;
/** Depois deste tempo sem brigas, uma "briga" é esquecida. */
const FIGHT_MEMORY_MS = 5000;
import { Tree } from "../core/tree";
import { type Side, type Zone, dropZone } from "../core/zones";
import type { Host, KWinWindow, Output, TabBar, VirtualDesktop } from "./api";

/** Janela sendo arrastada com o mouse. */
interface Drag {
  id: string;
  mode: "move" | "resize";
  /** Segurar para empilhar: onde o cursor parou, sobre qual janela, e se já deu o tempo. */
  hold: { x: number; y: number; target: string | null; gen: number; ready: boolean } | null;
}

/** Onde a janela arrastada vai entrar se for solta agora. */
interface DropTarget {
  key: string;
  place: Place;
  /** Janela sob o cursor (null: árvore vazia naquela tela). */
  id: string | null;
  /** O que acontece com a janela sob o cursor (ignorado se id for null). */
  zone: Zone;
  /** Onde a janela arrastada vai ficar. */
  rect: Rect;
  /** Na troca: para onde vai a outra janela. */
  ghost: Rect | null;
}

const SIDE_NAMES: Record<Side, string> = { left: "à esquerda de", right: "à direita de", up: "acima de", down: "para baixo de" };
import { DEFAULT_FLOATING_CLASSES, floatReason } from "./rules";
import { DEFAULT_SETTINGS, type Settings, describeSettings } from "./settings";

/**
 * Configuração do controlador: as preferências do usuário (Settings, lidas do
 * kwinrc e mudáveis ao vivo pela bandeja) e o que é fixo do código.
 */
export interface Config extends Settings {
  floatingClasses: readonly string[];
  /** Pilhas (abas): altura da barra de abas. */
  tabs: { height: number };
}

export const DEFAULT_CONFIG: Config = {
  ...DEFAULT_SETTINGS,
  floatingClasses: DEFAULT_FLOATING_CLASSES,
  tabs: { height: 32 },
};

/**
 * Folga, além da duração da animação, até a janela "assentar" e a borda ser
 * redesenhada (com a animação padrão de 250 ms: 300 ms).
 */
const BORDER_SETTLE_EXTRA_MS = 50;

/** Segurar a janela arrastada parada sobre outra por este tempo empilha as duas. */
const HOLD_TO_STACK_MS = 800;
/** Quanto o cursor pode se mexer (px) sem recomeçar a contagem do segurar. */
const HOLD_TOLERANCE = 12;

interface Tracked {
  window: KWinWindow;
  /** Chave da árvore onde a janela está, ou null se flutuante. */
  key: string | null;
  /** Geometria antes do tiling, restaurada ao desligar. */
  saved: Rect | null;
  /** Ordem de entrada no tiling (maior = mais recente). */
  seq: number;
  /** Tirada do tiling por não caber no mínimo; vale até o tiling ser religado. */
  noFit: boolean;
  /** Tirada do tiling porque o app insiste em outra geometria (idem). */
  rebel: boolean;
  /** Última geometria que o kubik aplicou (o tile). */
  target: Rect | null;
  /** Vezes recentes em que o app saiu do tile sozinho. */
  fights: number;
  checkPending: boolean;
  disconnect: () => void;
}

interface Place {
  output: Output;
  desktop: VirtualDesktop;
}

function idOf(w: KWinWindow): string {
  return String(w.internalId);
}

function keyOf(p: Place): string {
  return `${p.output.name}|${p.desktop.id}`;
}

function copy(r: Rect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/**
 * Liga a árvore BSP ao KWin: uma árvore por tela × desktop virtual.
 * Reage a janelas abrindo, fechando, minimizando e mudando de tela/desktop,
 * e aplica a geometria calculada pela árvore.
 */
export class Controller {
  private readonly trees = new Map<string, Tree>();
  private readonly places = new Map<string, Place>();
  private readonly tracked = new Map<string, Tracked>();
  /**
   * Ids ativados, do mais recente para o mais antigo. Inclui janelas ainda
   * não conhecidas: no KWin real, windowActivated chega ANTES de windowAdded.
   */
  private focusHistory: string[] = [];
  private enabled = true;
  private drag: Drag | null = null;
  private seq = 0;
  /**
   * Reconstruindo várias janelas de uma vez (início, religar): cada uma divide
   * a MAIOR janela, para a árvore sair equilibrada. Dividir sempre a focada
   * (o normal para uma janela nova) deixava tiles minúsculos e janelas sem
   * caber (achado no estresse com 12 janelas).
   */
  private balanced = false;
  private readonly unsubscribe: Array<() => void> = [];
  /** Última borda enviada ao QML (para não repetir) e de qual janela. */
  private borderRect: Rect | null = null;
  private borderOwner: string | null = null;
  /** Geração do timer de "assentou" (só o último vale). */
  private borderGen = 0;
  /** Últimas barras de abas enviadas ao QML (JSON, para não repetir). */
  private lastTabs = "[]";

  constructor(
    private readonly host: Host,
    private config: Config = DEFAULT_CONFIG,
  ) {
    this.enabled = config.enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  start(): void {
    const ws = this.host.workspace;
    const onAdded = (w: KWinWindow) => this.track(w);
    const onRemoved = (w: KWinWindow) => this.untrack(w);
    const onActivated = (w: KWinWindow | null) => {
      if (w) {
        this.noteFocus(idOf(w));
        this.tabActivated(idOf(w));
      }
      this.updateBorder();
    };
    ws.windowAdded.connect(onAdded);
    ws.windowRemoved.connect(onRemoved);
    ws.windowActivated.connect(onActivated);
    const onDesktop = () => this.desktopSwitched();
    ws.currentDesktopChanged.connect(onDesktop);
    this.unsubscribe.push(
      () => ws.currentDesktopChanged.disconnect(onDesktop),
      () => ws.windowAdded.disconnect(onAdded),
      () => ws.windowRemoved.disconnect(onRemoved),
      () => ws.windowActivated.disconnect(onActivated),
    );
    if (ws.activeWindow) this.noteFocus(idOf(ws.activeWindow));
    this.balanced = true;
    for (const w of ws.stackingOrder) this.track(w);
    this.balanced = false;
    this.host.log(`iniciado; ${this.tiledCount()} janela(s) no tiling`);
    this.updateBorder();
  }

  stop(): void {
    this.showBorder(null, null);
    if (this.lastTabs !== "[]") this.host.tabs([]);
    this.lastTabs = "[]";
    for (const off of this.unsubscribe.splice(0)) off();
    for (const t of this.tracked.values()) t.disconnect();
    this.tracked.clear();
    this.trees.clear();
  }

  /** Liga/desliga o tiling. Ao desligar, as janelas voltam à geometria anterior. */
  toggle(): void {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      for (const t of this.tracked.values()) {
        if (t.key === null) continue;
        this.removeFromTree(t);
        if (t.saved) t.window.frameGeometry = copy(t.saved);
        t.saved = null;
      }
      this.trees.clear();
      this.host.log("tiling desligado");
    } else {
      for (const t of this.tracked.values()) t.noFit = t.rebel = false;
      this.balanced = true;
      for (const t of this.tracked.values()) this.refresh(t);
      this.balanced = false;
      this.host.log(`tiling ligado; ${this.tiledCount()} janela(s)`);
    }
    this.updateBorder();
    this.publishTabs();
  }

  /**
   * Preferências novas (a bandeja gravou o kwinrc e pediu um reconfigure).
   * "Ligado" só vale quando MUDA no kwinrc: o Meta+Y liga/desliga sem gravar
   * nada, e um reconfigure qualquer (ex.: mudar o tema) não pode desfazê-lo.
   */
  applySettings(s: Settings): void {
    const before = this.config;
    this.config = { ...before, ...s };
    this.host.log(`configuração: ${describeSettings(s)}`);
    if (s.enabled !== before.enabled && s.enabled !== this.enabled) {
      this.toggle(); // religar já reavalia tudo com a configuração nova
      return;
    }
    if (!this.enabled) return;
    for (const t of this.tracked.values()) {
      const wasTiled = t.key !== null;
      this.refresh(t);
      // Virou exceção (ou a tela deixou de ladrilhar "todos os desktops"):
      // volta para onde estava antes do tiling, como ao desligar.
      if (wasTiled && t.key === null && t.saved) {
        t.window.frameGeometry = copy(t.saved);
        t.saved = null;
      }
    }
    const gapsChanged = s.gaps.inner !== before.gaps.inner || s.gaps.outer !== before.gaps.outer;
    if (gapsChanged) for (const key of [...this.trees.keys()]) this.retile(key);
    // Só a espessura mudou: a janela está parada, a borda nova vale na hora.
    // Com gaps novos, as janelas se movem: espera assentar, como sempre.
    this.updateBorder(!gapsChanged);
  }

  /** A exceção do usuário que pega esta janela (classe ou .desktop), ou null. */
  private exceptionOf(w: KWinWindow): string | null {
    const names = [w.resourceClass, w.desktopFileName ?? ""].map((n) => (n || "").toLowerCase()).filter(Boolean);
    return this.config.exceptions.find((e) => names.includes(e)) ?? null;
  }

  // ---- abas (pilhas) ---------------------------------------------------------

  /** Clique numa aba: põe a janela à vista e a ativa. */
  activateTab(id: string): void {
    const t = this.tracked.get(id);
    if (!t || t.key === null) return;
    this.trees.get(t.key)!.setActive(id);
    this.host.workspace.activeWindow = t.window;
    this.publishTabs();
  }

  /** O × da aba: tira a janela da pilha e a põe ao lado dela, no tiling normal. */
  unstack(id: string): void {
    const t = this.tracked.get(id);
    if (!t || t.key === null) return;
    const tree = this.trees.get(t.key)!;
    const rest = tree.stackOf(id).filter((x) => x !== id);
    if (rest.length === 0) return;
    const place = this.places.get(t.key)!;
    this.removeFromTree(t);
    this.insertInto(t, place, tree.activeOf(rest[0]));
    this.host.workspace.activeWindow = t.window;
    this.host.log(`tirou '${t.window.caption}' da pilha`);
  }

  /** Atalho: próxima (+1) ou anterior (-1) aba da pilha da janela em foco. */
  cycleTab(delta: number): void {
    const w = this.host.workspace.activeWindow;
    const t = w ? this.tracked.get(idOf(w)) : undefined;
    if (!w || !t || t.key === null) return;
    const members = this.trees.get(t.key)!.stackOf(idOf(w));
    if (members.length < 2) return;
    const i = members.indexOf(idOf(w));
    this.activateTab(members[(i + delta + members.length) % members.length]);
  }

  /** Uma aba escondida foi ativada por fora (Alt+Tab, clique na barra de tarefas). */
  private tabActivated(id: string): void {
    const t = this.tracked.get(id);
    if (!t || t.key === null) return;
    const tree = this.trees.get(t.key)!;
    if (tree.stackOf(id).length < 2 || tree.activeOf(id) === id) return;
    tree.setActive(id);
    this.publishTabs();
  }

  /** Envia ao QML as barras de abas das pilhas à vista (desktop atual). */
  private publishTabs(): void {
    const bars: TabBar[] = [];
    if (this.enabled) {
      const current = this.host.workspace.currentDesktop.id;
      for (const [key, tree] of this.trees) {
        if (tree.size < 2 || this.places.get(key)!.desktop.id !== current) continue;
        for (const st of tree.stacks(this.area(key), this.config.gaps, this.minsOf(tree)))
          bars.push({
            rect: st.bar,
            tabs: st.ids.map((id) => {
              const w = this.tracked.get(id)?.window;
              return { id, caption: w?.caption ?? "", active: id === st.active, icon: w?.icon };
            }),
          });
      }
    }
    // O ícone (QIcon) não serializa; a classe do app basta para notar mudanças.
    const json = JSON.stringify(bars, (k, v) => (k === "icon" ? undefined : v));
    if (json === this.lastTabs) return;
    this.lastTabs = json;
    this.host.tabs(bars);
  }

  // ---- borda de destaque ----------------------------------------------------

  /**
   * Recalcula a borda da janela em foco (chamado a cada mudança relevante).
   *
   * A borda NUNCA persegue a janela em movimento: como overlay, ela anda um
   * quadro atrás e parece arrastada pela janela (reclamação do usuário).
   * Enquanto a janela se move (arrasto, ou o efeito animando uma mudança de
   * layout), ela some; volta quando a janela assenta (duração da animação + folga, sem
   * mudanças). Trocar o foco é instantâneo.
   * `settled`: chamado pelo timer, a janela já está no lugar.
   */
  private updateBorder(settled = false): void {
    const w = this.host.workspace.activeWindow;
    const t = w ? this.tracked.get(idOf(w)) : undefined;
    if (!w || !t) {
      this.showBorder(null, null);
      return;
    }
    const id = idOf(w);
    if (!this.enabled || !this.config.border.enabled || !this.borderable(w)) {
      this.showBorder(null, id); // a mesma janela, ao voltar, espera assentar
      return;
    }
    let g = w.frameGeometry;
    // Numa pilha, a borda envolve o tile inteiro (barra de abas + janela).
    if (t.key !== null) {
      const tree = this.trees.get(t.key)!;
      if (tree.stackOf(id).length > 1)
        g = tree.tileRect(id, this.area(t.key), this.config.gaps, this.minsOf(tree)) ?? g;
    }
    const bw = this.config.border.width;
    const r = { x: g.x - bw, y: g.y - bw, width: g.width + 2 * bw, height: g.height + 2 * bw };
    const moving = w.move || w.resize || this.drag?.id === id;
    const changed = this.borderRect === null || !sameRect(r, this.borderRect);
    if (moving || (this.borderOwner === id && changed && !settled)) {
      this.showBorder(null, id);
      if (!moving) this.settleBorder();
      return;
    }
    this.showBorder(r, id);
  }

  /** Redesenha a borda quando a janela parar de mudar (reinicia a cada mudança). */
  private settleBorder(): void {
    const gen = ++this.borderGen;
    this.host.later(this.config.animation.duration + BORDER_SETTLE_EXTRA_MS, () => {
      if (gen === this.borderGen) this.updateBorder(true);
    });
  }

  private showBorder(r: Rect | null, owner: string | null): void {
    const same = r === null ? this.borderRect === null : this.borderRect !== null && sameRect(r, this.borderRect);
    this.borderOwner = owner;
    if (same) return;
    this.borderRect = r ? copy(r) : null;
    this.host.border(r);
  }

  /** Janelas "de verdade" à vista: diálogos, overlays e janelas ocultas não. */
  private borderable(w: KWinWindow): boolean {
    if (!w.normalWindow || w.splash || w.minimized || w.fullScreen || w.maximizeMode !== 0) return false;
    if (!w.resourceClass && w.skipSwitcher) return false;
    if ((w.skipTaskbar && w.skipSwitcher) || w.opacity === 0) return false;
    return true;
  }

  /** Estado para testes e diagnóstico: chave → forma da árvore. */
  snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, t] of this.trees) if (t.size) out[k] = t.shape();
    return out;
  }

  /**
   * Relatório legível do estado (atalho "Kubik: Log state", scripts/diagnose.sh):
   * cada árvore com as janelas, o tile calculado e a geometria real, e as
   * janelas flutuantes com o motivo.
   */
  describe(): string[] {
    const fmt = (r: Rect) => `${r.x},${r.y} ${r.width}x${r.height}`;
    const name = (w: KWinWindow) => `'${w.caption}' (${w.resourceClass || "sem classe"})`;
    const floating = [...this.tracked.values()].filter((t) => t.key === null);
    const lines = [
      `estado: tiling ${this.enabled ? "ligado" : "desligado"}; ${this.tiledCount()} no tiling, ${floating.length} flutuante(s)`,
    ];
    for (const [key, tree] of this.trees) {
      if (!tree.size) continue;
      const area = this.area(key);
      lines.push(`árvore ${key} área ${fmt(area)}: ${tree.size} janela(s)`);
      const layout = tree.layout(area, this.config.gaps, this.minsOf(tree));
      for (const id of tree.ids()) {
        const t = this.tracked.get(id);
        const tile = layout.get(id)!;
        if (!t) {
          lines.push(`  ${id} SEM JANELA (folha órfã) tile ${fmt(tile)}`);
          continue;
        }
        const real = t.window.frameGeometry;
        const off = sameRect(real, tile, 2) ? "" : " FORA DO TILE";
        lines.push(`  ${name(t.window)} tile ${fmt(tile)} real ${fmt(real)}${off}`);
      }
      lines.push(`forma ${key} ${JSON.stringify(tree.shape())}`);
    }
    for (const t of floating) lines.push(`flutuante ${name(t.window)}: ${this.floatReasonOf(t) ?? "?"}`);
    return lines;
  }

  private noteFocus(id: string): void {
    this.focusHistory = [id, ...this.focusHistory.filter((x) => x !== id)].slice(0, 64);
  }

  private tiledCount(): number {
    let n = 0;
    for (const t of this.tracked.values()) if (t.key !== null) n++;
    return n;
  }

  private track(w: KWinWindow): void {
    const id = idOf(w);
    if (this.tracked.has(id)) return;
    const onChange = () => {
      const t = this.tracked.get(id);
      // Durante um arrasto a tela da janela muda a cada passo; quem decide é o drop.
      if (t && this.drag?.id !== id) this.refresh(t);
    };
    const onGeometry = () => this.geometryChanged(id);
    // A borda some no começo do arrasto (também de flutuantes) e volta,
    // assentada, depois de soltar.
    const onStarted = () => {
      this.dragStarted(id);
      this.updateBorder();
    };
    const onStepped = (r: Rect) => this.dragStepped(id, r);
    const onFinished = () => {
      this.dragFinished(id);
      this.settleBorder();
    };
    const signals = [w.minimizedChanged, w.fullScreenChanged, w.desktopsChanged, w.outputChanged];
    for (const s of signals) s.connect(onChange);
    const onBorder = () => this.updateBorder();
    const borderSignals = [w.minimizedChanged, w.fullScreenChanged, w.maximizedChanged];
    for (const s of borderSignals) s.connect(onBorder);
    const onCaption = () => this.publishTabs();
    w.captionChanged.connect(onCaption);
    w.frameGeometryChanged.connect(onGeometry);
    w.interactiveMoveResizeStarted.connect(onStarted);
    w.interactiveMoveResizeStepped.connect(onStepped);
    w.interactiveMoveResizeFinished.connect(onFinished);
    const t: Tracked = {
      window: w,
      key: null,
      saved: null,
      seq: 0,
      noFit: false,
      rebel: false,
      target: null,
      fights: 0,
      checkPending: false,
      disconnect: () => {
        signals.forEach((s) => s.disconnect(onChange));
        borderSignals.forEach((s) => s.disconnect(onBorder));
        w.captionChanged.disconnect(onCaption);
        w.frameGeometryChanged.disconnect(onGeometry);
        w.interactiveMoveResizeStarted.disconnect(onStarted);
        w.interactiveMoveResizeStepped.disconnect(onStepped);
        w.interactiveMoveResizeFinished.disconnect(onFinished);
      },
    };
    this.tracked.set(id, t);
    this.refresh(t, true);
    this.updateBorder();
  }

  private untrack(w: KWinWindow): void {
    const id = idOf(w);
    const t = this.tracked.get(id);
    if (!t) return;
    t.disconnect();
    this.tracked.delete(id);
    this.focusHistory = this.focusHistory.filter((x) => x !== id);
    if (this.drag?.id === id) {
      this.drag = null;
      this.host.preview(null);
    }
    this.removeFromTree(t);
    this.updateBorder();
  }

  /**
   * Recalcula em qual árvore a janela deve estar (ou nenhuma) e reaplica.
   * `isNew`: a janela acabou de ser vista (loga o motivo se ela flutuar).
   */
  private refresh(t: Tracked, isNew = false): void {
    const w = t.window;
    const reason = this.floatReasonOf(t);
    const place = reason === null ? this.placeOf(w) : null;
    const key = place ? keyOf(place) : null;
    if (key === t.key && !isNew) return;

    const wasTiled = t.key !== null;
    this.removeFromTree(t);
    if (key === null || place === null) {
      if ((isNew || wasTiled) && this.enabled) this.host.log(`flutuante '${w.caption}': ${reason}`);
      return;
    }
    if (t.saved === null) t.saved = copy(w.frameGeometry);
    const id = idOf(w);
    this.insertInto(t, place, this.splitTarget(place, id));
    if (t.key !== null) this.host.log(`tiling '${w.caption}' em ${key}`);
  }

  /** Por que a janela fica fora do tiling, ou null se ela deve estar nele. */
  private floatReasonOf(t: Tracked): string | null {
    if (!this.enabled) return "tiling desligado";
    if (t.noFit) return "não cabe";
    if (t.rebel) return "o app não aceita o tile";
    const rule = floatReason(t.window, this.config.floatingClasses);
    if (rule !== null) return rule;
    const exception = this.exceptionOf(t.window);
    if (exception !== null) return `exceção do usuário (${exception})`;
    if (t.window.onAllDesktops && this.config.allDesktopsOff.includes(t.window.output.name.toLowerCase()))
      return "em todos os desktops (desligado nesta tela)";
    return null;
  }

  /** Tela × desktop da janela; "em todos os desktops" = o desktop atual. */
  private placeOf(w: KWinWindow): Place {
    return { output: w.output, desktop: w.onAllDesktops ? this.host.workspace.currentDesktop : w.desktops[0] };
  }

  /**
   * Janelas "em todos os desktops" acompanham o desktop visível. Numa tela só
   * com elas (a secundária, com o virtualdesktopsonlyonprimary), a árvore
   * inteira muda de chave e mantém o arranjo; nas outras, cada uma muda de árvore.
   */
  private desktopSwitched(): void {
    if (!this.enabled) return;
    const current = this.host.workspace.currentDesktop;
    for (const [key, tree] of [...this.trees]) {
      const place = this.places.get(key)!;
      if (place.desktop.id === current.id || tree.size === 0) continue;
      const members = tree.ids().map((id) => this.tracked.get(id)!);
      const sticky = members.filter((t) => t.window.onAllDesktops);
      if (sticky.length === 0) continue;
      const next: Place = { output: place.output, desktop: current };
      const nextKey = keyOf(next);
      if (sticky.length === members.length && !this.trees.get(nextKey)?.size) {
        const before = this.area(key);
        this.trees.delete(key);
        this.trees.set(nextKey, tree);
        this.places.set(nextKey, next);
        for (const t of members) t.key = nextKey;
        if (!sameRect(before, this.area(nextKey), 0)) this.retile(nextKey);
      } else {
        for (const t of sticky) this.refresh(t);
      }
    }
    this.publishTabs(); // as abas de cada desktop só aparecem nele
  }

  /**
   * Qual janela a nova divide: sempre uma das MAIORES (1 cheia, 2 lado a lado,
   * 3 = metade + 2 quadrantes, 4 = quadrantes…). No empate, a focada mais
   * recentemente; sem foco entre elas, a primeira na ordem da árvore.
   */
  private splitTarget(place: Place, id: string): string | null {
    const key = keyOf(place);
    const tree = this.treeFor(place);
    const sizes = [...tree.layout(this.area(key), this.config.gaps, this.minsOf(tree))]
      .filter(([leaf]) => leaf !== id)
      .map(([leaf, r]) => [leaf, r.width * r.height] as const);
    if (sizes.length === 0) return null;
    const biggest = Math.max(...sizes.map(([, a]) => a));
    // Tolerância: metades de um tamanho ímpar diferem em 1 px.
    const largest = sizes.filter(([, a]) => a >= biggest * 0.98).map(([leaf]) => leaf);
    if (this.balanced) return largest[0];
    return this.focusHistory.find((f) => largest.includes(f)) ?? largest[0];
  }

  private treeFor(place: Place): Tree {
    const key = keyOf(place);
    this.places.set(key, place);
    let tree = this.trees.get(key);
    if (!tree) {
      tree = new Tree(this.config.tabs.height);
      this.trees.set(key, tree);
    }
    return tree;
  }

  /**
   * Insere a janela (que não está em árvore nenhuma) dividindo `target`.
   * Se alguém ficar abaixo do mínimo mesmo redistribuindo, a janela mais
   * recente da árvore sai do tiling (flutuante) até caber.
   */
  private insertInto(t: Tracked, place: Place, target: string | null, side?: Side): void {
    const key = keyOf(place);
    const tree = this.treeFor(place);
    const id = idOf(t.window);
    if (side && target !== null) tree.insertBeside(id, target, side, this.area(key), this.config.gaps);
    else tree.insert(id, target, this.area(key), this.config.gaps);
    if (!side && target !== null && tree.violations(this.area(key), this.config.gaps, this.minsOf(tree)).length) {
      // Dividir o alvo (a focada) não deixa todo mundo no mínimo: tenta a maior.
      tree.remove(id);
      tree.insert(id, null, this.area(key), this.config.gaps);
    }
    t.key = key;
    t.seq = ++this.seq;
    // Apps que abrem maximizados (Chrome restaurando a sessão) ficariam
    // "maximizados" dentro do tile: sem contorno e sem a volta ao tile.
    if (t.window.maximizeMode !== 0) t.window.setMaximize(false, false);
    for (;;) {
      const bad = tree.violations(this.area(key), this.config.gaps, this.minsOf(tree));
      if (bad.length === 0) break;
      const newest = tree
        .ids()
        .map((id) => this.tracked.get(id)!)
        .reduce((x, y) => (y.seq > x.seq ? y : x));
      const m = newest.window.minSize;
      tree.remove(idOf(newest.window));
      newest.key = null;
      newest.noFit = true;
      this.host.log(`flutuante '${newest.window.caption}': não cabe (mínimo ${m.width}×${m.height})`);
      // A recém-inserida ainda não foi movida; as anteriores voltam ao lugar de antes.
      if (newest !== t && newest.saved) newest.window.frameGeometry = copy(newest.saved);
    }
    this.retile(key);
  }

  private minsOf(tree: Tree): Map<string, { width: number; height: number }> {
    const mins = new Map<string, { width: number; height: number }>();
    for (const id of tree.ids()) {
      const w = this.tracked.get(id)?.window;
      if (!w) continue;
      const m = w.minSize;
      if (m.width <= 0 && m.height <= 0) continue;
      // O mínimo do app é do CONTEÚDO; a árvore distribui molduras: soma a
      // decoração (barra de título, bordas). Sem isso, o app recusa o tile e
      // invade a vizinha (achado no estresse com o KCalc).
      const f = w.frameGeometry;
      const c = w.clientGeometry;
      mins.set(id, {
        width: m.width + Math.max(0, f.width - c.width),
        height: m.height + Math.max(0, f.height - c.height),
      });
    }
    return mins;
  }

  // ---- apps que mudam a própria geometria -------------------------------------

  /**
   * Chrome/Electron em X11 (e outros) às vezes se movem/redimensionam sozinhos
   * depois de abrir (restaurando a sessão anterior) ou recusam o tamanho do
   * tile. Sem reação, a janela fica por cima das vizinhas. O kubik devolve a
   * janela ao tile; se o app insistir, ela vira flutuante.
   */
  private geometryChanged(id: string): void {
    const active = this.host.workspace.activeWindow;
    if (active && idOf(active) === id) this.updateBorder();
    const t = this.tracked.get(id);
    if (!t || !this.deviates(t) || t.checkPending) return;
    t.checkPending = true;
    this.host.later(ENFORCE_DELAY_MS, () => {
      t.checkPending = false;
      if (this.tracked.get(id) !== t || !this.deviates(t)) return;
      t.fights++;
      this.host.later(FIGHT_MEMORY_MS, () => (t.fights = Math.max(0, t.fights - 1)));
      if (t.fights > MAX_FIGHTS) {
        t.rebel = true;
        this.host.log(`flutuante '${t.window.caption}': o app não aceita o tile`);
        this.removeFromTree(t);
        return;
      }
      t.window.frameGeometry = copy(t.target!);
    });
  }

  /** A janela está no tiling, fora do tile, e não por escolha do usuário. */
  private deviates(t: Tracked): boolean {
    const w = t.window;
    if (t.key === null || t.target === null) return false;
    if (this.drag?.id === idOf(w) || w.move || w.resize) return false;
    if (w.maximizeMode !== 0 || w.fullScreen || w.minimized) return false;
    return !sameRect(w.frameGeometry, t.target, 2);
  }

  // ---- mouse ---------------------------------------------------------------

  private dragStarted(id: string): void {
    const t = this.tracked.get(id);
    if (!t || t.key === null) return;
    const w = t.window;
    const mode = w.move ? "move" : w.resize ? "resize" : null;
    if (mode) this.drag = { id, mode, hold: null };
  }

  private dragStepped(id: string, r: Rect): void {
    if (this.drag?.id !== id) return;
    const t = this.tracked.get(id)!;
    if (t.key === null) return;
    if (this.drag.mode === "resize") {
      this.trees.get(t.key)!.resizeTo(id, r, this.area(t.key), this.config.gaps);
      this.retile(t.key, id); // a janela arrastada é do KWin até soltar
    } else {
      this.trackHold(t);
      this.showDropPreview(t);
    }
  }

  private showDropPreview(t: Tracked): void {
    const drop = this.dropTarget(t, this.drag?.hold ?? null);
    this.host.preview(drop?.rect ?? null, drop?.ghost ?? null, drop?.id != null && drop.zone === "stack");
  }

  /**
   * Segurar para empilhar: com o cursor parado (±HOLD_TOLERANCE) sobre a
   * mesma janela por HOLD_TO_STACK_MS, o drop passa a empilhar. Funciona em
   * qualquer parte da janela (apps como o Chrome não têm a barra de título
   * do KDE). Mexer o cursor ou mudar de janela recomeça a contagem.
   */
  private trackHold(t: Tracked): void {
    const drag = this.drag!;
    const p = this.host.workspace.cursorPos;
    const under = this.dropTarget(t)?.id ?? null;
    const h = drag.hold;
    if (h && h.target === under && Math.abs(p.x - h.x) <= HOLD_TOLERANCE && Math.abs(p.y - h.y) <= HOLD_TOLERANCE) return;
    const gen = (h?.gen ?? 0) + 1;
    drag.hold = { x: p.x, y: p.y, target: under, gen, ready: false };
    if (under === null) return;
    this.host.later(HOLD_TO_STACK_MS, () => {
      if (this.drag !== drag || drag.hold?.gen !== gen) return;
      drag.hold.ready = true;
      this.showDropPreview(t);
    });
  }

  private dragFinished(id: string): void {
    if (this.drag?.id !== id) return;
    const mode = this.drag.mode;
    const hold = this.drag.hold;
    this.drag = null;
    const t = this.tracked.get(id)!;
    if (t.key === null) return;
    // Durante o arrasto a janela pode ter deixado de ser "tileável" (ex.:
    // minimizada, ou em todos os desktops com a opção desligada; o plugin
    // virtualdesktopsonlyonprimary faz isso ao entrar na tela secundária).
    if (this.floatReasonOf(t) !== null) {
      this.host.preview(null);
      this.refresh(t);
      return;
    }
    if (mode === "resize") {
      this.retile(t.key);
      return;
    }
    this.host.preview(null);
    const drop = this.dropTarget(t, hold);
    const name = t.window.caption;
    if (!drop) {
      this.retile(t.key); // solto num gap ou sobre si mesma: volta ao lugar
    } else if (drop.id === null) {
      this.removeFromTree(t);
      this.insertInto(t, drop.place, null);
      this.host.log(`moveu '${name}' para ${drop.key}`);
    } else if (drop.zone === "swap") {
      this.swapWith(t, drop.key, drop.id);
      this.host.log(`trocou '${name}' de lugar`);
    } else if (drop.zone === "stack") {
      const other = this.tracked.get(drop.id)?.window.caption ?? "?";
      this.removeFromTree(t);
      this.treeFor(drop.place).stack(id, drop.id);
      t.key = drop.key;
      t.seq = ++this.seq;
      if (t.window.maximizeMode !== 0) t.window.setMaximize(false, false);
      this.retile(drop.key);
      this.host.log(`empilhou '${name}' com '${other}'`);
    } else {
      this.removeFromTree(t);
      this.insertInto(t, drop.place, drop.id, drop.zone);
      const other = this.tracked.get(drop.id)?.window.caption ?? "?";
      this.host.log(`moveu '${name}' ${SIDE_NAMES[drop.zone]} '${other}'`);
    }
  }

  /** Troca `t` com a janela `otherId` da árvore `key` (a mesma ou de outra tela). */
  private swapWith(t: Tracked, key: string, otherId: string): void {
    const id = idOf(t.window);
    const other = this.tracked.get(otherId)!;
    const from = t.key!;
    if (from === key) {
      this.trees.get(key)!.swap(id, otherId);
    } else {
      this.trees.get(from)!.replaceId(id, otherId);
      this.trees.get(key)!.replaceId(otherId, id);
      other.key = from;
      t.key = key;
      this.retile(from);
    }
    this.retile(key);
  }

  /** Destino de um drop com o cursor na posição atual, ou null (volta ao lugar). */
  private dropTarget(t: Tracked, hold: Drag["hold"] = null): DropTarget | null {
    const w = t.window;
    const id = idOf(w);
    const place = this.placeOf(w);
    const key = keyOf(place);
    const area = this.host.clientArea(place.output, place.desktop);
    const gaps = this.config.gaps;
    const tree = this.trees.get(key);
    const cursor = this.host.workspace.cursorPos;
    if (!tree || tree.size === 0)
      return { key, place, id: null, zone: "swap", rect: inset(area, gaps.outer), ghost: null };
    const mins = this.minsOf(tree);
    const layout = tree.layout(area, gaps, mins);
    const target = tree.idAt(cursor, area, gaps, mins);
    if (target === null || target === id) return null;
    // A barra de abas de uma pilha empilha na hora; segurar empilha em qualquer lugar.
    const held = hold?.ready === true && hold.target === target;
    const band = tree.stackOf(target).length > 1 ? tree.tabHeight : 0;
    const zone = held ? "stack" : dropZone(tree.tileRect(target, area, gaps, mins)!, cursor, band);
    if (zone === "swap") {
      return { key, place, id: target, zone, rect: layout.get(target)!, ghost: t.target };
    }
    // Simula o drop numa cópia para mostrar a posição final exata.
    const sim = tree.clone();
    sim.remove(id);
    if (zone === "stack") sim.stack(id, target);
    else sim.insertBeside(id, target, zone, area, gaps);
    const simMins = new Map(mins);
    const m = this.minsOf(this.trees.get(t.key!) ?? tree).get(id);
    if (m) simMins.set(id, m);
    const rect = zone === "stack" ? sim.tileRect(id, area, gaps, simMins)! : sim.layout(area, gaps, simMins).get(id)!;
    return { key, place, id: target, zone, rect, ghost: null };
  }

  private removeFromTree(t: Tracked): void {
    if (t.key === null) return;
    const key = t.key;
    const tree = this.trees.get(key);
    const id = idOf(t.window);
    const rest = (tree?.stackOf(id) ?? []).filter((x) => x !== id);
    const wasShown = tree?.activeOf(id) === id;
    tree?.remove(id);
    t.key = null;
    // Saiu a aba à vista: a que ficou à vista vem para a frente.
    if (tree && wasShown && rest.length > 0) {
      const next = this.tracked.get(tree.activeOf(rest[0])!)?.window;
      if (next) this.host.workspace.raiseWindow?.(next);
    }
    this.retile(key);
  }

  private area(key: string): Rect {
    const p = this.places.get(key)!;
    return this.host.clientArea(p.output, p.desktop);
  }

  /** Aplica o layout da árvore `key` (menos `except`, se dado). */
  private retile(key: string, except?: string): void {
    this.retileOnly(key, except);
    this.publishTabs();
  }

  private retileOnly(key: string, except?: string): void {
    const tree = this.trees.get(key);
    if (!tree || tree.size === 0) return;
    const layout = tree.layout(this.area(key), this.config.gaps, this.minsOf(tree));
    for (const [id, r] of layout) {
      const t = this.tracked.get(id);
      if (!t) continue;
      t.target = copy(r);
      if (id !== except) t.window.frameGeometry = copy(r);
    }
  }
}
