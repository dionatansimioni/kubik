"""Integração: o gerenciador do Kubik (kubik/manager) num KWin 6 real.

A janela que abre pelo AppImage e pela entrada "Kubik" do menu: um app Qt
com o próprio Qt (6.8, do Debian 13) dentro do AppImage. Com nada instalado
oferece Instalar; instalado, oferece Configurações e Remover, e Atualizar
quando há versão nova (do AppImage ou de um "GitHub" local, que traz um
AppImage 99.0.0). Roda no Arch e no Fedora (o app não usa nada do Plasma; as
configurações abrem no plasmawindowed, que só a imagem do Arch tem).
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


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class ManagerWindowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-manager-"))
        build_appimage(cls.out / "appimage")
        build_appimage(cls.out / "fake", version="99.0.0")
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/manager.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=600,
            env=dict(os.environ, KUBIK_EXTRA_PKGS=""),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.appimage = cls.log.split("=== MARK appimage ===")[1].split("=== MARK menu ===")[0]
        cls.menu = cls.log.split("=== MARK menu ===")[1].split("=== MARK no_tools ===")[0]
        cls.no_tools = cls.log.split("=== MARK no_tools ===")[1]

    @classmethod
    def tearDownClass(cls):
        if os.environ.get("KUBIK_KEEP_OUT"):
            print(cls.out)
            return
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_everything_happened(self):
        self.assertNotIn("TIMEOUT", self.log)
        self.assertNotIn("kubik-manager não saiu", self.log)

    def test_fresh_system_offers_only_install(self):
        self.assertRegex(self.appimage, r"\[kubik-manager\] aberto \(Qt 6\.8\.\d+\), pacote \d+\.\d+\.\d+")
        first = re.search(r"\[kubik-manager\] botões(.*)", self.appimage).group(1)
        self.assertEqual(re.findall(r" (\w+)=", first), ["install"])
        self.assertIn("=== FILES clean script=no tray=no menu=no manager=no", self.appimage)

    def test_reads_the_newer_kdeglobals_font_format(self):
        self.assertIn("fonte DejaVu Sans 10", self.appimage)
        self.assertNotIn("QFont::fromString", self.log)

    def test_follows_the_dark_kde_color_scheme(self):
        # A janela com a cor do kdeglobals (Breeze Dark), não o Fusion claro (#efefef).
        self.assertIn("cores do KDE (janela #202326)", self.appimage)

    def test_uses_its_own_qt(self):
        # O Qt de dentro do AppImage (6.8), não o do sistema (Arch e Fedora: mais novo).
        for qt in re.findall(r"\[kubik-manager\] aberto \(Qt ([\d.]+)\)", self.log):
            self.assertTrue(qt.startswith("6.8."), qt)

    def test_window_has_the_menu_entry_app_id(self):
        # Mesmo nome da entrada do menu: a barra de tarefas mostra o ícone do Kubik.
        self.assertIn("=== APPID io.github.dionatansimioni.kubik io.github.dionatansimioni.kubik", self.log)

    def test_install_from_the_appimage(self):
        self.assertRegex(self.appimage, r"ação: install \d+\.\d+\.\d+ \(bundle\)")
        self.assertIn("[kubik-manager] concluído: install", self.appimage)
        # O AppImage se guarda em ~/.local/share/kubik, e o menu o abre.
        self.assertIn("=== FILES installed script=yes tray=yes menu=yes manager=yes", self.appimage)
        # Depois de instalar, o estado mostra a versão (em pt-BR o kpackagetool6
        # escreve "Caminho"; 0.12.0 ficava em "instalado null").
        self.assertRegex(self.appimage, r"concluído: install[\s\S]*estado: instalado \d+\.\d+\.\d+")
        last = re.findall(r"\[kubik-manager\] botões(.*)", self.appimage)[-1]
        self.assertEqual(re.findall(r" (\w+)=", last), ["settings", "remove"])

    def test_menu_entry_opens_the_installed_manager(self):
        self.assertIn('=== EXEC "/home/tester/.local/share/kubik/Kubik.AppImage"', self.menu)
        self.assertIn("[kubik-manager] aberto", self.menu)

    @unittest.skipUnless(plasma_available(), "sem plasmawindowed na imagem")
    def test_settings_open_beside_the_manager(self):
        self.assertIn("[kubik-manager] configurações", self.menu)
        self.assertIn("=== WINDOWS io.github.dionatansimioni.kubik org.kde.plasmawindowed", self.menu)

    def test_offers_and_installs_the_github_update(self):
        self.assertIn("[kubik-manager] GitHub: 99.0.0", self.menu)
        offered = [l for l in re.findall(r"\[kubik-manager\] botões(.*)", self.menu) if " update=" in l][0]
        self.assertEqual(re.findall(r" (\w+)=", offered), ["settings", "remove", "update"])
        self.assertIn("ação: update 99.0.0 (github)", self.menu)
        # Pelo AppImage do release, que também troca o gerenciador guardado.
        self.assertIn("=== MANAGER is 99.0.0", self.menu)
        self.assertIn("[kubik-manager] concluído: update", self.menu)
        self.assertIn("estado: instalado 99.0.0", self.menu)

    def test_remove_asks_first_then_removes_everything(self):
        confirm = [l for l in re.findall(r"\[kubik-manager\] botões(.*)", self.menu) if " confirm=" in l][0]
        self.assertEqual(re.findall(r" (\w+)=", confirm), ["confirm", "cancel"])
        self.assertIn("[kubik-manager] concluído: remove", self.menu)
        self.assertIn("=== FILES removed script=no tray=no menu=no manager=no", self.menu)
        # Sem nada instalado, de novo só Instalar (agora a versão do GitHub).
        last = re.findall(r"\[kubik-manager\] botões(.*)", self.menu)[-1]
        self.assertEqual(re.findall(r" (\w+)=", last), ["install"])

    def test_window_is_small_and_floating(self):
        for w, h in re.findall(r"=== MGRGEOM \d+ \d+ (\d+)x(\d+)", self.log):
            self.assertLess(int(w), 700)
            self.assertLess(int(h), 500)
        self.assertRegex(self.log, r"flutuante 'Kubik': não redimensionável")

    def test_no_qml_errors(self):
        bad = [l for l in self.log.splitlines()
               if "qrc:/Main.qml" in l or ("kubik-manager" in l and re.search(r"Error|undefined|is not", l))]
        self.assertEqual(bad, [])
    def test_missing_tools_are_reported_before_installing(self):
        # Sem cliente de D-Bus nem de download: os dois avisos, com o comando da distro.
        self.assertRegex(self.no_tools, r"\[kubik-manager\] estado: instalado null, .*avisos dbus,fetch")


if __name__ == "__main__":
    unittest.main()
