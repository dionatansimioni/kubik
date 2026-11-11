import { describe, expect, it } from "vitest";
import { rect } from "../src/core/rect";
import { type MorphWindow, CURVES, morph, parseConfig, skipReason } from "../src/effect/morph";

function win(over: Partial<MorphWindow> = {}): MorphWindow {
  return {
    windowClass: "dolphin org.kde.dolphin",
    normalWindow: true,
    managed: true,
    specialWindow: false,
    dialog: false,
    popupWindow: false,
    move: false,
    resize: false,
    fullScreen: false,
    minimized: false,
    visible: true,
    deleted: false,
    ...over,
  };
}

const OLD = rect(4, 4, 1272, 792);
const NEW = rect(4, 4, 634, 792);
const CTX = { resizingSomething: false, skipNext: false };

describe("skipReason", () => {
  it("anima mudanças comuns de janelas normais", () => {
    expect(skipReason(win(), OLD, NEW, CTX)).toBeNull();
  });

  const cases: Array<[string, Partial<MorphWindow>]> = [
    ["o usuário está movendo", { move: true }],
    ["o usuário está redimensionando", { resize: true }],
    ["tela cheia", { fullScreen: true }],
    ["minimizada", { minimized: true }],
    ["invisível", { visible: false }],
    ["fechada", { deleted: true }],
    ["não é normal", { normalWindow: false }],
    ["diálogo", { dialog: true }],
    ["popup", { popupWindow: true }],
    ["especial", { specialWindow: true }],
    ["overlay interno (sem classe)", { windowClass: " " }],
  ];
  for (const [name, over] of cases)
    it(`não anima: ${name}`, () => expect(skipReason(win(over), OLD, NEW, CTX)).not.toBeNull());

  it("não anima enquanto alguma janela é redimensionada (vizinhas mudam a cada passo)", () => {
    expect(skipReason(win(), OLD, NEW, { ...CTX, resizingSomething: true })).not.toBeNull();
  });

  it("não anima a mudança marcada para pular (maximizar tem efeito próprio)", () => {
    expect(skipReason(win(), OLD, NEW, { ...CTX, skipNext: true })).not.toBeNull();
  });

  it("não anima janela nova (geometria antiga vazia) nem mudança de menos de 2 px", () => {
    expect(skipReason(win(), rect(0, 0, 0, 0), NEW, CTX)).not.toBeNull();
    expect(skipReason(win(), NEW, rect(5, 4, 634, 793), CTX)).not.toBeNull();
  });
});

describe("morph", () => {
  it("encolher: tamanho vai do antigo ao novo e a translação compensa os centros", () => {
    const m = morph(OLD, NEW);
    expect(m.fromSize).toEqual({ width: 1272, height: 792 });
    expect(m.toSize).toEqual({ width: 634, height: 792 });
    // centro antigo (640, 400) - centro novo (321, 400)
    expect(m.fromOffset).toEqual({ x: 319, y: 0 });
  });

  it("troca de lugar: só translação", () => {
    const m = morph(rect(642, 4, 634, 792), rect(4, 4, 634, 792));
    expect(m.fromSize).toEqual(m.toSize);
    expect(m.fromOffset).toEqual({ x: 638, y: 0 });
  });
});

describe("parseConfig", () => {
  it("padrões quando não há configuração", () => {
    expect(parseConfig(undefined, undefined)).toEqual({ duration: 250, curve: "OutCubic" });
  });

  it("aceita duração e curva válidas", () => {
    expect(parseConfig(400, "OutBack")).toEqual({ duration: 400, curve: "OutBack" });
  });

  it("0 desliga a animação (a bandeja oferece de 0 a 600 ms)", () => {
    expect(parseConfig(0, "Linear")).toEqual({ duration: 0, curve: "Linear" });
    expect(parseConfig("0", "Linear").duration).toBe(0);
    expect(parseConfig("", "Linear").duration).toBe(250);
  });

  it("rejeita valores inválidos", () => {
    expect(parseConfig(-5, "Bouncy")).toEqual({ duration: 250, curve: "OutCubic" });
    expect(parseConfig(99999, "OutQuint").duration).toBe(2000);
  });

  it("todas as curvas oferecidas existem no QEasingCurve", () => {
    expect(CURVES).toEqual(expect.arrayContaining(["Linear", "OutCubic", "OutQuint", "OutExpo", "OutBack"]));
  });
});
