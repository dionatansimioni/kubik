/**
 * Lógica pura do gerenciador do Kubik (kubik/manager: um app Qt próprio, com
 * o Qt dentro do AppImage): a janela do AppImage e da entrada "Kubik" do menu.
 * Decide o que mostrar e que ações oferecer a partir do estado no sistema (os
 * mesmos comandos da bandeja: src/tray/logic.ts) e monta os comandos de shell.
 *
 * Os textos ficam aqui, em inglês e português (o app não usa o i18n do KDE).
 */
import {
  INSTALLED_SYS,
  type Release,
  type Status,
  type SysPath,
  compareVersions,
  DATA_DIR,
  installedVersion,
  isVersion,
  newerRelease,
  parseStatus,
  releasesCommand,
  statusCommand,
  updateCommand,
} from "../tray/logic";

export { compareVersions, newerRelease, parseStatus, releasesCommand, statusCommand };

/** O sys.sh do pacote que vem no AppImage ou, sem ele, o da bandeja instalada. */
export function sysPath(bundleDir: string): SysPath {
  return bundleDir ? `${bundleDir}/sys.sh` : INSTALLED_SYS;
}

export type Action = "install" | "update" | "repair" | "remove" | "settings";

export interface Plan {
  installed: string | null;
  /** A melhor versão para instalar/atualizar e de onde ela vem. */
  available: string | null;
  source: "bundle" | "github" | null;
  /** Ações, na ordem dos botões (a principal por último, à direita). */
  actions: Action[];
  /** Avisos de estado. */
  /** dbus/fetch: programa faltando no sistema (sys.sh); o comando que instala fica em hints. */
  warnings: Array<"effect" | "script" | "dbus" | "fetch">;
  hints: { dbus: string | null; fetch: string | null };
  /** Componentes que faltam numa instalação incompleta. */
  missing: Array<"script" | "effect" | "tray">;
}

/**
 * bundled: a versão que vem no AppImage (o pacote junto) ou null.
 * release: o release mais novo do GitHub (ou null: sem rede, nada novo).
 */
export function plan(status: Status | null, bundled: string | null, release: Release | null): Plan {
  const installed = installedVersion(status);
  const bundle = bundled && isVersion(bundled) ? bundled : null;
  let available: string | null = bundle;
  let source: Plan["source"] = bundle ? "bundle" : null;
  if (release && (!available || compareVersions(release.version, available) > 0)) {
    available = release.version;
    source = "github";
  }
  const missing: Plan["missing"] = [];
  const warnings: Plan["warnings"] = [];
  const actions: Action[] = [];
  const tools = status?.missing ?? { dbus: null, fetch: null };
  // Sem cliente de D-Bus, o estado "carregado" não vale: avisa o que instalar.
  if (tools.dbus) warnings.push("dbus");
  if (tools.fetch) warnings.push("fetch");
  if (!installed) {
    if (available) actions.push("install");
  } else {
    for (const k of ["script", "effect", "tray"] as const) if (status && !status[k]) missing.push(k);
    if (!tools.dbus && status?.script && !status.scriptLoaded) warnings.push("script");
    if (!tools.dbus && status?.effect && !status.effectLoaded) warnings.push("effect");
    if (status?.tray) actions.push("settings");
    actions.push("remove");
    if (available && compareVersions(available, installed) > 0) actions.push("update");
    else if (missing.length && available) actions.push("repair");
  }
  return { installed, available, source, actions, warnings, missing, hints: { dbus: tools.dbus, fetch: tools.fetch } };
}

/** Aspas simples de shell. */
function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Instalar/atualizar/reparar: do pacote que vem no AppImage ou do release do GitHub. */
export function installCommand(source: Plan["source"], bundleDir: string, release: Release | null): string {
  if (source === "github" && release) return updateCommand(release, sysPath(bundleDir));
  if (source === "bundle" && bundleDir) return `bash ${q(`${bundleDir}/install.sh`)}`;
  throw new Error("nada para instalar");
}

/** Remover: a cópia guardada pelo install.sh ou, sem ela, a do pacote junto. */
export function removeCommand(bundleDir: string): string {
  const stored = `"${DATA_DIR}/uninstall.sh"`;
  const fallback = bundleDir ? `bash ${q(`${bundleDir}/uninstall.sh`)}` : "false";
  return `if [ -f ${stored} ]; then bash ${stored}; else ${fallback}; fi`;
}

/** Configurações: a bandeja numa janela (plasmawindowed), ao lado do gerenciador. */
export function settingsCommand(): string {
  return "setsid plasmawindowed io.github.dionatansimioni.kubik >/dev/null 2>&1 < /dev/null &";
}

