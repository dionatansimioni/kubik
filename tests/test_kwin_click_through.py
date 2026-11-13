"""Integração: os overlays do Kubik não engolem cliques (KWin 6 real).

A borda de destaque fica em cima da janela em foco, e a prévia e a fantasma
do arrasto ficam (transparentes) onde apareceram por último. O mouse tem que
atravessá-las: o KWin 6.7+ respeita o Qt.WindowTransparentForInput, e até o
6.6 só a propriedade outputOnly. Sem ela, no Debian 13 (Plasma 6.3) o clique
na janela em foco não chegava ao app. A janela de teste registra os cliques
que recebe (testenv/clients/window.qml).
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, kwin_env_available
from test_kwin_tiling import parse_windows


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class ClickThroughInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-click-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/click-through.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def clicks(self, tag, title):
        return [tuple(map(int, m)) for m in re.findall(rf"^CLICKS {tag} {title} (\d+) (\d+)$", self.log, re.M)]

    def test_layout(self):
        self.assertEqual(self.w["tiled"]["Alpha"][0], 4, self.w["tiled"])
        self.assertEqual(self.w["tiled"]["Beta"][0], 642, self.w["tiled"])

    def test_click_reaches_focused_window_under_border(self):
        self.assertEqual(len(self.clicks("beta_focused", "Beta")), 2, self.log[-3000:])

    def test_click_activates_and_reaches_other_window(self):
        self.assertEqual(len(self.clicks("alpha_clicked", "Alpha")), 2)
        self.assertIn("ACTIVE Alpha", self.log)

    def test_clicks_reach_apps_after_drag_preview(self):
        self.assertEqual(self.w["swapped"]["Alpha"][0], 642, self.w["swapped"])
        # Cumulativo: os 2 cliques de antes e 1 depois do arrasto.
        self.assertEqual(len(self.clicks("after_drag", "Alpha")), 3)
        self.assertEqual(len(self.clicks("after_drag", "Beta")), 3)

    def test_overlays_stay_out_of_overview_pager_and_taskbar(self):
        # Borda, prévia, fantasma e (com pilha) barra de abas: todos marcados.
        m = re.search(r"=== OVERLAYS (\d+) (.*) desktops=(\d+)", self.log)
        self.assertIsNotNone(m, "cenário não listou os overlays")
        self.assertGreaterEqual(int(m.group(1)), 3)
        self.assertEqual(m.group(3), "2")
        self.assertEqual(set(m.group(2).split()), {"true/true/true"})


if __name__ == "__main__":
    unittest.main()
