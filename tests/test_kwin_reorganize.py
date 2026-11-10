"""Integração: reorganizar o layout arrastando com o mouse (KWin 6 real).

Zonas sobre a janela-alvo: o terço central troca e as bordas dividem para
aquele lado. A prévia mostra a posição final; na troca, uma segunda prévia
mais clara mostra para onde vai a outra janela.
"""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, kwin_env_available
from test_kwin_tiling import parse_windows

TL, BL = (4, 4, 634, 394), (4, 402, 634, 394)
TR, BR = (642, 4, 634, 394), (642, 402, 634, 394)
LEFT, RIGHT = (4, 4, 634, 792), (642, 4, 634, 792)


def is_bluish(px):
    r, g, b = px[:3]
    return b > r + 10


def tinted(before, after):
    """A prévia (destaque translúcido) puxa o pixel para o azul."""
    return after[2] - before[2] > 20 and before[0] - after[0] > 10


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class ReorganizeInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-reorg-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/reorganize.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_start_layout(self):
        self.assertEqual(self.w["start"], {"Alpha": LEFT, "Beta": TR, "Gamma": BR})

    def test_drop_on_lower_half_splits_and_inverts_layout(self):
        self.assertEqual(self.w["split"], {"Alpha": TL, "Gamma": BL, "Beta": RIGHT})
        self.assertIn("moveu 'Gamma' para baixo de 'Alpha'", self.log)

    def test_preview_shows_final_position_while_dragging(self):
        before = Ppm(self.out / "start.ppm").getpixel((321, 600))
        during = Ppm(self.out / "split_dragging.ppm").getpixel((321, 600))
        self.assertTrue(tinted(before, during), f"sem prévia na posição final: {before} -> {during}")
        top0 = Ppm(self.out / "start.ppm").getpixel((321, 200))
        top = Ppm(self.out / "split_dragging.ppm").getpixel((321, 200))
        self.assertFalse(tinted(top0, top), f"prévia invadiu a metade de cima: {top0} -> {top}")

    def test_center_drop_swaps(self):
        self.assertEqual(self.w["swapped"], {"Beta": TL, "Gamma": BL, "Alpha": RIGHT})

    def test_swap_shows_ghost_where_the_other_goes(self):
        img = Ppm(self.out / "swap_dragging.ppm")
        main, ghost = img.getpixel((321, 120)), img.getpixel((1200, 600))
        before = Ppm(self.out / "split.ppm").getpixel((321, 120))
        self.assertTrue(tinted(before, main), f"sem prévia principal: {before} -> {main}")
        self.assertTrue(is_bluish(ghost), f"sem prévia da outra janela: {ghost}")


if __name__ == "__main__":
    unittest.main()
