/**
 * Ponto de entrada do bundle carregado pelo Kubik.qml.
 * O esbuild expõe este módulo como a variável global `Kubik`.
 */
import type { Host } from "./kwin/api";
import { Controller } from "./kwin/controller";

export function start(host: Host): Controller {
  const c = new Controller(host);
  c.start();
  return c;
}
