"""Integração: o gerenciador (a bandeja numa janela, entrada "Kubik" do menu).

Num KWin real com o Plasma do Arch: o applet acha uma versão nova num
"GitHub" local (testenv/lib.sh › fake_releases), atualiza pelo botão e
desinstala pelo botão, com confirmação. Ver tests/scenarios/manager.sh.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, Ppm, kwin_env_available
from test_kwin_tray import plasma_available


@unittest.skipUnless(kwin_env_available() and plasma_available(), "testenv com Plasma indisponível")
class ManagerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-manager-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/manager.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=400,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect kubik/tray",
                     KUBIK_KWINRC="Script-kubik/Exceptions=org.kde.plasmoidviewer,plasmoidviewer"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_shows_status_and_finds_the_new_version(self):
        self.assertRegex(self.log, r"\[kubik-tray\] estado: script (\d+\.\d+\.\d+) \(ativo\), efeito \1 \(ativo\), bandeja \1")
        self.assertRegex(self.log, r"\[kubik-tray\] nova versão: 99\.0\.0 \(instalada: \d+\.\d+\.\d+\)")
        self.assertNotIn("TIMEOUT", self.log)

    def test_update_button_installs_the_new_release(self):
        self.assertIn("[kubik-tray] atualizado para 99.0.0", self.log)
        self.assertIn("estado: script 99.0.0 (ativo), efeito 99.0.0 (ativo), bandeja 99.0.0", self.log)
        self.assertIn("=== FILES updated icon=yes desktop=yes uninstaller=yes script=yes tray=yes", self.log)
        self.assertIn("=== desktop exec: plasmawindowed io.github.dionatansimioni.kubik", self.log)

    def test_uninstall_asks_first_then_removes_everything(self):
        # Antes de confirmar, nada removido; o botão Remover aparece no lugar.
        before = self.log.split("=== MARK uninstall ===")[1]
        self.assertIn("[kubik-tray] desinstalando", before)
        self.assertIn("[kubik-tray] desinstalado", before)
        self.assertIn("=== FILES removed icon=no desktop=no uninstaller=no script=no tray=no", self.log)
        # Meta+← volta para o quick tile do KDE.
        self.assertIn("=== keys after uninstall quicktile=[285212690]", self.log)

    def test_confirmation_row_is_shown(self):
        # O botão "Remover" (ícone vermelho de lixeira) só aparece depois do "Desinstalar…".
        confirm = Ppm(self.out / "confirm.ppm")
        removed = Ppm(self.out / "removed.ppm")
        def reds(img):
            return sum(1 for x in range(1020, 1240) for y in range(330, 360)
                       if (lambda p: p[0] > 180 and p[1] < 110 and p[2] < 110)(img.getpixel((x, y))[:3]))
        self.assertGreater(reds(confirm), 5)
        self.assertEqual(reds(removed), 0)

    def test_no_qml_errors(self):
        applet = [l for l in self.log.splitlines()
                  if "io.github.dionatansimioni.kubik" in l and re.search(r"Error|error|is not|undefined", l)]
        self.assertEqual(applet, [])
        self.assertNotIn("comando falhou", self.log)


if __name__ == "__main__":
    unittest.main()
