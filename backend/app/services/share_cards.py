"""Shareable ride and achievement cards — Phase 4 W4.

Renders the Strava-style card described in the plan §1.4: a route snapshot
with a distance/duration overlay, downloadable and postable to Instagram,
WhatsApp or the Rydr feed.

Why SVG composed on the server
------------------------------
Three options were on the table: rasterise server-side with Pillow, compose
SVG server-side and let the client rasterise, or draw the whole thing in a
browser canvas. SVG-from-the-server was chosen because it needs no imaging
dependency on the backend, no font files shipped with the container, and no
duplicated layout code between the web card and the Android card — both fetch
the same SVG. The client turns it into a PNG when the user asks to download,
which browsers do natively.

The cost is that the card cannot embed a raster map tile without a fetch, so
the "route snapshot" is drawn: a plotted line between origin and destination
over a grid, rather than a photograph of the terrain. That is a real
limitation and it is why the map area is styled as a schematic rather than
pretending to be a satellite image.

Escaping
--------
Every interpolated value goes through :func:`_esc`. A destination name is
user-submitted content and this output is served as ``image/svg+xml``, which
browsers execute — an unescaped ``</text><script>`` in a destination name
would be stored XSS with a very wide blast radius, since cards are meant to
be shared. The escape covers the five XML metacharacters and the renderer
never interpolates anything outside a text node or a plain attribute value.
"""
from __future__ import annotations

import math
from typing import Optional, Sequence, Tuple

# Card geometry. 1200x630 is the Open Graph / Twitter summary_large_image
# ratio, so a shared link previews correctly without a second rendition.
WIDTH = 1200
HEIGHT = 630

# Palette lifted from the existing frontend dark/orange theme so a card looks
# like it came from the app rather than from a generator.
INK = "#f5f5f4"
MUTED = "#a8a29e"
CANVAS = "#0c0a09"
SURFACE = "#1c1917"
ACCENT = "#f97316"
LINE = "#292524"


def _esc(value: object) -> str:
    """XML-escape a value for safe interpolation into the SVG.

    Order matters: ``&`` must be replaced first, or the ampersands introduced
    by the later replacements get double-escaped into ``&amp;lt;``.
    """
    text = "" if value is None else str(value)
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


# Mean glyph advance as a fraction of font size, for the sans-serif stack
# below. Measured against the rendered card rather than guessed: bold display
# text is wider per glyph than body text, so the two differ.
_ADVANCE_BOLD = 0.60
_ADVANCE_REGULAR = 0.52


def _fit(text: str, *, font_size: int, max_width: int, bold: bool = False) -> str:
    """Clip ``text`` to what actually fits in ``max_width`` pixels.

    SVG has no text wrapping and no overflow handling, so anything too long
    simply runs off the card — a real destination name like "Chikmagalur
    Coffee Estates" overran the left panel and printed on top of the map.

    Budgeting by character count does not work, because the limit depends on
    the font size: 24 characters fits comfortably at 24px and overflows badly
    at 60px. This converts the pixel budget into a character budget using the
    font's mean advance, which is approximate but errs toward clipping early
    and is checked against the rendered output.
    """
    text = text or ""
    advance = (_ADVANCE_BOLD if bold else _ADVANCE_REGULAR) * font_size
    limit = max(4, int(max_width / advance))
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def format_distance(km: float) -> str:
    return f"{km:.0f} km" if km >= 10 else f"{km:.1f} km"


# Beyond this, a duration is a data-entry artefact rather than a long ride.
# ``RideLog.actual_start_ts`` defaults to the moment the log row is created,
# so a rider who logs a ride days after taking it and then sets a real end
# timestamp produces a "duration" of several hundred hours. A card reading
# "564h 23m" is worse than a card with no duration at all.
MAX_PLAUSIBLE_RIDE_MINUTES = 48 * 60


