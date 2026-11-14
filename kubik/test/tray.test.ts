import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/kwin/settings";
import {
  KEYS, RELEASES_URL, compareVersions, inList, installedVersion, isValidName, kwinrcValues, newerRelease,
  openApps, otherExceptions, parseRead, parseStatus, readCommand, releasesCommand, statusCommand, statusText,
  toSettings, toTrayConfig, toggleInList, updateCommand, writeCommand,
  keyCode, keyText, shortcutRows, shortcutsReadCommand, parseShortcuts, shortcutsWriteCommand, parseMissing,
  restartPanelCommand, logoutCommand,
} from "../src/tray/logic";

const SYS = "/home/u/.local/share/plasma/plasmoids/io.github.dionatansimioni.kubik/contents/code/sys.sh";
import { keyBindings } from "../src/kwin/keys";

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
    const cmd = writeCommand({ ...DEFAULT_SETTINGS, animation: { duration: 400, curve: "Linear" } }, SYS);
    expect(cmd).toContain("--group Script-kubik --key GapsInner '4'");
    expect(cmd).toContain("--group Effect-kubikanimations --key Duration '400'");
    expect(cmd).toContain("--group Effect-kubikanimations --key Curve 'Linear'");
    // O aviso ao KWin vai pelo sys.sh (o cliente de D-Bus que a distro tiver).
    expect(cmd).toContain(`sh '${SYS}' dbus-call org.kde.KWin /KWin org.kde.KWin.reconfigure`);
    expect(cmd).toContain(`sh '${SYS}' dbus-call org.kde.KWin /Effects org.kde.kwin.Effects.reconfigureEffect kubikanimations`);
    expect(cmd).not.toContain("dbus-send");
  });

  it("nomes estranhos nunca chegam ao shell", () => {
    const evil = { ...DEFAULT_SETTINGS, exceptions: ["steam", "x'; rm -rf ~; '", "$(reboot)", "com espaço"] };
    const cmd = writeCommand(evil, SYS);
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
    expect(() => updateCommand({ version: "1.0.0", url: "https://x/a b", page: "" }, SYS)).toThrow();
  });

  it("updateCommand baixa (pelo sys.sh), extrai e roda o install.sh da versão", () => {
    const cmd = updateCommand({ version: "0.10.0", url: "https://github.com/a/kubik-0.10.0.tar.gz", page: "" }, SYS);
    expect(cmd).toContain(`sh '${SYS}' fetch 'https://github.com/a/kubik-0.10.0.tar.gz' "$d/kubik.tar.gz"`);
    expect(cmd).toContain("\"$d/kubik-0.10.0/install.sh\"");
    expect(cmd).toMatch(/rm -rf "\$d"; exit \$r$/);
  });

  it("o download (curl, wget…) fica com o sys.sh; a lista de versões em 20 s", () => {
    const list = releasesCommand(SYS);
    expect(list).toMatch(new RegExp(`^KUBIK_FETCH_TIMEOUT=20 sh '${SYS}' fetch "\\$\\{KUBIK_RELEASES_URL:-[^"]+\\}" - 'Accept: application/vnd.github\\+json'`));
    expect(list).toMatch(/\|\| true$/);
    expect(list).not.toMatch(/curl|wget/);
  });

  it("com o AppImage anexado, atualiza por ele (que também guarda o gerenciador)", () => {
    const r = rel("kubik-v0.12.0");
    r.assets.push({ name: "Kubik-0.12.0-x86_64.AppImage", browser_download_url: "https://github.com/a/Kubik-0.12.0-x86_64.AppImage" });
    const found = newerRelease(JSON.stringify([r]), "0.11.0");
    expect(found?.appimage).toBe("https://github.com/a/Kubik-0.12.0-x86_64.AppImage");
    const cmd = updateCommand(found!, SYS);
    expect(cmd).toContain(`fetch 'https://github.com/a/Kubik-0.12.0-x86_64.AppImage' "$d/Kubik.AppImage"`);
    expect(cmd).toContain('"$d/Kubik.AppImage" --install --yes');
    expect(cmd).toMatch(/rm -rf "\$d"; exit \$r$/);
    // AppImage com endereço estranho: fica o .tar.gz.
    r.assets[r.assets.length - 1].browser_download_url = "https://evil/'x";
    expect(newerRelease(JSON.stringify([r]), "0.11.0")?.appimage).toBeUndefined();
  });

  it("releasesCommand usa a API do GitHub (ou KUBIK_RELEASES_URL) e nunca falha", () => {
    const cmd = releasesCommand(SYS);
    expect(cmd).toContain(`\${KUBIK_RELEASES_URL:-${RELEASES_URL}}`);
    expect(RELEASES_URL).toBe("https://api.github.com/repos/dionatansimioni/kubik/releases?per_page=20");
    expect(cmd).toMatch(/\|\| true$/);
  });

  it("estado: versões e o que está carregado", () => {
    const s = parseStatus("script=0.10.0\neffect=0.10.0\ntray=\ndbus=dbus-send\nshortcuts=dbus-send\nfetch=curl\nscriptLoaded=true\neffectLoaded=false\n");
    expect(s).toEqual({
      script: "0.10.0", effect: "0.10.0", tray: null, scriptLoaded: true, effectLoaded: false,
      missing: { dbus: null, shortcuts: null, fetch: null }, plasmaRestart: false,
    });
    expect(installedVersion(s)).toBe("0.10.0");
    expect(installedVersion(parseStatus("tray=0.9.0"))).toBe("0.9.0");
    expect(installedVersion(parseStatus(""))).toBeNull();
    const cmd = statusCommand(SYS);
    for (const id of ["KWin/Script --show kubik ", "KWin/Effect --show kubikanimations ", "Plasma/Applet --show io.github.dionatansimioni.kubik "])
      expect(cmd).toContain(`--type=${id}`);
    expect(cmd).toContain(`sh '${SYS}' dbus-bool org.kde.KWin /Effects org.kde.kwin.Effects.isEffectLoaded kubikanimations`);
    expect(cmd).toContain(`sh '${SYS}' tools`);
    expect(cmd).not.toContain("dbus-send");
    expect(cmd).toContain(`sh '${SYS}' session-pending`);
  });

  it("estado: painel a reiniciar (sys.sh session-pending; Lição 50)", () => {
    expect(parseStatus("script=0.13.2\nplasmaRestart=true\n").plasmaRestart).toBe(true);
    expect(parseStatus("script=0.13.2\nplasmaRestart=false\n").plasmaRestart).toBe(false);
    // sys.sh antigo (sem a linha): não pede nada.
    expect(parseStatus("script=0.13.2\n").plasmaRestart).toBe(false);
    expect(restartPanelCommand(SYS)).toBe(`sh '${SYS}' plasma-restart >/dev/null 2>&1`);
    expect(logoutCommand(SYS)).toBe(`sh '${SYS}' logout >/dev/null 2>&1`);
  });

  it("estado: o que falta no sistema, com o comando que instala", () => {
    const s = parseStatus("script=0.13.0\ndbus=none\nshortcuts=none\ndbus_hint=sudo dnf install dbus-tools\nfetch=none\nfetch_hint=sudo dnf install curl\nscriptLoaded=\n");
    expect(s.missing).toEqual({ dbus: "sudo dnf install dbus-tools", shortcuts: "sudo dnf install dbus-tools", fetch: "sudo dnf install curl" });
    expect(s.scriptLoaded).toBe(false);
    // Só o qdbus: o estado vale, os atalhos não.
    expect(parseMissing("dbus=qdbus6\nshortcuts=none\ndbus_hint=sudo apt install dbus-bin\nfetch=wget\n"))
      .toEqual({ dbus: null, shortcuts: "sudo apt install dbus-bin", fetch: null });
    // sys.sh antigo ou ausente (nada de "dbus="): não acusa falta.
    expect(parseMissing("script=0.13.0\n")).toEqual({ dbus: null, shortcuts: null, fetch: null });
  });

  it("estado: caminho do sys.sh com espaço e aspas vai citado", () => {
    expect(statusCommand("/home/a b/it's/sys.sh")).toContain(`sh '/home/a b/it'\\''s/sys.sh' tools`);
  });

  it("estado: lê a saída do kpackagetool6 em inglês (em pt-BR o rótulo vira \"Caminho\")", () => {
    const calls = statusCommand(SYS).split("kpackagetool6").slice(1);
    expect(calls).toHaveLength(3);
    for (const before of statusCommand(SYS).split("kpackagetool6").slice(0, -1))
      expect(before.endsWith("LC_ALL=C LANGUAGE= ")).toBe(true);
  });
});

