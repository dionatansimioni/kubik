"""Integração: Chromium (barra de título própria, X11/XWayland) no tiling.

Relato do usuário: Chrome e Podman Desktop (Electron) "não respeitam o
tiling e desordenam as outras janelas". Reproduzido: o app muda a própria
geometria depois de abrir (ConfigureRequest no X11) e fica por cima das
vizinhas. O kubik deve devolvê-lo ao tile; se o app insistir, deixá-lo
flutuante e reorganizar as outras.
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, kwin_env_available
from test_kwin_tiling import parse_windows

CHROME = "Chrome - Chromium"


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class CsdAppsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-csd-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/csd.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=600,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_chromium_enters_the_tiling(self):
        self.assertIn(CHROME, self.w["tiled"], "o Chromium não abriu")
        self.assertEqual(self.w["tiled"]["Alpha"], (4, 4, 634, 792))

    def test_app_that_moves_itself_goes_back_to_its_tile(self):
        self.assertEqual(self.w["restored"][CHROME], self.w["tiled"][CHROME])
        self.assertEqual(self.w["restored"]["Alpha"], self.w["tiled"]["Alpha"])
        self.assertEqual(self.w["restored"]["Beta"], self.w["tiled"]["Beta"])

    def test_app_that_insists_floats_and_others_reorganize(self):
        self.assertIn(f"flutuante '{CHROME}': o app não aceita o tile", self.log)
        rebel = self.w["rebel"]
        self.assertEqual(rebel["Alpha"], (4, 4, 634, 792))
        self.assertEqual(rebel["Beta"], (642, 4, 634, 792))

    def test_no_errors(self):
        for bad in ("TypeError", "ReferenceError", "Component failed"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
