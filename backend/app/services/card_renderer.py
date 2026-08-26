"""Shareable PNG card rendering — Phase 4.

Generates a simple gradient card with a title + subtitle lines, used for
both the ride-log recap card (``GET /api/ride-logs/{id}/card``) and the
earned-badge card (``GET /api/badges/{badge_id}/card``). Deliberately
low-tech: Pillow's bundled bitmap font via ``ImageFont.load_default()`` so
there's no font file to ship or license. A custom TTF (for real
typography) can be dropped into this module later and swapped into
``_load_font`` without touching either call site.
"""
from __future__ import annotations

import io
from typing import List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

CARD_WIDTH = 1200
CARD_HEIGHT = 630  # standard social-share aspect ratio (~1.91:1)

_GRADIENT_TOP = (30, 41, 59)  # slate-800
_GRADIENT_BOTTOM = (15, 23, 42)  # slate-900
_TITLE_COLOR = (255, 255, 255)
_SUBTITLE_COLOR = (203, 213, 225)  # slate-300
_ACCENT_COLOR = (56, 189, 248)  # sky-400


def _load_font(size: int) -> ImageFont.ImageFont:
    # Pillow's default bitmap font ignores `size` on old Pillow versions but
    # newer ones (>=10) accept it for the built-in font. Falls back cleanly
    # either way — no external font file required.
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _vertical_gradient(
    width: int, height: int, top: Tuple[int, int, int], bottom: Tuple[int, int, int]
) -> Image.Image:
    base = Image.new("RGB", (width, height), top)
    draw = ImageDraw.Draw(base)
    for y in range(height):
        t = y / max(height - 1, 1)
        color = tuple(int(top[c] + (bottom[c] - top[c]) * t) for c in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return base


def render_card(
    *,
    title: str,
    subtitle: Optional[str] = None,
    lines: Optional[List[str]] = None,
    accent_label: Optional[str] = None,
) -> bytes:
    """Render a shareable card and return PNG bytes.

    - ``title``: the big headline (destination name / badge name).
    - ``subtitle``: one line under the title (e.g. rider name / badge
      description).
    - ``lines``: additional detail lines (distance, duration, date...).
    - ``accent_label``: small tag in the top-left (e.g. "RYDR" / "BADGE
      EARNED").
    """
    img = _vertical_gradient(CARD_WIDTH, CARD_HEIGHT, _GRADIENT_TOP, _GRADIENT_BOTTOM)
    draw = ImageDraw.Draw(img)

    margin = 64

    if accent_label:
        draw.text(
            (margin, margin),
            accent_label.upper(),
            font=_load_font(28),
            fill=_ACCENT_COLOR,
        )

    title_y = margin + 90
    draw.text((margin, title_y), title, font=_load_font(64), fill=_TITLE_COLOR)

    next_y = title_y + 90
    if subtitle:
        draw.text((margin, next_y), subtitle, font=_load_font(34), fill=_SUBTITLE_COLOR)
        next_y += 56

    for line in lines or []:
        draw.text((margin, next_y), line, font=_load_font(30), fill=_SUBTITLE_COLOR)
        next_y += 44

    # Thin accent rule along the bottom.
    draw.rectangle(
        [(0, CARD_HEIGHT - 10), (CARD_WIDTH, CARD_HEIGHT)], fill=_ACCENT_COLOR
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
