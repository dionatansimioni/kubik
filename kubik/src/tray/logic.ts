/**
 * Lógica pura do ícone da bandeja (kubik/tray), sem QML: o esbuild gera
 * tray/contents/code/logic.js, que o QML importa como `Logic.KubikTray`.
 *
 * Fonte da verdade: o kwinrc. A bandeja lê [Script-kubik] ao iniciar (com o
 * MESMO parseSettings do script, então os dois nunca discordam dos padrões),
 * espelha os valores na própria configuração (Plasmoid.configuration, que as
 * páginas de "Configurar…" editam) e, a cada mudança, grava o kwinrc inteiro
 * e pede ao KWin para reler (writeCommand).
 */
import { DEFAULT_FLOATING_CLASSES } from "../kwin/rules";
import { CURVES, DEFAULT_SETTINGS, LIMITS, type Settings, parseSettings } from "../kwin/settings";

export { CURVES, DEFAULT_FLOATING_CLASSES, DEFAULT_SETTINGS, LIMITS };

export const SCRIPT_GROUP = "Script-kubik";
export const EFFECT_GROUP = "Effect-kubikanimations";
export const EFFECT_ID = "kubikanimations";
/** Nome do atalho do script (KWin.ShortcutHandler) no kglobalaccel. */
export const TOGGLE_SHORTCUT = "Kubik: Toggle tiling";

/** Chaves do [Script-kubik], na ordem em que são lidas e gravadas. */
export const KEYS = [
  "Enabled",
  "GapsInner",
  "GapsOuter",
  "BorderEnabled",
  "BorderWidth",
  "AllDesktopsOff",
  "Exceptions",
  "AnimDuration",
  "AnimCurve",
] as const;

/**
 * Curvas oferecidas na bandeja, com nome amigável (outras continuam aceitas
 * no kwinrc). O nome é o texto-fonte em inglês: o QML passa por i18n().
 */
export const CURVE_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "OutCubic", label: "Smooth" },
  { value: "Linear", label: "Linear" },
  { value: "OutQuint", label: "Strong ease-out" },
  { value: "OutBack", label: "Bounce" },
];

/** A configuração da bandeja (contents/config/main.xml): uma entrada por campo. */
export interface TrayConfig {
  enabled: boolean;
  gapsInner: number;
  gapsOuter: number;
  borderEnabled: boolean;
  borderWidth: number;
  allDesktopsOff: string[];
  exceptions: string[];
  animDuration: number;
  animCurve: string;
}

export function toTrayConfig(s: Settings): TrayConfig {
  return {
    enabled: s.enabled,
    gapsInner: s.gaps.inner,
    gapsOuter: s.gaps.outer,
    borderEnabled: s.border.enabled,
    borderWidth: s.border.width,
    allDesktopsOff: [...s.allDesktopsOff],
    exceptions: [...s.exceptions],
    animDuration: s.animation.duration,
    animCurve: s.animation.curve,
  };
}

/**
 * Normaliza o que veio das páginas/popup (QML entrega listas como objetos
 * parecidos com arrays, números como texto às vezes) passando pelo mesmo
 * parseSettings do script.
 */
export function toSettings(c: Partial<TrayConfig>): Settings {
  const v: Record<string, unknown> = {
    Enabled: c.enabled,
    GapsInner: c.gapsInner,
    GapsOuter: c.gapsOuter,
    BorderEnabled: c.borderEnabled,
    BorderWidth: c.borderWidth,
    AllDesktopsOff: c.allDesktopsOff ? Array.from(c.allDesktopsOff as ArrayLike<string>) : undefined,
    Exceptions: c.exceptions ? Array.from(c.exceptions as ArrayLike<string>) : undefined,
    AnimDuration: c.animDuration,
    AnimCurve: c.animCurve,
  };
  return parseSettings((key, fallback) => (v[key] === undefined ? fallback : v[key]));
}

/** Nome seguro para ir ao kwinrc e ao shell: classes de janela, .desktop, saídas (DP-3). */
export function isValidName(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(s);
}