describe("atalhos de teclado: texto ↔ inteiro do Qt", () => {
  it("as teclas do Kubik batem com as do install.sh (scripts/shortcuts.sh)", () => {
    expect(keyCode("Meta+Left")).toBe(285212690);
    expect(keyCode("Meta+Shift+Left")).toBe(318767122);
    expect(keyCode("Meta+Alt+Down")).toBe(419430421);
    expect(keyCode("Meta+O")).toBe(268435535);
    expect(keyCode("Meta+Y")).toBe(0x10000000 + 0x59);
  });

  it("ida e volta no formato portável do Qt (ordem Meta, Ctrl, Alt, Shift)", () => {
    for (const s of ["Meta+Y", "Meta+Ctrl+Tab", "Meta+Ctrl+Shift+Tab", "Ctrl+Alt+F5", "Meta+Shift+Space", "Meta+1", "Alt+PgDown", "Meta+Num+5", "Meta+/"])
      expect(keyText(keyCode(s))).toBe(s);
    expect(keyText(keyCode("shift+meta+left"))).toBe("Meta+Shift+Left");
    expect(keyText(keyCode("Ctrl++"))).toBe("Ctrl++");
  });

  it("vazio, desconhecido ou várias teclas: 0 / \"\"", () => {
    expect(keyCode("")).toBe(0);
    expect(keyCode("Meta+Foo")).toBe(0);
    expect(keyCode("Hyper+A")).toBe(0);
    expect(keyCode("Meta+A, Meta+B")).toBe(0);
    expect(keyText(0)).toBe("");
    expect(keyText(0x10000000)).toBe("");
  });
});

