"""Integração: mouse no KWin real (testenv/), com entrada simulada (fakeinput.py).

Arrastar uma janela tiled pela barra de título até outra troca as duas de
lugar (com prévia durante o arrasto); puxar a divisa entre duas janelas
redimensiona as duas.
"""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, kwin_env_available, needs_pixels
from test_kwin_tiling import LEFT, RIGHT, parse_windows


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class MouseInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-mouse-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/mouse.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_start_layout(self):
        self.assertEqual(self.w["start"], {"Alpha": LEFT, "Beta": RIGHT})

    def test_drag_onto_other_window_swaps(self):
        self.assertEqual(self.w["swapped"], {"Alpha": RIGHT, "Beta": LEFT})
        self.assertIn("trocou 'Alpha' de lugar", self.log)

    @needs_pixels
    def test_preview_shown_over_drop_target_while_dragging(self):
        before = Ppm(self.out / "start.ppm").getpixel((960, 200))
        during = Ppm(self.out / "dragging.ppm").getpixel((960, 200))
        self.assertGreater(max(abs(a - b) for a, b in zip(before, during)), 15,
                           f"sem prévia sobre o destino: {before} -> {during}")

    def test_preview_is_not_tiled(self):
        self.assertIn("flutuante '': janela interna do KWin", self.log)
        self.assertEqual(set(self.w["swapped"]), {"Alpha", "Beta"})

    def test_dragging_the_divider_resizes_both(self):
        r = self.w["resized"]
        beta, alpha = r["Beta"], r["Alpha"]
        self.assertAlmostEqual(beta[2], 834, delta=3)            # +200 px
        self.assertEqual(alpha[0], beta[0] + beta[2] + 4)       # gap interno preservado
        self.assertEqual(alpha[0] + alpha[2], 1276)             # vizinha preenche até o gap externo
        self.assertEqual((beta[1], beta[3], alpha[1], alpha[3]), (4, 792, 4, 792))


if __name__ == "__main__":
    unittest.main()
