"""PushToken - one row per (user, device) Expo push token, so a rider
signed in on two phones gets notified on both."""
from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PushToken(Base):
    __tablename__ = "push_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Expo push tokens look like "ExponentPushToken[xxxxxxxx]" - opaque,
    # device-specific, and already the addressing scheme Expo's push API
    # expects, so no separate APNs/FCM token handling is needed here.
    token = Column(String(255), nullable=False)
    platform = Column(String(20), nullable=True)  # "ios" | "android" | "web"
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (UniqueConstraint("user_id", "token", name="uq_push_token_user_token"),)

    user = relationship("User")
