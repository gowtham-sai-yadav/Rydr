"""Cloudinary integration — signing only.

Browser uploads direct to Cloudinary (saves backend bandwidth and avoids
proxying multi-MB blobs through our process). This module produces the signed
upload params; the actual upload + Cloudinary callback live in the frontend.

Feature flag: when any of the three Cloudinary env vars is empty, the service
reports ``is_configured() == False`` and the signing endpoint returns 503.
Every other M4 endpoint keeps working — the URL-confirm path accepts a media
URL produced any way the client likes (useful for dev / smoke tests).

This is the only module that imports the ``cloudinary`` package so the dep
stays isolated — swapping providers later is one file.
"""
from __future__ import annotations

import time
from typing import Optional, TypedDict

import cloudinary
import cloudinary.utils

from app.config import settings


UPLOAD_URL_TEMPLATE = "https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload"


class SignaturePayload(TypedDict):
    cloud_name: str
    api_key: str
    timestamp: int
    folder: str
    signature: str
    upload_url: str
    max_image_bytes: int
    max_video_bytes: int


def is_configured() -> bool:
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    )


def _configure_once() -> None:
    """Idempotent — cloudinary.config is a module-level singleton."""
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def sign_upload(folder: str, public_id: Optional[str] = None) -> SignaturePayload:
    """Build the signed upload params for a direct browser → Cloudinary upload.

    Caller is responsible for checking :func:`is_configured` first; this function
    will raise if the SDK can't sign.
    """
    _configure_once()
    timestamp = int(time.time())
    params_to_sign: dict[str, object] = {"timestamp": timestamp, "folder": folder}
    if public_id:
        params_to_sign["public_id"] = public_id

    signature = cloudinary.utils.api_sign_request(
        params_to_sign, settings.CLOUDINARY_API_SECRET
    )

    return SignaturePayload(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        timestamp=timestamp,
        folder=folder,
        signature=signature,
        upload_url=UPLOAD_URL_TEMPLATE.format(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME
        ),
        max_image_bytes=settings.CLOUDINARY_MAX_IMAGE_BYTES,
        max_video_bytes=settings.CLOUDINARY_MAX_VIDEO_BYTES,
    )
