import { beforeEach, describe, expect, it } from "vitest";
import { rect } from "../src/core/rect";
import { Controller, DEFAULT_CONFIG } from "../src/kwin/controller";
import {
  DESK_1, DESK_2, FakeWindow, FakeWorkspace, SCREEN_A, SCREEN_B, fakeHost,
} from "./fake-kwin";

let ws: FakeWorkspace;
let ctl: Controller;
let logs: string[];
let previews: Array<import("../src/core/rect").Rect | null>;
let ghosts: Array<import("../src/core/rect").Rect | null>;
let borders: Array<import("../src/core/rect").Rect | null>;
let tabs: Array<import("../src/kwin/api").TabBar[]>;
let stackHints: boolean[];
let tick: (upTo?: number) => void;

function win(caption: string, output = SCREEN_A, desktop = DESK_1): FakeWindow {
  return new FakeWindow(caption, output, desktop);
}

beforeEach(() => {
  ws = new FakeWorkspace();
  const h = fakeHost(ws);
  logs = h.logs;
  previews = h.previews;
  ghosts = h.ghosts;
  borders = h.borders;
  tabs = h.tabs;
  stackHints = h.stackHints;
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

  it("divide sempre a maior: 1 cheia, 2 lado a lado, 3 metade + 2 quadrantes, 4 quadrantes", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    const c = ws.open(win("c"));
    const d = ws.open(win("d")); // a (metade esquerda) é a maior: vira 2 quadrantes
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 394));
    expect(d.frameGeometry).toEqual(rect(4, 402, 634, 394));
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 394));
    expect(c.frameGeometry).toEqual(rect(642, 402, 634, 394));
  });

  it("entre as maiores (empate), divide a focada", () => {
    const a = ws.open(win("a"));
    ws.open(win("b"));
    const c = ws.open(win("c"));
    ws.open(win("d"));
    ws.activate(c); // 4 quadrantes iguais: a 5ª divide a focada
    const e = ws.open(win("e"));
    expect(c.frameGeometry).toEqual(rect(642, 402, 315, 394));
    expect(e.frameGeometry).toEqual(rect(961, 402, 315, 394));
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 394));
  });

  it("a focada só é dividida se for uma das maiores", () => {
    ws.open(win("a"));
    const b = ws.open(win("b"));
    const c = ws.open(win("c")); // b e c: quadrantes da direita
    ws.activate(c);
    const d = ws.open(win("d")); // a (metade) é maior que c (quadrante)
    expect(d.frameGeometry).toEqual(rect(4, 402, 634, 394));
    expect(b.frameGeometry).toEqual(rect(642, 4, 634, 394));
  });

  it("minimizada não ocupa espaço: a janela nova usa o lugar livre", () => {
    const a = ws.open(win("a"));
    const b = ws.open(win("b"));
    b.minimized = true;
    expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
    const c = ws.open(win("c"));
    expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
    expect(c.frameGeometry).toEqual(rect(642, 4, 634, 792));
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

  describe("janelas em todos os desktops", () => {
    function sticky(caption: string, output = SCREEN_A): FakeWindow {
      const w = win(caption, output);
      w.desktops = []; // KWin 6: em todos os desktops = lista vazia
      return w;
    }

    it("entram no tiling junto com as janelas do desktop atual", () => {
      const a = ws.open(win("a"));
      const s = ws.open(sticky("s"));
      expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
      expect(s.frameGeometry).toEqual(rect(642, 4, 634, 792));
    });

    it("arrastada para a tela secundária, onde o plugin a põe em todos os desktops: vai para o tiling de lá", () => {
      // virtualdesktopsonlyonprimary muda os desktops NO MEIO do arrasto
      // (achado no Fedora do usuário: o drop quebrava e o tile ficava reservado).
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      b.move = true;
      b.interactiveMoveResizeStarted.emit();
      b.output = SCREEN_B;
      b.desktops = [];
      ws.cursorPos = { x: 1500, y: 300 };
      b.move = false;
      expect(() => b.interactiveMoveResizeFinished.emit()).not.toThrow();
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(b.frameGeometry).toEqual(rect(1284, 4, 992, 992));
    });

    it("trocar de desktop: a tela só com janelas assim leva a árvore inteira junto, sem mexer nelas", () => {
      const s1 = ws.open(sticky("s1", SCREEN_B));
      const s2 = ws.open(sticky("s2", SCREEN_B));
      const geos = [s1.frameGeometry, s2.frameGeometry];
      const writes = s1.applied.length + s2.applied.length;
      ws.switchTo(DESK_2);
      expect([s1.frameGeometry, s2.frameGeometry]).toEqual(geos);
      expect(s1.applied.length + s2.applied.length).toBe(writes);
      expect(Object.keys(ctl.snapshot())).toEqual(["HDMI-1|desk-2"]);
    });

    it("trocar de desktop: numa tela com janelas do desktop, ela muda para a árvore do novo desktop", () => {
      const a = ws.open(win("a"));
      const s = ws.open(sticky("s"));
      const c = ws.open(win("c", SCREEN_A, DESK_2));
      ws.switchTo(DESK_2);
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(c.frameGeometry).toEqual(rect(4, 4, 634, 792));
      expect(s.frameGeometry).toEqual(rect(642, 4, 634, 792));
    });

    it("com a opção desligada, ficam flutuantes", () => {
      const h = fakeHost(ws);
      ctl.stop();
      const off = new Controller(h.host, { ...DEFAULT_CONFIG, tileAllDesktops: false });
      off.start();
      const a = ws.open(win("a"));
      ws.open(sticky("s"));
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(h.logs).toContain("flutuante 's': em todos os desktops");
    });
  });

  describe("janelas que flutuam", () => {
    it("janela oculta (fora da barra e do Alt+Tab, ex.: xwaylandvideobridge) não ocupa tile", () => {
      const a = ws.open(win("a"));
      const ghost = win("Ponte de vídeo Xwayland");
      ghost.resourceClass = "xwaylandvideobridge-qualquer";
      ghost.skipTaskbar = ghost.skipSwitcher = true;
      ws.open(ghost);
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(logs).toContain("flutuante 'Ponte de vídeo Xwayland': janela oculta (fora da barra de tarefas e do Alt+Tab)");
    });

    it("janela invisível (opacidade 0) não ocupa tile", () => {
      const a = ws.open(win("a"));
      const ghost = win("fantasma");
      ghost.opacity = 0;
      ws.open(ghost);
      expect(a.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(logs).toContain("flutuante 'fantasma': invisível (opacidade 0)");
    });

    it("janela que abre maximizada (app restaurando a sessão) é desmaximizada ao entrar no tile", () => {
      ws.open(win("a"));
      const chrome = win("chrome");
      chrome.maximizeMode = 3;
      ws.open(chrome);
      expect(chrome.maximizeMode).toBe(0);
      expect(chrome.frameGeometry).toEqual(rect(642, 4, 634, 792));
    });

    const cases: Array<[string, (w: FakeWindow) => void]> = [
      ["diálogo", (w) => (w.dialog = true)],
      ["transiente", (w) => (w.transient = true)],
      ["splash", (w) => (w.splash = true)],
      ["utilitário", (w) => (w.utility = true)],
      ["não normal", (w) => (w.normalWindow = false)],
      ["não redimensionável", (w) => (w.resizeable = false)],
      ["tamanho fixo", (w) => { w.minSize = { width: 300, height: 200 }; w.maxSize = { width: 300, height: 200 }; }],
      ["em alguns desktops (2 ou mais)", (w) => (w.desktops = [DESK_1, DESK_2])],
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
      // perto da borda direita da c: entra à direita dela
      a.dragThrough("move", [rect(1500, 100, 634, 792)], ws, { x: 2200, y: 500 }, SCREEN_B);
      expect(b.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(c.frameGeometry).toEqual(rect(1284, 4, 494, 992));
      expect(a.frameGeometry).toEqual(rect(1782, 4, 494, 992));
    });

    it("soltar perto da borda de outra janela reorganiza: o exemplo do usuário (3 sobre a metade de baixo de 1)", () => {
      const j1 = ws.open(win("1"));
      const j2 = ws.open(win("2"));
      const j3 = ws.open(win("3")); // 1 | (2 / 3)
      j3.dragThrough("move", [rect(200, 500, 634, 394)], ws, { x: 300, y: 700 });
      expect(j1.frameGeometry).toEqual(rect(4, 4, 634, 394));
      expect(j3.frameGeometry).toEqual(rect(4, 402, 634, 394));
      expect(j2.frameGeometry).toEqual(rect(642, 4, 634, 792));
      expect(logs).toContain("moveu '3' para baixo de '1'");
    });

    it("a prévia mostra onde a janela vai ficar ao soltar (dividir)", () => {
      ws.open(win("1"));
      ws.open(win("2"));
      const j3 = ws.open(win("3"));
      j3.dragThrough("move", [rect(200, 500, 634, 394)], ws, { x: 300, y: 700 });
      expect(previews).toEqual([rect(4, 402, 634, 394), null]);
      expect(ghosts).toEqual([null, null]);
      expect(stackHints).toEqual([false, false]);
    });

    it("a prévia da troca mostra o destino e, mais clara, para onde vai a outra", () => {
      const a = ws.open(win("a"));
      ws.open(win("b"));
      a.dragThrough("move", [rect(700, 60, 634, 792)], ws, { x: 900, y: 300 });
      expect(previews).toEqual([rect(642, 4, 634, 792), null]);
      expect(ghosts).toEqual([rect(4, 4, 634, 792), null]);
    });

    it("soltar perto da borda de uma janela de outra tela divide ela daquele lado", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      const c = ws.open(win("c", SCREEN_B));
      a.dragThrough("move", [rect(1500, 100, 634, 792)], ws, { x: 1700, y: 950 }, SCREEN_B);
      expect(b.frameGeometry).toEqual(rect(4, 4, 1272, 792));
      expect(c.frameGeometry).toEqual(rect(1284, 4, 992, 494));
      expect(a.frameGeometry).toEqual(rect(1284, 502, 992, 494));
    });

    it("trocar com uma janela de outra tela: cada uma fica no lugar da outra", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      const c = ws.open(win("c", SCREEN_B));
      a.dragThrough("move", [rect(1500, 100, 634, 792)], ws, { x: 1780, y: 500 }, SCREEN_B);
      expect(a.frameGeometry).toEqual(rect(1284, 4, 992, 992));
      expect(c.frameGeometry).toEqual(rect(4, 4, 634, 792));
      expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
      expect(ctl.snapshot()["HDMI-1|desk-1"]).toBe(a.internalId);
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
        ...DEFAULT_CONFIG,
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

  describe("relatório de estado (diagnóstico)", () => {
    it("lista cada árvore com as janelas, o tile e a geometria real, e as flutuantes com o motivo", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      const d = win("diálogo");
      d.dialog = true;
      ws.open(d);
      b.appSets(rect(10, 10, 300, 200)); // fora do tile, ainda não corrigida
      const lines = ctl.describe();
      expect(lines[0]).toBe("estado: tiling ligado; 2 no tiling, 1 flutuante(s)");
      expect(lines).toContain("árvore DP-1|desk-1 área 0,0 1280x800: 2 janela(s)");
      expect(lines).toContain("  'a' (org.example.app) tile 4,4 634x792 real 4,4 634x792");
      expect(lines).toContain("  'b' (org.example.app) tile 642,4 634x792 real 10,10 300x200 FORA DO TILE");
      expect(lines).toContain("flutuante 'diálogo' (org.example.app): diálogo");
      expect(lines.some((l) => l.startsWith("forma DP-1|desk-1 "))).toBe(true);
      void a;
    });
  });

  describe("borda de destaque na janela em foco", () => {
    /** A borda fica 3 px para fora da moldura. */
    const around = (r: import("../src/core/rect").Rect) => rect(r.x - 3, r.y - 3, r.width + 6, r.height + 6);
    const last = () => borders[borders.length - 1];

    it("aparece em volta da janela focada", () => {
      ws.open(win("a"));
      expect(last()).toEqual(around(rect(4, 4, 1272, 792)));
    });

    it("muda de janela junto com o foco, na hora", () => {
      const a = ws.open(win("a"));
      ws.open(win("b"));
      ws.activate(a);
      expect(last()).toEqual(around(rect(4, 4, 634, 792)));
    });

    it("quando o layout muda, some e só volta com a janela já no lugar (não persegue a animação)", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      ws.activate(a);
      ws.close(b);
      expect(last()).toBeNull();
      tick(300);
      expect(last()).toEqual(around(rect(4, 4, 1272, 792)));
    });

    it("mudanças seguidas reiniciam a espera (redesenha uma vez, no fim)", () => {
      const a = ws.open(win("a"));
      a.appSets(rect(10, 10, 500, 500));
      a.appSets(rect(4, 4, 1272, 792));
      tick(300);
      const shown = borders.filter((r) => r !== null);
      expect(shown[shown.length - 1]).toEqual(around(rect(4, 4, 1272, 792)));
      expect(shown).not.toContainEqual(around(rect(10, 10, 500, 500)));
    });

    it("some durante o arrasto com o mouse e volta depois de soltar, já no lugar", () => {
      ws.open(win("a"));
      const b = ws.open(win("b"));
      b.dragThrough("resize", [rect(600, 4, 676, 792)]);
      expect(borders).not.toContainEqual(around(rect(600, 4, 676, 792)));
      expect(last()).toBeNull();
      tick(300);
      expect(last()).toEqual(around(b.frameGeometry));
    });

    it("arrastar uma janela flutuante também esconde a borda até soltar", () => {
      const f = new FakeWindow("fixa", SCREEN_A, DESK_1, rect(100, 100, 300, 200));
      f.resizeable = false;
      ws.open(f);
      f.dragThrough("move", [rect(150, 150, 300, 200), rect(200, 200, 300, 200)], ws, { x: 300, y: 300 });
      expect(borders).not.toContainEqual(around(rect(150, 150, 300, 200)));
      tick(300);
      expect(last()).toEqual(around(rect(200, 200, 300, 200)));
    });

    it("some sem foco, minimizada, em tela cheia ou maximizada", () => {
      const a = ws.open(win("a"));
      ws.activate(null);
      expect(last()).toBeNull();
      ws.activate(a);
      expect(last()).toEqual(around(rect(4, 4, 1272, 792)));
      a.fullScreen = true;
      expect(last()).toBeNull();
      a.fullScreen = false;
      tick(300);
      expect(last()).toEqual(around(rect(4, 4, 1272, 792)));
      a.setMaximize(true, true);
      expect(last()).toBeNull();
      a.setMaximize(false, false);
      a.minimized = true;
      expect(last()).toBeNull();
    });

    it("não aparece em diálogos, janelas internas e ocultas, mas sim em flutuantes normais", () => {
      ws.open(win("a"));
      const d = win("diálogo");
      d.normalWindow = false;
      d.dialog = true;
      ws.open(d);
      expect(last()).toBeNull();
      const ghost = win("ponte");
      ghost.skipTaskbar = ghost.skipSwitcher = true;
      ws.open(ghost);
      expect(last()).toBeNull();
      const fixed = new FakeWindow("fixa", SCREEN_A, DESK_1, rect(100, 100, 300, 200));
      fixed.resizeable = false; // flutua, mas é uma janela de verdade
      ws.open(fixed);
      expect(last()).toEqual(around(rect(100, 100, 300, 200)));
    });

    it("desligar o tiling esconde; religar mostra de novo", () => {
      ws.open(win("a"));
      ctl.toggle();
      expect(last()).toBeNull();
      ctl.toggle();
      tick(300);
      expect(last()).toEqual(around(rect(4, 4, 1272, 792)));
    });

    it("não repete a mesma borda (sem escrita inútil no overlay)", () => {
      const a = ws.open(win("a"));
      const n = borders.length;
      a.appSets(a.frameGeometry);
      ws.activate(a);
      expect(borders.length).toBe(n);
    });

    it("com a borda desligada na configuração, nunca aparece", () => {
      const h = fakeHost(ws);
      ctl.stop();
      const off = new Controller(h.host, { ...DEFAULT_CONFIG, border: { ...DEFAULT_CONFIG.border, enabled: false } });
      off.start();
      ws.open(win("a"));
      expect(h.borders.filter((r) => r !== null)).toEqual([]);
    });
  });

  describe("abas (pilhas)", () => {
    /** a | b, e arrasta c para a barra de título da b (y logo abaixo do topo). */
    function stackOnB(): { a: FakeWindow; b: FakeWindow; c: FakeWindow } {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      b.decoration = { width: 0, height: 30 };
      const c = ws.open(win("c")); // c divide b: b em cima, c embaixo (à direita)
      c.dragThrough("move", [rect(700, 20, 634, 394)], ws, { x: 900, y: 15 });
      return { a, b, c };
    }
    const lastTabs = () => tabs[tabs.length - 1];

    it("soltar na barra de título de outra janela empilha as duas no tile dela", () => {
      const { a, b, c } = stackOnB();
      expect(a.frameGeometry).toEqual(rect(4, 4, 634, 792));
      expect(b.frameGeometry).toEqual(rect(642, 32, 634, 764));
      expect(c.frameGeometry).toEqual(rect(642, 32, 634, 764));
      expect(logs).toContain("empilhou 'c' com 'b'");
    });

    it("a barra de abas mostra as janelas da pilha, com a arrastada à vista", () => {
      stackOnB();
      expect(lastTabs()).toEqual([
        {
          rect: rect(642, 4, 634, 28),
          tabs: [
            { id: expect.any(String), caption: "b", active: false },
            { id: expect.any(String), caption: "c", active: true },
          ],
        },
      ]);
    });

    it("a prévia do empilhar mostra o tile final da pilha", () => {
      const a = ws.open(win("a"));
      const b = ws.open(win("b"));
      b.decoration = { width: 0, height: 30 };
      void a;
      const c = ws.open(win("c"));
      c.dragThrough("move", [rect(700, 20, 634, 394)], ws, { x: 900, y: 15 });
      expect(previews[0]).toEqual(rect(642, 4, 634, 792)); // a c sai de baixo: a b cresce
      expect(stackHints).toEqual([true, false]); // a prévia avisa que vai empilhar
    });

    it("clicar numa aba (activateTab) ativa aquela janela e atualiza as abas", () => {
      const { b } = stackOnB();
      ctl.activateTab(String(b.internalId));
      expect(ws.activeWindow).toBe(b);
      expect(lastTabs()[0].tabs.map((t) => t.active)).toEqual([true, false]);
    });

    it("ativar uma aba escondida por fora (Alt+Tab) a põe à vista", () => {
      const { b } = stackOnB();
      ws.activate(b);
      expect(lastTabs()[0].tabs.map((t) => t.active)).toEqual([true, false]);
    });

    it("atalho de próxima/anterior aba circula pela pilha", () => {
      const { b, c } = stackOnB();
      ctl.cycleTab(1);
      expect(ws.activeWindow).toBe(b);
      ctl.cycleTab(1);
      expect(ws.activeWindow).toBe(c);
      ctl.cycleTab(-1);
      expect(ws.activeWindow).toBe(b);
    });

    it("fechar a aba à vista traz a vizinha para a frente e, com uma só, a barra some", () => {
      const { b, c } = stackOnB();
      ws.close(c);
      expect(ws.raised).toContain(b);
      expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
      expect(lastTabs()).toEqual([]);
    });

    it("arrastar uma aba para fora da pilha a tira de lá", () => {
      const { a, b, c } = stackOnB();
      c.dragThrough("move", [rect(100, 500, 634, 394)], ws, { x: 300, y: 700 }); // metade de baixo da a
      expect(a.frameGeometry).toEqual(rect(4, 4, 634, 394));
      expect(c.frameGeometry).toEqual(rect(4, 402, 634, 394));
      expect(b.frameGeometry).toEqual(rect(642, 4, 634, 792));
      expect(lastTabs()).toEqual([]);
    });

    it("o título da aba acompanha o título da janela", () => {
      const { b } = stackOnB();
      b.retitle("b — página nova");
      expect(lastTabs()[0].tabs[0].caption).toBe("b — página nova");
    });

    it("a borda envolve a pilha inteira (barra de abas + janela)", () => {
      stackOnB();
      tick(300);
      expect(borders[borders.length - 1]).toEqual(rect(639, 1, 640, 798));
    });

    it("as abas de outro desktop não aparecem; voltam ao voltar", () => {
      stackOnB();
      ws.switchTo(DESK_2);
      expect(lastTabs()).toEqual([]);
      ws.switchTo(DESK_1);
      expect(lastTabs()).toHaveLength(1);
    });

    it("desligar o tiling esconde as abas", () => {
      stackOnB();
      ctl.toggle();
      expect(lastTabs()).toEqual([]);
    });
  });
});
