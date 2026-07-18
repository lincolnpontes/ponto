"""Generate the compact Letras & Numeros theme as deterministic PNG assets."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
THEME = ROOT / "themes" / "letters-numbers"
SYMBOLS = THEME / "symbols"

TOKENS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") + list("ABCDEFGHIJKLMNOPQRSTU")
PALETTE = [
    (255, 92, 69),
    (46, 109, 246),
    (255, 190, 25),
    (47, 183, 132),
    (141, 108, 244),
    (242, 84, 139),
    (20, 154, 177),
    (239, 119, 35),
    (91, 184, 62),
]
INK = (23, 35, 60)
PAPER = (255, 250, 240)


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/ariblk.ttf"),
        Path("C:/Windows/Fonts/seguisb.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def regular_polygon(cx: float, cy: float, radius: float, sides: int, angle: float = -math.pi / 2):
    return [
        (
            cx + math.cos(angle + index * math.tau / sides) * radius,
            cy + math.sin(angle + index * math.tau / sides) * radius,
        )
        for index in range(sides)
    ]


def star(cx: float, cy: float, outer: float, inner: float, points: int = 8):
    coords = []
    for index in range(points * 2):
        radius = outer if index % 2 == 0 else inner
        angle = -math.pi / 2 + index * math.pi / points
        coords.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return coords


def draw_symbol(index: int, token: str) -> Image.Image:
    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # A segunda ocorrência de A–U usa uma cor deliberadamente distante da primeira.
    base_index = index - 36 if index >= 36 else index
    color_index = (base_index + 4) % len(PALETTE) if index >= 36 else base_index % len(PALETTE)
    color = PALETTE[color_index]
    accent = PALETTE[(color_index + 3 + index % 2) % len(PALETTE)] if index >= 36 else PALETTE[(index * 4 + 3) % len(PALETTE)]
    shape = index % 7
    bbox = (31, 31, 225, 225)

    if shape == 0:
        draw.ellipse(bbox, fill=color, outline=INK, width=11)
    elif shape == 1:
        draw.rounded_rectangle(bbox, radius=45, fill=color, outline=INK, width=11)
    elif shape == 2:
        draw.polygon(regular_polygon(128, 128, 112, 4, math.pi / 4), fill=color, outline=INK)
        draw.line(regular_polygon(128, 128, 112, 4, math.pi / 4) + [regular_polygon(128, 128, 112, 4, math.pi / 4)[0]], fill=INK, width=11, joint="curve")
    elif shape == 3:
        polygon = regular_polygon(128, 128, 108, 6)
        draw.polygon(polygon, fill=color)
        draw.line(polygon + [polygon[0]], fill=INK, width=11, joint="curve")
    elif shape == 4:
        polygon = star(128, 128, 114, 83, 9)
        draw.polygon(polygon, fill=color)
        draw.line(polygon + [polygon[0]], fill=INK, width=9, joint="curve")
    elif shape == 5:
        draw.ellipse(bbox, fill=color, outline=INK, width=11)
        draw.ellipse((60, 60, 196, 196), fill=PAPER, outline=INK, width=8)
    else:
        draw.rounded_rectangle((28, 55, 228, 201), radius=68, fill=color, outline=INK, width=11)

    if shape != 5:
        if index % 3 == 0:
            draw.ellipse((52, 48, 96, 92), fill=accent, outline=INK, width=5)
        elif index % 3 == 1:
            draw.polygon(regular_polygon(190, 68, 25, 5), fill=accent, outline=INK)
        else:
            draw.rounded_rectangle((164, 49, 211, 86), radius=14, fill=accent, outline=INK, width=5)

    label_font = font(116)
    box = draw.textbbox((0, 0), token, font=label_font, stroke_width=3)
    width = box[2] - box[0]
    height = box[3] - box[1]
    x = 128 - width / 2 - box[0]
    y = 130 - height / 2 - box[1]
    fill = PAPER if color[0] + color[1] + color[2] < 480 else INK
    draw.text((x + 4, y + 6), token, font=label_font, fill=(23, 35, 60, 110), stroke_width=4, stroke_fill=(23, 35, 60, 80))
    draw.text((x, y), token, font=label_font, fill=fill, stroke_width=5, stroke_fill=INK)
    return image


def draw_icon(size: int) -> Image.Image:
    scale = size / 512
    image = Image.new("RGB", (size, size), (255, 92, 69))
    draw = ImageDraw.Draw(image)
    draw.ellipse(tuple(int(value * scale) for value in (64, 64, 448, 448)), fill=PAPER, outline=INK, width=max(4, int(25 * scale)))
    draw.ellipse(tuple(int(value * scale) for value in (150, 150, 362, 362)), fill=(255, 216, 61), outline=INK, width=max(3, int(16 * scale)))
    icon_font = font(max(42, int(215 * scale)))
    label = "!"
    box = draw.textbbox((0, 0), label, font=icon_font, stroke_width=max(2, int(5 * scale)))
    x = size / 2 - (box[2] - box[0]) / 2 - box[0]
    y = size / 2 - (box[3] - box[1]) / 2 - box[1] - int(8 * scale)
    draw.text((x, y), label, font=icon_font, fill=INK)
    return image


def main() -> None:
    SYMBOLS.mkdir(parents=True, exist_ok=True)
    metadata = []
    for index, token in enumerate(TOKENS):
        filename = f"{index:02d}.png"
        draw_symbol(index, token).save(SYMBOLS / filename, optimize=True)
        metadata.append({"id": index, "label": token, "file": f"symbols/{filename}"})

    theme_data = {
        "id": "letters-numbers",
        "name": "Maiúsculas & números",
        "version": 2,
        "symbolCount": len(metadata),
        "symbols": metadata,
    }
    (THEME / "theme.json").write_text(json.dumps(theme_data, ensure_ascii=False, indent=2), encoding="utf-8")
    draw_icon(192).save(ROOT / "icon-192.png", optimize=True)
    draw_icon(512).save(ROOT / "icon-512.png", optimize=True)


if __name__ == "__main__":
    main()
