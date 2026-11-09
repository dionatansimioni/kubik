"""Roda os testes unitários do núcleo TypeScript (Vitest) via scripts/node.sh,
para que `python3 -m unittest discover -s tests` cubra o projeto inteiro."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("docker"), "docker indisponível")
class KubikUnitTests(unittest.TestCase):
    def test_typecheck(self):
        proc = subprocess.run([str(ROOT / "scripts" / "node.sh"), "kubik", "npx", "tsc", "--noEmit"],
                              capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

    def test_vitest(self):
        proc = subprocess.run([str(ROOT / "scripts" / "node.sh"), "kubik", "npx", "vitest", "run"],
                              capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stdout[-4000:] + proc.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
