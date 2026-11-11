import { describe, expect, it } from "vitest";
import { keyBindings, langOf, shortcutText } from "../src/kwin/keys";

describe("atalhos: idioma", () => {
  it("langOf: português para pt_BR/pt-BR/pt; inglês para o resto", () => {
    for (const l of ["pt_BR", "pt-BR", "pt", "pt-Latn-BR"]) expect(langOf(l)).toBe("pt");
    for (const l of ["en_US", "de", "C", "", undefined, "ptx"]) expect(langOf(l)).toBe("en");
  });

  it("os nomes (chaves do kglobalaccel) não mudam com o idioma; os textos sim", () => {
    const en = keyBindings("en");
    const pt = keyBindings("pt");
    expect(pt.map((b) => b.name)).toEqual(en.map((b) => b.name));
    expect(pt.map((b) => b.sequence)).toEqual(en.map((b) => b.sequence));
    expect(en[0].text).toBe("Kubik: focus the window to the left");
    expect(pt[0].text).toBe("Kubik: focar a janela à esquerda");
    expect(shortcutText("en", "toggle")).toBe("Kubik: toggle tiling");
    expect(shortcutText("pt", "toggle")).toBe("Kubik: liga/desliga o tiling");
  });

  it("15 ações, nomes únicos", () => {
    const names = keyBindings().map((b) => b.name);
    expect(names).toHaveLength(15);
    expect(new Set(names).size).toBe(15);
  });
});
