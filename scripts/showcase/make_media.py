#!/usr/bin/env python3
"""Monta os GIFs (README) e WebPs animados (site) a partir das gravações do
cenário da vitrine, e recorta os screenshots do gerenciador e da bandeja.

Uso (dentro do testenv): make_media.py <saída do cenário>
  <saída>/rec/<cena>/NNNN-<epoch ms>.jpg  quadros (scripts/showcase/record.py)
  <saída>/rec/<cena>/labels.tsv           "<epoch ms>\t<tecla/ação>\t<texto>"
Resultado em <saída>/media/: <cena>.gif, <cena>.webp, hero.png, tabs.png,
manager.png, tray.png.
"""
import glob
import os
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

WIDTH = 880          # largura final dos GIFs
MIN_STEP_MS = 70     # no máximo ~14 quadros por segundo (o GIF fica abaixo de ~6 MB)
MAX_HOLD_MS = 1800   # pausa máxima num quadro parado
LAST_HOLD_MS = 2500


def font(bold, size):
    # DejaVu primeiro: a Noto Sans não tem as setas (←↑↓→) das teclas.
    for pattern in (f"/usr/share/fonts/TTF/DejaVuSans{'-Bold' if bold else ''}.ttf",
                    f"/usr/share/fonts/noto/NotoSans-{'Bold' if bold else 'Regular'}.ttf"):
        for f in glob.glob(pattern):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


KEY_FONT, TEXT_FONT = font(True, 22), font(False, 20)


def labels_of(scene_dir):
    out = []
    path = os.path.join(scene_dir, "labels.tsv")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            t, key, text = (line.rstrip("\n").split("\t") + ["", ""])[:3]
            out.append((int(t), key, text))
    return out


def badge(img, key, text):
    """Legenda no pé do quadro (acima do painel): [tecla] texto."""
    d = ImageDraw.Draw(img, "RGBA")
    pad, gap = 12, 12
    kw = d.textlength(key, font=KEY_FONT)
    tw = d.textlength(text, font=TEXT_FONT) if text else 0
    w = pad + kw + pad + (gap + tw if text else 0) + pad
    h = 44
    x0 = (img.width - w) / 2
    y0 = img.height - h - int(img.height * 0.08)
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=12, fill=(20, 22, 26, 225), outline=(61, 174, 233, 255), width=2)
    d.rounded_rectangle([x0 + 6, y0 + 6, x0 + 6 + kw + 2 * pad - 6, y0 + h - 6], radius=8, fill=(61, 174, 233, 255))
    d.text((x0 + pad + 3, y0 + h / 2), key, font=KEY_FONT, fill=(255, 255, 255), anchor="lm")
    if text:
        d.text((x0 + pad + kw + pad + gap, y0 + h / 2), text, font=TEXT_FONT, fill=(235, 235, 235), anchor="lm")


def still(a, b):
    """Quadros "iguais" (o JPEG nunca repete os bytes): diferença só de ruído."""
    diff = ImageChops.difference(a.resize((320, 200)), b.resize((320, 200))).convert("L")
    return diff.point(lambda v: 255 if v > 24 else 0).getbbox() is None


def frames_of(scene_dir):
    """[(imagem reduzida com legenda, duração ms)], já sem quadros repetidos."""
    files = sorted(glob.glob(os.path.join(scene_dir, "*.jpg")))
    times = [int(re.search(r"-(\d+)\.jpg$", f).group(1)) for f in files]
    labels = labels_of(scene_dir)
    kept = []  # [(arquivo, tempo)]
    for f, t in zip(files, times):
        if kept and t - kept[-1][1] < MIN_STEP_MS:
            continue
        kept.append((f, t))
    out = []
    prev_raw = None
    for i, (f, t) in enumerate(kept):
        nxt = kept[i + 1][1] if i + 1 < len(kept) else t + LAST_HOLD_MS
        raw = Image.open(f).convert("RGB")
        current = [l for l in labels if l[0] <= t]
        key = current[-1][1:] if current else None
        sig = (key,)
        if prev_raw is not None and out and out[-1][2] == sig and still(raw, prev_raw):
            out[-1][1] += nxt - t
            continue
        prev_raw = raw
        small = raw.resize((WIDTH, round(raw.height * WIDTH / raw.width)), Image.LANCZOS)
        if key:
            badge(small, *key)
        out.append([small, nxt - t, sig])
    result = []
    for i, (img, ms, _) in enumerate(out):
        ms = min(ms, LAST_HOLD_MS if i == len(out) - 1 else MAX_HOLD_MS)
        result.append((img, max(ms, 20)))
    return result


def save_animation(frames, base):
    imgs = [f for f, _ in frames]
    durations = [ms for _, ms in frames]
    # Uma paleta só para a cena (tirada de quadros espalhados): o GIF guarda só
    # o que muda de um quadro para o outro, em vez de redesenhar a tela inteira.
    sample = Image.new("RGB", (imgs[0].width, imgs[0].height * 4))
    for k in range(4):
        sample.paste(imgs[round(k * (len(imgs) - 1) / 3)], (0, imgs[0].height * k))
    palette = sample.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    pal = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in imgs]
    pal[0].save(base + ".gif", save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
    imgs[0].save(base + ".webp", save_all=True, append_images=imgs[1:], duration=durations, loop=0, quality=80, method=4)


def crop_window(src, dst, box, margin=36):
    img = Image.open(src)
    x, y, w, h = box
    img.crop((max(0, x - margin), max(0, y - margin), min(img.width, x + w + margin),
              min(img.height, y + h + margin))).save(dst, optimize=True)


def main(out):
    media = os.path.join(out, "media")
    os.makedirs(media, exist_ok=True)
    for scene in sorted(glob.glob(os.path.join(out, "rec", "*"))):
        name = os.path.basename(scene)
        frames = frames_of(scene)
        if not frames:
            print(f"MEDIA {name}: nenhum quadro", file=sys.stderr)
            continue
        save_animation(frames, os.path.join(media, name))
        size = os.path.getsize(os.path.join(media, name + ".gif")) / 1e6
        print(f"MEDIA {name}: {len(frames)} quadros, {sum(ms for _, ms in frames) / 1000:.1f} s, gif {size:.1f} MB")
    # O popup da bandeja, no canto de baixo à direita (acima do painel).
    tray = os.path.join(out, "tray.png")
    if os.path.exists(tray):
        img = Image.open(tray)
        img.crop((img.width - 450, img.height - 490, img.width, img.height)).save(os.path.join(media, "tray.png"), optimize=True)
    for shot in ("hero", "tabs"):
        src = os.path.join(out, shot + ".png")
        if os.path.exists(src):
            Image.open(src).save(os.path.join(media, shot + ".png"), optimize=True)
    log = open(os.path.join(out, "kwin.log"), errors="replace").read()
    m = re.findall(r"MANAGER (\d+) (\d+) (\d+) (\d+)", log)
    if m and os.path.exists(os.path.join(out, "manager.png")):
        crop_window(os.path.join(out, "manager.png"), os.path.join(media, "manager.png"), tuple(map(int, m[-1])))


if __name__ == "__main__":
    main(sys.argv[1])
