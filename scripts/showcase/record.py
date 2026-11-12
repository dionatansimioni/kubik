#!/usr/bin/env python3
"""Grava a tela do KWin (D-Bus ScreenShot2) quadro a quadro até existir o
arquivo de parada: record.py <diretório> <arquivo-de-parada>
Cada quadro vira <diretório>/<n>-<epoch em ms>.jpg (JPEG de alta qualidade,
no máximo 20 por segundo: em PPM, 1600×1000 a 33 por segundo encheu o disco) (o tempo real, para o GIF
ter o ritmo de verdade e casar com as legendas do cenário, também em epoch). Roda dentro do testenv."""
import os
import sys
import threading
import time

import dbus
from PIL import Image

RAW_MODES = {4: "BGRX", 5: "BGRA", 6: "BGRA", 16: "RGBX", 17: "RGBA", 18: "RGBA"}


def capture(shot):
    r, w = os.pipe()
    chunks = []
    reader = threading.Thread(target=lambda: chunks.extend(iter(lambda: os.read(r, 1 << 20), b"")))
    reader.start()
    meta = shot.CaptureWorkspace({"native-resolution": True}, dbus.types.UnixFd(w))
    os.close(w)
    reader.join()
    os.close(r)
    size = (int(meta["width"]), int(meta["height"]))
    return Image.frombuffer("RGBA", size, b"".join(chunks), "raw", RAW_MODES[int(meta["format"])],
                            int(meta["stride"]), 1).convert("RGB")


def main(out, stop):
    os.makedirs(out, exist_ok=True)
    shot = dbus.Interface(dbus.SessionBus().get_object("org.kde.KWin", "/org/kde/KWin/ScreenShot2"),
                          "org.kde.KWin.ScreenShot2")
    n = 0
    while not os.path.exists(stop):
        start = time.time()
        capture(shot).save(f"{out}/{n:04d}-{int(start * 1000)}.jpg", quality=93)
        n += 1
        time.sleep(max(0.0, 0.05 - (time.time() - start)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
