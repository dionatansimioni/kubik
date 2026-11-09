#!/usr/bin/env python3
"""Empacota um KWin Script do kubik para teste fácil.

Gera em dist/:
  <id>-<versão>.kwinscript  zip instalável em Configurações do Sistema ›
                            Scripts do KWin › "Instalar de arquivo…"
                            (ou kpackagetool6 -t KWin/Script -i arquivo)
  <id>-<versão>.tar.gz      pacote + install.sh / uninstall.sh

Uso: scripts/build.py [diretório-do-pacote]   (padrão: kubik/package)
Imprime os caminhos dos arquivos gerados, um por linha.

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


def build_kwinscript(pkg: Path, out: Path):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in package_files(pkg):
            info = zipfile.ZipInfo(f.relative_to(pkg).as_posix(), FIXED_ZIP_DATE)
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, f.read_bytes())


def build_tarball(pkg: Path, plugin_id: str, version: str, out: Path):
    top = f"{plugin_id}-{version}"

    def add(tar, data: bytes, name: str, mode: int):
        info = tarfile.TarInfo(f"{top}/{name}")
        info.size, info.mode, info.mtime = len(data), mode, 0
        tar.addfile(info, io.BytesIO(data))

    with tarfile.open(out, "w:gz") as tar:
        for f in package_files(pkg):
            add(tar, f.read_bytes(), "package/" + f.relative_to(pkg).as_posix(), 0o644)
        for script in ("install.sh", "uninstall.sh"):
            add(tar, (SCRIPTS / script).read_bytes(), script, 0o755)
        readme = next((p for p in (pkg / "README.md", pkg.parent / "README.md") if p.is_file()), None)
        if readme:
            add(tar, readme.read_bytes(), "README.md", 0o644)


def main(argv):
    pkg = (ROOT / (argv[1] if len(argv) > 1 else "kubik/package")).resolve()
    prebuild(pkg)
    plugin_id, version = read_metadata(pkg)
    DIST.mkdir(exist_ok=True)
    kwinscript = DIST / f"{plugin_id}-{version}.kwinscript"
    tarball = DIST / f"{plugin_id}-{version}.tar.gz"
    build_kwinscript(pkg, kwinscript)
    build_tarball(pkg, plugin_id, version, tarball)
    print(kwinscript)
    print(tarball)


if __name__ == "__main__":
    main(sys.argv)
