#!/usr/bin/env python3
"""Empacota um KWin Script do kubik para teste fácil.

Gera em dist/:
  <id>-<versão>.kwinscript  zip instalável em Configurações do Sistema ›
                            Scripts do KWin › "Instalar de arquivo…"
                            (ou kpackagetool6 -t KWin/Script -i arquivo)
  <id>-<versão>.tar.gz      pacote + install.sh / uninstall.sh / diagnose.sh
                            + share/ (ícone do app e entrada do menu)

Uso: scripts/build.py [diretório-do-pacote]   (padrão: kubik/package)
Imprime os caminhos dos arquivos gerados, um por linha.

Pacotes companheiros (metadata "X-Kubik-Companions", caminhos relativos ao
pacote, ex.: o efeito de animação) ganham o próprio arquivo instalável e vão
juntos no .tar.gz, em packages/<Id>/; o install.sh instala todos.
Saída: o arquivo do pacote principal, o .tar.gz, e depois os dos companheiros.

Se o diretório pai do pacote for um projeto Node (tem package.json), roda
antes `npm run build` nele (via scripts/node.sh), que gera os arquivos do
pacote a partir do TypeScript.
"""
import io
import json
import os
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = Path(os.environ.get("KUBIK_DIST", ROOT / "dist"))
SCRIPTS = ROOT / "scripts"
ASSETS = ROOT / "assets"
APP_ID = "io.github.dionatansimioni.kubik"
# Data fixa nos arquivos para builds reproduzíveis.
FIXED_ZIP_DATE = (2026, 1, 1, 0, 0, 0)


def prebuild(pkg: Path):
    project = pkg.parent
    if not (project / "package.json").is_file():
        return
    rel = str(project.relative_to(ROOT))
    node = [str(SCRIPTS / "node.sh"), rel]
    # A saída do npm vai para o stderr: o stdout do build.py é só a lista de artefatos.
    if not (project / "node_modules").is_dir():
        subprocess.run(node + ["npm", "ci"], check=True, stdout=sys.stderr)
    subprocess.run(node + ["npm", "run", "--silent", "build"], check=True, stdout=sys.stderr)


def package_files(pkg: Path):
    files = [pkg / "metadata.json"]
    files += sorted(p for p in (pkg / "contents").rglob("*") if p.is_file())
    return files


def read_metadata(pkg: Path):
    meta = json.loads((pkg / "metadata.json").read_text(encoding="utf-8"))
    return meta["KPlugin"]["Id"], meta["KPlugin"]["Version"]


def companions(pkg: Path):
    meta = json.loads((pkg / "metadata.json").read_text(encoding="utf-8"))
    return [(pkg / c).resolve() for c in meta.get("X-Kubik-Companions", [])]


EXTENSIONS = {"KWin/Script": "kwinscript", "KWin/Effect": "kwineffect", "Plasma/Applet": "plasmoid"}


def archive_name(pkg: Path) -> str:
    meta = json.loads((pkg / "metadata.json").read_text(encoding="utf-8"))
    plugin_id, version = read_metadata(pkg)
    return f"{plugin_id}-{version}.{EXTENSIONS[meta['KPackageStructure']]}"


def build_archive(pkg: Path, out: Path):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in package_files(pkg):
            info = zipfile.ZipInfo(f.relative_to(pkg).as_posix(), FIXED_ZIP_DATE)
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, f.read_bytes())


def build_tarball(pkgs, plugin_id: str, version: str, out: Path):
    top = f"{plugin_id}-{version}"

    def add(tar, data: bytes, name: str, mode: int):
        info = tarfile.TarInfo(f"{top}/{name}")
        info.size, info.mode, info.mtime = len(data), mode, 0
        tar.addfile(info, io.BytesIO(data))

    main = pkgs[0]
    with tarfile.open(out, "w:gz") as tar:
        for pkg in pkgs:
            pid, _ = read_metadata(pkg)
            for f in package_files(pkg):
                add(tar, f.read_bytes(), f"packages/{pid}/" + f.relative_to(pkg).as_posix(), 0o644)
        for script in ("install.sh", "uninstall.sh", "diagnose.sh"):
            add(tar, (SCRIPTS / script).read_bytes(), script, 0o755)
        add(tar, (SCRIPTS / "shortcuts.sh").read_bytes(), "shortcuts.sh", 0o644)
        # Ícone do app e entrada do menu (o install.sh põe em ~/.local/share).
        add(tar, (ASSETS / "kubik.svg").read_bytes(), f"share/{APP_ID}.svg", 0o644)
        add(tar, (ASSETS / f"{APP_ID}.desktop").read_bytes(), f"share/{APP_ID}.desktop", 0o644)
        readme = next((p for p in (main / "README.md", main.parent / "README.md") if p.is_file()), None)
        if readme:
            add(tar, readme.read_bytes(), "README.md", 0o644)


def main(argv):
    pkg = (ROOT / (argv[1] if len(argv) > 1 else "kubik/package")).resolve()
    prebuild(pkg)
    pkgs = [pkg] + companions(pkg)
    plugin_id, version = read_metadata(pkg)
    DIST.mkdir(exist_ok=True)
    archives = [DIST / archive_name(p) for p in pkgs]
    tarball = DIST / f"{plugin_id}-{version}.tar.gz"
    for p, a in zip(pkgs, archives):
        build_archive(p, a)
    build_tarball(pkgs, plugin_id, version, tarball)
    print(archives[0])
    print(tarball)
    for a in archives[1:]:
        print(a)


if __name__ == "__main__":
    main(sys.argv)
