#!/usr/bin/env python3
"""Mouse e teclado simulados no KWin, via protocolo Wayland org_kde_kwin_fake_input.

Cliente Wayland mínimo, sem dependências: fala o protocolo direto no socket.
Requer KWIN_WAYLAND_NO_PERMISSION_CHECKS=1 no KWin (o protocolo é restrito).

Uso:
  fakeinput.py move X Y              move o cursor (posição absoluta)
  fakeinput.py drag X1 Y1 X2 Y2 [N]  arrasta com o botão esquerdo, em N passos
                                     (FAKEINPUT_BEFORE_RELEASE: comando rodado
                                     com o botão ainda pressionado)
  fakeinput.py click X Y
  fakeinput.py key CODE [CODE...]    pressiona as teclas (códigos evdev) juntas e solta
"""
import os
import socket
import subprocess
import struct
import sys
import time

BTN_LEFT = 0x110

# Opcodes das requisições de org_kde_kwin_fake_input (fake-input.xml).
AUTHENTICATE, POINTER_MOTION, BUTTON = 0, 1, 2
POINTER_MOTION_ABSOLUTE, KEYBOARD_KEY = 9, 10


def _string(s):
    data = s.encode() + b"\0"
    pad = (4 - len(data) % 4) % 4
    return struct.pack("<I", len(data)) + data + b"\0" * pad


def _fixed(v):
    return struct.pack("<i", int(round(v * 256)))


class Wayland:
    def __init__(self):
        path = os.path.join(os.environ["XDG_RUNTIME_DIR"], os.environ.get("WAYLAND_DISPLAY", "wayland-0"))
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(path)
        self.next_id = 2
        self.buf = b""

    def new_id(self):
        i = self.next_id
        self.next_id += 1
        return i

    def send(self, obj, opcode, payload=b""):
        size = 8 + len(payload)
        self.sock.sendall(struct.pack("<II", obj, (size << 16) | opcode) + payload)

    def events(self):
        while True:
            while len(self.buf) >= 8:
                obj, word = struct.unpack_from("<II", self.buf)
                size, opcode = word >> 16, word & 0xFFFF
                if len(self.buf) < size:
                    break
                payload = self.buf[8:size]
                self.buf = self.buf[size:]
                yield obj, opcode, payload
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("conexão Wayland fechada")
            self.buf += chunk

    def roundtrip(self, on_event=lambda *a: None):
        cb = self.new_id()
        self.send(1, 0, struct.pack("<I", cb))  # wl_display.sync
        for obj, opcode, payload in self.events():
            if obj == cb and opcode == 0:
                return
            if obj == 1 and opcode == 0:  # wl_display.error
                oid, code = struct.unpack_from("<II", payload)
                raise RuntimeError(f"erro Wayland no objeto {oid}: código {code}")
            on_event(obj, opcode, payload)


class FakeInput:
    def __init__(self):
        self.wl = Wayland()
        registry = self.wl.new_id()
        self.wl.send(1, 1, struct.pack("<I", registry))  # wl_display.get_registry
        found = {}

        def on_event(obj, opcode, payload):
            if obj == registry and opcode == 0:  # wl_registry.global
                name, length = struct.unpack_from("<II", payload)
                iface = payload[8:8 + length - 1].decode()
                version = struct.unpack_from("<I", payload, 8 + ((length + 3) & ~3))[0]
                found[iface] = (name, version)

        self.wl.roundtrip(on_event)
        if "org_kde_kwin_fake_input" not in found:
            sys.exit("org_kde_kwin_fake_input indisponível (KWIN_WAYLAND_NO_PERMISSION_CHECKS=1?)")
        name, version = found["org_kde_kwin_fake_input"]
        self.id = self.wl.new_id()
        self.wl.send(registry, 0, struct.pack("<I", name) + _string("org_kde_kwin_fake_input")
                     + struct.pack("<II", min(version, 4), self.id))
        self.wl.send(self.id, AUTHENTICATE, _string("kubik-testenv") + _string("testes automatizados"))
        self.wl.roundtrip()

    def move(self, x, y):
        self.wl.send(self.id, POINTER_MOTION_ABSOLUTE, _fixed(x) + _fixed(y))
        self.wl.roundtrip()

    def button(self, pressed, button=BTN_LEFT):
        self.wl.send(self.id, BUTTON, struct.pack("<II", button, 1 if pressed else 0))
        self.wl.roundtrip()

    def key(self, code, pressed):
        self.wl.send(self.id, KEYBOARD_KEY, struct.pack("<II", code, 1 if pressed else 0))
        self.wl.roundtrip()


def main(argv):
    cmd, args = argv[1], [float(a) for a in argv[2:]]
    fi = FakeInput()
    pause = 0.03
    if cmd == "move":
        fi.move(*args)
    elif cmd == "click":
        # Pausas: sem elas o app pode receber o press antes do "entrou" e
        # perder o release (o Plasma entendia um clique longo: modo de edição).
        fi.move(*args)
        time.sleep(0.15)
        fi.button(True)
        time.sleep(0.08)
        fi.button(False)
    elif cmd == "drag":
        x1, y1, x2, y2 = args[:4]
        steps = int(args[4]) if len(args) > 4 else 20
        fi.move(x1, y1)
        time.sleep(pause)
        fi.button(True)
        time.sleep(pause)
        for i in range(1, steps + 1):
            fi.move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps)
            time.sleep(pause)
        if os.environ.get("FAKEINPUT_BEFORE_RELEASE"):
            time.sleep(0.3)
            subprocess.run(os.environ["FAKEINPUT_BEFORE_RELEASE"], shell=True, check=False)
        fi.button(False)
    elif cmd == "key":
        codes = [int(a) for a in args]
        for c in codes:
            fi.key(c, True)
        for c in reversed(codes):
            fi.key(c, False)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
