/**
 * Ponto de entrada do bundle carregado pelo Kubik.qml.
 * O esbuild expõe este módulo como a variável global `Kubik`.
 */
import type { Host } from "./kwin/api";
import { Controller, DEFAULT_CONFIG } from "./kwin/controller";
import { type Settings, describeSettings, parseSettings } from "./kwin/settings";

import { KEY_BINDINGS, type KeyBinding } from "./kwin/keys";

export { describeSettings, parseSettings };

/**
 * Os atalhos de teclado (keys.ts). Uma função, não a constante: o esbuild
 * registra os exports no começo do bundle, e uma constante exportada faria o
 * QML avisar "used before its declaration" (funções são içadas).
 */
export function keyBindings(): KeyBinding[] {
  return KEY_BINDINGS;
}

export function start(host: Host, settings?: Settings): Controller {
  const c = new Controller(host, { ...DEFAULT_CONFIG, ...settings });
  c.start();
  return c;
}
