import { beforeEach, describe, expect, it } from "vitest";
import { rect } from "../src/core/rect";
import { Controller } from "../src/kwin/controller";
import {
  DESK_1, DESK_2, FakeWindow, FakeWorkspace, SCREEN_A, SCREEN_B, fakeHost,
} from "./fake-kwin";

let ws: FakeWorkspace;
let ctl: Controller;
let logs: string[];
let previews: Array<import("../src/core/rect").Rect | null>;
let tick: () => void;

function win(caption: string, output = SCREEN_A, desktop = DESK_1): FakeWindow {
  return new FakeWindow(caption, output, desktop);
}

beforeEach(() => {
  ws = new FakeWorkspace();
  const h = fakeHost(ws);
  logs = h.logs;
  previews = h.previews;
  tick = h.tick;
  ctl = new Controller(h.host);
  ctl.start();
});

describe("Controller", () => {
  it("organiza janelas novas em BSP na tela delas", () => {
    const a = ws.open(win("a"));
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    const b = ws.open(win("b"));
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
    const c = ws.open(win("c")); // divide b, a janela focada
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 394));
    expect(c.frameGeometry).toEqual(rect(642, 402, 634, 394));
  });

  it("a janela nova divide a que tinha foco antes dela (ativação chega antes do windowAdded)", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    const c = ws.open(win("c"));
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 394));
    expect(c.frameGeometry).toEqual(rect(642, 402, 634, 394));
  });

  it("fechar a janela focada não confunde o alvo da próxima divisão", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    ws.activate(a);
    ws.activate(b);
    ws.close(b);
    const c = ws.open(win("c"));
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
    expect(c.frameGeometry).toEqual(rect(642, 4, 634, 792));
  });

  it("divide a janela focada, não a última aberta", () => {
    const a = ws.open(win("a"));
    ws.open(win("b"));
    ws.activate(a);
    const c = ws.open(win("c"));
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 394));
    expect(c.frameGeometry).toEqual(rect(4, 402, 634, 394));
  });

  it("fechar uma janela devolve o espaço às vizinhas", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    ws.close(b);
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
  });

  it("adota as janelas que já estavam abertas ao iniciar", () => {
    const ws2 = new FakeWorkspace();
    const a = win("a");
    const b = win("b");
    ws2.stackingOrder = [a, b];
    new Controller(fakeHost(ws2).host).start();
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
  });

  it("mantém uma árvore por tela × desktop", () => {
    const a = ws.open(win("a", SCREEN_A, DESK_1));
    const b = ws.open(win("b", SCREEN_B, DESK_1));
    const c = ws.open(win("c", SCREEN_A, DESK_2));
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    expect(b.frameGeometry).toEqual(rect(1284, 4, 992, 992));
    expect(c.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    expect(Object.keys(ctl.snapshot()).sort()).toEqual(["DP-1|desk-1", "DP-1|desk-2", "HDMI-1|desk-1"]);
  });

  it("mover a janela para outra tela a reinsere na árvore de destino", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    b.output = SCREEN_B;
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    expect(b.frameGeometry).toEqual(rect(1284, 4, 992, 992));
  });

  it("mover a janela para outro desktop a tira da árvore de origem", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    b.desktops = [DESK_2];
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    expect(ctl.snapshot()["DP-1|desk-2"]).toBe(b.internalId);
  });

  it("minimizar tira do tiling; restaurar devolve", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    b.minimized = true;
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    b.minimized = false;
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
  });

  it("tela cheia sai do tiling", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    b.fullScreen = true;
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
  });

  describe("janelas que flutuam", () => {
    const cases: Array<[string, (w: FakeWindow) => void]> = [
      ["diálogo", (w) => (w.dialog = true)],
      ["transiente", (w) => (w.transient = true)],
      ["splash", (w) => (w.splash = true)],
      ["utilitário", (w) => (w.utility = true)],
      ["não normal", (w) => (w.normalWindow = false)],
      ["não redimensionável", (w) => (w.resizeable = false)],
      ["tamanho fixo", (w) => { w.minSize = { width: 300, height: 200 }; w.maxSize = { width: 300, height: 200 }; }],
      ["em todos os desktops", (w) => (w.onAllDesktops = true)],
      ["classe da lista padrão", (w) => (w.resourceClass = "org.kde.krunner")],
      // Regressão: a borda do protótipo (janela interna do KWin) entrou no
      // tiling e empurrou as janelas do usuário para a metade direita.
      ["janela interna do KWin (overlay)", (w) => { w.resourceClass = ""; w.skipSwitcher = true; }],
    ];
    for (const [name, setup] of cases) {
      it(name, () => {
        const a = ws.open(win("a"));
        const f = win("f");
        setup(f);
        const before = f.frameGeometry;
        ws.open(f);
        expect(f.frameGeometry).toBe(before);
        expect(f.applied).toEqual([]);
        expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      });
    }

    it("o log explica o motivo", () => {
      const f = win("Salvar como");
      f.dialog = true;
      ws.open(f);
      expect(logs).toContain("flutuante 'Salvar como': diálogo");
    });
  });

  describe("toggle", () => {
    it("desligar devolve as janelas à geometria de antes do tiling", () => {
      const a = new FakeWindow("a", SCREEN_A, DESK_1, rect(10, 20, 300, 200));
      const b = new FakeWindow("b", SCREEN_A, DESK_1, rect(50, 60, 500, 400));
      ws.open(a);
      ws.open(b);
      ctl.toggle();
      expect(ctl.isEnabled).toBe(false);
      expect(a.frameGeometry).toEqual(rect(10, 20, 300, 200));
      expect(b.frameGeometry).toEqual(rect(50, 60, 500, 400));
      expect(ctl.snapshot()).toEqual({});
    });

    it("desligado, janelas novas não entram no tiling", () => {
      ctl.toggle();
      const a = ws.open(win("a"));
      expect(a.applied).toEqual([]);
    });

    it("religar organiza todas as janelas de novo", () => {
      const a = ws.open(win("a"));
      ctl.toggle();
      const b = ws.open(win("b"));
      ctl.toggle();
      expect(ctl.isEnabled).toBe(true);
      expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
      expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
    });
  });

  it("stop desconecta todos os sinais", () => {
    const a = ws.open(win("a"));
    ctl.stop();
    expect(ws.windowAdded.count).toBe(0);
    expect(ws.windowRemoved.count).toBe(0);
    expect(ws.windowActivated.count).toBe(0);
    expect(a.minimizedChanged.count).toBe(0);
    const b = ws.open(win("b"));
    expect(b.applied).toEqual([]);
  });

  describe("mouse", () => {
    it("redimensionar pela borda move a divisão e a vizinha acompanha ao vivo", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      a.dragThrough("resize", [rect(4, 4, 700, 792), rect(4, 4, 834, 792)]);
      expect(a.frameGeometry).toEqual(rect(4, 4, 834, 792));
      expect(b.frameGeometry).toEqual(rect(842, 4, 434, 792));
      // durante o arrasto o kubik não briga com o KWin pela janela arrastada
      expect(a.applied.filter((r) => r.width === 700)).toEqual([]);
    });

    it("arrastar e soltar sobre outra janela troca as duas de lugar", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      a.dragThrough("move", [rect(300, 50, 634, 792), rect(700, 60, 634, 792)], ws, { x: 900, y: 300 });
      expect(a.frameGeometry).toEqual(rect(642, 4, 634, 792));
      expect(b.frameGeometry).toEqual(rect(4, 4, 634, 792));
    });

    it("mostra a prévia do destino durante o arrasto e esconde ao soltar", () => {
      const a = ws.open(win("a"));
      ws.open(win("b"));
      a.dragThrough("move", [rect(700, 60, 634, 792)], ws, { x: 900, y: 300 });
      expect(previews).toEqual([rect(642, 4, 634, 792), null]);
    });

    it("soltar num gap ou sobre ela mesma devolve a janela ao lugar", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      a.dragThrough("move", [rect(50, 80, 634, 792)], ws, { x: 640, y: 300 }); // gap
      expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
      expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
    });

    it("soltar em outra tela leva a janela para a árvore de lá", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      const c = ws.open(win("c", SCREEN_B));
      a.dragThrough("move", [rect(1500, 100, 634, 792)], ws, { x: 1700, y: 300 }, SCREEN_B);
      expect(b.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      // tela B é quadrada (992×992 úteis): empate divide lado a lado
      expect(c.frameGeometry).toEqual(rect(1284, 4, 494, 992));
      expect(a.frameGeometry).toEqual(rect(1782, 4, 494, 992));
    });

    it("arrastar uma janela flutuante não mexe no tiling", () => {
      const a = ws.open(win("a"));
      const f = win("f");
      f.dialog = true;
      ws.open(f);
      f.dragThrough("move", [rect(10, 10, 300, 200)], ws, { x: 100, y: 100 });
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(previews).toEqual([]);
    });
  });

  describe("tamanhos mínimos", () => {
    it("respeita o mínimo redistribuindo a divisão", () => {
      const a = ws.open(win("a"));
      const b = win("b");
      b.minSize = { width: 900, height: 300 };
      ws.open(b);
      expect(b.frameGeometry.width).toBe(900);
      expect(a.frameGeometry).toEqual(rect(4, 4, 368, 792));
    });

    it("janela que não cabe de jeito nenhum vira flutuante e as outras se reorganizam", () => {
      const a = win("a");
      a.minSize = { width: 800, height: 300 };
      ws.open(a);
      const b = win("b");
      b.minSize = { width: 800, height: 300 };
      const before = b.frameGeometry;
      ws.open(b);
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(b.frameGeometry).toBe(before);
      expect(logs).toContain("flutuante 'b': não cabe (mínimo 800×300)");
    });

    it("muitas janelas grandes: as que não cabem flutuam e nenhuma fica abaixo do mínimo", () => {
      const all: FakeWindow[] = [];
      for (let i = 0; i < 14; i++) {
        const w = win(`w${i}`);
        w.minSize = { width: 300, height: 300 };
        all.push(ws.open(w));
      }
      const floated = all.filter((w) => w.frameGeometry.x === 100 && w.frameGeometry.y === 100);
      expect(floated.length).toBeGreaterThan(0);
      for (const w of all.filter((x) => !floated.includes(x))) {
        expect(w.frameGeometry.width).toBeGreaterThanOrEqual(300);
        expect(w.frameGeometry.height).toBeGreaterThanOrEqual(300);
      }
      expect(logs.some((l) => l.includes("não cabe"))).toBe(true);
    });
  });

  describe("imperfeições achadas no estresse com 12 janelas", () => {
    it("o mínimo do app vale para o conteúdo: a moldura ganha a barra de título", () => {
      // Como o KCalc: mínimo de CONTEÚDO, barra de título de 36 px. Mínimo 370
      // cabe no tile de 394 se contar só o conteúdo, mas a moldura precisa de 406.
      const t = new Controller(fakeHost(ws).host, {
        gaps: { outer: 4, inner: 4 },
        floatingClasses: [],
      });
      ctl.stop();
      t.start();
      const a = ws.open(win("a"));
      const calc = win("calc");
      calc.decoration = { width: 0, height: 36 };
      calc.minSize = { width: 235, height: 370 };
      ws.open(calc);
      ws.activate(calc);
      const c = ws.open(win("c")); // divide a calc ao meio na vertical: 394 de altura cada
      expect(calc.frameGeometry.height).toBeGreaterThanOrEqual(370 + 36);
      expect(c.frameGeometry.y).toBe(calc.frameGeometry.y + calc.frameGeometry.height + 4);
      expect(a.frameGeometry.width).toBe(634);
    });

    it("religar o tiling reconstrói a árvore equilibrada (divide sempre a maior)", () => {
      const all: FakeWindow[] = [];
      for (let i = 0; i < 8; i++) {
        const w = win(`w${i}`);
        w.minSize = { width: 150, height: 150 };
        all.push(ws.open(w));
      }
      ctl.toggle();
      ctl.toggle();
      const floating = logs.filter((l) => l.includes("não cabe"));
      expect(floating).toEqual([]);
      const areas = all.map((w) => w.frameGeometry.width * w.frameGeometry.height);
      expect(Math.max(...areas) / Math.min(...areas)).toBeLessThanOrEqual(2.1);
    });

    it("janela nova que não cabe dividindo a focada tenta a maior antes de flutuar", () => {
      // Sempre focando a última: a divisão em cadeia afina cada vez mais o canto.
      const all: FakeWindow[] = [];
      for (let i = 0; i < 12; i++) {
        const w = win(`w${i}`);
        w.minSize = { width: 150, height: 150 };
        all.push(ws.open(w));
      }
      expect(logs.filter((l) => l.includes("não cabe"))).toEqual([]);
      for (const w of all) {
        expect(w.frameGeometry.width).toBeGreaterThanOrEqual(150);
        expect(w.frameGeometry.height).toBeGreaterThanOrEqual(150);
      }
    });
  });

  describe("apps que mudam a própria geometria (Chrome/Electron em X11)", () => {
    it("o app sai do tile sozinho: o kubik o devolve", () => {
      const a = ws.open(win("a"));
      const chrome = ws.open(win("chrome"));
      chrome.appSets(rect(60, 40, 1000, 700)); // "restaurando a sessão anterior"
      tick();
      expect(chrome.frameGeometry).toEqual(rect(642, 4, 634, 792));
      expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
    });

    it("mudanças intermediárias que assentam no tile não geram escrita extra", () => {
      ws.open(win("a"));
      const b = ws.open(win("b"));
      const writes = b.applied.length;
      b.appSets(rect(642, 4, 400, 300)); // no meio do caminho (Wayland assíncrono)
      b.appSets(rect(642, 4, 634, 792)); // assentou
      tick();
      expect(b.applied.length).toBe(writes);
    });

    it("app que insiste vira flutuante e as outras se reorganizam", () => {
      const a = ws.open(win("a"));
      const rebel = ws.open(win("rebel"));
      for (let i = 0; i < 4; i++) {
        rebel.appSets(rect(60, 40, 1000, 700));
        tick();
      }
      expect(logs).toContain("flutuante 'rebel': o app não aceita o tile");
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(rebel.frameGeometry).toEqual(rect(60, 40, 1000, 700));
    });

    it("janela maximizada pelo usuário não é devolvida ao tile", () => {
      ws.open(win("a"));
      const b = ws.open(win("b"));
      b.maximizeMode = 3;
      b.appSets(rect(0, 0, 1280, 800));
      tick();
      expect(b.frameGeometry).toEqual(rect(0, 0, 1280, 800));
    });

    it("arrasto do usuário não é desfeito no meio", () => {
      ws.open(win("a"));
      const b = ws.open(win("b"));
      b.move = true;
      b.interactiveMoveResizeStarted.emit();
      b.appSets(rect(300, 300, 634, 792));
      tick();
      expect(b.frameGeometry).toEqual(rect(300, 300, 634, 792));
    });
  });
});
