/**
 * Configurações do usuário, lidas do kwinrc ([Script-kubik]) com
 * KWin.readConfig. Quem escreve é o ícone da bandeja (kubik/tray): ele grava
 * as chaves com kwriteconfig6 e pede ao KWin um "reconfigure"; o KWin então
 * emite Options.configChanged e o Kubik.qml relê tudo (parseSettings).
 *
 * As chaves e os padrões ficam AQUI e no tray (contents/code/settings.js):
 * mudou um, mude o outro (o teste tests/test_tray.py confere).
 */
import type { Gaps } from "../core/tree";

/** Curvas oferecidas (nomes do QEasingCurve / Easing do QML). */
export const CURVES = ["Linear", "OutQuad", "OutCubic", "OutQuart", "OutQuint", "OutExpo", "OutCirc", "OutBack", "InOutCubic"] as const;
export type CurveName = (typeof CURVES)[number];

export interface Settings {
  /** Tiling ligado. Persistido: vale também depois de reiniciar a sessão. */
  enabled: boolean;
  gaps: Gaps;
  border: { enabled: boolean; width: number };
  /** Telas (nome da saída, ex.: "DP-3") onde janelas "em todos os desktops" ficam FORA do tiling. */
  allDesktopsOff: readonly string[];
  /** Apps que sempre flutuam (classe da janela ou nome do .desktop, sem maiúsculas). */
  exceptions: readonly string[];
  /** Animação: duração base em ms (0 = sem animação) e curva. */
  animation: { duration: number; curve: CurveName };
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  gaps: { outer: 4, inner: 4 },
  border: { enabled: true, width: 3 },
  allDesktopsOff: [],
  exceptions: [],
  animation: { duration: 250, curve: "OutCubic" },
};

export const LIMITS = {
  gaps: { min: 0, max: 64 },
  borderWidth: { min: 1, max: 12 },
  duration: { min: 0, max: 600 },
} as const;

/** readConfig: devolve o valor do kwinrc (sempre texto) ou o padrão passado. */
export type ConfigReader = (key: string, fallback: unknown) => unknown;

function toBool(v: unknown, d: boolean): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return d;
}

function toInt(v: unknown, d: number, lim: { min: number; max: number }): number {
  const s = typeof v === "number" ? v : String(v ?? "").trim();
  if (s === "") return d;
  const n = Number(s);
  if (!Number.isFinite(n)) return d;
  return Math.min(lim.max, Math.max(lim.min, Math.round(n)));
}

/** Lista separada por vírgulas (como o KConfig grava QStringList), sem vazios nem repetidos. */
export function list(v: unknown): string[] {
  const items = Array.isArray(v) ? v.map(String) : String(v ?? "").split(",");
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim().toLowerCase();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function parseSettings(read: ConfigReader): Settings {
  const d = DEFAULT_SETTINGS;
  const curve = String(read("AnimCurve", d.animation.curve) ?? "");
  return {
    enabled: toBool(read("Enabled", d.enabled), d.enabled),
    gaps: {
      inner: toInt(read("GapsInner", d.gaps.inner), d.gaps.inner, LIMITS.gaps),
      outer: toInt(read("GapsOuter", d.gaps.outer), d.gaps.outer, LIMITS.gaps),
    },
    border: {
      enabled: toBool(read("BorderEnabled", d.border.enabled), d.border.enabled),
      width: toInt(read("BorderWidth", d.border.width), d.border.width, LIMITS.borderWidth),
    },
    // Nomes de saída mantêm maiúsculas ("DP-3"): compara-se sem elas mesmo assim.
    allDesktopsOff: list(read("AllDesktopsOff", "")),
    exceptions: list(read("Exceptions", "")),
    animation: {
      duration: toInt(read("AnimDuration", d.animation.duration), d.animation.duration, LIMITS.duration),
      curve: (CURVES as readonly string[]).includes(curve) ? (curve as CurveName) : d.animation.curve,
    },
  };
}

/** Uma linha curta para o log: o que está valendo. */
export function describeSettings(s: Settings): string {
  return [
    `tiling ${s.enabled ? "ligado" : "desligado"}`,
    `gaps ${s.gaps.inner}/${s.gaps.outer}`,
    `borda ${s.border.enabled ? `${s.border.width}px` : "desligada"}`,
    `fora em todos os desktops: ${s.allDesktopsOff.join(",") || "nenhuma tela"}`,
    `exceções: ${s.exceptions.join(",") || "nenhuma"}`,
    `animação ${s.animation.duration}ms ${s.animation.curve}`,
  ].join("; ");
}
