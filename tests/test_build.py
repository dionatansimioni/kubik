"""Testes do empacotamento (scripts/build.py) e dos scripts de instalação."""
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "prototype" / "overlay"
META = json.loads((PKG / "metadata.json").read_text(encoding="utf-8"))
ID, VERSION = META["KPlugin"]["Id"], META["KPlugin"]["Version"]


class BuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        env = dict(os.environ, KUBIK_DIST=cls.tmp.name)
        proc = subprocess.run(
            ["python3", str(ROOT / "scripts" / "build.py"), "prototype/overlay"],
            capture_output=True, text=True, env=env, check=True,
        )
        cls.outputs = [Path(p) for p in proc.stdout.split()]
        cls.kwinscript = Path(cls.tmp.name) / f"{ID}-{VERSION}.kwinscript"
        cls.tarball = Path(cls.tmp.name) / f"{ID}-{VERSION}.tar.gz"

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_prints_both_artifacts(self):
        self.assertEqual(self.outputs, [self.kwinscript, self.tarball])

    def test_kwinscript_layout(self):
        with zipfile.ZipFile(self.kwinscript) as z:
            names = set(z.namelist())
            self.assertIn("metadata.json", names)  # na raiz, como o kpackagetool6 espera
            self.assertIn("contents/" + META["X-Plasma-MainScript"], names)
            self.assertEqual(json.loads(z.read("metadata.json"))["KPlugin"]["Version"], VERSION)

    def test_kwinscript_is_reproducible(self):
        with tempfile.TemporaryDirectory() as other:
            env = dict(os.environ, KUBIK_DIST=other)
            subprocess.run(["python3", str(ROOT / "scripts" / "build.py"), "prototype/overlay"], env=env,
                           check=True, capture_output=True)
            again = Path(other) / self.kwinscript.name
            self.assertEqual(again.read_bytes(), self.kwinscript.read_bytes())

    def test_tarball_layout(self):
        top = f"{ID}-{VERSION}"
        with tarfile.open(self.tarball) as t:
            members = {m.name: m for m in t.getmembers()}
        for name in ("install.sh", "uninstall.sh", "package/metadata.json",
                     "package/contents/" + META["X-Plasma-MainScript"]):
            self.assertIn(f"{top}/{name}", members)
        self.assertTrue(members[f"{top}/install.sh"].mode & 0o111, "install.sh não é executável")


@unittest.skipUnless(shutil.which("docker"), "docker indisponível (build do TypeScript)")
class KubikBuildTest(unittest.TestCase):
    """O pacote principal: o build.py compila o TypeScript e embute no QML."""

    def test_kwinscript_has_loader_and_embedded_core(self):
        meta = json.loads((ROOT / "kubik" / "package" / "metadata.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as out:
            env = dict(os.environ, KUBIK_DIST=out)
            proc = subprocess.run(["python3", str(ROOT / "scripts" / "build.py"), "kubik/package"],
                                  env=env, check=True, capture_output=True, text=True)
            kwinscript = Path(proc.stdout.split()[0])
            self.assertEqual(kwinscript.name, f"kubik-{meta['KPlugin']['Version']}.kwinscript")
            with zipfile.ZipFile(kwinscript) as z:
                main = z.read("contents/ui/main.qml").decode()
                kubik = z.read("contents/ui/Kubik.qml").decode()
                names = z.namelist()
        self.assertIn('Qt.resolvedUrl("Kubik.qml") + "?load=" + Date.now()', main)
        self.assertIn("var Kubik = ", kubik)
        self.assertNotIn("@@KUBIK_BUNDLE@@", kubik)
        self.assertFalse([n for n in names if n.endswith(".js")], "nenhum .js solto: o KWin o guardaria em cache")


class ShellScriptsTest(unittest.TestCase):
    SCRIPTS = [ROOT / "scripts" / n for n in ("install.sh", "uninstall.sh", "release.sh")]

    def test_bash_syntax(self):
        for s in self.SCRIPTS:
            with self.subTest(script=s.name):
                subprocess.run(["bash", "-n", str(s)], check=True)

    @unittest.skipUnless(shutil.which("shellcheck"), "shellcheck não instalado")
    def test_shellcheck(self):
        subprocess.run(["shellcheck", *map(str, self.SCRIPTS)], check=True)

    def test_install_extracts_id_from_metadata(self):
        # Mesmo sed do install.sh: precisa achar o Id real do pacote.
        out = subprocess.run(
            ["sed", "-n", r's/.*"Id": *"\([^"]*\)".*/\1/p', str(PKG / "metadata.json")],
            capture_output=True, text=True, check=True,
        ).stdout.split()
        self.assertEqual(out[0], ID)

    def test_scripts_do_not_require_qdbus(self):
        # qdbus6 não existe em várias distros (ex.: Plasma 6.8 do usuário); use dbus-send.
        for name in ("install.sh", "uninstall.sh"):
            with self.subTest(script=name):
                src = (ROOT / "scripts" / name).read_text(encoding="utf-8")
                self.assertNotIn("qdbus", src)
                self.assertIn("dbus-send", src)


if __name__ == "__main__":
    unittest.main()