def format_duration(minutes: Optional[int]) -> str:
    """Render minutes as the card's duration string, or an em dash if absent.

    Returns the dash for a missing, negative, or implausibly large value —
    see MAX_PLAUSIBLE_RIDE_MINUTES.
    """
    if minutes is None or minutes < 0 or minutes > MAX_PLAUSIBLE_RIDE_MINUTES:
        return "—"
    hours, mins = divmod(int(minutes), 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


def _route_polyline(
    origin: Optional[Tuple[float, float]],
    destination: Tuple[float, float],
    box: Tuple[int, int, int, int],
) -> str:
    """A schematic route line inside ``box`` = (x, y, w, h).

    Not a real path — Rydr stores no GPS track. The line is the great-circle
    bearing between the two points rendered as a gentle curve, which conveys
    direction and relative distance honestly without implying turn-by-turn
    detail the data does not contain.

    With no origin (rider has no home location) it degenerates to a single
    marker at the centre, since a line from nowhere would be a fabrication.
    """
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2

    if origin is None:
        return (
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="9" fill="{ACCENT}"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="18" fill="none" '
            f'stroke="{ACCENT}" stroke-opacity="0.35" stroke-width="2"/>'
        )

    # Bearing decides which way the curve leans, so two different rides do not
    # produce an identical picture.
    dlon = math.radians(destination[1] - origin[1])
    lat1, lat2 = math.radians(origin[0]), math.radians(destination[0])
    bearing = math.atan2(
        math.sin(dlon) * math.cos(lat2),
        math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon),
    )
    lean = math.sin(bearing)

    x0, y0 = x + w * 0.14, y + h * 0.74
    x1, y1 = x + w * 0.86, y + h * 0.26
    ctrl_x = cx + (w * 0.22 * lean)
    ctrl_y = cy - (h * 0.30)

    return (
        f'<path d="M {x0:.1f} {y0:.1f} Q {ctrl_x:.1f} {ctrl_y:.1f} {x1:.1f} {y1:.1f}" '
        f'fill="none" stroke="{ACCENT}" stroke-width="4" stroke-linecap="round"/>'
        f'<circle cx="{x0:.1f}" cy="{y0:.1f}" r="8" fill="{INK}"/>'
        f'<circle cx="{x1:.1f}" cy="{y1:.1f}" r="10" fill="{ACCENT}"/>'
    )


def _grid(box: Tuple[int, int, int, int]) -> str:
    x, y, w, h = box
    parts = []
    step = 48
    for gx in range(x + step, x + w, step):
        parts.append(
            f'<line x1="{gx}" y1="{y}" x2="{gx}" y2="{y + h}" stroke="{LINE}" stroke-width="1"/>'
        )
    for gy in range(y + step, y + h, step):
        parts.append(
            f'<line x1="{x}" y1="{gy}" x2="{x + w}" y2="{gy}" stroke="{LINE}" stroke-width="1"/>'
        )
    return "".join(parts)


def _stat_block(x: int, y: int, label: str, value: str) -> str:
    return (
        f'<text x="{x}" y="{y}" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="19" fill="{MUTED}" letter-spacing="1.6">{_esc(label.upper())}</text>'
        f'<text x="{x}" y="{y + 46}" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="42" font-weight="700" fill="{INK}">{_esc(value)}</text>'
    )


def _frame(body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
        f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img">'
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{CANVAS}"/>'
        f"{body}"
        f"</svg>"
    )


