import { describe, expect, it } from "vitest";
import {
  actionText, bundleArg, installCommand, langOf, missingText, plan, removeCommand, settingsCommand, tr,
} from "../src/manager/logic";
import type { Status } from "../src/tray/logic";

const full = (v: string, loaded = true): Status => ({
  script: v, effect: v, tray: v, scriptLoaded: loaded, effectLoaded: loaded,
});
const none: Status = { script: null, effect: null, tray: null, scriptLoaded: false, effectLoaded: false };
const rel = (v: string) => ({ version: v, url: `https://github.com/x/kubik-${v}.tar.gz`, page: "" });

describe("gerenciador: o que oferecer", () => {
  it("nada instalado, aberto pelo AppImage: instalar a versão que veio junto", () => {
    expect(plan(none, "0.11.0", null)).toMatchObject({ installed: null, available: "0.11.0", source: "bundle", actions: ["install"] });
  });

  it("nada instalado e o GitHub tem uma mais nova que o AppImage: instala a do GitHub", () => {
    expect(plan(none, "0.11.0", rel("0.12.0"))).toMatchObject({ available: "0.12.0", source: "github", actions: ["install"] });
    // Empate: a que veio junto (sem baixar nada).
    expect(plan(none, "0.11.0", rel("0.11.0"))).toMatchObject({ source: "bundle" });
  });

  it("instalado e em dia: configurações e remover", () => {
    expect(plan(full("0.11.0"), "0.11.0", null)).toMatchObject({ installed: "0.11.0", actions: ["settings", "remove"], warnings: [] });
  });

  it("instalado mais velho que o AppImage ou o GitHub: atualizar (por último, o botão principal)", () => {
    expect(plan(full("0.10.0"), "0.11.0", null)).toMatchObject({ actions: ["settings", "remove", "update"], source: "bundle" });
    expect(plan(full("0.11.0"), null, rel("0.12.0"))).toMatchObject({ actions: ["settings", "remove", "update"], source: "github" });
  });

  it("AppImage mais velho que o instalado: não oferece voltar", () => {
    expect(plan(full("0.12.0"), "0.11.0", null).actions).toEqual(["settings", "remove"]);
  });

  it("aberto pelo menu (sem pacote junto) e sem rede: só o que dá para fazer", () => {
    expect(plan(full("0.11.0"), null, null)).toMatchObject({ available: null, actions: ["settings", "remove"] });
    expect(plan(none, null, null).actions).toEqual([]);
  });

  it("instalação incompleta: reparar", () => {
    const s = { ...full("0.11.0"), effect: null, effectLoaded: false };
    expect(plan(s, "0.11.0", null)).toMatchObject({ missing: ["effect"], actions: ["settings", "remove", "repair"] });
    // Sem a bandeja, não há Configurações.
    const noTray = { ...full("0.11.0"), tray: null };
    expect(plan(noTray, "0.11.0", null).actions).toEqual(["remove", "repair"]);
  });

  it("avisos: efeito só depois de sair e entrar, script parado", () => {
    expect(plan({ ...full("0.11.0"), effectLoaded: false }, null, null).warnings).toEqual(["effect"]);
    expect(plan({ ...full("0.11.0"), scriptLoaded: false }, null, null).warnings).toEqual(["script"]);
  });
});

describe("gerenciador: comandos", () => {
  it("instalar do pacote junto ou do GitHub", () => {
    expect(installCommand("bundle", "/tmp/.mount_Kubik/kubik-0.11.0", null)).toBe("'/tmp/.mount_Kubik/kubik-0.11.0/install.sh'");
    expect(installCommand("github", "", rel("0.12.0"))).toContain("'https://github.com/x/kubik-0.12.0.tar.gz'");
    expect(() => installCommand(null, "", null)).toThrow();
  });

  it("remover usa a cópia guardada, ou a do pacote junto", () => {
    const cmd = removeCommand("/b/kubik-0.11.0");
    expect(cmd).toBe('if [ -f "${XDG_DATA_HOME:-$HOME/.local/share}/kubik/uninstall.sh" ]; then bash "${XDG_DATA_HOME:-$HOME/.local/share}/kubik/uninstall.sh"; else \'/b/kubik-0.11.0/uninstall.sh\'; fi');
    expect(removeCommand("")).toMatch(/else false; fi$/);
  });

  it("caminho com aspas não escapa do shell", () => {
    expect(installCommand("bundle", "/tmp/a'b", null)).toBe("'/tmp/a'\\''b/install.sh'");
  });

  it("configurações abre a bandeja numa janela, sem esperar", () => {
    expect(settingsCommand()).toMatch(/^setsid plasmawindowed io\.github\.dionatansimioni\.kubik .*&$/);
  });

  it("lê --bundle= dos argumentos", () => {
    expect(bundleArg(["qml", "Main.qml", "--", "--bundle=/x/kubik-1.0.0"])).toBe("/x/kubik-1.0.0");
    expect(bundleArg(["qml"])).toBe("");
  });
});

describe("gerenciador: textos", () => {
  it("idioma pelo locale", () => {
    expect(langOf("pt_BR")).toBe("pt");
    expect(langOf("en_US")).toBe("en");
    expect(langOf("")).toBe("en");
  });

  it("botões e faltas nos dois idiomas", () => {
    const p = plan(none, "0.11.0", null);
    expect(actionText("en", "install", p)).toBe("Install 0.11.0");
    expect(actionText("pt", "install", p)).toBe("Instalar 0.11.0");
    expect(actionText("pt", "remove", p)).toBe("Remover…");
    expect(missingText("pt", ["script", "tray"])).toBe("o script de tiling e o ícone da bandeja");
    expect(missingText("en", ["script", "effect", "tray"])).toBe("the tiling script, the animations and the tray icon");
    expect(tr("pt", "failed", 3)).toContain("código 3");
  });
});
