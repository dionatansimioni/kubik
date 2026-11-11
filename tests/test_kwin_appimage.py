"""Integração: o AppImage sem o gerenciador em Qt, num KWin 6 real (Arch e Fedora).

O menu de reserva do kdialog (forçado, ou porque o app não abriu) e as opções
de terminal. O AppImage é gerado do .tar.gz do release (scripts/appimage.sh) e
roda no container com APPIMAGE_EXTRACT_AND_RUN (sem FUSE). As janelas são de
um kdialog falso que registra o texto no log. Ver tests/scenarios/appimage.sh.
O gerenciador em Qt: test_kwin_manager.py.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import ROOT, kwin_env_available


def _with_version(tarball: Path, version: str, dest: Path) -> Path:
    """O mesmo .tar.gz, com outra versão (para um "release" falso mais novo)."""
    import io
    import re as _re
    import tarfile
    out = dest / f"kubik-{version}.tar.gz"
    with tarfile.open(tarball) as src, tarfile.open(out, "w:gz") as dst:
        for m in src.getmembers():
            data = src.extractfile(m).read() if m.isfile() else None
            parts = m.name.split("/", 1)
            # Entrada nova (nomes longos vão num cabeçalho PAX, que mudar
            # m.name não alteraria).
            info = tarfile.TarInfo(f"kubik-{version}" + ("/" + parts[1] if len(parts) > 1 else ""))
            info.type, info.mode, info.mtime = m.type, m.mode, m.mtime
            if data is not None and info.name.endswith("metadata.json") and "/packages/" in info.name:
                data = _re.sub(rb'"Version": *"[^"]*"', f'"Version": "{version}"'.encode(), data)
            info.size = len(data) if data is not None else 0
            dst.addfile(info, io.BytesIO(data) if data is not None else None)
    return out


def build_appimage(dest: Path, version: str = "") -> Path:
    dist = Path(tempfile.mkdtemp(prefix="kubik-ai-dist-"))
    try:
        out = subprocess.run(["python3", str(ROOT / "scripts" / "build.py")], cwd=ROOT, check=True,
                             capture_output=True, text=True, env=dict(os.environ, KUBIK_DIST=str(dist))).stdout
        tarball = Path(next(l for l in out.splitlines() if l.endswith(".tar.gz")))
        if version:
            tarball = _with_version(tarball, version, dist)
        path = subprocess.run([str(ROOT / "scripts" / "appimage.sh"), str(tarball), str(dest)],
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

    def test_name(self):
        self.assertRegex(self.appimage.name, r"^Kubik-\d+\.\d+\.\d+-x86_64\.AppImage$")

    def test_menu_installs_everything_in_portuguese(self):
        d = self.dialogs("gui_first")
        self.assertIn("[--menu] [O Kubik não está instalado.", d[0])
        self.assertIn("[install] [Instalar o Kubik", d[0])
        # Efeito novo: o KWin só o carrega no próximo login, e o resumo avisa.
        self.assertIn("[--msgbox]", d[1])
        self.assertIn("Saia e entre na sessão uma vez", d[1])
        # De volta ao menu, agora instalado (Cancelar sai).
        self.assertRegex(d[2], r"\[--menu\] \[O Kubik \d+\.\d+\.\d+ está instalado\.\]")
        self.assertEqual(len(d), 3, d)
        self.assertIn("=== exit 0", self.phase("gui_first"))
        self.assertIn("=== STATE gui_first script=true tray=yes icon=yes menu=yes manager=yes", self.log)

    def test_installed_appimage_is_the_menu_entry(self):
        self.assertIn('=== desktop exec: "/home/tester/.local/share/kubik/Kubik.AppImage"', self.log)

    def test_menu_offers_settings_reinstall_and_remove_when_installed(self):
        d = self.dialogs("gui_again")
        first = d[0]
        for tag in ("[settings] [Settings]", "[repair] [Reinstall", "[remove] [Remove Kubik]"):
            self.assertIn(tag, first)
        self.assertNotIn("[update]", first)  # o mesmo do AppImage: nada a atualizar
        self.assertIn("[--warningyesno] [Remove Kubik, its tray icon and its shortcuts?]", d[1])
        self.assertIn("[--msgbox] [Kubik was removed.]", d[2])
        self.assertIn("[install] [Install Kubik", d[3])
        self.assertIn("=== STATE gui_again script=false tray=no icon=no menu=no manager=no", self.log)

    def test_terminal_install_and_uninstall(self):
        self.assertIn("=== STATE cli_install script=true tray=yes icon=yes menu=yes manager=yes", self.log)
        self.assertIn("=== STATE cli_uninstall script=false tray=no icon=no menu=no manager=no", self.log)
        self.assertIn("Kubik removido.", self.phase("cli_uninstall"))

    def test_broken_manager_falls_back_to_the_menu_and_says_why(self):
        phase = self.phase("broken_manager")
        self.assertEqual(len(self.dialogs("broken_manager")), 1, phase)
        self.assertIn("[--menu]", self.dialogs("broken_manager")[0])
        runlog = phase.split("=== RUNLOG")[1]
        self.assertRegex(runlog, r"abrindo o gerenciador")
        self.assertRegex(runlog, r"o gerenciador saiu com \d+: menu do kdialog")
        self.assertIn("nenhuma", runlog)  # a mensagem do Qt sobre a plataforma

if __name__ == "__main__":
    unittest.main()
