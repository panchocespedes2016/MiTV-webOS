#!/usr/bin/env python3
"""Genera icon.png (80x80), largeIcon.png (130x130) y splash.png (1920x1080) para MiTV webOS.
Fondo oscuro #0D0D0F, texto MiTV en blanco con "TV" en rojo #C1111B y triángulo de play rojo.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.expanduser("~/workspace/mitv-webos/app")
BG = (13, 13, 15)          # #0D0D0F
WHITE = (238, 238, 238)    # #EEEEEE
RED = (193, 17, 27)        # #C1111B
RED2 = (210, 31, 43)       # #D21F2B

def find_font():
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

FONT = find_font()

def draw_play(draw, cx, cy, size, color):
    """Triángulo de play centrado en (cx, cy), de lado 'size'."""
    h = size
    w = int(size * 0.86)
    pts = [(cx - w // 2, cy - h // 2), (cx - w // 2, cy + h // 2), (cx + w // 2, cy)]
    draw.polygon(pts, fill=color)

def make_icon(path, size, play_size, font_size):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    # triángulo de play arriba
    draw_play(d, size // 2, int(size * 0.30), play_size, RED2)
    # texto "MiTV" debajo
    if FONT:
        f = ImageFont.truetype(FONT, font_size)
        text = "MiTV"
        # mide el texto
        bbox = d.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        x = (size - tw) // 2
        y = int(size * 0.58)
        # "Mi" en blanco, "TV" en rojo
        f2 = ImageFont.truetype(FONT, font_size)
        mi = "Mi"
        bbox_mi = d.textbbox((0, 0), mi, font=f2)
        w_mi = bbox_mi[2] - bbox_mi[0]
        d.text((x, y), mi, font=f2, fill=WHITE)
        d.text((x + w_mi, y), "TV", font=f2, fill=RED)
    img.save(path, "PNG")
    print("OK", path, img.size)

def make_splash(path):
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # triángulo de play grande, centrado arriba del texto
    draw_play(d, W // 2, 380, 220, RED2)
    if FONT:
        f = ImageFont.truetype(FONT, 200)
        text = "MiTV"
        bbox = d.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        y = 520
        mi = "Mi"
        bbox_mi = d.textbbox((0, 0), mi, font=f)
        w_mi = bbox_mi[2] - bbox_mi[0]
        d.text((x, y), mi, font=f, fill=WHITE)
        d.text((x + w_mi, y), "TV", font=f, fill=RED)
        # subtítulo
        f2 = ImageFont.truetype(FONT, 56)
        sub = "TV en vivo  ·  Películas  ·  Series"
        bbox2 = d.textbbox((0, 0), sub, font=f2)
        tw2 = bbox2[2] - bbox2[0]
        d.text(((W - tw2) // 2, 780), sub, font=f2, fill=(170, 170, 170))
    img.save(path, "PNG")
    print("OK", path, img.size)

if __name__ == "__main__":
    print("Fuente:", FONT)
    make_icon(os.path.join(OUT, "icon.png"), 80, 26, 22)
    make_icon(os.path.join(OUT, "largeIcon.png"), 130, 42, 36)
    make_splash(os.path.join(OUT, "splash.png"))
