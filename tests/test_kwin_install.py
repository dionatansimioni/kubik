"""Integração: instalar o .tar.gz do release com o install.sh numa sessão aberta.

Relato do usuário: "não existem animações" no Fedora. Reproduzido: o KWin só
descobre efeitos NOVOS ao iniciar a sessão; na primeira instalação o efeito
não carrega até o próximo login, e o install.sh dizia "tudo ativo". Agora ele
avisa. Numa atualização (efeito já conhecido), o efeito carrega na hora.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, kwin_env_available, needs_effects


def run(extra=""):
    out = Path(tempfile.mkdtemp(prefix="kubik-install-"))
    subprocess.run(
        [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/install-bundle.sh", str(out)],
        cwd=ROOT, check=True, capture_output=True, timeout=300,
        env=dict(os.environ, KUBIK_EXTRA_PKGS=extra),
    )
    return out, (out / "kwin.log").read_text(errors="replace")


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class FirstInstallTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out, cls.log = run()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_script_is_active(self):
        self.assertIn("=== script loaded: true", self.log)

    def test_keyboard_takes_meta_arrows_and_uninstall_gives_them_back(self):
        # Meta+← = 0x11000012; Meta+Alt+← = 0x19000012; Meta+M = 0x1000004D.
        # Sem tecla: o KWin 6.8 lista [], o 6.3 (Debian) lista [0].
        self.assertRegex(self.log, r"=== keys quicktile=\[0?\] switchwin=\[0?\] focus=\[285212690\] resize=\[419430418\] monocle=\[268435533\]")
        self.assertIn("=== active after Meta+Left: Alpha", self.log)
        self.assertIn("=== after uninstall quicktile=[285212690] switchwin=[419430418] backup=no", self.log)

    def test_app_icon_and_stored_uninstaller(self):
        # Pelo .tar.gz não há gerenciador (ele é o AppImage), então nem entrada
        # "Kubik" no menu; com o AppImage: test_kwin_appimage/test_kwin_manager.
        self.assertIn("=== files installed icon=yes menu=no uninstaller=yes "
                      "list=[Plasma/Applet io.github.dionatansimioni.kubik,KWin/Script kubik,KWin/Effect kubikanimations]",
                      self.log)
        self.assertIn("=== files uninstalled icon=no menu=no uninstaller=no list=[]", self.log)

    def test_uninstall_stops_the_script_right_away(self):
        self.assertIn("=== script loaded after uninstall: false", self.log)

    def test_tray_icon_is_installed(self):
        self.assertIn("=== tray installed: true", self.log)
        self.assertIn("Ícone na bandeja", self.log)

    def test_new_effect_needs_relogin_and_installer_says_so(self):
        self.assertIn("=== effect loaded: false", self.log)  # limitação do KWin
        self.assertIn("SAIR E ENTRAR", self.log)
        self.assertNotIn("Pronto: tudo instalado e ativo", self.log)


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class UpgradeInstallTest(unittest.TestCase):
    """O efeito já existia quando a sessão começou (atualização)."""

    @classmethod
    def setUpClass(cls):
        cls.out, cls.log = run(extra="kubik/effect")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    @needs_effects
    def test_effect_reloads_without_relogin(self):
        self.assertIn("=== effect loaded: true", self.log)
        self.assertIn("Pronto: tudo instalado e ativo", self.log)
        self.assertNotIn("SAIR E ENTRAR", self.log)
        self.assertGreaterEqual(len(re.findall(r"\[kubik-animations\] carregado", self.log)), 2)


if __name__ == "__main__":
    unittest.main()
