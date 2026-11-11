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
