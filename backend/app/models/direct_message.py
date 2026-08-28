"""DMThread + DirectMessage - 1:1 messaging between mutual followers.

Separate from ChatGroup/ChatMessage (which is strictly 1:1 with a
RidePlan) rather than reusing it, since a DM thread has no ride behind it
and needs its own membership pair instead of a participant-approval flow.
"""
from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DMThread(Base):
    __tablename__ = "dm_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Normalized so a pair only ever has one thread: user_a_id is always the
    # smaller UUID of the two (enforced in the router, not the DB, since
    # Postgres has no portable "least(uuid, uuid)" without an extension).
    user_a_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_b_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_dm_thread_pair"),
        CheckConstraint("user_a_id != user_b_id", name="ck_dm_thread_not_self"),
        Index("idx_dm_threads_user_a", "user_a_id"),
        Index("idx_dm_threads_user_b", "user_b_id"),
    )

    user_a = relationship("User", foreign_keys=[user_a_id])
    user_b = relationship("User", foreign_keys=[user_b_id])
    messages = relationship(
        "DirectMessage",
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="DirectMessage.created_at",
    )


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id = Column(UUID(as_uuid=True), ForeignKey("dm_threads.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_direct_messages_thread_time", "thread_id", "created_at"),
    )

    thread = relationship("DMThread", back_populates="messages")
    author = relationship("User")