// ---- textos ------------------------------------------------------------------

const TEXTS = {
  title: ["Kubik", "Kubik"],
  tagline: ["Auto-tiling for KDE Plasma", "Auto-tiling para o KDE Plasma"],
  checking: ["Checking…", "Verificando…"],
  installed: ["Installed", "Instalado"],
  notInstalled: ["Not installed", "Não instalado"],
  available: ["Available", "Disponível"],
  upToDate: ["Up to date", "Em dia"],
  fromGithub: ["%1 on GitHub", "%1 no GitHub"],
  missing: ["Incomplete: %1 missing.", "Incompleto: falta %1."],
  part_script: ["the tiling script", "o script de tiling"],
  part_effect: ["the animations", "as animações"],
  part_tray: ["the tray icon", "o ícone da bandeja"],
  warn_effect: ["Animations start after you log out and back in.", "As animações começam depois que você sair e entrar na sessão."],
  warn_script: [
    "The tiling script is not running. Turn it on in System Settings › Window Management › KWin Scripts.",
    "O script de tiling não está rodando. Ative em Configurações do Sistema › Gerenciamento de janelas › Scripts do KWin.",
  ],
  warn_dbus: [
    "Kubik can't talk to KWin: a D-Bus tool is missing. Install it with: %1",
    "O Kubik não consegue falar com o KWin: falta um programa de D-Bus. Instale com: %1",
  ],
  warn_fetch: [
    "Can't check GitHub for new versions: a download tool is missing. Install it with: %1",
    "Não dá para procurar versões novas no GitHub: falta um programa de download. Instale com: %1",
  ],
  act_install: ["Install %1", "Instalar %1"],
  act_update: ["Update to %1", "Atualizar para %1"],
  act_repair: ["Repair", "Reparar"],
  act_remove: ["Remove…", "Remover…"],
  act_settings: ["Settings", "Configurações"],
  confirmRemove: ["Remove Kubik, its tray icon and its shortcuts?", "Remover o Kubik, o ícone da bandeja e os atalhos?"],
  remove: ["Remove", "Remover"],
  cancel: ["Cancel", "Cancelar"],
  busy_install: ["Installing…", "Instalando…"],
  busy_update: ["Updating…", "Atualizando…"],
  busy_repair: ["Repairing…", "Reparando…"],
  busy_remove: ["Removing…", "Removendo…"],
  done_install: ["Kubik %1 is installed.", "O Kubik %1 foi instalado."],
  done_update: ["Updated to %1.", "Atualizado para %1."],
  done_repair: ["Repaired.", "Reparado."],
  done_remove: ["Kubik was removed.", "O Kubik foi removido."],
  failed: ["Something went wrong (code %1). Check your internet connection and try again.", "Algo deu errado (código %1). Confira a conexão com a internet e tente de novo."],
  nothing: [
    "Kubik is not installed. Download the installer from GitHub.",
    "O Kubik não está instalado. Baixe o instalador no GitHub.",
  ],
  keys: [
    "Meta+arrows move the focus between windows. KDE's quick tile on those keys is off until you remove Kubik.",
    "Meta+setas passam o foco entre as janelas. O quick tile do KDE nessas teclas fica desligado até remover o Kubik.",
  ],
} as const;

export type TextKey = keyof typeof TEXTS;

/** "pt" para qualquer locale português (pt_BR, pt_PT), senão "en". */
export function langOf(locale: string): "en" | "pt" {
  return /^pt/i.test(String(locale || "")) ? "pt" : "en";
}

export function tr(lang: "en" | "pt", key: TextKey, ...args: Array<string | number>): string {
  let s: string = TEXTS[key][lang === "pt" ? 1 : 0];
  args.forEach((a, i) => (s = s.split(`%${i + 1}`).join(String(a))));
  return s;
}

/** Texto do botão de uma ação. */
export function actionText(lang: "en" | "pt", a: Action, p: Plan): string {
  if (a === "install") return tr(lang, "act_install", p.available ?? "");
  if (a === "update") return tr(lang, "act_update", p.available ?? "");
  return tr(lang, `act_${a}` as TextKey);
}

/** "o script de tiling e as animações". */
export function missingText(lang: "en" | "pt", missing: Plan["missing"]): string {
  const parts = missing.map((m) => tr(lang, `part_${m}` as TextKey));
  if (parts.length <= 1) return parts.join("");
  const and = lang === "pt" ? " e " : " and ";
  return parts.slice(0, -1).join(", ") + and + parts[parts.length - 1];
}
