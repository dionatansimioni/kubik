"""Integração: scripts/sys.sh com os programas de D-Bus de verdade, num KWin real.

Os testes de unidade (test_sys.py) usam programas falsos; aqui, cada backend
presente na imagem do testenv responde de verdade e todos têm que concordar.
Ver tests/scenarios/sys.sh.
"""
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, kwin_env_available

META_Y, META_H = "268435545", "268435528"


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class SysInKWinTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-sys-"))
        subprocess.run([str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/sys.sh", str(cls.out)],
                       cwd=ROOT, check=True, capture_output=True, timeout=300)
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.tools = dict(re.findall(r"=== TOOL ([\w-]+)=(\S+)", cls.log))
        cls.rows = {m.group(1): m.group(2) for m in re.finditer(r"=== SYS \[([^\]]*)\] (.*)", cls.log)}
        cls.calls = {m.group(1): m.group(2) for m in re.finditer(r"=== CALL \[([^\]]*)\] (.*)", cls.log)}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def backends(self):
        """KUBIK_SYS_DISABLE de cada rodada → backend de D-Bus que ela usou (ou None)."""
        has = lambda t: self.tools.get(t) == "yes"
        qdbus = has("qdbus6") or has("qdbus-qt6") or has("qdbus")
        return {
            "": "dbus-send" if has("dbus-send") else None,
            "dbus-send": "gdbus" if has("gdbus") else ("qdbus" if qdbus else None),
            "dbus-send gdbus": "qdbus" if qdbus else None,
        }

    def test_every_backend_gives_the_same_answers(self):
        self.assertEqual(self.tools.get("dbus-send"), "yes", "toda imagem do testenv tem o dbus-send")
        for disabled, backend in self.backends().items():
            with self.subTest(backend=backend or f"nenhum ({disabled})"):
                row = self.rows[disabled]
                if backend is None:
                    continue
                self.assertIn("loaded=true other=false", row)
                if backend == "qdbus":
                    self.assertIn("getrc=127", row)   # o qdbus não lê atalhos
                else:
                    self.assertIn(f"get={META_Y} getrc=0", row)

    def test_written_by_one_read_by_the_other(self):
        if self.tools.get("gdbus") != "yes":
            self.skipTest("imagem sem gdbus (Debian: o KDE não instala o libglib2.0-bin)")
        self.assertIn(f"=== SET gdbus->dbus-send {META_H}", self.log)
        self.assertIn(f"=== SET dbus-send->gdbus {META_Y}", self.log)

    def test_dbus_call_unloads_and_starts_the_script(self):
        for disabled, backend in self.backends().items():
            if backend is None:
                continue
            with self.subTest(backend=backend):
                self.assertEqual(self.calls[disabled], "after_unload=false after_start=true")

    def test_reconfigure_without_dbus_send_applies_settings(self):
        # O que a bandeja faz ao gravar (writeCommand): o KWin relê o kwinrc.
        after = self.log.split("=== MARK reconfigure ===")[1]
        first = after.split("=== RECONF [dbus-send] done")[0]
        self.assertIn("gaps 9/", first)
        if self.backends()["dbus-send gdbus"]:
            second = after.split("=== RECONF [dbus-send] done")[1].split("=== RECONF [dbus-send gdbus] done")[0]
            self.assertIn("gaps 7/", second)


if __name__ == "__main__":
    unittest.main()
