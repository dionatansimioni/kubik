"""Integração: janelas "em todos os desktops" no tiling (KWin 6 real).

Com o plugin virtualdesktopsonlyonprimary (Fedora do usuário), toda janela da
tela secundária fica em todos os desktops; elas precisam entrar no tiling e
acompanhar o desktop visível. Tela 1280×800, gaps de 4 px, 2 desktops.
"""
import os
import shutil
import subprocess
import tempfile
import unittest

from test_kwin_overlay import ROOT, kwin_env_available
from test_kwin_tiling import parse_windows

FULL = (4, 4, 1272, 792)
LEFT, RIGHT = (4, 4, 634, 792), (642, 4, 634, 792)


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class StickyInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix="kubik-sticky-")
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/sticky.sh", cls.out],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_KWINRC="Desktops/Number=2"),
        )
        with open(f"{cls.out}/kwin.log", errors="replace") as f:
            cls.log = f.read()
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_two_desktops_and_switch_happened(self):
        self.assertIn("CURDESK 1 of 2", self.log)

    def test_sticky_window_is_tiled_with_desktop_windows(self):
        self.assertEqual(self.w["desk1"], {"Alpha": LEFT, "Sticky": RIGHT})

    def test_sticky_window_follows_to_the_new_desktop(self):
        self.assertEqual(self.w["desk2"]["Sticky"], FULL)

    def test_new_window_splits_with_sticky_on_new_desktop(self):
        geo = self.w["desk2_gamma"]
        self.assertEqual(geo["Sticky"], LEFT)
        self.assertEqual(geo["Gamma"], RIGHT)

    def test_back_to_first_desktop(self):
        geo = self.w["back"]
        self.assertEqual(geo["Alpha"], LEFT)
        self.assertEqual(geo["Sticky"], RIGHT)


if __name__ == "__main__":
    unittest.main()
