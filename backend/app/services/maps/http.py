"""Minimal JSON-over-HTTP helper for map providers — Phase 4 W2.

Uses ``urllib`` from the standard library rather than adding an HTTP client to
the backend's runtime dependencies. The requirement is modest — one GET, a
timeout, parse JSON — and the project's standing rule is that dependencies get
surfaced for approval before they land. ``httpx`` enters this project as a
test dependency; promoting it to a runtime one to save a dozen lines here was
not worth the ask.

Every failure mode collapses to ``None``. Callers treat that as "upstream
unavailable" and fall back, so no map problem can surface as a 500.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from app.config import settings

logger = logging.getLogger(__name__)


def get_json(
    url: str, params: Optional[Dict[str, Any]] = None
) -> Optional[Any]:
    """GET ``url`` and parse JSON. Returns None on any failure."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    request = urllib.request.Request(
        url,
        headers={
            # Nominatim refuses requests without an identifying agent, and
            # OSRM's demo server asks for one too.
            "User-Agent": settings.MAP_USER_AGENT,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(
            request, timeout=settings.MAP_HTTP_TIMEOUT_SECONDS
        ) as response:
            if response.status != 200:
                logger.warning("map upstream %s returned %s", url, response.status)
                return None
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        # URLError covers DNS and connection refusal, TimeoutError the
        # deadline, ValueError a malformed JSON body. All mean the same thing
        # to the caller: no upstream answer, use the fallback.
        logger.warning("map upstream %s unavailable: %s", url, exc)
        return None
