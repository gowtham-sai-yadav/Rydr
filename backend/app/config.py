"""Application settings.

M9 hardening: migrate from the inner ``class Config: env_file = ".env"``
pattern to ``model_config = SettingsConfigDict(...)`` (pydantic-settings 2.x
canonical form — the old pattern emits a ``DeprecationWarning`` on every
startup). Add ``APP_ENV`` + ``ALLOWED_ORIGINS`` so prod deploys aren't
shipping with the default-localhost CORS or the placeholder JWT secret.
"""
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Sentinel for "the placeholder secret in .env.example". Production deploys
# MUST replace this; the validator below refuses to boot otherwise.
PLACEHOLDER_SECRET_KEY = (
    "replace-in-production-generate-with-openssl-rand-hex-32"
)


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://rydr:rydr_secret@localhost:5432/rydr"
    SECRET_KEY: str = PLACEHOLDER_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # M9 — environment flag. Dev/test allow the placeholder secret;
    # staging/prod refuse to boot with it. Read via env var APP_ENV.
    APP_ENV: Literal["dev", "test", "staging", "prod"] = "dev"

    # M9 — comma-separated list of allowed CORS origins. M2 audit #14
    # carry-forward. Default keeps local dev working.
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # M2 cost-calculator default — single env-tunable constant
    FUEL_PRICE_INR_PER_L: float = 105.0

    # M4 Cloudinary integration — empty defaults serve as a feature flag.
    # When any of these is empty, the signed-upload endpoint returns 503 and
    # the rest of the post-ride capture flow keeps working (URL confirm path).
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    # Free-tier size ceilings, surfaced to the client in the sign response.
    CLOUDINARY_MAX_IMAGE_BYTES: int = 10 * 1024 * 1024  # 10 MB
    CLOUDINARY_MAX_VIDEO_BYTES: int = 100 * 1024 * 1024  # 100 MB

    # ---------------------------------------------------------------
    # Phase 4 W2 — maps & routing.
    #
    # OpenStreetMap is the shipped default: no account, no key, no usage
    # ceiling. The Phase 4 plan named Mapbox primary with OSM "kept in
    # reserve"; the reconciliation inverted that (see
    # docs/plan/phase4-web-and-android.md §4.1) and routed everything
    # through a provider interface so switching is config, not a rewrite.
    #
    # Setting MAPBOX_TOKEN is the switch: non-empty selects the Mapbox
    # provider, empty keeps OSM. Same feature-flag-by-empty-string pattern
    # the Cloudinary settings above already use.
    # ---------------------------------------------------------------
    # Phase 4 W8 — log verbosity for the JSON access log.
    LOG_LEVEL: str = "INFO"

    MAPBOX_TOKEN: str = ""

    # Public demo endpoints. Both ask for courteous use and rate-limit
    # accordingly, which is why routes are cached in-process and every call
    # has a hard timeout with a graceful fallback. Point these at a
    # self-hosted OSRM / Nominatim for staging.
    OSRM_BASE_URL: str = "https://router.project-osrm.org"
    NOMINATIM_BASE_URL: str = "https://nominatim.openstreetmap.org"

    # Nominatim's usage policy requires a real identifying User-Agent.
    # Requests without one are refused.
    MAP_USER_AGENT: str = "Rydr/1.0 (academic project; contact via repo)"

    # Seconds before an upstream map call is abandoned. Deliberately short:
    # a slow router must degrade to the straight-line estimate rather than
    # holding a request open.
    MAP_HTTP_TIMEOUT_SECONDS: float = 6.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("SECRET_KEY")
    @classmethod
    def _no_placeholder_in_non_dev(cls, v: str, info) -> str:
        """Refuse to boot in staging/prod with the placeholder secret.

        Reads ``APP_ENV`` from the *raw* env values via ``info.data`` —
        which is populated by the time field validation runs. Belt-and-
        braces if APP_ENV isn't set yet, fall back to env var directly.
        """
        import os

        env = info.data.get("APP_ENV") or os.environ.get("APP_ENV", "dev")
        if v == PLACEHOLDER_SECRET_KEY and env not in {"dev", "test"}:
            raise ValueError(
                f"SECRET_KEY is the placeholder value but APP_ENV={env!r}. "
                "Generate a real secret with `openssl rand -hex 32` and set "
                "it in the environment before starting in this mode."
            )
        return v

    @property
    def maps_provider(self) -> str:
        """Which map provider is active. See MAPBOX_TOKEN above."""
        return "mapbox" if self.MAPBOX_TOKEN.strip() else "osm"

    @property
    def allowed_origins_list(self) -> list[str]:
        """Convenience accessor — comma-split + strip whitespace."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
