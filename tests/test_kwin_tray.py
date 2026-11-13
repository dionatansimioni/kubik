"""Integração: o ícone da bandeja (plasmoid) num KWin 6 real, com o Kubik.

O applet roda no plasmoidviewer (Plasma do Arch); o cenário clica nos
controles do popup e das páginas de "Configurar…" e confere o que foi gravado
no kwinrc e o que o Kubik fez. Ver tests/scenarios/tray.sh.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_kwin_overlay import OLD_KWIN, ROOT, Ppm, kwin_env_available, needs_pixels
from test_kwin_tiling import parse_windows


# Os cliques do cenário têm coordenadas conferidas no screenshot do popup no
# Plasma 6.8; o popup do 6.3 tem outro layout, e o Debian não tem screenshot
# para recalibrar. Lá vale o que não depende de clique: carregar, ler o kwinrc,
# achar a versão nova (pelo wget) e não ter erro de QML.
needs_popup_clicks = unittest.skipIf(OLD_KWIN, "cliques calibrados no popup do Plasma 6.8 (Debian: outro layout, sem screenshot)")

# O único erro esperado no Plasma 6.3: o ShortcutWatcher.qml (Loader) sem o tipo.
SIGNALWATCHER_63 = "ShortcutWatcher.qml:7:1: DBus.SignalWatcher is not a type"


def plasma_available():
    """As imagens do Arch e do Debian têm o Plasma (plasmoidviewer); a do Fedora tem só o KWin."""
    return os.environ.get("KUBIK_TESTENV", "arch") in ("arch", "debian")


@unittest.skipUnless(kwin_env_available() and plasma_available(), "testenv com Plasma indisponível")
class TrayInPlasmaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-tray-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/tray.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=400,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect kubik/tray",
                     # Já havia configuração (gaps 6), e o plasmoidviewer não entra no tiling.
                     KUBIK_KWINRC="Script-kubik/GapsInner=6 Script-kubik/GapsOuter=6 "
                                  "Script-kubik/Exceptions=org.kde.plasmoidviewer,plasmoidviewer"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")
        cls.w = parse_windows(cls.log)
        cls.rc = {m.group(1): dict(kv.split("=", 1) for kv in m.group(2).split())
                  for m in re.finditer(r"=== RC (\w+) (.*)", cls.log)}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    @needs_pixels
    def test_reads_existing_config_without_rewriting_it(self):
        self.assertIn("[kubik-tray] configuração lida do kwinrc: Tiling ligado · gaps 6 px", self.log)
        # Nada gravado só por abrir: Enabled ainda não existe no kwinrc.
        self.assertEqual(self.rc["start"]["Enabled"], "")
        self.assertEqual(self.rc["start"]["Gaps"], "6/6")
        # O popup aparece, com o interruptor ligado (trilho na cor de destaque, clara).
        r, g, b = Ppm(self.out / "popup.ppm").getpixel((1093, 101))[:3]
        self.assertTrue(b > 200 and b - r > 60, (r, g, b))

    @needs_popup_clicks
    def test_switch_turns_tiling_off(self):
        self.assertEqual(self.rc["switch_off"]["Enabled"], "false")
        self.assertIn("[kubik] tiling desligado", self.log)

    def test_follows_the_keyboard_shortcut(self):
        if OLD_KWIN:
            # Plasma 6.3: sem DBus.SignalWatcher, a bandeja carrega sem acompanhar
            # o Meta+Y (antes, o tipo desconhecido derrubava a bandeja inteira).
            self.assertIn("[kubik-tray] sem DBus.SignalWatcher", self.log)
            self.assertIn("[kubik-tray] configuração lida do kwinrc", self.log)
            return
        self.assertNotIn("sem DBus.SignalWatcher", self.log)
        self.assertIn("[kubik-tray] atalho: tiling ligado", self.log)
        self.assertEqual(self.rc["shortcut_on"]["Enabled"], "true")
        self.assertEqual(self.w["on"]["Alpha"], (6, 6, 631, 788))

    @needs_popup_clicks
    def test_gaps_spinbox(self):
        self.assertEqual(self.rc["gaps"]["Gaps"], "8/8")
        self.assertEqual(self.w["gaps"]["Alpha"], (8, 8, 628, 784))

    @needs_popup_clicks
    def test_border_checkbox(self):
        self.assertEqual(self.rc["border"]["Border"], "false/3")
        self.assertIn("borda desligada", self.log)

    @needs_popup_clicks
    def test_all_desktops_per_screen(self):
        self.assertEqual(self.rc["screen"]["AllOff"], "virtual-0")
        self.assertIn("fora em todos os desktops: virtual-0", self.log)

    @needs_popup_clicks
    def test_exceptions_page_marks_an_open_app(self):
        self.assertEqual(self.rc["exceptions"]["Exc"], "org.kde.plasmoidviewer,plasmoidviewer,org.qt-project.qml")
        self.assertIn("flutuante 'Alpha': exceção do usuário (org.qt-project.qml)", self.log)

    @needs_popup_clicks
    def test_animation_page_writes_script_and_effect(self):
        self.assertEqual(self.rc["anim"], {"AnimDuration": "0", "AnimCurve": "OutCubic", "EffectDuration": "0"})
        self.assertIn("[kubik-animations] configuração: 0ms", self.log)

    def test_no_qml_errors_in_the_applet(self):
        applet = [l for l in self.log.splitlines()
                  if "io.github.dionatansimioni.kubik" in l and re.search(r"Error|error|is not|undefined|usedbeforedeclared", l)
                  and not (OLD_KWIN and SIGNALWATCHER_63 in l)]
        self.assertEqual(applet, [])
        self.assertNotIn("comando falhou", self.log)


@unittest.skipUnless(kwin_env_available() and plasma_available(), "testenv com Plasma indisponível")
class TrayLanguageTest(unittest.TestCase):
    """Textos em inglês por padrão; em português com o sistema em pt_BR."""

    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-tray-i18n-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/tray-i18n.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=300,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/tray"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def tooltip(self, phase):
        part = self.log.split(f"=== MARK viewer {phase} ===")[1]
        return re.search(r"\[kubik-tray\] tooltip: (.*)", part).group(1)

    def test_english_by_default(self):
        self.assertEqual(self.tooltip("default"), "Tiling on · gaps 4 px · border 3 px")

    def test_portuguese_with_pt_br(self):
        self.assertEqual(self.tooltip("pt_BR"), "Tiling ligado · gaps 4 px · borda 3 px")


@unittest.skipUnless(kwin_env_available() and plasma_available(), "testenv com Plasma indisponível")
class TrayUpdateTest(unittest.TestCase):
    """O popup acha a versão nova num "GitHub" local e o botão Atualizar instala."""

    @classmethod
    def setUpClass(cls):
        cls.out = Path(tempfile.mkdtemp(prefix="kubik-tray-update-"))
        subprocess.run(
            [str(ROOT / "testenv" / "run.sh"), "kubik/package", "tests/scenarios/tray-update.sh", str(cls.out)],
            cwd=ROOT, check=True, capture_output=True, timeout=400,
            env=dict(os.environ, KUBIK_EXTRA_PKGS="kubik/effect kubik/tray",
                     KUBIK_KWINRC="Script-kubik/Exceptions=org.kde.plasmoidviewer,plasmoidviewer"),
        )
        cls.log = (cls.out / "kwin.log").read_text(errors="replace")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.out, ignore_errors=True)

    def test_shows_status_and_finds_the_new_version(self):
        # Sem animações (Debian do testenv), o efeito fica instalado mas parado.
        effect = r"\((ativo|parado)\)" if OLD_KWIN else r"\(ativo\)"
        self.assertRegex(self.log, r"\[kubik-tray\] estado: script (\d+\.\d+\.\d+) \(ativo\), efeito \1 " + effect + r", bandeja \1")
        self.assertRegex(self.log, r"\[kubik-tray\] nova versão: 99\.0\.0 \(instalada: \d+\.\d+\.\d+\)")
        if not OLD_KWIN:  # no Debian, o clique em "Atualizar" erra o botão (needs_popup_clicks)
            self.assertNotIn("TIMEOUT", self.log)

    def test_notices_when_the_script_comes_back(self):
        # O estado lido com o script fora do ar (meio de uma instalação) não
        # fica preso: a bandeja reconfere e passa a "ativo" sem reabrir.
        before, _, after = self.log.partition("=== MARK script_back")
        self.assertRegex(before, r"\[kubik-tray\] estado: script \d+\.\d+\.\d+ \(parado\)")
        self.assertRegex(after.split("=== MARK update")[0],
                         r"\[kubik-tray\] estado: script \d+\.\d+\.\d+ \(ativo\)")

    @needs_popup_clicks
    def test_update_button_installs_the_new_release(self):
        self.assertIn("[kubik-tray] atualizado para 99.0.0", self.log)
        self.assertIn("estado: script 99.0.0 (ativo), efeito 99.0.0 (ativo), bandeja 99.0.0", self.log)
        # Pelo .tar.gz (o release falso não tem AppImage) não há gerenciador
        # guardado, então nem entrada no menu; com o AppImage: test_kwin_manager.
        self.assertIn("=== FILES updated icon=yes desktop=no uninstaller=yes script=yes tray=yes", self.log)

    def test_no_qml_errors(self):
        applet = [l for l in self.log.splitlines()
                  if "io.github.dionatansimioni.kubik" in l and re.search(r"Error|error|is not|undefined", l)
                  and not (OLD_KWIN and SIGNALWATCHER_63 in l)]
        self.assertEqual(applet, [])
        self.assertNotIn("comando falhou", self.log)


if __name__ == "__main__":
    unittest.main()
