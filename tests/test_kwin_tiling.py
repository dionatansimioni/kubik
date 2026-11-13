"""Integração: o tiling do kubik num KWin 6 real (testenv/).

Roda tests/scenarios/tiling.sh e confere a geometria REAL das janelas (lida
por um script de inspeção dentro do KWin), não a que o kubik pediu.
Tela virtual: 1280×800 sem painéis; gaps padrão de 4 px.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from test_kwin_overlay import ROOT, kwin_env_available

FULL = (4, 4, 1272, 792)
LEFT = (4, 4, 634, 792)
RIGHT = (642, 4, 634, 792)
RIGHT_TOP = (642, 4, 634, 394)
RIGHT_BOTTOM = (642, 402, 634, 394)


def parse_windows(log):
    """{tag: {caption: (x, y, w, h)}} a partir das linhas 'WINDOW <tag> {json}'."""
    out = {}
    for m in re.finditer(r"WINDOW (\w+) (\{.*\})", log):
        d = json.loads(m.group(2))
        geo = tuple(round(d[k]) for k in ("x", "y", "width", "height"))
        out.setdefault(m.group(1), {})[d["caption"]] = geo
    return out


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class TilingInKWinTest(unittest.TestCase):
    EXTRA_PKGS = ""

    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp(prefix="kubik-tiling-")
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package",
             "tests/scenarios/tiling.sh", cls.out],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS=cls.EXTRA_PKGS),
        )
        with open(f"{cls.out}/kwin.log", errors="replace") as f:
            cls.log = f.read()
        cls.w = parse_windows(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_loads_without_errors(self):
        self.assertIn("[kubik] iniciado", self.log)
        for bad in ("Component failed to load", "TypeError", "ReferenceError", "falha ao carregar"):
            self.assertNotIn(bad, self.log)

    def test_diagnose_reports_kubik_state_and_windows(self):
        diag = self.log.split("=== MARK diagnose ===", 1)[1]
        self.assertRegex(diag, r"\[kubik\] \[estado\] estado: tiling ligado; 3 no tiling")
        self.assertRegex(diag, r"\[estado\]   'Alpha' \(org.qt-project.qml\) tile 4,4 634x394 real 4,4 634x394\n")
        self.assertNotIn("FORA DO TILE", diag)
        self.assertRegex(diag, r'JANELA \{"caption":"Alpha","cls":"org.qt-project.qml"')
        report = open(f"{self.out}/diag.txt", encoding="utf-8").read()
        for section in ("sistema", "programas (sys.sh)", "pacotes do kubik", "estado do kubik", "janelas no KWin"):
            self.assertIn(f"===== {section} =====", report)
        self.assertRegex(report, r"KWin/Script kubik versão=\d+\.\d+\.\d+ ativado=true")
        # O que a distro tem (Lição 48): toda imagem do testenv tem o dbus-send.
        self.assertIn("dbus=dbus-send", report)
        self.assertRegex(report, r"fetch=(curl|wget|wget2|none)")

    def test_single_window_fills_screen_minus_gaps(self):
        self.assertEqual(self.w["one"], {"Alpha": FULL})

    def test_second_window_splits_side_by_side(self):
        self.assertEqual(self.w["two"], {"Alpha": LEFT, "Beta": RIGHT})

    def test_third_window_splits_the_focused_one(self):
        # Beta tinha o foco e é mais alta que larga: divide em cima/embaixo.
        self.assertEqual(self.w["three"], {"Alpha": LEFT, "Beta": RIGHT_TOP, "Gamma": RIGHT_BOTTOM})

    def test_closing_gives_space_back(self):
        self.assertEqual(self.w["closed"], {"Alpha": LEFT, "Beta": RIGHT})

    def natural_size(self):
        # Delta abriu com o tiling desligado: é o tamanho natural de uma janela
        # 400x300 com a decoração da distro (varia: Breeze no Arch, padrão no Fedora).
        return self.w["off_new"]["Delta"][2:]

    def test_toggle_off_restores_original_geometry(self):
        for caption, geo in self.w["off"].items():
            self.assertNotIn(geo, (LEFT, RIGHT, FULL), caption)
            self.assertEqual(geo[2:], self.natural_size(), f"{caption} não voltou ao tamanho original")

    def test_new_window_floats_while_off(self):
        self.assertNotIn(self.w["off_new"]["Delta"], (LEFT, RIGHT, FULL, RIGHT_TOP, RIGHT_BOTTOM))
        self.assertLess(self.natural_size()[0], 500)

    def test_toggle_on_tiles_everything_again(self):
        geos = self.w["on_again"]
        self.assertEqual(set(geos), {"Alpha", "Beta", "Delta"})
        # Religar reconstrói a árvore equilibrada (cada janela divide a maior):
        # uma metade inteira e dois quartos, em qualquer arranjo.
        self.assertEqual(sorted(g[2:] for g in geos.values()), [(634, 394), (634, 394), (634, 792)])


class TilingWithOverlayPrototypeTest(TilingInKWinTest):
    """Regressão (relato do usuário): com o protótipo de overlays ativo, a borda
    dele (janela interna do KWin) entrava no tiling, ocupava a metade esquerda
    e as janelas do usuário se dividiam só na metade direita."""

    EXTRA_PKGS = "prototype/overlay"

    def test_overlay_border_is_not_tiled(self):
        self.assertIn("janela interna do KWin", self.log)
        self.assertNotIn("tiling '' em", self.log)


if __name__ == "__main__":
    unittest.main()
