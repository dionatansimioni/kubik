"""Integração: memória do Kubik num KWin real (testenv/).

O script e o efeito do Kubik rodam dentro do kwin_wayland, então a medida é a
memória residente (RSS) do KWin. O cenário tests/scenarios/memory.sh roda duas
vezes: com o Kubik e com ele desativado (o mesmo KWin, as mesmas janelas). A
diferença é o consumo do Kubik; o crescimento entre os ciclos, descontado o do
KWin sozinho, é o que vazaria.

O resumo é impresso no fim ("memória do kubik: ...").
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

from test_kwin_overlay import ROOT, kwin_env_available

CYCLES = 28
# Proteção grosseira pela RSS: quanto o KWin com o Kubik pode crescer a mais
# que o KWin sozinho (que também cresce, ~100 kB por ciclo), por ciclo de 4
# janelas. Dois KWins separados variam centenas de kB por ciclo entre si, então
# o limite é largo; o teste exato é o das coleções do Kubik
# (test_kubik_keeps_nothing_from_closed_windows).
MAX_GROWTH_KB_PER_CYCLE = 250
# O Kubik inteiro (script + efeito, com 4 janelas abertas e fechadas).
MAX_FOOTPRINT_MB = 40


def parse(log):
    """[(fase, rss_kb)] na ordem."""
    return [(m.group(1), int(m.group(2))) for m in re.finditer(r"=== MEM (\w+) rss=(\d+)", log)]


def run(out, kwinrc=""):
    subprocess.run(
        [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/memory.sh", out],
        cwd=ROOT, check=True, capture_output=True, timeout=600,
        env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect", KUBIK_KWINRC=kwinrc,
                 KUBIK_MEM_CYCLES=str(CYCLES)),
    )
    with open(f"{out}/kwin.log", errors="replace") as f:
        return f.read()


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class MemoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dirs = [tempfile.mkdtemp(prefix="kubik-mem-") for _ in range(2)]
        with ThreadPoolExecutor(2) as ex:
            on = ex.submit(run, cls.dirs[0])
            off = ex.submit(run, cls.dirs[1], "Plugins/kubikEnabled=false Plugins/kubikanimationsEnabled=false")
            cls.log_on, cls.log_off = on.result(), off.result()
        cls.on, cls.off = parse(cls.log_on), parse(cls.log_off)

    @classmethod
    def tearDownClass(cls):
        for d in cls.dirs:
            shutil.rmtree(d, ignore_errors=True)
        if len(cls.on) == len(cls.off) == CYCLES // 4 + 2:
            print(f"\nmemória do kubik: {cls.footprint_kb() / 1024:.1f} MB em média "
                  f"(KWin {cls.avg(cls.on) / 1024:.0f} MB com, {cls.avg(cls.off) / 1024:.0f} MB sem); "
                  f"crescimento a mais por ciclo: {cls.extra_growth_kb():.0f} kB", file=sys.stderr)

    @staticmethod
    def avg(samples):
        steady = [kb for phase, kb in samples if phase.startswith("cycle")]
        return sum(steady) / len(steady)

    @classmethod
    def footprint_kb(cls):
        return cls.avg(cls.on) - cls.avg(cls.off)

    @classmethod
    def extra_growth_kb(cls):
        """Quanto a diferença com/sem cresce por ciclo: mediana das 3 primeiras
        medidas depois do aquecimento (ciclos 4, 8, 12) contra a das 3 últimas.
        A mediana ignora picos soltos do KWin (um ciclo com +9 MB que volta)."""
        diff = [a - b for (_, a), (_, b) in zip(cls.on, cls.off)]
        first, last = sorted(diff[1:4])[1], sorted(diff[-3:])[1]
        return (last - first) / (CYCLES - 8)

    def test_both_runs_measured(self):
        self.assertIn("=== KUBIK loaded=1", self.log_on)
        self.assertIn("=== KUBIK loaded=0", self.log_off)
        self.assertIn("[kubik] iniciado", self.log_on)
        self.assertNotIn("[kubik]", self.log_off)
        for samples in (self.on, self.off):
            self.assertEqual(len(samples), CYCLES // 4 + 2, samples)

    def test_kubik_actually_tiled_every_cycle(self):
        # Sem isso, "não vaza" poderia ser só "não fez nada".
        n = CYCLES + 1  # + o de aquecimento
        self.assertEqual(len(re.findall(r"\[kubik\] tiling 'M[ABCD]'", self.log_on)), 4 * n)
        self.assertEqual(self.log_on.count("[kubik] trocou 'M"), n)
        self.assertEqual(self.log_on.count("[kubik] monocle ligado"), n)
        self.assertEqual(self.log_on.count("[kubik] monocle desligado"), n)
        self.assertNotIn("TypeError", self.log_on)
        self.assertNotIn("ReferenceError", self.log_on)

    def test_kubik_keeps_nothing_from_closed_windows(self):
        # O exato: as coleções do Kubik (janelas rastreadas, árvores, histórico
        # de foco, sinais) voltam ao tamanho de antes dos ciclos.
        start = re.search(r"=== MARK state_start ===[\s\S]*?\[estado\] (memória: [^\n]*)", self.log_on)
        end = re.search(r"=== MARK state_end ===[\s\S]*?\[estado\] (memória: [^\n]*)", self.log_on)
        self.assertIsNotNone(start)
        self.assertIsNotNone(end)
        self.assertEqual(start.group(1), end.group(1))
        self.assertIn("tiled=0", end.group(1))

    def test_no_memory_leak(self):
        self.assertLess(self.extra_growth_kb(), MAX_GROWTH_KB_PER_CYCLE,
                        f"com: {self.on}\nsem: {self.off}")

    def test_footprint_is_small(self):
        self.assertLess(self.footprint_kb() / 1024, MAX_FOOTPRINT_MB, f"com: {self.on}\nsem: {self.off}")


if __name__ == "__main__":
    unittest.main()
