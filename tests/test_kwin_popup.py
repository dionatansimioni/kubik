"""Integração: menus por cima da borda e da barra de abas (KWin 6 real).

O KWin põe toda janela interna (os overlays do Kubik) na camada mais alta,
acima até dos menus (Lição 51). Um menu do app em foco cruzando a beira da
janela era cortado pela linha da borda. Agora a borda ganha um buraco onde o
menu passa, e a barra de abas (que recebe cliques) some enquanto um menu a
cobre. Layout: Alpha (4,4 634×792) | Beta (642,4 634×792); a borda da Beta
passa em x≈640, e o menu dela (fundo #202020) cobre 493..793 × 240..440.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, is_accent, kwin_env_available, needs_pixels


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class PopupOverOverlaysTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-popup-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/popup.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.popups = dict(re.findall(r"=== POPUP (\w+) (\S+ \S+)", cls.log))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def px(self, shot, xy):
        return Ppm(self.out / f"{shot}.ppm").getpixel(xy)

    def accent_column(self, shot, x, y0, y1):
        img = Ppm(self.out / f"{shot}.ppm")
        return [y for y in range(y0, y1, 2) if any(is_accent(img.getpixel((xx, y))) for xx in (x - 1, x, x + 1))]

    def accent_share(self, shot, x0, x1, y=20):
        img = Ppm(self.out / f"{shot}.ppm")
        row = [img.getpixel((x, y)) for x in range(x0, x1, 4)]
        return sum(map(is_accent, row)) / len(row)

    def test_menus_opened_where_expected(self):
        self.assertEqual(self.popups.get("border"), "493,240 300x200")
        self.assertIn("tabs", self.popups)

    @needs_pixels
    def test_border_does_not_cross_the_menu(self):
        # Sem a correção, a linha azul atravessava o menu em x≈640.
        self.assertEqual(self.accent_column("menu", 640, 250, 430), [], "borda desenhada por cima do menu")
        self.assertNotEqual(self.accent_column("menu", 640, 100, 230), [], "borda sumiu acima do menu")
        self.assertNotEqual(self.accent_column("menu", 640, 460, 790), [], "borda sumiu abaixo do menu")
        self.assertTrue(is_accent(self.px("menu", (1278, 400))), "borda sumiu do lado direito")

    @needs_pixels
    def test_border_is_whole_again_after_the_menu_closes(self):
        self.assertNotEqual(self.accent_column("menu_closed", 640, 250, 430), [])

    @needs_pixels
    def test_tab_bar_hides_under_a_menu_and_comes_back(self):
        # Aba à vista (Gamma, 2ª) em destaque, fora da área do menu (x > 905).
        self.assertGreater(self.accent_share("tabs", 990, 1250), 0.6, "sem a barra de abas")
        self.assertLess(self.accent_share("tabs_menu", 990, 1250), 0.1, "barra de abas por cima do menu")
        self.assertGreater(self.accent_share("tabs_closed", 990, 1250), 0.6, "a barra não voltou")

    def test_no_qml_errors(self):
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read", "Cannot assign", "Unable to assign"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
