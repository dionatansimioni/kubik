"""Integração: abas (pilhas) num KWin 6 real, com mouse simulado.

Soltar uma janela na barra de título de outra empilha as duas no tile dela,
abaixo de uma barra de abas (28 px) com a aba à vista na cor de destaque.
Clicar numa aba e o atalho "Kubik: Next tab" trocam a janela à vista.
Arrastar a janela para fora a tira da pilha.
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, is_accent, kwin_env_available, needs_pixels
from test_kwin_tiling import parse_windows

TL, BL = (4, 4, 634, 394), (4, 402, 634, 394)
LEFT, RIGHT = (4, 4, 634, 792), (642, 4, 634, 792)
TR, BR = (642, 4, 634, 394), (642, 402, 634, 394)
IN_STACK = (642, 36, 634, 760)  # abaixo da barra de abas (32 px)
# Barra de abas: ícone de pilha (642..678) e duas abas de ~296 px.
TAB1, TAB2 = (690, 950), (990, 1250)


def internal_windows(log):
    """Quantas vezes o KWin abriu (mapeou) um overlay do kubik."""
    return log.count("flutuante 'kubik-overlay': janela interna do KWin")


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class TabsInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-tabs-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/tabs.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)
        cls.active = dict(re.findall(r"ACTIVE (\w+) (\w+)", cls.log))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def accent_share(self, shot, x0, x1, y=20):
        img = Ppm(self.out / f"{shot}.ppm")
        row = [img.getpixel((x, y)) for x in range(x0, x1, 4)]
        return sum(map(is_accent, row)) / len(row)

    def test_start_layout(self):
        self.assertEqual(self.w["start"], {"Alpha": LEFT, "Beta": TR, "Gamma": BR})

    def test_holding_over_a_window_stacks(self):
        self.assertEqual(self.w["stacked"], {"Alpha": LEFT, "Beta": IN_STACK, "Gamma": IN_STACK})
        self.assertIn("empilhou 'Gamma' com 'Beta'", self.log)
        self.assertEqual(self.active["stacked"], "Gamma")

    @needs_pixels
    def test_preview_shows_stack_icon_while_holding(self):
        # O ícone de pilha (destaque) no centro do tile final (a direita inteira).
        img = Ppm(self.out / "stack_holding.ppm")
        center = [img.getpixel((x, y)) for x in range(930, 990, 3) for y in (400, 410, 420)]
        self.assertGreater(sum(map(is_accent, center)), 5, "sem ícone de pilha na prévia")

    @needs_pixels
    def test_tab_bar_highlights_the_shown_tab(self):
        self.assertGreater(self.accent_share("stacked", *TAB2), 0.6, "aba à vista (Gamma) sem destaque")
        self.assertLess(self.accent_share("stacked", *TAB1), 0.2, "aba escondida (Beta) destacada")
        self.assertGreater(self.accent_share("stacked", 650, 672), 0.1, "sem o ícone de pilha na barra")

    @needs_pixels
    def test_clicking_a_tab_shows_that_window(self):
        self.assertEqual(self.active["clicked"], "Beta")
        self.assertGreater(self.accent_share("clicked", *TAB1), 0.6)
        r, g, b = Ppm(self.out / "clicked.ppm").getpixel((960, 400))
        self.assertTrue(g > r + 30 and g > b + 30, f"Beta não está à vista: {(r, g, b)}")

    def test_next_tab_shortcut(self):
        self.assertEqual(self.active["next"], "Gamma")

    @needs_pixels
    def test_close_button_unstacks_back_to_tiling(self):
        self.assertEqual(self.w["closed_x"], {"Alpha": LEFT, "Gamma": TR, "Beta": BR})
        self.assertIn("tirou 'Beta' da pilha", self.log)
        self.assertLess(self.accent_share("closed_x", 646, 1272), 0.2, "barra de abas ficou na tela")

    def test_overlays_are_opened_once_and_never_reopened(self):
        # Reabrir um overlay dispara a animação de abrir janela do usuário (o
        # "glitch" do contorno crescendo do centro): prévia, prévia-fantasma,
        # borda e uma barra de abas = 4 aberturas, por mais que apareçam e sumam.
        self.assertEqual(internal_windows(self.log), 4)

    def test_no_qml_errors(self):
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read", "Cannot assign", "Unable to assign"):
            self.assertNotIn(bad, self.log)


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class StackOnChromiumTest(unittest.TestCase):
    """Apps sem a barra de título do KDE (Chrome, Electron): segurar sobre eles empilha."""

    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-tabs-chrome-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/tabs-chrome.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_stacks_onto_chromium(self):
        self.assertRegex(self.log, r"empilhou 'Alpha' com 'Chrome[^']*'")
        geos = self.w["stacked"]
        chrome = next(g for c, g in geos.items() if c.startswith("Chrome"))
        self.assertEqual(geos["Alpha"], chrome)


if __name__ == "__main__":
    unittest.main()
