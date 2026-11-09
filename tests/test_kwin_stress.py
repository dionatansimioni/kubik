"""Integração: estresse com 12 janelas (testenv/), procurando imperfeições.

Janelas de tamanhos variados, 2 KCalc reais (com tamanho mínimo), foco
trocado, minimizar/restaurar, fechar, toggle, com o efeito de animação ativo.
Em cada checkpoint (depois das animações) confere, para as janelas no tiling:
dentro da área, sem sobreposição, gaps de pelo menos 4 px, mínimos
respeitados, área bem aproveitada, e que cada janela aparece de fato onde o
KWin diz que ela está (animação não ficou travada no meio).
"""
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, kwin_env_available

AREA = (4, 4, 1276, 796)  # x0, y0, x1, y1 depois do gap externo
GAP = 4
CHECKPOINTS = ("six", "nine", "shrunk", "twelve", "on_again")
COLORS = {
    "W01": "#c0392b", "W02": "#27ae60", "W04": "#8e44ad", "W05": "#f39c12", "W06": "#16a085",
    "W07": "#d35400", "W09": "#7f8c8d", "W10": "#e84393", "W11": "#6c5ce7", "W12": "#00b894",
}


def parse(log):
    """{checkpoint: {nome: dict}}; nomes repetidos (KCalc) viram KCalc, KCalc#2…"""
    out = {}
    for m in re.finditer(r"WINDOW (\w+) (\{.*\})", log):
        d = json.loads(m.group(2))
        cp = out.setdefault(m.group(1), {})
        name, n = d["caption"], 2
        while name in cp:
            name, n = f"{d['caption']}#{n}", n + 1
        cp[name] = d
    return out


def rgb(hexcolor):
    return tuple(int(hexcolor[i:i + 2], 16) for i in (1, 3, 5))


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class StressTwelveWindowsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-stress-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/stress.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=600,
            env={**__import__("os").environ, "KUBIK_EXTRA_PKGS": "kubik/effect"},
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.cp = parse(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def tiled(self, cp):
        """Janelas no tiling no checkpoint `cp`, reconstruído pelo log do kubik
        (eventos 'tiling X' / 'flutuante X' / 'tiling desligado', em ordem)."""
        members, state = set(), {}
        for line in self.log.splitlines():
            m = re.search(r"\[kubik\] tiling '([^']+)' em", line)
            if m:
                members.add(m.group(1))
            m = re.search(r"\[kubik\] flutuante '([^']+)'", line)
            if m:
                members.discard(m.group(1))
            if "[kubik] tiling desligado" in line:
                members.clear()
            m = re.search(r"WINDOW (\w+) ", line)
            if m and m.group(1) not in state:
                state[m.group(1)] = set(members)
        return {n: d for n, d in self.cp[cp].items()
                if d["caption"] in state.get(cp, set()) and not d["minimized"]}

    def test_no_script_errors(self):
        for bad in ("TypeError", "ReferenceError", "Component failed", "used before its declaration"):
            self.assertNotIn(bad, self.log)

    def test_nobody_floats_for_lack_of_space(self):
        # 12 janelas com mínimo de 150 px (e KCalc 235×302) cabem em 1280×800.
        self.assertEqual(re.findall(r"flutuante '([^']+)': não cabe", self.log), [])

    def test_all_checkpoints_reached(self):
        for cp in CHECKPOINTS + ("off",):
            self.assertIn(cp, self.cp)

    def test_tiles_inside_area(self):
        for cp in CHECKPOINTS:
            for name, d in self.tiled(cp).items():
                with self.subTest(checkpoint=cp, window=name):
                    self.assertGreaterEqual(round(d["x"]), AREA[0])
                    self.assertGreaterEqual(round(d["y"]), AREA[1])
                    self.assertLessEqual(round(d["x"] + d["width"]), AREA[2])
                    self.assertLessEqual(round(d["y"] + d["height"]), AREA[3])

    def test_no_overlaps_and_gaps_kept(self):
        for cp in CHECKPOINTS:
            ws = list(self.tiled(cp).items())
            for i in range(len(ws)):
                for j in range(i + 1, len(ws)):
                    (na, a), (nb, b) = ws[i], ws[j]
                    sep = (a["x"] + a["width"] + GAP <= b["x"] + 0.5 or b["x"] + b["width"] + GAP <= a["x"] + 0.5
                           or a["y"] + a["height"] + GAP <= b["y"] + 0.5 or b["y"] + b["height"] + GAP <= a["y"] + 0.5)
                    with self.subTest(checkpoint=cp, pair=(na, nb)):
                        self.assertTrue(sep, f"{na} {a} e {nb} {b} se sobrepõem ou sem gap")

    def test_min_sizes_respected(self):
        for cp in CHECKPOINTS:
            for name, d in self.tiled(cp).items():
                with self.subTest(checkpoint=cp, window=name):
                    self.assertGreaterEqual(d["width"] + 1, d["minWidth"])
                    self.assertGreaterEqual(d["height"] + 1, d["minHeight"])

    def test_space_is_used(self):
        full = (AREA[2] - AREA[0]) * (AREA[3] - AREA[1])
        for cp in CHECKPOINTS:
            tiles = self.tiled(cp).values()
            used = sum(d["width"] * d["height"] for d in tiles)
            with self.subTest(checkpoint=cp, windows=len(tiles)):
                self.assertGreater(used / full, 0.9, "sobrou área vazia demais")

    def test_windows_rendered_where_kwin_says(self):
        for cp in CHECKPOINTS:
            img = Ppm(self.out / f"{cp}.ppm")
            tiled = self.tiled(cp)
            floating = [d for n, d in self.cp[cp].items() if n not in tiled and not d["minimized"]]
            for name, d in tiled.items():
                # Fora do centro (lá fica o texto branco da janela de teste).
                cx = round(d["x"] + d["width"] * 0.25)
                cy = round(d["y"] + d["height"] * 0.75)
                if any(f["x"] <= cx < f["x"] + f["width"] and f["y"] <= cy < f["y"] + f["height"] for f in floating):
                    continue  # coberto por uma flutuante
                px = img.getpixel((cx, cy))
                with self.subTest(checkpoint=cp, window=name, at=(cx, cy)):
                    if name in COLORS:
                        want = rgb(COLORS[name])
                        self.assertLess(max(abs(p - q) for p, q in zip(px, want)), 40,
                                        f"esperava {want} (cor da {name}), achou {px}")
                    else:
                        self.assertGreater(max(px), 30, f"{name}: pixel de fundo {px}")

    def test_toggle_on_brings_back_at_least_the_same_windows(self):
        self.assertLessEqual(set(self.tiled("twelve")), set(self.tiled("on_again")))


if __name__ == "__main__":
    unittest.main()