def render_ride_card(
    *,
    rider_name: str,
    destination_name: str,
    destination_region: Optional[str],
    ride_date,
    distance_km: float,
    duration_minutes: Optional[int],
    rider_count: int,
    stars: Optional[int],
    origin: Optional[Tuple[float, float]],
    destination_coords: Tuple[float, float],
) -> str:
    """Compose the ride card SVG."""
    map_box = (660, 60, 480, 510)

    # Text lives between x=72 and the map panel at x=660, less a 60px gutter.
    TEXT_LEFT = 72
    TEXT_WIDTH = 528

    title = _fit(destination_name, font_size=60, max_width=TEXT_WIDTH, bold=True)
    subtitle = _fit(destination_region or "", font_size=24, max_width=TEXT_WIDTH)

    # Filled and hollow stars rather than a numeral: the card is read at a
    # glance in a chat thread. Rendered as the value of its own stat block in
    # the second row, beside Riders — an earlier version floated it under the
    # Riders figure, where its ascenders collided with that number's
    # descenders.
    stars_block = ""
    if stars:
        glyphs = "\u2605" * stars + "\u2606" * (5 - stars)
        stars_block = (
            f'<text x="320" y="410" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
            f'font-size="19" fill="{MUTED}" letter-spacing="1.6">RATED</text>'
            f'<text x="320" y="452" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
            f'font-size="34" fill="{ACCENT}">{glyphs}</text>'
        )

    body = (
        # Left panel
        f'<rect x="0" y="0" width="640" height="{HEIGHT}" fill="{CANVAS}"/>'
        # Map panel
        f'<rect x="{map_box[0]}" y="{map_box[1]}" width="{map_box[2]}" '
        f'height="{map_box[3]}" rx="24" fill="{SURFACE}"/>'
        f"{_grid(map_box)}"
        f"{_route_polyline(origin, destination_coords, map_box)}"
        # Wordmark
        f'<text x="72" y="96" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="24" font-weight="800" fill="{ACCENT}" letter-spacing="4">RYDR</text>'
        # Destination
        f'<text x="72" y="188" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="60" font-weight="800" fill="{INK}">{_esc(title)}</text>'
        f'<text x="72" y="230" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="24" fill="{MUTED}">{_esc(subtitle)}</text>'
        # Stats — two rows of two, 110px apart so the 42px values in row one
        # clear the 19px labels in row two.
        f"{_stat_block(72, 300, 'Distance', format_distance(distance_km))}"
        f"{_stat_block(320, 300, 'Duration', format_duration(duration_minutes))}"
        f"{_stat_block(72, 410, 'Riders', str(rider_count))}"
        f"{stars_block}"
        # Footer
        f'<line x1="72" y1="522" x2="568" y2="522" stroke="{LINE}" stroke-width="2"/>'
        f'<text x="72" y="566" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="22" fill="{MUTED}">'
        f'{_esc(_fit(rider_name, font_size=22, max_width=340))} '
        f'· {_esc(ride_date)}</text>'
    )
    return _frame(body)


def render_badge_card(
    *,
    rider_name: str,
    badge_name: str,
    badge_description: str,
    earned_at,
) -> str:
    """Compose the achievement card SVG."""
    body = (
        f'<circle cx="905" cy="315" r="188" fill="{SURFACE}"/>'
        f'<circle cx="905" cy="315" r="188" fill="none" stroke="{ACCENT}" '
        f'stroke-width="3" stroke-opacity="0.55"/>'
        f'<text x="905" y="360" text-anchor="middle" font-size="150">\U0001f3c5</text>'
        f'<text x="72" y="96" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="24" font-weight="800" fill="{ACCENT}" letter-spacing="4">RYDR</text>'
        f'<text x="72" y="196" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="21" fill="{MUTED}" letter-spacing="2.4">BADGE UNLOCKED</text>'
        f'<text x="72" y="278" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="58" font-weight="800" fill="{INK}">'
        f'{_esc(_fit(badge_name, font_size=58, max_width=560, bold=True))}</text>'
        f'<text x="72" y="336" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="25" fill="{MUTED}">'
        f'{_esc(_fit(badge_description, font_size=25, max_width=560))}</text>'
        f'<line x1="72" y1="522" x2="568" y2="522" stroke="{LINE}" stroke-width="2"/>'
        f'<text x="72" y="566" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" '
        f'font-size="22" fill="{MUTED}">'
        f'{_esc(_fit(rider_name, font_size=22, max_width=340))} '
        f'· {_esc(earned_at)}</text>'
    )
    return _frame(body)
