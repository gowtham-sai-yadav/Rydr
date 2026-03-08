"""ChatGroup + ChatMessage.

ChatGroup FK renamed to ride_plan_id in M1. ChatMessage added — table is live but
endpoint wiring stays mock (MOCK_MESSAGES) until M5.
"""
from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ChatGroup(Base):
    __tablename__ = "chat_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_plan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_plans.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    name = Column(String(200), nullable=False)

    ride_plan = relationship("RidePlan", back_populates="chat_group")
    messages = relationship(
        "ChatMessage",
        back_populates="chat_group",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_chat_messages_group_time", "chat_group_id", "created_at"),
    )

    chat_group = relationship("ChatGroup", back_populates="messages")
    author = relationship("User")