/** Aspas simples de shell (os valores já passaram por isValidName, mas por garantia). */
function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Comando que imprime "Chave=valor" de cada chave do [Script-kubik] (vazio se não existe). */
export function readCommand(): string {
  const reads = KEYS.map(
    (k) => `printf '%s=' ${k}; kreadconfig6 --file kwinrc --group ${SCRIPT_GROUP} --key ${k} 2>/dev/null; echo`,
  );
  return reads.join("; ");
}

/** Interpreta a saída do readCommand. */
export function parseRead(stdout: string): Settings {
  const found: Record<string, string> = {};
  for (const line of String(stdout || "").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (value !== "") found[key] = value;
  }
  return parseSettings((key, fallback) => (key in found ? found[key] : fallback));
}

/** Os valores como vão ao kwinrc (texto). Listas: só nomes válidos, separados por vírgula. */
export function kwinrcValues(s: Settings): Record<(typeof KEYS)[number], string> {
  return {
    Enabled: String(s.enabled),
    GapsInner: String(s.gaps.inner),
    GapsOuter: String(s.gaps.outer),
    BorderEnabled: String(s.border.enabled),
    BorderWidth: String(s.border.width),
    AllDesktopsOff: s.allDesktopsOff.filter(isValidName).join(","),
    Exceptions: s.exceptions.filter(isValidName).join(","),
    AnimDuration: String(s.animation.duration),
    AnimCurve: s.animation.curve,
  };
}

/**
 * Grava tudo no kwinrc e avisa o KWin: o reconfigure faz o script reler
 * (Options.configChanged); o efeito só relê com o reconfigureEffect dele.
 */
export function writeCommand(s: Settings): string {
  const v = kwinrcValues(s);
  const kw = (group: string, key: string, value: string) =>
    `kwriteconfig6 --file kwinrc --group ${group} --key ${key} ${q(value)}`;
  const cmds = KEYS.map((k) => kw(SCRIPT_GROUP, k, v[k]));
  cmds.push(kw(EFFECT_GROUP, "Duration", v.AnimDuration), kw(EFFECT_GROUP, "Curve", v.AnimCurve));
  const dbus = "dbus-send --session --print-reply --dest=org.kde.KWin";
  cmds.push(`${dbus} /KWin org.kde.KWin.reconfigure >/dev/null`);
  cmds.push(`${dbus} /Effects org.kde.kwin.Effects.reconfigureEffect string:${EFFECT_ID} >/dev/null`);
  return cmds.join(" && ");
}

/** Liga/desliga uma entrada de lista (exceções, telas), sem maiúsculas e sem repetir. */
export function toggleInList(list: ArrayLike<string>, name: string, on: boolean): string[] {
  const n = name.trim().toLowerCase();
  const rest = Array.from(list).filter((x) => x.toLowerCase() !== n);
  return on && n ? [...rest, n] : rest;
}

export function inList(list: ArrayLike<string> | null | undefined, name: string): boolean {
  const n = name.trim().toLowerCase();
  return Array.from(list ?? []).some((x) => x.toLowerCase() === n);
}

export interface OpenApp {
  /** O que vai para a lista de exceções (o AppId da barra de tarefas, sem maiúsculas). */
  id: string;
  name: string;
  icon: unknown;
}

