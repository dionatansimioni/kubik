import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/kwin/settings";
import {
  KEYS, inList, isValidName, kwinrcValues, openApps, otherExceptions, parseRead, readCommand,
  statusText, toSettings, toTrayConfig, toggleInList, writeCommand,
} from "../src/tray/logic";

describe("bandeja: ida e volta pelo kwinrc", () => {
  it("o que a bandeja grava, o script (parseSettings) lê igual", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      enabled: false,
      gaps: { inner: 12, outer: 2 },
      exceptions: ["steam", "org.gimp.gimp"],
      allDesktopsOff: ["hdmi-a-1"],
      animation: { duration: 0, curve: "OutBack" as const },
    };
    const v = kwinrcValues(s);
    const stdout = KEYS.map((k) => `${k}=${v[k]}`).join("\n");
    expect(parseRead(stdout)).toEqual(s);
  });

  it("kwinrc sem nada (primeira vez): padrões", () => {
    const stdout = KEYS.map((k) => `${k}=`).join("\n");
    expect(parseRead(stdout)).toEqual(DEFAULT_SETTINGS);
    expect(parseRead("")).toEqual(DEFAULT_SETTINGS);
  });

  it("TrayConfig ↔ Settings", () => {
    expect(toSettings(toTrayConfig(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
    // Do QML os números às vezes chegam como texto, e as listas como "arrays" do QML.
    expect(toSettings({ gapsInner: "7" as unknown as number, exceptions: { length: 1, 0: "Steam" } as unknown as string[] }))
      .toMatchObject({ gaps: { inner: 7, outer: 4 }, exceptions: ["steam"] });
  });
});

describe("comandos", () => {
  it("readCommand lê todas as chaves do [Script-kubik]", () => {
    const cmd = readCommand();
    for (const k of KEYS) expect(cmd).toContain(`--group Script-kubik --key ${k}`);
  });

  it("writeCommand grava script e efeito e avisa o KWin (os dois reconfigures)", () => {
    const cmd = writeCommand({ ...DEFAULT_SETTINGS, animation: { duration: 400, curve: "Linear" } });
    expect(cmd).toContain("--group Script-kubik --key GapsInner '4'");
    expect(cmd).toContain("--group Effect-kubikanimations --key Duration '400'");
    expect(cmd).toContain("--group Effect-kubikanimations --key Curve 'Linear'");
    expect(cmd).toContain("/KWin org.kde.KWin.reconfigure");
    expect(cmd).toContain("org.kde.kwin.Effects.reconfigureEffect string:kubikanimations");
  });

  it("nomes estranhos nunca chegam ao shell", () => {
    const evil = { ...DEFAULT_SETTINGS, exceptions: ["steam", "x'; rm -rf ~; '", "$(reboot)", "com espaço"] };
    const cmd = writeCommand(evil);
    expect(cmd).toContain("--key Exceptions 'steam'");
    expect(cmd).not.toContain("rm -rf");
    expect(cmd).not.toContain("reboot");
    expect(isValidName("org.kde.dolphin")).toBe(true);
    expect(isValidName("DP-3")).toBe(true);
    expect(isValidName("-x")).toBe(false);
  });
});

describe("listas (exceções e telas)", () => {
  it("toggleInList liga e desliga sem repetir e sem maiúsculas", () => {
    expect(toggleInList(["a"], "B", true)).toEqual(["a", "b"]);
    expect(toggleInList(["a", "b"], "b", true)).toEqual(["a", "b"]);
    expect(toggleInList(["a", "b"], "A", false)).toEqual(["b"]);
    expect(inList(["hdmi-a-1"], "HDMI-A-1")).toBe(true);
    expect(inList(undefined, "x")).toBe(false);
  });

  it("openApps: um por app, sem as exceções embutidas, em ordem alfabética", () => {
    const apps = openApps([
      { appId: "org.kde.dolphin", appName: "Dolphin", icon: "d" },
      { appId: "firefox", appName: "Firefox", icon: "f" },
      { appId: "org.kde.dolphin", appName: "Dolphin", icon: "d" },
      { appId: "org.kde.plasmashell", appName: "Plasma", icon: "p" },
      { appId: "", appName: "sem id", icon: "" },
    ]);
    expect(apps.map((a) => a.id)).toEqual(["org.kde.dolphin", "firefox"]);
  });

  it("otherExceptions: as que não são de app aberto", () => {
    const open = openApps([{ appId: "steam", appName: "Steam", icon: "" }]);
    expect(otherExceptions(["steam", "gimp"], open)).toEqual(["gimp"]);
  });
});

describe("statusText", () => {
  it("resume o estado no tooltip", () => {
    expect(statusText(toTrayConfig(DEFAULT_SETTINGS))).toBe("Tiling ligado · gaps 4 px · borda 3 px");
    expect(statusText({ enabled: false })).toBe("Tiling desligado (Meta+Y liga)");
  });
});
