/**
 * Teclas como texto ("Meta+Shift+Left", o formato portável do QKeySequence,
 * que o KeySequenceItem do QML lê e escreve) ↔ inteiro do Qt (modificadores
 * + tecla), o formato do kglobalaccel no D-Bus (`shortcut`/`setForeignShortcut`).
 */

const MODS: ReadonlyArray<[string, number]> = [
  ["Meta", 0x10000000],
  ["Ctrl", 0x04000000],
  ["Alt", 0x08000000],
  ["Shift", 0x02000000],
];
const KEYPAD = 0x20000000;
const MOD_MASK = 0x10000000 | 0x04000000 | 0x08000000 | 0x02000000 | KEYPAD;

const NAMED: ReadonlyArray<[string, number]> = [
  ["Esc", 0x01000000], ["Tab", 0x01000001], ["Backtab", 0x01000002], ["Backspace", 0x01000003],
  ["Return", 0x01000004], ["Enter", 0x01000005], ["Ins", 0x01000006], ["Del", 0x01000007],
  ["Pause", 0x01000008], ["Print", 0x01000009], ["SysReq", 0x0100000a], ["Clear", 0x0100000b],
  ["Home", 0x01000010], ["End", 0x01000011], ["Left", 0x01000012], ["Up", 0x01000013],
  ["Right", 0x01000014], ["Down", 0x01000015], ["PgUp", 0x01000016], ["PgDown", 0x01000017],
  ["CapsLock", 0x01000024], ["NumLock", 0x01000025], ["ScrollLock", 0x01000026],
  ["Menu", 0x01000055], ["Space", 0x20],
  ...Array.from({ length: 35 }, (_, i): [string, number] => [`F${i + 1}`, 0x01000030 + i]),
];
const BY_NAME = new Map(NAMED.map(([n, c]) => [n.toLowerCase(), c]));
const BY_CODE = new Map(NAMED.map(([n, c]) => [c, n]));
// Sinônimos que o Qt também aceita ao ler.
for (const [alias, name] of [["escape", "esc"], ["insert", "ins"], ["delete", "del"], ["pgup", "pgup"],
  ["page up", "pgup"], ["pageup", "pgup"], ["page down", "pgdown"], ["pagedown", "pgdown"]] as const)
  BY_NAME.set(alias, BY_NAME.get(name)!);

/** "Meta+Shift+Left" → inteiro do Qt; 0 se vazio ou se a tecla não é conhecida. */
export function keyCode(text: string): number {
  const s = String(text ?? "").trim();
  if (!s || s.includes(",")) return 0; // sequências de várias teclas: não
  // A tecla pode ser o próprio "+" ("Ctrl++"): separa do fim.
  const parts = s.endsWith("++") ? [...s.slice(0, -2).split("+"), "+"] : s.split("+");
  const key = parts.pop()!.trim();
  let mods = 0;
  for (const p of parts) {
    const m = MODS.find(([n]) => n.toLowerCase() === p.trim().toLowerCase());
    if (p.trim().toLowerCase() === "num") mods |= KEYPAD;
    else if (m) mods |= m[1];
    else return 0;
  }
  const named = BY_NAME.get(key.toLowerCase());
  if (named !== undefined) return mods | named;
  if (key.length === 1) {
    const c = key.toUpperCase().charCodeAt(0);
    if (c > 0x20 && c < 0x7f) return mods | c;
  }
  return 0;
}

/** Inteiro do Qt → "Meta+Shift+Left" (ordem do Qt: Meta, Ctrl, Alt, Shift); "" se 0 ou desconhecido. */
export function keyText(code: number): string {
  const n = Number(code) || 0;
  const key = n & ~MOD_MASK;
  if (!key) return "";
  const name = BY_CODE.get(key) ?? (key > 0x20 && key < 0x7f ? String.fromCharCode(key) : null);
  if (!name) return "";
  const mods = MODS.filter(([, bit]) => (n & bit) === bit).map(([m]) => m);
  if (n & KEYPAD) mods.push("Num");
  return [...mods, name].join("+");
}
