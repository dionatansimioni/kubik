"""Integração: configuração ao vivo pelo kwinrc (o caminho da bandeja), KWin 6 real.

A bandeja grava [Script-kubik] / [Effect-kubikanimations] com kwriteconfig6 e
chama org.kde.KWin.reconfigure; o KWin emite Options.configChanged e o
Kubik relê tudo. Tela 1280×800.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, is_accent, kwin_env_available, needs_effects, needs_pixels
from test_kwin_tiling import parse_windows


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class SettingsInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-settings-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/settings.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_starts_with_defaults(self):
        self.assertEqual(self.w["start"], {"Alpha": (4, 4, 634, 792), "Beta": (642, 4, 634, 792)})
        self.assertIn("configuração: tiling ligado; gaps 4/4; borda 3px", self.log)

    def test_gaps_apply_live(self):
        self.assertEqual(self.w["gaps"], {"Alpha": (0, 0, 630, 800), "Beta": (650, 0, 630, 800)})

    def test_exception_floats_the_app_live(self):
        kcalc = [c for c in self.w["with_kcalc"] if c not in ("Alpha", "Beta")]
        self.assertEqual(len(kcalc), 1, self.w["with_kcalc"])
        self.assertEqual(len(self.w["with_kcalc"]), 3)
        after = self.w["kcalc_exception"]
        self.assertEqual((after["Alpha"], after["Beta"]), ((0, 0, 630, 800), (650, 0, 630, 800)))
        self.assertIn("exceção do usuário (org.kde.kcalc)", self.log)

    @needs_pixels
    def test_border_width_applies_live(self):
        # Alpha (0,0 630×800) com foco: borda de 8 px, para dentro da tela à
        # esquerda (cortada) e no gap de 20 px à direita (x 630..637).
        img = Ppm(self.out / "border8.ppm")
        self.assertTrue(is_accent(img.getpixel((636, 400))), img.getpixel((636, 400)))
        self.assertFalse(is_accent(img.getpixel((640, 400))), img.getpixel((640, 400)))

    def test_enabled_off_and_shortcut_survives_a_reconfigure(self):
        off = self.w["off"]
        self.assertNotEqual(off["Alpha"], (0, 0, 630, 800))
        self.assertIn("tiling desligado", self.log)
        self.assertEqual(self.w["toggled_on"], {"Alpha": (0, 0, 630, 800), "Beta": (650, 0, 630, 800)})

    @needs_effects
    def test_zero_duration_disables_animation(self):
        self.assertIn("[kubik-animations] configuração: 0ms", self.log)
        # 150 ms depois de fechar a Beta, a Alpha já está no lugar final (sem animação).
        img = Ppm(self.out / "no_animation.ppm")
        self.assertEqual(img.getpixel((1000, 400))[:3], img.getpixel((300, 400))[:3])
        self.assertEqual(self.w["alone"], {"Alpha": (0, 0, 1280, 800)})

    def test_no_script_errors(self):
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
