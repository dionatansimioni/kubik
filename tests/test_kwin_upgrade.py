"""Integração: atualizar o script com o KWin rodando carrega o código NOVO.

Regressão da v0.0.3: o KWin mantém em memória o QML já compilado de cada
caminho de arquivo até reiniciar. Atualizar o pacote no mesmo caminho fazia
o KWin recarregar o código ANTIGO, e o usuário via a versão anterior.
"""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, is_accent, kwin_env_available, parse_log

MARKER = "carregado-VERSAO-NOVA"


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class UpgradeInRunningKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-upgrade-"))
        # Versão "nova": mesmo código, outra versão e um marcador no log.
        new_pkg = cls.out / "src"
        shutil.copytree(ROOT / "prototype" / "overlay", new_pkg)
        meta_path = new_pkg / "metadata.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["KPlugin"]["Version"] = "9.9.9"
        meta_path.write_text(json.dumps(meta), encoding="utf-8")
        qml = new_pkg / "contents" / "ui" / "Overlay.qml"
        src = qml.read_text(encoding="utf-8")
        assert 'log("carregado;' in src
        qml.write_text(src.replace('log("carregado;', f'log("{MARKER};'), encoding="utf-8")
        subprocess.run(["python3", str(ROOT / "scripts" / "build.py"), str(new_pkg)],
                       env=dict(os.environ, KUBIK_DIST=str(cls.out / "upgrade")),
                       check=True, capture_output=True)
        (cls.out / "upgrade" / "kubikoverlayproto-9.9.9.kwinscript").unlink()
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "prototype/overlay",
             "tests/scenarios/upgrade.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.marks = parse_log(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_new_code_is_running(self):
        self.assertTrue(MARKER in self.log, "o KWin recarregou o código antigo (ver kwin.log)")

    def test_border_on_focused_window_after_upgrade(self):
        img = Ppm(self.out / "upgraded.ppm")
        beta = self.marks["after"]["Beta"]
        x, y, h = round(beta["x"]), round(beta["y"]), round(beta["height"])
        self.assertTrue(is_accent(img.getpixel((x - 2, y + h // 2))), "sem borda na janela focada")

    def test_no_ghost_border_from_old_instance(self):
        img = Ppm(self.out / "upgraded.ppm")
        alpha = self.marks["after"]["Alpha"] if "Alpha" in self.marks["after"] else self.marks["before"]["Alpha"]
        x, y, h = round(alpha["x"]), round(alpha["y"]), round(alpha["height"])
        self.assertFalse(is_accent(img.getpixel((x - 2, y + h // 2))),
                         "borda fantasma da instância antiga na janela sem foco")


if __name__ == "__main__":
    unittest.main()
