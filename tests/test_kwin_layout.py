"""Integração: as regras de layout num KWin 6 real (testenv/).

1 janela cheia, 2 lado a lado, 3 = metade + 2 quadrantes, 4 = quadrantes;
minimizada libera o espaço; a ponte de vídeo do XWayland (real, invisível)
não ocupa tile; janela que abre maximizada entra no tile desmaximizada.
Tela virtual 1280×800, gaps de 4 px.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from test_kwin_overlay import ROOT, kwin_env_available
from test_kwin_tiling import parse_windows

TL, BL = (4, 4, 634, 394), (4, 402, 634, 394)
TR, BR = (642, 4, 634, 394), (642, 402, 634, 394)
LEFT, RIGHT = (4, 4, 634, 792), (642, 4, 634, 792)


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class LayoutInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix="kubik-layout-")
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/layout.sh", cls.out],
            cwd=ROOT, check=True, capture_output=True, timeout=300, env=dict(os.environ),
        )
        with open(f"{cls.out}/kwin.log", errors="replace") as f:
            cls.log = f.read()
        # A ponte de vídeo (só no Fedora) aparece no dump, mas não é do layout.
        cls.w = {tag: {c: g for c, g in geos.items() if "Video Bridge" not in c}
                 for tag, geos in parse_windows(cls.log).items()}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_video_bridge_is_running_and_floats(self):
        if "VIDEOBRIDGE ausente" in self.log:
            self.skipTest("xwaylandvideobridge só existe na imagem Fedora")
        self.assertIn('"cls":"xwaylandvideobridge"', self.log.replace(" ", ""))
        self.assertRegex(self.log, r"flutuante '[^']*': janela oculta \(fora da barra de tarefas e do Alt\+Tab\)")

    def test_three_windows_half_plus_two_quadrants(self):
        self.assertEqual(self.w["three"], {"Alpha": LEFT, "Beta": TR, "Gamma": BR})

    def test_four_windows_quadrants(self):
        self.assertEqual(self.w["four"], {"Alpha": TL, "Delta": BL, "Beta": TR, "Gamma": BR})

    def test_minimized_frees_its_space(self):
        geo = self.w["minimized"]
        self.assertEqual(geo["Alpha"], LEFT)
        self.assertEqual(geo["Beta"], TR)
        self.assertEqual(geo["Gamma"], BR)

    def test_restored_takes_space_back(self):
        geo = self.w["restored"]
        self.assertEqual(sorted(geo.values()), sorted([TL, BL, TR, BR]))

    def test_window_opened_maximized_is_tiled_unmaximized(self):
        self.assertIn("MAXMODE 0", self.log)
        geo = self.w["maximized"]
        self.assertNotEqual(geo["Max"], (0, 0, 1280, 800))
        tiles = list(geo.values())
        self.assertEqual(len(tiles), 5)
        for g in tiles:
            self.assertLess(g[2] * g[3], 640 * 800, f"janela não encaixada: {g}")


if __name__ == "__main__":
    unittest.main()
