"""Integração: o protótipo de overlay rodando num KWin 6 real (testenv/).

Roda tests/scenarios/overlay.sh num kwin_wayland --virtual dentro de um
container e confere o log e os screenshots. Leva ~20s. Pulado quando não há
docker ou GPU virtual (vgem); defina KUBIK_SKIP_KWIN=1 para pular sempre.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def kwin_env_available():
    if os.environ.get("KUBIK_SKIP_KWIN"):
        return False
    if not shutil.which("docker"):
        return False
    has_vgem = any(p.resolve().name == "vgem" for p in Path("/sys/class/drm").glob("renderD*/device"))
    return has_vgem or os.geteuid() == 0


def is_accent(px):
    """Cor de destaque (Breeze: #3daee9): azul claro e saturado."""
    r, g, b = px[:3]
    return b > 180 and b - r > 100 and g > 120


def is_background(px):
    return max(px[:3]) < 30


class Ppm:
    """Leitor mínimo de PPM binário (P6, maxval 255)."""

    def __init__(self, path):
        data = Path(path).read_bytes()
        fields, pos = [], 0
        while len(fields) < 4:
            while data[pos:pos + 1].isspace():
                pos += 1
            start = pos
            while not data[pos:pos + 1].isspace():
                pos += 1
            fields.append(data[start:pos])
        assert fields[0] == b"P6" and fields[3] == b"255", fields
        self.width, self.height = int(fields[1]), int(fields[2])
        self.pixels = data[pos + 1:]

    def getpixel(self, xy):
        x, y = xy
        i = 3 * (y * self.width + x)
        return tuple(self.pixels[i:i + 3])


def parse_log(text):
    """Geometria mais recente de cada janela antes de cada MARK."""
    geos, marks = {}, {}
    for line in text.splitlines():
        m = re.search(r"ativada '([^']+)'.* geo=(\{[^}]+\})", line) or \
            re.search(r"assentou '([^']+)' geo=(\{[^}]+\})", line)
        if m:
            geos[m.group(1)] = json.loads(m.group(2))
        m = re.search(r"=== MARK (\w+) ===", line)
        if m:
            marks[m.group(1)] = dict(geos)
    return marks


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class OverlayInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-kwin-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "prototype/overlay",
             "tests/scenarios/overlay.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.marks = parse_log(cls.log)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def image(self, name):
        return Ppm(self.out / f"{name}.ppm")

    def assertBorderAround(self, img, geo, msg=""):
        x, y, w, h = (round(geo[k]) for k in ("x", "y", "width", "height"))
        midy, midx = y + h // 2, x + w // 2
        for px in ((x - 2, midy), (x + w + 1, midy), (midx, y + h + 1)):
            self.assertTrue(is_accent(img.getpixel(px)),
                            f"{msg}: sem borda em {px}: {img.getpixel(px)}")

    def test_script_loads_without_errors(self):
        self.assertIn("[kubik-proto] carregado", self.log)
        self.assertIn("overlays=true/true", self.log)
        for bad in ("Component failed to load", "TypeError", "ReferenceError", "is not defined"):
            self.assertNotIn(bad, self.log)

    def test_border_around_single_window(self):
        self.assertBorderAround(self.image("single"), self.marks["single"]["Alpha"], "single")

    def test_border_follows_focus(self):
        img = self.image("two")
        self.assertBorderAround(img, self.marks["two"]["Beta"], "two/Beta")
        alpha = self.marks["two"]["Alpha"]
        left = (round(alpha["x"]) - 2, round(alpha["y"] + alpha["height"] / 2))
        self.assertFalse(is_accent(img.getpixel(left)), "janela sem foco não deveria ter borda")

    def test_stacking_shows_tab_bar(self):
        img = self.image("stacked")
        beta = self.marks["two"]["Beta"]  # a pilha ocupa o retângulo original da Beta
        x, y, w = round(beta["x"]), round(beta["y"]), round(beta["width"])
        row = [img.getpixel((px, y + 14)) for px in range(x + 5, x + w - 5, 5)]
        accent = sum(map(is_accent, row))
        inactive = sum(1 for p in row if not is_accent(p) and min(p) > 180)  # aba clara
        self.assertGreater(accent, len(row) // 4, "aba ativa destacada ausente")
        self.assertGreater(inactive, len(row) // 4, "aba inativa ausente")

    def test_stacked_windows_share_geometry(self):
        geos = self.marks["stacked"]
        self.assertIn("Alpha", geos)
        beta = self.marks["two"]["Beta"]
        alpha = geos["Alpha"]
        self.assertAlmostEqual(alpha["x"], beta["x"], delta=2)
        self.assertAlmostEqual(alpha["width"], beta["width"], delta=2)
        self.assertAlmostEqual(alpha["y"], beta["y"] + 28, delta=2)  # espaço da barra de abas


if __name__ == "__main__":
    unittest.main()
