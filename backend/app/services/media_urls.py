"""Cloudinary delivery-URL derivation — Phase 4 W3.

Two things the plan asks for in W3: "video support + thumbnail generation" and
a "CDN delivery check across devices". Both are URL transformations rather than
processing jobs, because Cloudinary generates derived assets on first request
from parameters embedded in the delivery URL. Rydr never has to run ffmpeg,
store a second file, or poll a job queue — it stores one canonical URL and
derives the rest.

A delivery URL looks like::

    https://res.cloudinary.com/<cloud>/video/upload/v1234/rydr/clip.mp4
                                      ^^^^^ ^^^^^^                  ^^^^
                                      type  action              extension

Transformations are inserted as a path segment directly after ``upload``.

Safety
------
Only URLs that are recognisably Cloudinary delivery URLs for the configured
cloud are rewritten. Anything else is returned unchanged. The M4 confirm-media
path deliberately accepts any https URL so the flow works without Cloudinary
configured, and mangling an arbitrary third-party URL into a Cloudinary
transformation would produce a broken image where a working one had been.
"""
from __future__ import annotations

import re
from typing import Optional

from app.models.ride_log import MediaType

# https://res.cloudinary.com/<cloud>/<resource_type>/upload/<rest>
_DELIVERY_RE = re.compile(
    r"^(?P<prefix>https://res\.cloudinary\.com/"
    r"(?P<cloud>[^/]+)/"
    r"(?P<resource>image|video)/upload/)"
    r"(?P<rest>.+)$"
)

# Poster frame: first frame, 16:9, cropped to fill, delivered as JPEG.
# so_0 is "start offset zero" — Cloudinary's frame selector.
_VIDEO_POSTER = "so_0,w_640,h_360,c_fill,q_auto,f_jpg"

# Responsive image thumbnail. f_auto lets Cloudinary serve AVIF/WebP to
# clients that accept them and JPEG to those that do not, which is the whole
# of the "CDN delivery across devices" requirement — one URL, right format
# per device, negotiated at the edge.
_IMAGE_THUMB = "w_640,h_360,c_fill,q_auto,f_auto"

# Full-size delivery with automatic format and quality. Applied to the
# original so a 12MP phone photo is not shipped to a phone screen intact.
_OPTIMIZED = "q_auto,f_auto"


def _rewrite(url: str, transformation: str, *, force_ext: Optional[str] = None) -> Optional[str]:
    """Insert ``transformation`` into a Cloudinary delivery URL.

    Returns None when ``url`` is not a Cloudinary delivery URL, so callers can
    distinguish "not applicable" from "here is your derived URL".
    """
    match = _DELIVERY_RE.match(url or "")
    if not match:
        return None

    rest = match.group("rest")
    if force_ext:
        # A video's poster frame is an image, so the extension has to change:
        # .../so_0,.../rydr/clip.mp4 would still serve video bytes.
        rest = re.sub(r"\.[A-Za-z0-9]+$", "", rest) + force_ext

    return f"{match.group('prefix')}{transformation}/{rest}"


def derive_thumbnail(url: str, media_type: MediaType) -> Optional[str]:
    """A poster image for this asset, or None if one cannot be derived.

    For video this is the first frame as a JPEG. For images it is a resized
    variant. None for non-Cloudinary URLs — the caller stores nothing and the
    client falls back to the original.
    """
    if media_type == MediaType.video:
        return _rewrite(url, _VIDEO_POSTER, force_ext=".jpg")
    return _rewrite(url, _IMAGE_THUMB)


def derive_optimized(url: str) -> Optional[str]:
    """Format- and quality-negotiated delivery URL for the full-size asset."""
    return _rewrite(url, _OPTIMIZED)


def is_cloudinary_url(url: str) -> bool:
    return _DELIVERY_RE.match(url or "") is not None
