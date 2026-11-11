/**
 * Ponto de entrada do bundle carregado pelo Kubik.qml.
 * O esbuild expõe este módulo como a variável global `Kubik`.
 */
import type { Host } from "./kwin/api";
import { Controller, DEFAULT_CONFIG } from "./kwin/controller";
import { type Settings, describeSettings, parseSettings } from "./kwin/settings";

export { describeSettings, parseSettings };

export function start(host: Host, settings?: Settings): Controller {
  const c = new Controller(host, { ...DEFAULT_CONFIG, ...settings });
  c.start();
  return c;
}
