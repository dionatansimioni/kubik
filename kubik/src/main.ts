/**
 * Ponto de entrada do bundle carregado pelo Kubik.qml.
 * O esbuild expõe este módulo como a variável global `Kubik`.
 */
import type { Host } from "./kwin/api";
import { Controller, DEFAULT_CONFIG } from "./kwin/controller";
import { type Settings, describeSettings, parseSettings } from "./kwin/settings";

import { type KeyBinding, type Lang, keyBindings as bindings, langOf, shortcutText } from "./kwin/keys";

export { describeSettings, langOf, parseSettings, shortcutText };

/** Os atalhos de teclado (keys.ts) no idioma do sistema. */
export function keyBindings(lang: Lang): KeyBinding[] {
  return bindings(lang);
}

export function start(host: Host, settings?: Settings): Controller {
  const c = new Controller(host, { ...DEFAULT_CONFIG, ...settings });
  c.start();
  return c;
}
