"""scripts/sys.sh: o mesmo resultado com qualquer cliente de D-Bus ou de download.

Os programas (dbus-send, gdbus, qdbus6, curl, wget) são falsos, num PATH só
deles: imprimem a saída que o programa de verdade imprime (conferida no KWin
real em test_kwin_sys.py) e anotam os argumentos recebidos. O sys.sh roda no
dash, para garantir que é POSIX.
"""
import os
import shutil
import subprocess
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYS = ROOT / "scripts" / "sys.sh"
SHELL = shutil.which("dash") or "/bin/sh"

# Saídas reais (KWin 6, Arch): Meta+Y = 268435545, Meta+H = 268435528.
STUBS = {
    "dbus-send": r'''
        case "$*" in
            *isScriptLoaded*string:kubik*) printf 'method return time=1 sender=:1.3 -> destination=:1.9 serial=7 reply_serial=2\n   boolean true\n' ;;
            *isScriptLoaded*) printf 'method return time=1 sender=:1.3 -> destination=:1.9 serial=7 reply_serial=2\n   boolean false\n' ;;
            *KGlobalAccel.shortcut*Toggle*) printf 'method return time=1\n   array [\n      int32 268435545\n      int32 268435528\n   ]\n' ;;
            *KGlobalAccel.shortcut*) printf 'method return time=1\n   array [\n      int32 0\n   ]\n' ;;
            *loadScript*) printf 'method return time=1\n   int32 7\n' ;;
            *) printf 'method return time=1\n' ;;
        esac''',
    "gdbus": r'''
        case "$*" in
            *isScriptLoaded*" kubik"*) echo '(true,)' ;;
            *isScriptLoaded*) echo '(false,)' ;;
            *KGlobalAccel.shortcut*Toggle*) echo '([268435545, 268435528],)' ;;
            *KGlobalAccel.shortcut*) echo '(@ai [],)' ;;
            *loadScript*) echo '(7,)' ;;
            *) echo '()' ;;
        esac''',
    "qdbus6": r'''
        case "$*" in
            *isScriptLoaded*" kubik") echo true ;;
            *isScriptLoaded*) echo false ;;
            *loadScript*) echo 7 ;;
        esac''',
    "curl": "echo curl-ok",
    "wget": "echo wget-ok",
}


class SysTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="kubik-sys-"))
        self.bin = self.dir / "bin"
        self.bin.mkdir()
        self.log = self.dir / "calls.log"
        # Só o que o sys.sh usa do sistema (sem os clientes de verdade).
        for tool in ("sed", "grep", "tr"):
            (self.bin / tool).symlink_to(shutil.which(tool))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def stub(self, *names):
        for n in names:
            f = self.bin / n
            f.write_text(f'#!/bin/sh\necho "{n} $*" >> "{self.log}"\n' + textwrap.dedent(STUBS[n]) + "\n")
            f.chmod(0o755)

    def sys(self, *args, env=None):
        e = {"PATH": str(self.bin), "KUBIK_OS_RELEASE": str(self.dir / "none")}
        e.update(env or {})
        return subprocess.run([SHELL, str(SYS), *args], env=e, capture_output=True, text=True)

    def calls(self):
        return self.log.read_text().splitlines() if self.log.exists() else []

    def os_release(self, text):
        p = self.dir / "os-release"
        p.write_text(text)
        return {"KUBIK_OS_RELEASE": str(p)}

    # ---- escolha do backend ---------------------------------------------------

    def test_tools_prefers_dbus_send_then_gdbus_then_qdbus(self):
        self.stub("dbus-send", "gdbus", "qdbus6", "wget")
        out = self.sys("tools").stdout
        self.assertIn("dbus=dbus-send", out)
        self.assertIn("shortcuts=dbus-send", out)
        self.assertIn("fetch=wget", out)
        out = self.sys("tools", env={"KUBIK_SYS_DISABLE": "dbus-send"}).stdout
        self.assertIn("dbus=gdbus", out)
        self.assertIn("dbus-send=no", out)
        out = self.sys("tools", env={"KUBIK_SYS_DISABLE": "dbus-send gdbus"}).stdout
        self.assertIn("dbus=qdbus6", out)
        self.assertIn("shortcuts=none", out)

    # ---- dbus-bool --------------------------------------------------------------

    def test_dbus_bool_same_answer_from_every_backend(self):
        self.stub("dbus-send", "gdbus", "qdbus6")
        args = ("dbus-bool", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.isScriptLoaded")
        for disabled in ("", "dbus-send", "dbus-send gdbus"):
            with self.subTest(disabled=disabled):
                env = {"KUBIK_SYS_DISABLE": disabled}
                self.assertEqual(self.sys(*args, "kubik", env=env).stdout, "true\n")
                self.assertEqual(self.sys(*args, "outro", env=env).stdout, "false\n")
        self.assertIn("dbus-send --session --print-reply --dest=org.kde.KWin /Scripting "
                      "org.kde.kwin.Scripting.isScriptLoaded string:kubik", self.calls())
        self.assertIn("gdbus call --session --dest org.kde.KWin --object-path /Scripting "
                      "--method org.kde.kwin.Scripting.isScriptLoaded kubik", self.calls())
        self.assertIn("qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded kubik", self.calls())

    # ---- dbus-call --------------------------------------------------------------

    def test_dbus_call_keeps_spaces_in_arguments(self):
        self.stub("dbus-send", "gdbus")
        args = ("dbus-call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.unloadScript", "um nome", "dois")
        self.assertEqual(self.sys(*args).returncode, 0)
        self.assertEqual(self.sys(*args, env={"KUBIK_SYS_DISABLE": "dbus-send"}).returncode, 0)
        self.assertEqual(self.calls(), [
            "dbus-send --session --print-reply --dest=org.kde.KWin /Scripting "
            "org.kde.kwin.Scripting.unloadScript string:um nome string:dois",
            "gdbus call --session --dest org.kde.KWin --object-path /Scripting "
            "--method org.kde.kwin.Scripting.unloadScript um nome dois",
        ])

    # ---- dbus-int e require ------------------------------------------------------

    def test_dbus_int_same_answer_from_every_backend(self):
        self.stub("dbus-send", "gdbus", "qdbus6")
        for disabled in ("", "dbus-send", "dbus-send gdbus"):
            with self.subTest(disabled=disabled):
                r = self.sys("dbus-int", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadScript",
                             "/tmp/a b.js", "nome", env={"KUBIK_SYS_DISABLE": disabled})
                self.assertEqual(r.stdout, "7\n")
        self.assertIn("dbus-send --session --print-reply --dest=org.kde.KWin /Scripting "
                      "org.kde.kwin.Scripting.loadScript string:/tmp/a b.js string:nome", self.calls())

    def test_require(self):
        self.stub("qdbus6", "wget")
        env = self.os_release("ID=fedora\n")
        self.assertEqual(self.sys("require", "dbus", env=env).returncode, 0)
        self.assertEqual(self.sys("require", "fetch", env=env).returncode, 0)
        r = self.sys("require", "shortcuts", env=env)
        self.assertEqual(r.returncode, 127)
        self.assertIn("falta dbus-send ou gdbus para os atalhos (o qdbus não serve)", r.stderr)
        self.assertIn("instale: sudo dnf install dbus-tools", r.stderr)
        r = self.sys("require", "dbus", env={**env, "KUBIK_SYS_DISABLE": "qdbus6"})
        self.assertEqual(r.returncode, 127)
        self.assertEqual(self.sys("require", "outra").returncode, 2)

    # ---- atalhos ----------------------------------------------------------------

    def test_shortcut_get_same_answer_from_dbus_send_and_gdbus(self):
        self.stub("dbus-send", "gdbus")
        for disabled in ("", "dbus-send"):
            with self.subTest(disabled=disabled):
                env = {"KUBIK_SYS_DISABLE": disabled}
                self.assertEqual(self.sys("shortcut-get", "Kubik: Toggle tiling", env=env).stdout, "268435545,268435528\n")
                # Sem tecla: o KWin 6.3 lista [0], o 6.8 lista [] (gdbus: @ai []).
                self.assertEqual(self.sys("shortcut-get", "Kubik: Move Up", env=env).stdout, "\n")

    def test_shortcut_set_arguments(self):
        self.stub("dbus-send", "gdbus")
        self.assertEqual(self.sys("shortcut-set", "Kubik: Toggle tiling", "268435528").returncode, 0)
        self.assertEqual(self.sys("shortcut-set", "Kubik: Toggle tiling", "0",
                                  env={"KUBIK_SYS_DISABLE": "dbus-send"}).returncode, 0)
        self.assertEqual(self.calls(), [
            "dbus-send --session --print-reply --dest=org.kde.kglobalaccel /kglobalaccel "
            "org.kde.KGlobalAccel.setForeignShortcut array:string:kwin,Kubik: Toggle tiling,KWin,Kubik: Toggle tiling "
            "array:int32:268435528",
            "gdbus call --session --dest org.kde.kglobalaccel --object-path /kglobalaccel "
            "--method org.kde.KGlobalAccel.setForeignShortcut ['kwin', 'Kubik: Toggle tiling', 'KWin', "
            "'Kubik: Toggle tiling'] [0]",
        ])

    def test_shortcuts_need_dbus_send_or_gdbus(self):
        # O qdbus não manda listas como argumento.
        self.stub("qdbus6")
        r = self.sys("shortcut-get", "Kubik: Toggle tiling")
        self.assertEqual(r.returncode, 127)
        self.assertIn("falta dbus-send ou gdbus para os atalhos (o qdbus não serve)", r.stderr)
        self.assertNotIn("falta um cliente de D-Bus", r.stderr)

    def test_bad_names_and_keys_never_reach_the_shell(self):
        self.stub("dbus-send")
        for name in ("x', 'y", 'a"b', "a,b", "a]b", ""):
            with self.subTest(name=name):
                self.assertEqual(self.sys("shortcut-get", name).returncode, 2)
        self.assertEqual(self.sys("shortcut-set", "Kubik: X", "12;rm").returncode, 2)
        self.assertEqual(self.sys("shortcut-set", "Kubik: X", "").returncode, 2)
        self.assertEqual(self.calls(), [])

    # ---- download ---------------------------------------------------------------

    def test_fetch_uses_curl_then_wget(self):
        self.stub("curl", "wget")
        self.assertEqual(self.sys("fetch", "https://x/y", "-", "Accept: a/b").stdout, "curl-ok\n")
        self.assertEqual(self.sys("fetch", "https://x/y", "/tmp/f", env={"KUBIK_SYS_DISABLE": "curl"}).stdout, "wget-ok\n")
        self.assertEqual(self.calls(), [
            "curl -fsSL --max-time 600 -H Accept: a/b -o - https://x/y",
            "wget -q -T 600 -O /tmp/f https://x/y",
        ])

    # ---- faltando tudo ----------------------------------------------------------

    def test_missing_dbus_client_says_what_to_install(self):
        cases = {
            'ID=fedora\n': "sudo dnf install dbus-tools",
            'ID=debian\n': "sudo apt install dbus-bin",
            'ID=kubuntu\nID_LIKE="ubuntu debian"\n': "sudo apt install dbus-bin",
            'ID=arch\n': "sudo pacman -S dbus",
            'ID=endeavouros\nID_LIKE=arch\n': "sudo pacman -S dbus",
            'ID=opensuse-tumbleweed\nID_LIKE="opensuse suse"\n': "sudo zypper install dbus-1-tools",
            'ID=gentoo\n': "dbus-send",
        }
        for release, hint in cases.items():
            with self.subTest(release=release):
                r = self.sys("dbus-bool", "a", "/b", "c.d", "e", env=self.os_release(release))
                self.assertEqual(r.returncode, 127)
                self.assertIn("kubik-sys: falta um cliente de D-Bus", r.stderr)
                self.assertIn("instale: " + hint, r.stderr)

    def test_tools_gives_the_hint_for_what_is_missing(self):
        self.stub("qdbus6")  # chamadas simples sim, atalhos não; sem download
        out = self.sys("tools", env=self.os_release("ID=fedora\n")).stdout
        self.assertIn("dbus=qdbus6", out)
        self.assertIn("shortcuts=none", out)
        self.assertIn("dbus_hint=sudo dnf install dbus-tools", out)
        self.assertIn("fetch=none", out)
        self.assertIn("fetch_hint=sudo dnf install curl", out)
        self.stub("dbus-send", "curl")
        out = self.sys("tools").stdout
        self.assertNotIn("_hint=", out)

    def test_missing_downloader_says_what_to_install(self):
        r = self.sys("fetch", "https://x", "-", env=self.os_release("ID=debian\n"))
        self.assertEqual(r.returncode, 127)
        self.assertIn("instale: sudo apt install wget", r.stderr)

    def test_usage_errors(self):
        self.assertEqual(self.sys().returncode, 2)
        self.assertEqual(self.sys("dbus-bool", "só um").returncode, 2)


    # ---- reiniciar o painel ou a sessão (Lição 50) --------------------------------

    def plasma(self, pid):
        """Um pgrep falso que acha o plasmashell com esse PID (None: não roda)."""
        f = self.bin / "pgrep"
        f.write_text(f'#!/bin/sh\necho "pgrep $*" >> "{self.log}"\n' + (f"echo {pid}\n" if pid else "exit 1\n"))
        f.chmod(0o755)
        for tool in ("id", "cat", "rm", "mkdir"):
            if not (self.bin / tool).exists():
                (self.bin / tool).symlink_to(shutil.which(tool))
        return {"XDG_RUNTIME_DIR": str(self.dir / "run")}

    def test_session_mark_lasts_while_the_same_plasmashell_runs(self):
        env = self.plasma(4242)
        (self.dir / "run").mkdir()
        self.assertEqual(self.sys("session-pending", env=env).stdout, "plasmaRestart=false\n")
        self.assertEqual(self.sys("session-mark", env=env).returncode, 0)
        self.assertEqual((self.dir / "run" / "kubik-plasma-restart").read_text(), "4242\n")
        self.assertEqual(self.sys("session-pending", env=env).stdout, "plasmaRestart=true\n")
        # Painel reiniciado (outro PID): o pedido some, e o arquivo também.
        env = self.plasma(5555)
        self.assertEqual(self.sys("session-pending", env=env).stdout, "plasmaRestart=false\n")
        self.assertFalse((self.dir / "run" / "kubik-plasma-restart").exists())
        self.assertTrue(any(c.startswith("pgrep -u ") and c.endswith(" -x plasmashell") for c in self.calls()))

    def test_without_pgrep_reads_proc(self):
        env = self.plasma(None)
        (self.bin / "pgrep").unlink()
        proc = self.dir / "proc"
        for pid, comm in ((17, "kwin_wayland"), (4242, "plasmashell"), (99, "plasmashell-x")):
            (proc / str(pid)).mkdir(parents=True)
            (proc / str(pid) / "comm").write_text(comm + "\n")
        env["KUBIK_PROC"] = str(proc)
        self.assertEqual(self.sys("session-mark", env=env).returncode, 0)
        self.assertEqual((self.dir / "run" / "kubik-plasma-restart").read_text(), "4242\n")
        self.assertEqual(self.sys("session-pending", env=env).stdout, "plasmaRestart=true\n")

    def test_session_mark_without_plasmashell_does_nothing(self):
        env = self.plasma(None)
        self.assertEqual(self.sys("session-mark", env=env).returncode, 0)
        self.assertFalse((self.dir / "run" / "kubik-plasma-restart").exists())
        self.assertEqual(self.sys("session-pending", env=env).stdout, "plasmaRestart=false\n")

    def test_plasma_restart_uses_the_systemd_service(self):
        env = self.plasma(4242)
        f = self.bin / "systemctl"
        f.write_text(f'#!/bin/sh\necho "systemctl $*" >> "{self.log}"\n')
        f.chmod(0o755)
        self.assertEqual(self.sys("plasma-restart", env=env).returncode, 0)
        self.assertEqual([c for c in self.calls() if c.startswith("systemctl")], [
            "systemctl --user -q is-active plasma-plasmashell.service",
            "systemctl --user --no-block restart plasma-plasmashell.service",
        ])

    def test_plasma_restart_without_systemd_stops_and_starts_it_detached(self):
        env = self.plasma(4242)
        f = self.bin / "setsid"
        f.write_text(f'#!/bin/sh\nshift 2; echo "setsid $*" >> "{self.log}"\n')
        f.chmod(0o755)
        self.assertEqual(self.sys("plasma-restart", env=env).returncode, 0)
        for _ in range(50):
            if any(c.startswith("setsid") for c in self.calls()):
                break
            time.sleep(0.05)
        detached = [c for c in self.calls() if c.startswith("setsid")]
        self.assertEqual(len(detached), 1)
        self.assertIn("kill 4242", detached[0])
        self.assertTrue(detached[0].endswith("exec plasmashell"), detached[0])

    def test_logout_opens_the_kde_logout_prompt(self):
        self.stub("dbus-send", "gdbus")
        self.assertEqual(self.sys("logout").returncode, 0)
        self.assertEqual(self.sys("logout", env={"KUBIK_SYS_DISABLE": "dbus-send"}).returncode, 0)
        self.assertEqual(self.calls(), [
            "dbus-send --session --print-reply --dest=org.kde.LogoutPrompt /LogoutPrompt "
            "org.kde.LogoutPrompt.promptLogout",
            "gdbus call --session --dest org.kde.LogoutPrompt --object-path /LogoutPrompt "
            "--method org.kde.LogoutPrompt.promptLogout",
        ])

if __name__ == "__main__":
    unittest.main()
