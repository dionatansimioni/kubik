"""Integração: o efeito kubikanimations no KWin real (testenv/).

Com o efeito, a Alpha encolhe de tela cheia para a metade esquerda ao longo
de 2 s (linear): ~0,7 s depois, ela ainda cobre o ponto (760, 780). Sem o
efeito (controle), o ponto já é da Beta. O controle prova que o teste mede a
animação, e não o tempo de abrir a janela.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, kwin_env_available
from test_kwin_tiling import LEFT, RIGHT, parse_windows

PROBE = (760, 780)  # dentro da Alpha no meio do encolhimento; dentro da Beta no final


def is_red(p):
    return p[0] > 100 and p[1] < 80 and p[2] < 80


def is_green(p):
    return p[1] > 80 and p[0] < 80 and p[2] < 80


class _AnimationScenario(unittest.TestCase):
    EXTRA_PKGS = ""

    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-anim-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/animation.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS=cls.EXTRA_PKGS,
                     KUBIK_KWINRC="Effect-kubikanimations/Duration=2000 Effect-kubikanimations/Curve=Linear"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def pixel(self, shot):
        return Ppm(self.out / f"{shot}.ppm").getpixel(PROBE)

    def test_final_layout_is_the_same(self):
        self.assertEqual(parse_windows(self.log)["end"], {"Alpha": LEFT, "Beta": RIGHT})
        self.assertTrue(is_green(self.pixel("end")), self.pixel("end"))


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class AnimationEffectTest(_AnimationScenario):
    EXTRA_PKGS = "kubik/effect"

    def test_effect_loads_with_configured_timing(self):
        self.assertIn("[kubik-animations] carregado", self.log)
        self.assertIn("[kubik-animations] configuração: 2000ms Linear", self.log)

    def test_no_qml_warnings_from_the_bundle(self):
        self.assertNotIn("used before its declaration", self.log)

    def test_resize_is_animated(self):
        p = self.pixel("mid")
        self.assertTrue(is_red(p), f"no meio da animação a Alpha deveria cobrir {PROBE}: {p}")


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class NoAnimationControlTest(_AnimationScenario):
    EXTRA_PKGS = ""

    def test_without_effect_resize_is_instant(self):
        p = self.pixel("mid")
        self.assertTrue(is_green(p), f"sem o efeito, {PROBE} já deveria ser da Beta: {p}")


del _AnimationScenario  # só as subclasses rodam

if __name__ == "__main__":
    unittest.main()
