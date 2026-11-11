"""Integração: o gerenciador do Kubik (kubik/manager) num KWin 6 real.

A janela que abre pelo AppImage e pela entrada "Kubik" do menu: com nada
instalado oferece Instalar; instalado, oferece Configurações e Remover, e
Atualizar quando há versão nova (do AppImage ou de um "GitHub" local).
Só no Arch: a janela usa os módulos do Plasma, que a imagem do Fedora não tem.
Ver tests/scenarios/manager.sh.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_appimage import build_appimage
from test_kwin_overlay import ROOT, kwin_env_available
from test_kwin_tray import plasma_available


@unittest.skipUnless(kwin_env_available() and plasma_available(), "testenv com Plasma indisponível")
class ManagerWindowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-manager-"))
        build_appimage(cls.out / "appimage")
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/manager.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=500,
            env=dict(os.environ, KUBIK_EXTRA_PKGS=""),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.appimage = cls.log.split("=== MARK appimage ===")[1].split("=== MARK menu ===")[0]
        cls.menu = cls.log.split("=== MARK menu ===")[1]

    @classmethod
    def tearDownClass(cls):
        if os.environ.get("KUBIK_KEEP_OUT"):
            print(cls.out)
            return
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_everything_happened(self):
        self.assertNotIn("TIMEOUT", self.log)

    def test_fresh_system_offers_only_install(self):
        self.assertRegex(self.appimage, r"\[kubik-manager\] aberto pelo instalador \d+\.\d+\.\d+")
        first = re.search(r"\[kubik-manager\] botões(.*)", self.appimage).group(1)
        self.assertEqual(re.findall(r" (\w+)=", first), ["install"])
        self.assertIn("=== FILES clean script=no tray=no menu=no manager=no", self.appimage)

    def test_install_from_the_appimage(self):
        self.assertRegex(self.appimage, r"ação: install \d+\.\d+\.\d+ \(bundle\)")
        self.assertIn("[kubik-manager] concluído: install", self.appimage)
        self.assertIn("=== FILES installed script=yes tray=yes menu=yes manager=yes", self.appimage)
        # Depois: configurações e remover (em dia com o AppImage).
        last = re.findall(r"\[kubik-manager\] botões(.*)", self.appimage)[-1]
        self.assertEqual(re.findall(r" (\w+)=", last), ["settings", "remove"])

    def test_menu_entry_opens_the_installed_manager(self):
        self.assertIn('=== EXEC "/home/tester/.local/share/kubik/manager.sh"', self.menu)
        self.assertIn("[kubik-manager] aberto pelo menu", self.menu)

    def test_offers_and_installs_the_github_update(self):
        self.assertIn("[kubik-manager] GitHub: 99.0.0", self.menu)
        offered = [l for l in re.findall(r"\[kubik-manager\] botões(.*)", self.menu) if " update=" in l][0]
        self.assertEqual(re.findall(r" (\w+)=", offered), ["settings", "remove", "update"])
        self.assertIn("ação: update 99.0.0 (github)", self.menu)
        self.assertIn("[kubik-manager] concluído: update", self.menu)
        self.assertIn("estado: instalado 99.0.0", self.menu)

    def test_settings_opens_the_tray_in_a_window(self):
        self.assertIn("=== SETTINGS Kubik", self.menu)

    def test_remove_asks_first_then_removes_everything(self):
        confirm = [l for l in re.findall(r"\[kubik-manager\] botões(.*)", self.menu) if " confirm=" in l][0]
        self.assertEqual(re.findall(r" (\w+)=", confirm), ["confirm", "cancel"])
        self.assertIn("[kubik-manager] concluído: remove", self.menu)
        self.assertIn("=== FILES removed script=no tray=no menu=no manager=no", self.menu)
        # Sem nada instalado, de novo só Instalar (agora a versão do GitHub).
        last = re.findall(r"\[kubik-manager\] botões(.*)", self.menu)[-1]
        self.assertEqual(re.findall(r" (\w+)=", last), ["install"])

    def test_window_has_the_menu_entry_app_id(self):
        # Mesmo nome da entrada do menu: a barra de tarefas mostra o ícone do Kubik.
        self.assertIn("=== APPID io.github.dionatansimioni.kubik io.github.dionatansimioni.kubik", self.log)

    def test_window_is_small_and_floating(self):
        m = re.search(r"=== MGRGEOM \d+ \d+ (\d+)x(\d+)", self.log)
        self.assertLess(int(m.group(1)), 700)
        self.assertRegex(self.log, r"flutuante 'Kubik': não redimensionável")

    def test_no_qml_errors(self):
        bad = [l for l in self.log.splitlines()
               if "manager/Main.qml" in l or ("kubik-manager" in l and re.search(r"Error|undefined|is not", l))]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
