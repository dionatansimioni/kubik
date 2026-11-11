"""Testes do empacotamento (scripts/build.py) e dos scripts de instalação."""
import json
import re
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
        for name in ("install.sh", "uninstall.sh", "diagnose.sh", "shortcuts.sh", f"packages/{ID}/metadata.json",
                     f"packages/{ID}/contents/" + META["X-Plasma-MainScript"]):
            self.assertIn(f"{top}/{name}", members)
        for script in ("install.sh", "diagnose.sh"):
            self.assertTrue(members[f"{top}/{script}"].mode & 0o111, f"{script} não é executável")


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

    def test_release_bundles_the_animation_effect(self):
        version = json.loads((ROOT / "kubik" / "package" / "metadata.json").read_text())["KPlugin"]["Version"]
        effect = json.loads((ROOT / "kubik" / "effect" / "metadata.json").read_text())
        self.assertEqual(effect["KPlugin"]["Version"], version, "efeito e script devem ter a mesma versão")
        tray = json.loads((ROOT / "kubik" / "tray" / "metadata.json").read_text())
        self.assertEqual(tray["KPlugin"]["Version"], version, "bandeja e script devem ter a mesma versão")
        tray_id = tray["KPlugin"]["Id"]
        with tempfile.TemporaryDirectory() as out:
            proc = subprocess.run(["python3", str(ROOT / "scripts" / "build.py"), "kubik/package"],
                                  env=dict(os.environ, KUBIK_DIST=out), check=True, capture_output=True, text=True)
            files = [Path(p) for p in proc.stdout.split()]
            self.assertEqual([f.name for f in files],
                             [f"kubik-{version}.kwinscript", f"kubik-{version}.tar.gz", f"kubikanimations-{version}.kwineffect",
                              f"{tray_id}-{version}.plasmoid"])
            with zipfile.ZipFile(files[2]) as z:
                self.assertIn("contents/code/main.js", z.namelist())
                self.assertIn("[kubik-animations] carregado", z.read("contents/code/main.js").decode())
            with tarfile.open(files[1]) as t:
                names = t.getnames()
            top = f"kubik-{version}"
            self.assertIn(f"{top}/packages/kubik/contents/ui/Kubik.qml", names)
            self.assertIn(f"{top}/packages/kubikanimations/contents/code/main.js", names)
            # O ícone da bandeja, com a lógica gerada do TypeScript.
            self.assertIn(f"{top}/packages/{tray_id}/contents/ui/main.qml", names)
            self.assertIn(f"{top}/packages/{tray_id}/contents/code/logic.js", names)
            with zipfile.ZipFile(files[3]) as z:
                self.assertIn("var KubikTray = ", z.read("contents/code/logic.js").decode())
            # A bandeja aparece sozinha na área de notificação ao instalar.
            self.assertTrue(tray["KPlugin"]["EnabledByDefault"])
            self.assertTrue(tray["X-Plasma-NotificationAreaCategory"])


class ShellScriptsTest(unittest.TestCase):
    SCRIPTS = [ROOT / "scripts" / n for n in ("install.sh", "uninstall.sh", "release.sh", "diagnose.sh", "shortcuts.sh")]

    def test_bash_syntax(self):
        for s in self.SCRIPTS:
            with self.subTest(script=s.name):
                subprocess.run(["bash", "-n", str(s)], check=True)

    @unittest.skipUnless(shutil.which("shellcheck"), "shellcheck não instalado")
    def test_shellcheck(self):
        subprocess.run(["shellcheck", *map(str, self.SCRIPTS)], check=True)

    def test_install_extracts_metadata_fields(self):
        # Mesmo sed do install.sh: precisa achar Id, Version e KPackageStructure.
        def field(name, pkg=PKG):
            return subprocess.run(
                ["sed", "-n", rf's/.*"{name}": *"\([^"]*\)".*/\1/p', str(pkg / "metadata.json")],
                capture_output=True, text=True, check=True,
            ).stdout.split()[0]
        self.assertEqual(field("Id"), ID)
        self.assertEqual(field("Version"), VERSION)
        self.assertEqual(field("KPackageStructure"), "KWin/Script")
        self.assertEqual(field("KPackageStructure", ROOT / "kubik" / "effect"), "KWin/Effect")

    def test_scripts_do_not_require_qdbus(self):
        # qdbus6 não existe em várias distros (ex.: Plasma 6.8 do usuário); use dbus-send.
        for name in ("install.sh", "uninstall.sh", "diagnose.sh"):
            with self.subTest(script=name):
                src = (ROOT / "scripts" / name).read_text(encoding="utf-8")
                self.assertNotIn("qdbus", src)
                self.assertIn("dbus-send", src)


class ShortcutTableTest(unittest.TestCase):
    """A tabela de teclas do install.sh (scripts/shortcuts.sh) bate com kubik/src/kwin/keys.ts."""

    QT = {"Meta": 0x10000000, "Shift": 0x02000000, "Alt": 0x08000000, "Ctrl": 0x04000000,
          "Left": 0x01000012, "Up": 0x01000013, "Right": 0x01000014, "Down": 0x01000015}

    def qt_key(self, seq):
        return sum(self.QT[p] if p in self.QT else ord(p) for p in seq.split("+"))

    def test_install_table_matches_keys_ts(self):
        sh = (ROOT / "scripts" / "shortcuts.sh").read_text()
        table = dict(re.findall(r'"(Kubik: [^"=]+)=(\d+)"', sh))
        out = subprocess.run(
            [str(ROOT / "scripts" / "node.sh"), "kubik", "npx", "--yes", "esbuild", "src/kwin/keys.ts",
             "--bundle", "--format=cjs", "--log-level=error"],
            capture_output=True, text=True, check=True).stdout
        js = out + "\nconsole.log(JSON.stringify(module.exports.keyBindings('en').map(b => [b.name, b.sequence])));"
        res = subprocess.run([str(ROOT / "scripts" / "node.sh"), "kubik", "node", "-e", js],
                             capture_output=True, text=True, check=True).stdout
        bindings = json.loads(res.strip().splitlines()[-1])
        self.assertEqual({n: str(self.qt_key(seq)) for n, seq in bindings}, table)


class TrayTranslationTest(unittest.TestCase):
    """Todo texto do ícone da bandeja (i18n no QML, rótulos de curva) tem tradução em pt_BR."""

    def msgids(self):
        tray = ROOT / "kubik" / "tray"
        ids = set()
        for f in (tray / "contents").rglob("*.qml"):
            ids |= set(re.findall(r'i18n\("((?:[^"\\]|\\.)*)"', f.read_text()))
        logic = (ROOT / "kubik" / "src" / "tray" / "logic.ts").read_text()
        ids |= set(re.findall(r'label: "([^"]+)"', logic))
        return ids

    def test_every_string_is_translated(self):
        po = (ROOT / "kubik" / "tray" / "po" / "pt_BR.po").read_text()
        entries = dict(re.findall(r'^msgid "(.*)"\nmsgstr "(.*)"$', po, re.M))
        missing = sorted(i for i in self.msgids() if not entries.get(i))
        self.assertEqual(missing, [])

    def test_sources_are_english(self):
        accents = sorted(i for i in self.msgids() if re.search(r"[ãõçáéíóúâêô]", i))
        self.assertEqual(accents, [])


if __name__ == "__main__":
    unittest.main()
