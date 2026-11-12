import type { KWinWindow } from "./api";

/** Classes que nunca entram no tiling (comparação sem maiúsculas). */
export const DEFAULT_FLOATING_CLASSES = [
  "plasmashell",
  "org.kde.plasmashell",
  "krunner",
  "org.kde.krunner",
  "yakuake",
  "org.kde.yakuake",
  "kwin",
  "org.kde.kwin",
  "ksmserver-logout-greeter",
  "org.kde.polkit-kde-authentication-agent-1",
  "org.kde.spectacle",
  "xwaylandvideobridge",
  "org.kde.xwaylandvideobridge",
  // Applets numa janela, como o gerenciador do Kubik (entrada "Kubik" do menu).
  "plasmawindowed",
  "org.kde.plasmawindowed",
];

/**
 * Overlays do próprio KWin/scripts (bordas, prévias): sem classe e fora do
 * Alt+Tab. No KWin 6.3 elas ainda aparecem no Alt+Tab; o que têm em toda
 * versão é não aceitar foco (wantsInput false).
 */
export function isInternalWindow(w: KWinWindow): boolean {
  return !w.resourceClass && (w.skipSwitcher || w.wantsInput === false);
}

/**
 * Motivo para a janela NÃO entrar no tiling, ou null se ela deve entrar.
 * Devolver o motivo (em vez de um booleano) deixa o log explicável.
 */
export function floatReason(w: KWinWindow, floatingClasses: readonly string[]): string | null {
  if (!w.normalWindow) return "não é janela normal";
  // Sem esta regra, a borda do protótipo entrava no tiling (e, no KWin 6.3,
  // os próprios overlays do Kubik).
  if (isInternalWindow(w)) return "janela interna do KWin";
  // Auxiliares que o app esconde do usuário (ex.: a ponte de vídeo do
  // XWayland, transparente): sem esta regra, ocupavam um tile vazio.
  if (w.skipTaskbar && w.skipSwitcher) return "janela oculta (fora da barra de tarefas e do Alt+Tab)";
  if (w.opacity === 0) return "invisível (opacidade 0)";
  if (w.dialog) return "diálogo";
  if (w.splash) return "splash";
  if (w.utility) return "utilitário";
  if (w.specialWindow) return "janela especial";
  if (w.transient) return "transiente";
  if (!w.resizeable) return "não redimensionável";
  if (
    w.minSize.width > 0 &&
    w.minSize.width === w.maxSize.width &&
    w.minSize.height === w.maxSize.height
  )
    return "tamanho fixo";
  if (w.minimized) return "minimizada";
  if (w.fullScreen) return "tela cheia";
  // "Em todos os desktops" pode entrar no tiling (decisão do controlador,
  // pela configuração); em ALGUNS desktops (2+), não: a árvore é por desktop.
  if (!w.onAllDesktops && w.desktops.length !== 1) return "em vários desktops";
  const cls = (w.resourceClass || "").toLowerCase();
  if (floatingClasses.some((c) => c.toLowerCase() === cls)) return `classe flutuante (${cls})`;
  return null;
}
