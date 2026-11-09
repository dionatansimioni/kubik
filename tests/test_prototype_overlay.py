"""Testes básicos do protótipo de overlay (prototype/overlay).

Não há KWin neste ambiente; validamos o que dá para validar estaticamente:
- metadata.json é um pacote KWin/Script declarativo válido;
- o QML passa no qmllint (sem erros de sintaxe nem avisos inesperados).
Os avisos que dependem do módulo org.kde.kwin (indisponível fora do KWin)
são tolerados: imports, propriedades do ShortcutHandler e o singleton Workspace.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / "prototype" / "overlay"
QMLLINT = shutil.which("qmllint6") or shutil.which("qmllint") or "/usr/lib/qt6/bin/qmllint"


class MetadataTest(unittest.TestCase):
    def setUp(self):
        self.meta = json.loads((PKG / "metadata.json").read_text(encoding="utf-8"))

    def test_is_declarative_kwin_script(self):
        self.assertEqual(self.meta["KPackageStructure"], "KWin/Script")
        self.assertEqual(self.meta["X-Plasma-API"], "declarativescript")

    def test_plugin_id_is_set(self):
        self.assertRegex(self.meta["KPlugin"]["Id"], r"^[a-z0-9]+$")

    def test_license_is_gpl3(self):
        self.assertEqual(self.meta["KPlugin"]["License"], "GPL-3.0-or-later")

    def test_main_script_exists(self):
        main = PKG / "contents" / self.meta["X-Plasma-MainScript"]
        self.assertTrue(main.is_file(), f"{main} não existe")


@unittest.skipUnless(Path(QMLLINT).exists(), "qmllint não encontrado")
class QmlLintTest(unittest.TestCase):
    QML = PKG / "contents" / "ui" / "Overlay.qml"
    WARNING = re.compile(r"^(Warning|Error): .*?:(\d+):(\d+): (.*) \[([\w-]+)\]$")

    def lint(self):
        proc = subprocess.run(
            [QMLLINT, "--import", "disable", "--missing-property", "disable", str(self.QML)],
            capture_output=True, text=True,
        )
        return proc.returncode, (proc.stdout + proc.stderr).splitlines()

    def test_lint_exit_code_is_zero(self):
        code, out = self.lint()
        self.assertEqual(code, 0, "\n".join(out))

    def test_only_kwin_singleton_warnings(self):
        _, out = self.lint()
        source = self.QML.read_text(encoding="utf-8").splitlines()
        unexpected = []
        for line in out:
            m = self.WARNING.match(line)
            if not m:
                continue
            kind, row, col, _, category = m.groups()
            snippet = source[int(row) - 1][int(col) - 1:]
            if kind == "Warning" and category == "unqualified" and snippet.startswith("KWin."):
                continue  # tipos do org.kde.kwin, só existem dentro do KWin
            unexpected.append(line)
        self.assertEqual(unexpected, [], "avisos inesperados:\n" + "\n".join(unexpected))


class LoaderStubTest(unittest.TestCase):
    """Regressão da v0.0.3: o KWin guarda o QML compilado por URL até reiniciar.
    main.qml deve ser só um carregador que usa uma URL única a cada carga."""

    def test_main_qml_is_a_cache_busting_loader(self):
        src = (PKG / "contents" / "ui" / "main.qml").read_text(encoding="utf-8")
        self.assertIn("Loader", src)
        self.assertRegex(src, r'Qt\.resolvedUrl\("\w+\.qml"\)\s*\+\s*"\?load="\s*\+\s*Date\.now\(\)')
        self.assertNotIn("org.kde.kwin", src)


class KWinImportTest(unittest.TestCase):
    """Regressão da v0.0.1: 'import org.kde.kwin' sem namespace faz o tipo
    Window do KWin (não criável) esconder o Window do QtQuick.Window, e o
    script falha com "Type cannot be created in QML"."""

    def test_kwin_module_is_namespaced(self):
        for qml in PKG.rglob("*.qml"):
            src = qml.read_text(encoding="utf-8")
            with self.subTest(qml=qml.name):
                self.assertNotRegex(src, r"(?m)^\s*import\s+org\.kde\.kwin\s*$")
                if "org.kde.kwin" in src:
                    self.assertRegex(src, r"(?m)^\s*import\s+org\.kde\.kwin\s+as\s+KWin\s*$")


if __name__ == "__main__":
    unittest.main()
