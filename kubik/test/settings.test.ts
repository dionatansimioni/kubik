import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, describeSettings, list, parseSettings } from "../src/kwin/settings";

/** Como o KWin.readConfig: o que está no kwinrc (texto) ou o padrão. */
const reader = (rc: Record<string, string>) => (key: string, fallback: unknown) => (key in rc ? rc[key] : fallback);

describe("parseSettings", () => {
  it("kwinrc vazio: os padrões", () => {
    expect(parseSettings(reader({}))).toEqual(DEFAULT_SETTINGS);
  });

  it("lê os valores como o kwriteconfig6 grava (texto)", () => {
    const s = parseSettings(
      reader({
        Enabled: "false",
        GapsInner: "8",
        GapsOuter: "0",
        BorderEnabled: "false",
        BorderWidth: "5",
        AllDesktopsOff: "HDMI-A-1",
        Exceptions: "Steam,org.gimp.GIMP",
        AnimDuration: "0",
        AnimCurve: "OutBack",
      }),
    );
    expect(s).toEqual({
      enabled: false,
      gaps: { inner: 8, outer: 0 },
      border: { enabled: false, width: 5 },
      allDesktopsOff: ["hdmi-a-1"],
      exceptions: ["steam", "org.gimp.gimp"],
      animation: { duration: 0, curve: "OutBack" },
    });
  });

  it("valores inválidos ou fora dos limites: padrão ou limite", () => {
    const s = parseSettings(
      reader({ Enabled: "talvez", GapsInner: "abc", GapsOuter: "999", BorderWidth: "0", AnimDuration: "-5", AnimCurve: "Pulo" }),
    );
    expect(s.enabled).toBe(true);
    expect(s.gaps).toEqual({ inner: 4, outer: 64 });
    expect(s.border.width).toBe(1);
    expect(s.animation).toEqual({ duration: 0, curve: "OutCubic" });
  });

  it("aceita tipos nativos (o padrão passado ao readConfig volta como veio)", () => {
    const s = parseSettings((_k, fallback) => fallback);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(reader({ Enabled: "0" })).enabled).toBe(false);
  });
});

describe("list", () => {
  it("separa por vírgula, tira espaços, vazios e repetidos, sem maiúsculas", () => {
    expect(list(" a, B ,,b,c ")).toEqual(["a", "b", "c"]);
    expect(list("")).toEqual([]);
    expect(list(undefined)).toEqual([]);
    expect(list(["X", "y"])).toEqual(["x", "y"]);
  });
});

describe("describeSettings", () => {
  it("resume numa linha", () => {
    expect(describeSettings(DEFAULT_SETTINGS)).toBe(
      "tiling ligado; gaps 4/4; borda 3px; fora em todos os desktops: nenhuma tela; exceções: nenhuma; animação 250ms OutCubic",
    );
  });
});
