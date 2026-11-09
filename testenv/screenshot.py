#!/usr/bin/env python3
"""Captura a tela inteira do KWin (D-Bus ScreenShot2) e salva em PNG (+ PPM).
Requer KWIN_SCREENSHOT_NO_PERMISSION_CHECKS=1 no ambiente do KWin.
Uso: screenshot.py saida.png"""
import os
import sys
import threading

import dbus
from PIL import Image

out = sys.argv[1]
r, w = os.pipe()
chunks = []
reader = threading.Thread(target=lambda: chunks.extend(iter(lambda: os.read(r, 1 << 20), b"")))
reader.start()

bus = dbus.SessionBus()
shot = dbus.Interface(bus.get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2"), "org.kde.KWin.ScreenShot2")
meta = shot.CaptureWorkspace({"native-resolution": True}, dbus.types.UnixFd(w))
os.close(w)
reader.join()
os.close(r)

width, height, stride = int(meta["width"]), int(meta["height"]), int(meta["stride"])
data = b"".join(chunks)
# Valores de QImage::Format -> ordem dos bytes na memória (little-endian).
RAW_MODES = {4: "BGRX", 5: "BGRA", 6: "BGRA", 16: "RGBX", 17: "RGBA", 18: "RGBA"}
fmt = int(meta["format"])
if fmt not in RAW_MODES:
    sys.exit(f"formato de imagem não suportado: {fmt}")
img = Image.frombuffer("RGBA", (width, height), data, "raw", RAW_MODES[fmt], stride, 1).convert("RGB")
img.save(out)
# Cópia em PPM (P6): formato trivial, lido pelos testes sem depender do Pillow.
img.save(os.path.splitext(out)[0] + ".ppm")
print(f"{out} {width}x{height} format={fmt}")
