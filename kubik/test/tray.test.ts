import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/kwin/settings";
import {
  KEYS, RELEASES_URL, compareVersions, inList, installedVersion, isValidName, kwinrcValues, newerRelease,
  openApps, otherExceptions, parseRead, parseStatus, readCommand, releasesCommand, statusCommand, statusText,
  toSettings, toTrayConfig, toggleInList, updateCommand, writeCommand,
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

describe("gerenciador", () => {
  const rel = (tag: string, extra: Record<string, unknown> = {}) => {
    const v = tag.replace("kubik-v", "");
    return {
      tag_name: tag,
      draft: false,
      prerelease: true,
      html_url: `https://github.com/dionatansimioni/kubik/releases/tag/${tag}`,
      assets: [
        { name: `kubik-${v}.kwinscript`, browser_download_url: `https://github.com/x/kubik-${v}.kwinscript` },
        { name: `kubik-${v}.tar.gz`, browser_download_url: `https://github.com/dionatansimioni/kubik/releases/download/${tag}/kubik-${v}.tar.gz` },
      ],
      ...extra,
    };
  };

  it("compara versões numericamente", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.1", "0.10.0")).toBeLessThan(0);
  });

  it("acha o release mais novo com o .tar.gz, ignorando rascunhos e outras tags", () => {
    const json = JSON.stringify([
      rel("kubik-v0.9.0"),
      rel("kubik-v0.11.0", { draft: true }),
      rel("kubik-v0.10.0"),
      rel("outro-v9.0.0"),
      { ...rel("kubik-v0.10.5"), assets: [] },
    ]);
    expect(newerRelease(json, "0.9.0")).toEqual({
      version: "0.10.0",
      url: "https://github.com/dionatansimioni/kubik/releases/download/kubik-v0.10.0/kubik-0.10.0.tar.gz",
      page: "https://github.com/dionatansimioni/kubik/releases/tag/kubik-v0.10.0",
    });
    expect(newerRelease(json, "0.10.0")).toBeNull();
    expect(newerRelease(json, "0.12.0")).toBeNull();
    // Nada instalado: qualquer release serve.
    expect(newerRelease(json, null)?.version).toBe("0.10.0");
  });

  it("sem rede ou resposta estranha: nada", () => {
    expect(newerRelease("", "0.9.0")).toBeNull();
    expect(newerRelease("{\"message\":\"API rate limit exceeded\"}", "0.9.0")).toBeNull();
    expect(newerRelease("[null, 3]", "0.9.0")).toBeNull();
  });

  it("endereço com aspas ou espaço não vai para o shell", () => {
    const bad = rel("kubik-v1.0.0");
    bad.assets[1].browser_download_url = "https://evil/'; rm -rf ~; '.tar.gz";
    expect(newerRelease(JSON.stringify([bad]), "0.9.0")).toBeNull();
    expect(() => updateCommand({ version: "1.0.0", url: "https://x/a b", page: "" })).toThrow();
  });

  it("updateCommand baixa, extrai e roda o install.sh da versão", () => {
    const cmd = updateCommand({ version: "0.10.0", url: "https://github.com/a/kubik-0.10.0.tar.gz", page: "" });
    expect(cmd).toContain("curl -fsSL --max-time 600 -o \"$d/kubik.tar.gz\" 'https://github.com/a/kubik-0.10.0.tar.gz'");
    expect(cmd).toContain("\"$d/kubik-0.10.0/install.sh\"");
    expect(cmd).toMatch(/rm -rf "\$d"; exit \$r$/);
  });

  it("releasesCommand usa a API do GitHub (ou KUBIK_RELEASES_URL) e nunca falha", () => {
    const cmd = releasesCommand();
    expect(cmd).toContain(`\${KUBIK_RELEASES_URL:-${RELEASES_URL}}`);
    expect(RELEASES_URL).toBe("https://api.github.com/repos/dionatansimioni/kubik/releases?per_page=20");
    expect(cmd).toMatch(/\|\| true$/);
  });

  it("estado: versões e o que está carregado", () => {
    const s = parseStatus("script=0.10.0\neffect=0.10.0\ntray=\nscriptLoaded=1\neffectLoaded=0\n");
    expect(s).toEqual({ script: "0.10.0", effect: "0.10.0", tray: null, scriptLoaded: true, effectLoaded: false });
    expect(installedVersion(s)).toBe("0.10.0");
    expect(installedVersion(parseStatus("tray=0.9.0"))).toBe("0.9.0");
    expect(installedVersion(parseStatus(""))).toBeNull();
    const cmd = statusCommand();
    for (const id of ["KWin/Script --show kubik ", "KWin/Effect --show kubikanimations ", "Plasma/Applet --show io.github.dionatansimioni.kubik "])
      expect(cmd).toContain(`--type=${id}`);
    expect(cmd).toContain("isEffectLoaded string:kubikanimations");
  });
});
