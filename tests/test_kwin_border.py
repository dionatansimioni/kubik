"""Integração: a borda de destaque em volta da janela em foco (KWin 6 real).

Confere pelos pixels: a borda acompanha o foco e o layout, some enquanto a
janela anima (é redesenhada com ela parada) e some sem janela em foco. Layout: Alpha (4,4 634×792) | Beta (642,4 634×792); a borda fica
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

    def test_no_border_while_the_window_is_animating(self):
        # A borda não persegue a janela (pedido do usuário): no meio da
        # animação ela não aparece em lugar nenhum; volta com a janela parada.
        img = Ppm(self.out / "growing.ppm")
        accent = [(x, y) for x in range(0, 1280, 4) for y in (2, 400, 798) if is_accent(img.getpixel((x, y)))]
        self.assertEqual(accent, [], "borda desenhada durante a animação")
        self.assertAccent("alpha_alone", (1278, 400))

    def test_no_border_without_focused_window(self):
        img = Ppm(self.out / "none.ppm")
        accent = [(x, y) for x in range(0, 1280, 8) for y in range(0, 800, 8) if is_accent(img.getpixel((x, y)))]
        self.assertEqual(accent, [])

    def test_border_is_never_reopened(self):
        # A borda aparece e some várias vezes no cenário, mas o overlay é aberto
        # uma vez só (reabrir dispara a animação de abrir janela do usuário).
        # Overlays: prévia, prévia-fantasma e borda.
        self.assertEqual(self.log.count("flutuante '': janela interna do KWin"), 3)

    def test_overlay_is_not_tiled(self):
        self.assertEqual(set(self.w["alone"]), {"Alpha"})
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
