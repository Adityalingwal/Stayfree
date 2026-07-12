#!/usr/bin/env python3
"""Generate the StayFree tray icon PNGs (1x + 2x).

Design: cream rounded-square tile (#E7E4DC) with ink-black waveform bars
(#0B0B0B) — palette taken from Aditya's portfolio terminal theme.
Rendered at 8x supersampling for smooth edges, then downsampled.

Usage: python3 scripts/generate-tray-icon.py
Writes: src/assets/trayIcon.png (22x22), src/assets/trayIcon@2x.png (44x44)
"""

from pathlib import Path

from PIL import Image, ImageDraw

CREAM = (231, 228, 220, 255)  # #E7E4DC
INK = (11, 11, 11, 255)  # #0B0B0B

ASSETS = Path(__file__).resolve().parent.parent / "src" / "assets"


def render(size: int) -> Image.Image:
    """Render the icon at `size` x `size` (22 for 1x, 44 for 2x)."""
    ss = 8  # supersampling factor
    c = size * ss
    img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Cream tile: 1px margin (at 1x) on all sides, radius ~5px at 1x.
    margin = 1 * ss * (size // 22)
    radius = 5 * ss * (size // 22)
    draw.rounded_rectangle(
        [margin, margin, c - 1 - margin, c - 1 - margin],
        radius=radius,
        fill=CREAM,
    )

    # Waveform: 5 vertical bars, center tallest, rounded caps.
    # Geometry in 1x units, scaled up.
    unit = ss * (size // 22)
    bar_w = 2 * unit
    gap = 1.5 * unit
    heights = [5, 9, 13, 9, 5]  # 1x px
    total_w = 5 * bar_w + 4 * gap
    x = (c - total_w) / 2
    cy = c / 2
    for h in heights:
        bh = h * unit
        draw.rounded_rectangle(
            [x, cy - bh / 2, x + bar_w, cy + bh / 2],
            radius=bar_w / 2,
            fill=INK,
        )
        x += bar_w + gap

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    render(22).save(ASSETS / "trayIcon.png")
    render(44).save(ASSETS / "trayIcon@2x.png")
    print(f"Wrote trayIcon.png + trayIcon@2x.png to {ASSETS}")


if __name__ == "__main__":
    main()
