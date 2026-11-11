"""Integração: o instalador AppImage num KWin 6 real (Arch e Fedora).

O AppImage é gerado do .tar.gz do release (scripts/appimage.sh) e roda no
container com APPIMAGE_EXTRACT_AND_RUN (sem FUSE). As janelas do kdialog são
de um kdialog falso que registra o texto no log. Ver tests/scenarios/appimage.sh.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, kwin_env_available
from test_kwin_tray import plasma_available


def build_appimage(dest: Path) -> Path:
    dist = Path(tempfile.mkdtemp(prefix="kubik-ai-dist-"))
    try:
        out = subprocess.run(["python3", str(ROOT / "scripts" / "build.py")], cwd=ROOT, check=True,
                             capture_output=True, text=True, env=dict(os.environ, KUBIK_DIST=str(dist))).stdout
        tarball = next(l for l in out.splitlines() if l.endswith(".tar.gz"))
        path = subprocess.run([str(ROOT / "scripts" / "appimage.sh"), tarball, str(dest)],
                              check=True, capture_output=True, text=True).stdout.strip()
        return Path(path)
    finally:
        shutil.rmtree(dist, ignore_errors=True)


@unittest.skipUnless(kwin_env_available(), "testenv indisponível (docker/vgem)")
class AppImageInstallTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-appimage-"))
        cls.appimage = build_appimage(cls.out / "appimage")
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/appimage.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=400,
            env=dict(os.environ, KUBIK_EXTRA_PKGS=""),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")

    @classmethod
    def tearDownClass(cls):
        if os.environ.get("KUBIK_KEEP_OUT"):
            print(cls.out)
            return
        shutil.rmtree(cls.out, ignore_errors=True)

    def phase(self, name):
        return self.log.split(f"=== MARK {name} ===")[1].split("=== MARK")[0]

    def dialogs(self, name):
        return re.findall(r"^KDIALOG (.*)$", self.phase(name), re.M)

    def test_small_without_qt(self):
        self.assertLess(self.appimage.stat().st_size, 3 * 1024 * 1024)
        self.assertRegex(self.appimage.name, r"^Kubik-\d+\.\d+\.\d+-x86_64\.AppImage$")

    def test_two_clicks_install_everything_in_portuguese(self):
        d = self.dialogs("gui_first")
        self.assertEqual(len(d), 2, d)
        self.assertIn("[--yesno] [Instalar o Kubik", d[0])
        self.assertIn("[--yes-label] [Instalar]", d[0])
        # Efeito novo: o KWin só o carrega no próximo login, e o resumo avisa.
        self.assertIn("Saia e entre na sessão uma vez", d[1])
        self.assertIn("[--yes-label] [Abrir o Kubik]", d[1])
        self.assertIn("=== STATE gui_first script=true tray=yes icon=yes menu=yes", self.log)

    @unittest.skipUnless(plasma_available(), "sem os módulos do Plasma (gerenciador) na imagem")
    def test_open_kubik_shows_the_installed_manager(self):
        self.assertIn("[kubik-manager] aberto", self.phase("gui_first"))
        m = re.search(r"=== MANAGER (\S+) (\d+)x(\d+)", self.log)
        self.assertTrue(m, "janela do gerenciador não apareceu")
        self.assertLess(int(m.group(2)), 900)  # janela pequena, fora do tiling

    @unittest.skipIf(plasma_available(), "a imagem do Arch tem o Plasma (plasmawindowed)")
    def test_without_plasmawindowed_falls_back_to_kdialog(self):
        d = self.dialogs("no_plasmawindowed")
        self.assertEqual(len(d), 1, self.phase("no_plasmawindowed"))
        self.assertIn("is already installed", d[0])

    def test_second_run_knows_it_is_installed(self):
        d = self.dialogs("gui_again")
        # Falhou uma vez no Fedora com a máquina carregada (nenhuma janela):
        # a mensagem traz a fase inteira para diagnosticar.
        phase = "\n".join(l for l in self.phase("gui_again").splitlines() if "kwin_core" not in l)
        self.assertEqual(len(d), 1, phase)
        self.assertRegex(d[0], r"\[--yesnocancel\] \[Kubik \d+\.\d+\.\d+ is already installed\.\]")
        self.assertIn("=== exit 0", self.phase("gui_again"))

    def test_terminal_uninstall_and_install(self):
        self.assertIn("=== STATE cli_uninstall script=false tray=no icon=no menu=no", self.log)
        self.assertIn("=== STATE cli_install script=true tray=yes icon=yes menu=yes", self.log)
        self.assertIn("Kubik removido.", self.phase("cli_uninstall"))


if __name__ == "__main__":
    unittest.main()
