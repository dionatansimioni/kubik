// O botão de download do site: acha o AppImage do release mais novo do Kubik
// na API do GitHub. Todos os releases são pré-releases, então /releases/latest
// (que ignora pré-releases) não serve. Testado em kubik/test/site.test.ts.

export const REPO = "dionatansimioni/kubik";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
export const API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const TAG = /^kubik-v(\d+)\.(\d+)\.(\d+)$/;
const APPIMAGE = /^Kubik-.+-x86_64\.AppImage$/;

function versionOf(tag) {
  const m = TAG.exec(tag || "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function newer(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * O release mais novo (pela versão, não pela ordem da API) que tem AppImage.
 * Devolve { version, url, size, date, page } ou null.
 */
export function pickDownload(releases) {
  let best = null;
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft) continue;
    const v = versionOf(r.tag_name);
    const asset = (r.assets || []).find((a) => APPIMAGE.test(a.name || ""));
    if (!v || !asset) continue;
    if (!best || newer(v, best.v)) best = { v, r, asset };
  }
  if (!best) return null;
  return {
    version: best.v.join("."),
    url: best.asset.browser_download_url,
    size: best.asset.size,
    date: (best.r.published_at || "").slice(0, 10),
    page: best.r.html_url || RELEASES_PAGE,
  };
}

export function formatSize(bytes) {
  return bytes ? `${Math.round(bytes / 1e6)} MB` : "";
}

/** Busca na API (com cache de 10 min na sessão: a API limita 60 pedidos/h). */
export async function latestDownload(fetchFn = fetch, storage = globalThis.sessionStorage) {
  const KEY = "kubik-latest";
  try {
    const cached = JSON.parse(storage?.getItem(KEY) || "null");
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;
  } catch {
    /* sem storage: busca de novo */
  }
  const res = await fetchFn(API, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const value = pickDownload(await res.json());
  try {
    storage?.setItem(KEY, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* tudo bem */
  }
  return value;
}
