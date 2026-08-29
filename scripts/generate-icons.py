#!/usr/bin/env python3
"""Rasterise public/icon.svg into the PNG sizes the manifest and iOS need.

Kept in the repo so the icons can be regenerated after a design tweak:
    pip install Pillow && python3 scripts/generate-icons.py
"""
from PIL import Image, ImageDraw

SS = 4  # supersampling factor, downsampled at the end for smooth edges
BG = (47, 133, 90, 255)       # #2f855a
LIGHT = (154, 230, 180, 255)  # #9ae6b4
WHITE = (255, 255, 255, 255)


def capsule(size: int, scale: float) -> Image.Image:
    """The pill, drawn axis-aligned on a transparent layer, then rotated 45deg."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    u = size / 512 * scale
    cx = cy = size / 2
    w, h = 220 * u, 120 * u
    x0, y0 = cx - w / 2, cy - h / 2
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h / 2, fill=WHITE)

    # Light-green right half: clip a rounded rect to the right of centre.
    half = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(half)
    hd.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h / 2, fill=LIGHT)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rectangle([cx, 0, size, size], fill=255)
    layer.paste(half, (0, 0), mask)

    # Seam where the two halves meet.
    d.rectangle([cx - 8 * u, y0, cx + 8 * u, y0 + h], fill=(47, 133, 90, 90))
    return layer.rotate(45, resample=Image.BICUBIC)


def icon(px: int, maskable: bool) -> Image.Image:
    size = px * SS
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        # Full bleed: the launcher may crop up to 20% on every edge.
        d.rectangle([0, 0, size, size], fill=BG)
        pill_scale = 0.78
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 112 / 512, fill=BG)
        pill_scale = 1.0
    img.alpha_composite(capsule(size, pill_scale))
    return img.resize((px, px), Image.LANCZOS)


for path, px, maskable in [
    ("public/icons/icon-192.png", 192, False),
    ("public/icons/icon-512.png", 512, False),
    ("public/icons/icon-512-maskable.png", 512, True),
    ("public/icons/apple-touch-icon.png", 180, False),
    ("public/favicon-32.png", 32, False),
]:
    icon(px, maskable).save(path)
    print("wrote", path)
