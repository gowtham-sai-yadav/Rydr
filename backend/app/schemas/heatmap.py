"""Pydantic schema for GPS heatmaps (personal + global)."""
from __future__ import annotations

from typing import List

from pydantic import BaseModel


class HeatmapResponse(BaseModel):
    # [lat, lng] pairs — matches what Leaflet.heat / a WebView heat layer
    # expects directly, no reshaping needed on the frontend.
    points: List[List[float]] = []
    ride_count: int
