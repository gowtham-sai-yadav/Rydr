"""Sends a push notification via Expo's push API for every in-app
Notification this app creates. No APNs/FCM keys needed here — Expo's
push service (https://exp.host) is the single endpoint for both
platforms as long as the client obtained an Expo push token (which is
what expo-notifications' getExpoPushTokenAsync() returns).

Best-effort by design, same as the rest of notification_service.py: a
down push endpoint or a stale/uninstalled token should never fail the
action that earned the notification.
"""
from __future__ import annotations

from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.models.push_token import PushToken

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
PUSH_TIMEOUT_SECONDS = 4.0


def send_push(db: Session, *, user_id: UUID, title: str, body: str) -> None:
    tokens = db.query(PushToken.token).filter(PushToken.user_id == user_id).all()
    if not tokens:
        return

    messages = [
        {"to": token, "title": title, "body": body, "sound": "default"}
        for (token,) in tokens
    ]
    try:
        httpx.post(EXPO_PUSH_URL, json=messages, timeout=PUSH_TIMEOUT_SECONDS)
    except Exception:  # noqa: BLE001 - push delivery is never allowed to fail the caller
        pass