/** Janelas abertas (linhas do TasksModel) → um app por AppId, em ordem alfabética. */
export function openApps(rows: ReadonlyArray<{ appId: string; appName: string; icon: unknown }>): OpenApp[] {
  const byId = new Map<string, OpenApp>();
  for (const r of rows) {
    const id = String(r.appId || "").trim().toLowerCase().replace(/\.desktop$/, "");
    if (!id || !isValidName(id) || byId.has(id)) continue;
    if (DEFAULT_FLOATING_CLASSES.includes(id)) continue; // já flutua sempre
    byId.set(id, { id, name: String(r.appName || id), icon: r.icon });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Exceções que não são de nenhum app aberto agora (seção "Outras"). */
export function otherExceptions(exceptions: ArrayLike<string>, open: ReadonlyArray<OpenApp>): string[] {
  return Array.from(exceptions).filter((e) => !open.some((a) => a.id === e.toLowerCase()));
}

/** Resumo do estado para o log da bandeja (o tooltip é montado no QML, traduzido). */
export function statusText(c: Partial<TrayConfig>): string {
  const s = toSettings(c);
  if (!s.enabled) return "Tiling desligado (Meta+Y liga)";
  return `Tiling ligado · gaps ${s.gaps.inner} px · borda ${s.border.enabled ? `${s.border.width} px` : "desligada"}`;
}

// ---- gerenciador: estado, versões novas no GitHub, atualizar, desinstalar ----

/** Repositório dos releases (as versões são pré-releases com a tag kubik-v<versão>). */
export const REPO = "dionatansimioni/kubik";
export const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
/** De quanto em quanto tempo a bandeja procura versão nova (6 h). */
export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Os três componentes instalados pelo install.sh. */
export const COMPONENTS = [
  { key: "script", type: "KWin/Script", id: "kubik" },
  { key: "effect", type: "KWin/Effect", id: EFFECT_ID },
  { key: "tray", type: "Plasma/Applet", id: "io.github.dionatansimioni.kubik" },
] as const;

export interface Status {
  /** Versão instalada de cada componente (null: não instalado). */
  script: string | null;
  effect: string | null;
  tray: string | null;
  scriptLoaded: boolean;
  effectLoaded: boolean;
}

/**
 * Comando que imprime "chave=valor" do estado: a versão de cada componente
 * (do metadata.json no Path que o kpackagetool6 mostra; LC_ALL=C porque em
 * pt-BR o rótulo vira "Caminho") e se o script e o
 * efeito estão carregados no KWin agora.
 */
export function statusCommand(): string {
  const version = COMPONENTS.map(
    (c) =>
      `p=$(LC_ALL=C LANGUAGE= kpackagetool6 --type=${c.type} --show ${c.id} 2>/dev/null | sed -n 's/^ *Path *: *//p'); ` +
      `v=""; [ -n "$p" ] && v=$(sed -n 's/.*"Version": *"\\([^"]*\\)".*/\\1/p' "\${p%/}/metadata.json" 2>/dev/null | head -n1); ` +
      `echo "${c.key}=$v"`,
  );
  const dbus = "dbus-send --session --print-reply --dest=org.kde.KWin";
  const loaded = (key: string, path: string, method: string, id: string) =>
    `echo "${key}=$(${dbus} ${path} ${method} string:${id} 2>/dev/null | grep -c 'boolean true')"`;
  return [
    ...version,
    loaded("scriptLoaded", "/Scripting", "org.kde.kwin.Scripting.isScriptLoaded", "kubik"),
    loaded("effectLoaded", "/Effects", "org.kde.kwin.Effects.isEffectLoaded", EFFECT_ID),
  ].join("; ");
}

export function parseStatus(stdout: string): Status {
  const v: Record<string, string> = {};
  for (const line of String(stdout || "").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) v[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const ver = (k: string) => (isVersion(v[k] ?? "") ? v[k] : null);
  return {
    script: ver("script"),
    effect: ver("effect"),
    tray: ver("tray"),
    scriptLoaded: v.scriptLoaded === "1",
    effectLoaded: v.effectLoaded === "1",
  };
}

/** A versão "do Kubik": a do script (o principal) ou, sem ele, a da bandeja. */
export function installedVersion(s: Status | null | undefined): string | null {
  return s ? (s.script ?? s.tray) : null;
}

export function isVersion(s: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(s);
}

/** Compara "1.2.3" com "1.10.0" numericamente: <0, 0 ou >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Lista os releases do GitHub. KUBIK_RELEASES_URL troca o endereço (o
 * testenv aponta para um servidor local). Sem rede: saída vazia, sem erro.
 */
export function releasesCommand(): string {
  return `${download(`"\${KUBIK_RELEASES_URL:-${RELEASES_URL}}"`, "-", 20, "Accept: application/vnd.github+json")} 2>/dev/null || true`;
}

/**
 * Baixa `url` (já citado para o shell) para `out` ("-" = saída padrão) com o
 * curl ou, sem ele, com o wget: o Debian não instala o curl por padrão, só o
 * wget. Os dois falham (saída ≠ 0) com erro HTTP.
 */
function download(url: string, out: string, seconds: number, header?: string): string {
  const o = out === "-" ? "-" : `"${out}"`;
  const curl = `curl -fsSL --max-time ${seconds}${header ? ` -H '${header}'` : ""} -o ${o} ${url}`;
  const wget = `wget -q -T ${seconds}${header ? ` --header='${header}'` : ""} -O ${o} ${url}`;
  return `{ if command -v curl >/dev/null 2>&1; then ${curl}; else ${wget}; fi; }`;
}

export interface Release {
  version: string;
  /** O kubik-<versão>.tar.gz do release. */
  url: string;
  /** O Kubik-<versão>-x86_64.AppImage do release (atualiza também o gerenciador), se houver. */
  appimage?: string;
  /** Página do release (notas). */
  page: string;
}

/** Endereço seguro para ir ao shell (entre aspas simples, mas por garantia). */
function isSafeUrl(s: string): boolean {
  return /^https?:\/\/[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$/.test(s) && !s.includes("'");
}

/** O release mais novo com o .tar.gz anexado, se for mais novo que `current`. */
export function newerRelease(json: string, current: string | null): Release | null {
  let list: unknown;
  try {
    list = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  let best: Release | null = null;
  for (const r of list as Array<Record<string, unknown>>) {
    if (!r || r.draft) continue;
    const m = /^kubik-v(\d+\.\d+\.\d+)$/.exec(String(r.tag_name ?? ""));
    if (!m) continue;
    const version = m[1];
    const assets = Array.isArray(r.assets) ? (r.assets as Array<Record<string, unknown>>) : [];
    const tar = assets.find((a) => a && a.name === `kubik-${version}.tar.gz`);
    const url = tar ? String(tar.browser_download_url ?? "") : "";
    if (!isSafeUrl(url)) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    const page = String(r.html_url ?? "");
    const ai = assets.find((a) => a && a.name === `Kubik-${version}-x86_64.AppImage`);
    const appimage = ai ? String(ai.browser_download_url ?? "") : "";
    best = { version, url, page: isSafeUrl(page) ? page : `https://github.com/${REPO}/releases` };
    if (isSafeUrl(appimage)) best.appimage = appimage;
  }
  if (!best) return null;
  return current && isVersion(current) && compareVersions(best.version, current) <= 0 ? null : best;
}

/** Baixa o .tar.gz do release e roda o install.sh dele (o mesmo da instalação manual). */
export function updateCommand(r: Release): string {
  if (!isSafeUrl(r.url) || !isVersion(r.version)) throw new Error(`release inválido: ${r.version} ${r.url}`);
  // Com o AppImage, ele mesmo instala (e guarda a si próprio como o gerenciador).
  if (r.appimage && isSafeUrl(r.appimage))
    return (
      `d=$(mktemp -d) && ${download(q(r.appimage), "$d/Kubik.AppImage", 600)} && ` +
      `chmod +x "$d/Kubik.AppImage" && "$d/Kubik.AppImage" --install --yes; ` +
      `r=$?; rm -rf "$d"; exit $r`
    );
  return (
    `d=$(mktemp -d) && ${download(q(r.url), "$d/kubik.tar.gz", 600)} && ` +
    `tar xzf "$d/kubik.tar.gz" -C "$d" && "$d/kubik-${r.version}/install.sh"; ` +
    `r=$?; rm -rf "$d"; exit $r`
  );
}

/** Onde o install.sh guarda o gerenciador (Kubik.AppImage) e uma cópia do uninstall.sh. */
export const DATA_DIR = "${XDG_DATA_HOME:-$HOME/.local/share}/kubik";
