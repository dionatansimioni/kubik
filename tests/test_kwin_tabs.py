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

from test_kwin_overlay import ROOT, Ppm, is_accent, kwin_env_available
from test_kwin_tiling import parse_windows

TL, BL = (4, 4, 634, 394), (4, 402, 634, 394)
LEFT, RIGHT = (4, 4, 634, 792), (642, 4, 634, 792)
TR, BR = (642, 4, 634, 394), (642, 402, 634, 394)
IN_STACK = (642, 32, 634, 764)


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

    def accent_share(self, shot, x0, x1, y=18):
        img = Ppm(self.out / f"{shot}.ppm")
        row = [img.getpixel((x, y)) for x in range(x0, x1, 4)]
        return sum(map(is_accent, row)) / len(row)

    def test_start_layout(self):
        self.assertEqual(self.w["start"], {"Alpha": LEFT, "Beta": TR, "Gamma": BR})

    def test_drop_on_title_bar_stacks(self):
        self.assertEqual(self.w["stacked"], {"Alpha": LEFT, "Beta": IN_STACK, "Gamma": IN_STACK})
        self.assertIn("empilhou 'Gamma' com 'Beta'", self.log)
        self.assertEqual(self.active["stacked"], "Gamma")

    def test_preview_while_dragging_announces_stacking(self):
        # Faixa de abas forte no topo da prévia, que cobre o tile final (a
        # direita inteira, já que a Gamma sai de baixo).
        self.assertGreater(self.accent_share("stack_dragging", 646, 690, y=16), 0.5)
        r, g, b = Ppm(self.out / "stack_dragging.ppm").getpixel((960, 600))
        self.assertGreater(b, r + 10, f"prévia não cobre o tile final: {(r, g, b)}")

    def test_tab_bar_highlights_the_shown_tab(self):
        self.assertGreater(self.accent_share("stacked", 962, 1272), 0.7, "aba à vista (Gamma) sem destaque")
        self.assertLess(self.accent_share("stacked", 646, 956), 0.2, "aba escondida (Beta) destacada")

    def test_clicking_a_tab_shows_that_window(self):
        self.assertEqual(self.active["clicked"], "Beta")
        self.assertGreater(self.accent_share("clicked", 646, 956), 0.7)
        # a Beta (verde) aparece na área da pilha
        r, g, b = Ppm(self.out / "clicked.ppm").getpixel((960, 400))
        self.assertTrue(g > r + 30 and g > b + 30, f"Beta não está à vista: {(r, g, b)}")

    def test_next_tab_shortcut(self):
        self.assertEqual(self.active["next"], "Gamma")

    def test_dragging_out_unstacks(self):
        self.assertEqual(self.w["unstacked"], {"Alpha": TL, "Gamma": BL, "Beta": RIGHT})
        self.assertLess(self.accent_share("unstacked", 646, 1272), 0.2, "barra de abas ficou na tela")

    def test_no_qml_errors(self):
        for bad in ("TypeError", "ReferenceError", "is not defined", "Cannot read", "Cannot assign"):
            self.assertNotIn(bad, self.log)


if __name__ == "__main__":
    unittest.main()
