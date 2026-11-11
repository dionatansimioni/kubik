"""Integração: teclado no estilo Pop!_Shell num KWin 6 real (tests/scenarios/keyboard.sh).

As ações são disparadas pelo kglobalaccel, como uma tecla faria; a tomada
das teclas do KDE (Meta+setas) é testada em test_kwin_install. Tela 1280×800.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, kwin_env_available
from test_kwin_tiling import parse_windows


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class KeyboardInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-keyboard-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/keyboard.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)
        cls.active = dict(re.findall(r"=== ACTIVE (\w+) (\w+)", cls.log))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_focus_by_direction(self):
        self.assertEqual(self.active["up"], "Beta")
        self.assertEqual(self.active["left"], "Alpha")

    def test_move_swaps_with_the_neighbor(self):
        self.assertEqual(self.w["moved"]["Beta"], (4, 4, 634, 792))
        self.assertEqual(self.w["moved"]["Alpha"], (642, 4, 634, 394))
        self.assertEqual(self.active["moved"], "Alpha")

    def test_resize_moves_the_border_by_5_percent(self):
        self.assertEqual(self.w["resized"]["Beta"], (4, 4, 698, 792))
        self.assertEqual(self.w["resized"]["Alpha"], (706, 4, 570, 394))

    def test_rotate_split(self):
        self.assertEqual(self.w["rotated"]["Alpha"], (706, 4, 283, 792))
        self.assertEqual(self.w["rotated"]["Gamma"], (993, 4, 283, 792))

    def test_toggle_floating(self):
        self.assertIn("flutuante 'Alpha': flutuando por escolha (Meta+F)", self.log)
        self.assertEqual(self.w["floating"]["Gamma"], (706, 4, 570, 792))
        self.assertEqual(self.w["floating"]["Alpha"], (440, 232, 400, 336))  # onde abriu

    def test_monocle(self):
        for name in ("Alpha", "Beta", "Gamma"):
            self.assertEqual(self.w["monocle"][name], (4, 4, 1272, 792))
        self.assertEqual(self.active["monocle_next"], "Gamma")
        # Só a janela de cima aparece (vermelha, a Alpha), de ponta a ponta.
        img = Ppm(self.out / "monocle.ppm")
        for xy in ((100, 400), (1200, 400), (640, 700)):
            self.assertEqual(img.getpixel(xy)[:3], (0x8b, 0x2f, 0x2f), xy)
        self.assertEqual(len(self.w["back"]), 3)
        self.assertNotEqual(self.w["back"]["Alpha"], (4, 4, 1272, 792))

    def test_shortcut_texts_follow_the_system_language(self):
        # O testenv roda em C.UTF-8: inglês. (Português: kubik/test/keys.test.ts.)
        self.assertIn("=== SHORTCUT TEXT Kubik: Focus Left = Kubik: focus the window to the left", self.log)
        self.assertIn("=== SHORTCUT TEXT Kubik: Toggle tiling = Kubik: toggle tiling", self.log)

    def test_no_script_errors(self):
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read", "used before its declaration"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
