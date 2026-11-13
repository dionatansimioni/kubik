import { describe, expect, it } from "vitest";
import {
  actionText, installCommand, langOf, missingText, plan, removeCommand, settingsCommand, tr,
} from "../src/manager/logic";
import type { Status } from "../src/tray/logic";

const NOTHING_MISSING = { dbus: null, shortcuts: null, fetch: null };
const full = (v: string, loaded = true): Status => ({
  script: v, effect: v, tray: v, scriptLoaded: loaded, effectLoaded: loaded, missing: NOTHING_MISSING,
});
const none: Status = { script: null, effect: null, tray: null, scriptLoaded: false, effectLoaded: false, missing: NOTHING_MISSING };
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
  it("instalar do pacote do AppImage ou do GitHub", () => {
    expect(installCommand("bundle", "/tmp/.mount_Kubik/kubik-0.12.0", null)).toBe("bash '/tmp/.mount_Kubik/kubik-0.12.0/install.sh'");
    expect(installCommand("github", "", rel("0.13.0"))).toContain("'https://github.com/x/kubik-0.13.0.tar.gz'");
    // O download vai pelo sys.sh: o do pacote junto ou, sem ele, o da bandeja instalada.
    expect(installCommand("github", "/tmp/.mount_K/kubik-0.12.0", rel("0.13.0"))).toContain("sh '/tmp/.mount_K/kubik-0.12.0/sys.sh' fetch ");
    expect(installCommand("github", "", rel("0.13.0")))
      .toContain('sh "${XDG_DATA_HOME:-$HOME/.local/share}/plasma/plasmoids/io.github.dionatansimioni.kubik/contents/code/sys.sh" fetch ');
    expect(() => installCommand(null, "", null)).toThrow();
    expect(() => installCommand("bundle", "", null)).toThrow();
  });

  it("remover usa a cópia guardada, ou a do pacote junto", () => {
    expect(removeCommand("/b/kubik-0.12.0")).toBe(
      'if [ -f "${XDG_DATA_HOME:-$HOME/.local/share}/kubik/uninstall.sh" ]; then bash "${XDG_DATA_HOME:-$HOME/.local/share}/kubik/uninstall.sh"; ' +
        "else bash '/b/kubik-0.12.0/uninstall.sh'; fi",
    );
    expect(removeCommand("")).toMatch(/else false; fi$/);
  });

  it("caminho com aspas não escapa do shell", () => {
    expect(installCommand("bundle", "/tmp/a'b", null)).toBe("bash '/tmp/a'\\''b/install.sh'");
  });

  it("configurações abre a bandeja numa janela, sem esperar", () => {
    expect(settingsCommand()).toBe("setsid plasmawindowed io.github.dionatansimioni.kubik >/dev/null 2>&1 < /dev/null &");
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