describe("atalhos de teclado: a página", () => {
  it("todas as ações, com o padrão, no idioma do sistema", () => {
    const en = shortcutRows("en_US");
    expect(en.map((r) => r.name)).toEqual([
      "Kubik: Toggle tiling",
      ...keyBindings("en").map((b) => b.name),
      "Kubik: Next tab",
      "Kubik: Previous tab",
    ]);
    expect(en[0]).toEqual({ name: "Kubik: Toggle tiling", text: "Toggle tiling", sequence: "Meta+Y" });
    expect(shortcutRows("pt_BR")[0].text).toBe("Liga/desliga o tiling");
    for (const r of en) expect(keyCode(r.sequence), r.name).not.toBe(0);
  });

  it("lê do kglobalaccel e interpreta (a primeira tecla vale)", () => {
    const cmd = shortcutsReadCommand(["Kubik: Toggle tiling", "Kubik: Move Left", "x'; rm -rf ~"], SYS);
    expect(cmd).toContain(`printf '%s\\t%s\\n' 'Kubik: Toggle tiling' "$(sh '${SYS}' shortcut-get 'Kubik: Toggle tiling' 2>/dev/null)"`);
    expect(cmd).toMatch(new RegExp(`^sh '${SYS}' tools`));
    expect(cmd).toContain("Kubik: Move Left");
    expect(cmd).not.toContain("rm -rf");
    expect(parseShortcuts("Kubik: Toggle tiling\t268435545,123\nKubik: Move Left\t\n")).toEqual({
      "Kubik: Toggle tiling": "Meta+Y",
      "Kubik: Move Left": "",
    });
  });

  it("grava as mudadas e a lista das personalizadas", () => {
    const cmd = shortcutsWriteCommand([{ name: "Kubik: Toggle tiling", code: keyCode("Meta+H") }, { name: "Kubik: Move Up", code: 0 }],
      ["Kubik: Toggle tiling", "Kubik: Move Up"], SYS);
    expect(cmd).toContain(`sh '${SYS}' shortcut-set 'Kubik: Toggle tiling' ${0x10000000 + 0x48}`);
    expect(cmd).toContain(`sh '${SYS}' shortcut-set 'Kubik: Move Up' 0`);
    expect(cmd).toContain("--key CustomShortcuts 'Kubik: Toggle tiling,Kubik: Move Up'");
    expect(shortcutsWriteCommand([], [], SYS)).toContain("--key CustomShortcuts --delete");
  });
});
