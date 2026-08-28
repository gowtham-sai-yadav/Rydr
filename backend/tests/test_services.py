"""Pure-function service behaviour — share cards, media URLs, stats helpers.

These need no database or HTTP client, so they run as plain unit tests.
"""
from __future__ import annotations

import datetime as dt
import xml.etree.ElementTree as ET

import pytest

from app.models.ride_log import MediaType
from app.services import media_urls, share_cards, stats

SVG_NS = "{http://www.w3.org/2000/svg}"


# ---------------------------------------------------------------------------
# Share cards
# ---------------------------------------------------------------------------
def _card(**overrides):
    kwargs = dict(
        rider_name="Test Rider",
        destination_name="Nandi Hills",
        destination_region="Karnataka",
        ride_date="2026-09-20",
        distance_km=90.7,
        duration_minutes=185,
        rider_count=4,
        stars=5,
        origin=(12.97, 77.59),
        destination_coords=(13.37, 77.68),
    )
    kwargs.update(overrides)
    return share_cards.render_ride_card(**kwargs)


def test_card_is_well_formed_svg():
    ET.fromstring(_card())


@pytest.mark.parametrize(
    "hostile",
    [
        'Nandi <script>alert("x")</script>',
        "Tea & Coffee Estate",
        "It's a \"place\"",
    ],
)
def test_user_content_is_escaped_in_the_card(hostile):
    """Cards are served as image/svg+xml, which browsers execute, and
    destination names are user-submitted."""
    svg = _card(destination_name=hostile)
    ET.fromstring(svg)  # would raise on broken markup
    assert "<script>" not in svg


def test_long_names_are_clipped_inside_the_left_panel():
    """SVG has no text wrapping; anything too long prints over the map."""
    svg = _card(destination_name="Chikmagalur Coffee Estates and Waterfalls")
    root = ET.fromstring(svg)

    MAP_LEFT = 660
    for el in root.iter(f"{SVG_NS}text"):
        if el.get("text-anchor") == "middle":
            continue
        size = float(el.get("font-size", 16))
        bold = el.get("font-weight") in ("700", "800")
        advance = (
            share_cards._ADVANCE_BOLD if bold else share_cards._ADVANCE_REGULAR
        ) * size
        right = float(el.get("x", 0)) + len("".join(el.itertext())) * advance
        if float(el.get("x", 0)) < MAP_LEFT:
            assert right <= MAP_LEFT, f"{el.text!r} overflows into the map panel"


@pytest.mark.parametrize(
    "minutes,expected",
    [
        (None, "—"),
        (-5, "—"),
        (45, "45m"),
        (120, "2h"),
        (150, "2h 30m"),
        # Beyond the plausibility ceiling: actual_start_ts defaults to log
        # creation, so logging a ride days later yields hundreds of hours.
        (share_cards.MAX_PLAUSIBLE_RIDE_MINUTES + 1, "—"),
    ],
)
def test_duration_formatting(minutes, expected):
    assert share_cards.format_duration(minutes) == expected


def test_distance_formatting_switches_precision():
    assert share_cards.format_distance(4.25) == "4.2 km"
    assert share_cards.format_distance(90.7) == "91 km"


def test_card_without_an_origin_draws_a_marker_not_a_line():
    """A rider with no home location has no start point; drawing a line from
    nowhere would be a fabrication."""
    svg = _card(origin=None)
    root = ET.fromstring(svg)
    assert not [p for p in root.iter(f"{SVG_NS}path")]
    assert [c for c in root.iter(f"{SVG_NS}circle")]


def test_badge_card_is_well_formed():
    svg = share_cards.render_badge_card(
        rider_name="Test Rider",
        badge_name="Century Rider",
        badge_description="Twenty rides logged",
        earned_at="2026-08-28",
    )
    ET.fromstring(svg)


# ---------------------------------------------------------------------------
# Media URL derivation
# ---------------------------------------------------------------------------
VIDEO = "https://res.cloudinary.com/demo/video/upload/v1/rydr/clip.mp4"
IMAGE = "https://res.cloudinary.com/demo/image/upload/v1/rydr/shot.jpg"


def test_video_poster_swaps_the_extension():
    """Leaving .mp4 would serve video bytes from a URL used as an img src."""
    poster = media_urls.derive_thumbnail(VIDEO, MediaType.video)
    assert "so_0" in poster
    assert poster.endswith(".jpg")
    assert ".mp4" not in poster


def test_image_thumbnail_requests_automatic_format():
    thumb = media_urls.derive_thumbnail(IMAGE, MediaType.image)
    assert "f_auto" in thumb


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not a url",
        "https://cdn.example.com/photo.jpg",
        "https://res.cloudinary.com/demo/raw/upload/x.bin",
    ],
)
def test_non_cloudinary_urls_are_left_alone(url):
    assert media_urls.derive_thumbnail(url, MediaType.image) is None
    assert media_urls.derive_optimized(url) is None


# ---------------------------------------------------------------------------
# Stats helpers
# ---------------------------------------------------------------------------
def test_estimated_ride_km_is_a_round_trip():
    one_way = stats.haversine_km(12.9716, 77.5946, 13.3702, 77.6835)
    both = stats.estimated_ride_km(12.9716, 77.5946, 13.3702, 77.6835)
    assert both == pytest.approx(one_way * 2, rel=0.01)


def test_rider_without_a_home_location_contributes_zero_distance():
    assert stats.estimated_ride_km(None, None, 13.37, 77.68) == 0.0


def test_earth_radius_matches_the_geo_module():
    """Two constants would make the leaderboard and the destination list
    disagree about the same journey on adjacent screens."""
    from app.services import geo

    assert stats.EARTH_RADIUS_KM == geo.EARTH_RADIUS_KM


def _monday(y, m, d):
    return dt.date(y, m, d)


def test_streaks_count_consecutive_weeks():
    today = dt.datetime.now(dt.timezone.utc).date()
    weeks = [today - dt.timedelta(days=7 * i) for i in range(3)]
    current, longest = stats._streaks(weeks)
    assert current == 3
    assert longest == 3


def test_a_streak_survives_into_the_following_week():
    """Requiring a ride *this* week would show every rider a zero streak on
    Monday morning."""
    today = dt.datetime.now(dt.timezone.utc).date()
    last_week = today - dt.timedelta(days=7)
    current, _ = stats._streaks([last_week])
    assert current == 1


def test_an_old_streak_is_not_current():
    today = dt.datetime.now(dt.timezone.utc).date()
    long_ago = today - dt.timedelta(days=60)
    current, longest = stats._streaks([long_ago, long_ago + dt.timedelta(days=7)])
    assert current == 0
    assert longest == 2


def test_no_rides_means_no_streak():
    assert stats._streaks([]) == (0, 0)
