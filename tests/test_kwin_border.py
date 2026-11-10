"""Integração: a borda de destaque em volta da janela em foco (KWin 6 real).

Confere pelos pixels: a borda acompanha o foco e o layout e some sem janela
em foco. Layout: Alpha (4,4 634×792) | Beta (642,4 634×792); a borda fica
3 px para fora da moldura, dentro dos gaps de 4 px.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, is_accent, kwin_env_available
from test_kwin_tiling import parse_windows


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class BorderInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-border-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/border.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def px(self, shot, xy):
        return Ppm(self.out / f"{shot}.ppm").getpixel(xy)

    def assertAccent(self, shot, xy):
        self.assertTrue(is_accent(self.px(shot, xy)), f"{shot}: sem borda em {xy}: {self.px(shot, xy)}")

    def assertNoAccent(self, shot, xy):
        self.assertFalse(is_accent(self.px(shot, xy)), f"{shot}: borda indevida em {xy}: {self.px(shot, xy)}")

    def test_border_around_focused_window(self):
        for xy in ((640, 400), (1278, 400), (960, 798), (960, 2)):
            self.assertAccent("beta_focused", xy)
        self.assertNoAccent("beta_focused", (2, 400))  # Alpha sem foco

    def test_border_follows_focus(self):
        for xy in ((2, 400), (639, 400), (320, 798)):
            self.assertAccent("alpha_focused", xy)
        self.assertNoAccent("alpha_focused", (1278, 400))

    def test_border_follows_layout_change(self):
        self.assertEqual(self.w["alone"], {"Alpha": (4, 4, 1272, 792)})
        self.assertAccent("alpha_alone", (1278, 400))
        self.assertNoAccent("alpha_alone", (639, 400))  # nada de borda no lugar antigo

    def test_border_slides_with_the_animated_window(self):
        # Onde quer que a animação esteja no print, a borda está colada na
        # borda direita da janela (não pulou para o destino final).
        img = Ppm(self.out / "growing.ppm")
        row = [img.getpixel((x, 400)) for x in range(1280)]
        red = [x for x, p in enumerate(row) if p[0] > 120 and p[1] < 70 and p[2] < 70]
        accent = [x for x in range(645, 1280) if is_accent(row[x])]
        self.assertTrue(accent, "sem borda no meio da animação")
        # Tolerância: as duas animações começam com ~1 quadro de diferença
        # (8–12 px no início da curva); pular direto seria ~100 px.
        self.assertLessEqual(abs(min(accent) - (max(red) + 1)), 20,
                             f"borda em {min(accent)}, janela termina em {max(red)}")

    def test_no_border_without_focused_window(self):
        img = Ppm(self.out / "none.ppm")
        accent = [(x, y) for x in range(0, 1280, 8) for y in range(0, 800, 8) if is_accent(img.getpixel((x, y)))]
        self.assertEqual(accent, [])

    def test_overlay_is_not_tiled(self):
        self.assertEqual(set(self.w["alone"]), {"Alpha"})
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
