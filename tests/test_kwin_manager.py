"""Integração: o gerenciador do Kubik (kubik/manager) num KWin 6 real.

A janela que abre pelo AppImage e pela entrada "Kubik" do menu (um plasmoide
oculto no plasmawindowed): com nada instalado oferece Instalar; instalado,
oferece Configurações e Remover, e Atualizar quando há versão nova (do
AppImage ou de um "GitHub" local).
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
        self.assertNotIn("plasmawindowed não saiu", self.log)

    def test_fresh_system_offers_only_install(self):
        self.assertIn("[kubik-manager] aberto", self.appimage)
        self.assertRegex(self.appimage, r"estado: instalado null, disponível \d+\.\d+\.\d+ \(bundle\), ações install")
        # O pacote do AppImage fica num lugar fixo da sessão.
        self.assertRegex(self.appimage, r"=== STAGE .*install\.sh .*packages")
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
        self.assertIn('=== EXEC "/home/tester/.local/share/kubik/open.sh"', self.menu)
        self.assertIn("[kubik-manager] aberto", self.menu)

    def test_opens_when_plasmawindowed_is_already_running(self):
        # As configurações já estavam abertas: o gerenciador fica no lugar delas.
        self.assertRegex(self.menu, r"=== WINDOWS before \d+x\d+\n")
        self.assertRegex(self.menu, r"=== WINDOWS manager \d+x\d+\n")
        self.assertIn("=== PROCESSES 1", self.menu)

    def test_offers_and_installs_the_github_update(self):
        self.assertIn("[kubik-manager] GitHub: 99.0.0", self.menu)
        offered = [l for l in re.findall(r"\[kubik-manager\] botões(.*)", self.menu) if " update=" in l][0]
        self.assertEqual(re.findall(r" (\w+)=", offered), ["settings", "remove", "update"])
        self.assertIn("ação: update 99.0.0 (github)", self.menu)
        self.assertIn("[kubik-manager] concluído: update", self.menu)
        self.assertIn("estado: instalado 99.0.0", self.menu)

    def test_settings_opens_the_tray_in_a_window(self):
        self.assertIn("[kubik-manager] configurações", self.menu)
        # Uma janela só: a da bandeja (o plasmawindowed mostra um plasmoide por vez).
        after = self.menu.split("[kubik-manager] configurações", 1)[1].split("=== WINDOWS settings", 1)
        self.assertNotIn("[kubik-manager] aberto", after[0])
        self.assertRegex(after[1], r"^ \d+x\d+\n")

    def test_menu_reopens_the_manager_after_settings(self):
        # O plasmawindowed ignora um plasmoide que já passou pelo processo; o
        # open.sh começa outro processo.
        self.assertEqual(self.menu.count("[kubik-manager] aberto"), 2)
        after = self.menu.split("=== WINDOWS settings", 1)[1]
        self.assertIn("[kubik-manager] aberto", after.split("=== WINDOWS reopened")[0])
        self.assertRegex(after, r"=== WINDOWS reopened \d+x\d+\n")

    def test_remove_asks_first_then_removes_everything(self):
        confirm = [l for l in re.findall(r"\[kubik-manager\] botões(.*)", self.menu) if " confirm=" in l][0]
        self.assertEqual(re.findall(r" (\w+)=", confirm), ["confirm", "cancel"])
        self.assertIn("[kubik-manager] concluído: remove", self.menu)
        self.assertIn("=== FILES removed script=no tray=no menu=no manager=no", self.menu)
        # Sem nada instalado, de novo só Instalar (agora a versão do GitHub).
        last = re.findall(r"\[kubik-manager\] botões(.*)", self.menu)[-1]
        self.assertEqual(re.findall(r" (\w+)=", last), ["install"])

    def test_window_is_small_and_floating(self):
        # Do tamanho do conteúdo (o plasmawindowed abriria com 500×536).
        for w, h in re.findall(r"=== MGRGEOM \d+ \d+ (\d+)x(\d+)", self.log):
            self.assertLess(int(w), 500)
            self.assertLess(int(h), 400)
        self.assertRegex(self.log, r"flutuante 'Kubik': classe flutuante \(org\.kde\.plasmawindowed\)")

    def test_no_qml_errors(self):
        bad = [l for l in self.log.splitlines()
               if "kubik.manager/contents" in l or ("kubik-manager" in l and re.search(r"Error|undefined|is not", l))]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
