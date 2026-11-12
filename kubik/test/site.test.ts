import { describe, expect, it } from "vitest";
// @ts-expect-error: módulo JS puro do site (sem tipos)
import { formatSize, latestDownload, pickDownload, RELEASES_PAGE } from "../../site/download.js";

const rel = (tag: string, assets: string[], extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/dionatansimioni/kubik/releases/tag/${tag}`,
  published_at: "2026-11-12T10:00:00Z",
  prerelease: true,
  draft: false,
  assets: assets.map((name) => ({ name, size: 39643640, browser_download_url: `https://example.invalid/${name}` })),
  ...extra,
});

describe("site: botão de download", () => {
  it("o AppImage do release mais novo, mesmo pré-release e fora de ordem", () => {
    const d = pickDownload([
      rel("kubik-v0.9.0", ["Kubik-0.9.0-x86_64.AppImage"]),
      rel("kubik-v0.12.1", ["kubik-0.12.1.tar.gz", "Kubik-0.12.1-x86_64.AppImage"]),
      rel("kubik-v0.12.0", ["Kubik-0.12.0-x86_64.AppImage"]),
    ]);
    expect(d).toEqual({
      version: "0.12.1",
      url: "https://example.invalid/Kubik-0.12.1-x86_64.AppImage",
      size: 39643640,
      date: "2026-11-12",
      page: "https://github.com/dionatansimioni/kubik/releases/tag/kubik-v0.12.1",
    });
  });

  it("compara versões como números (0.10 > 0.9)", () => {
    expect(pickDownload([rel("kubik-v0.9.9", ["Kubik-0.9.9-x86_64.AppImage"]), rel("kubik-v0.10.0", ["Kubik-0.10.0-x86_64.AppImage"])])?.version).toBe("0.10.0");
  });

  it("ignora rascunhos, releases sem AppImage e outras tags", () => {
    expect(pickDownload([
      rel("kubik-v0.13.0", ["Kubik-0.13.0-x86_64.AppImage"], { draft: true }),
      rel("kubik-v0.12.2", ["kubik-0.12.2.tar.gz"]),
      rel("proto-v9.0.0", ["Kubik-9.0.0-x86_64.AppImage"]),
      rel("kubik-v0.12.1", ["Kubik-0.12.1-x86_64.AppImage"]),
    ])?.version).toBe("0.12.1");
    expect(pickDownload([])).toBeNull();
    expect(pickDownload({ message: "API rate limit exceeded" })).toBeNull();
  });

  it("tamanho em MB", () => {
    expect(formatSize(39643640)).toBe("40 MB");
    expect(formatSize(0)).toBe("");
  });

  it("busca uma vez e guarda na sessão; erro da API vira exceção (o site cai na página de releases)", async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    let calls = 0;
    const ok = async () => {
      calls++;
      return { ok: true, json: async () => [rel("kubik-v0.12.1", ["Kubik-0.12.1-x86_64.AppImage"])] };
    };
    expect((await latestDownload(ok, storage))?.version).toBe("0.12.1");
    expect((await latestDownload(ok, storage))?.version).toBe("0.12.1");
    expect(calls).toBe(1);
    const fail = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(latestDownload(fail, { getItem: () => null, setItem: () => {} })).rejects.toThrow("403");
    expect(RELEASES_PAGE).toBe("https://github.com/dionatansimioni/kubik/releases");
  });
});
