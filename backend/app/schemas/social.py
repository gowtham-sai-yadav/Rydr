"""Pydantic schemas for Follow + Discussion + DiscussionComment."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class FollowOut(BaseModel):
    follower_id: UUID
    followed_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class DiscussionCommentOut(BaseModel):
    id: UUID
    discussion_id: UUID
    author_id: UUID
    parent_comment_id: Optional[UUID] = None
    body: str
    created_at: datetime
    updated_at: datetime
    replies: List["DiscussionCommentOut"] = []

    class Config:
        from_attributes = True


DiscussionCommentOut.model_rebuild()


class DiscussionCommentCreate(BaseModel):
    body: str = Field(min_length=1)
    parent_comment_id: Optional[UUID] = None


class DiscussionOut(BaseModel):
    id: UUID
    destination_id: UUID
    author_id: UUID
    title: str
    body: str
    created_at: datetime
    updated_at: datetime
    comments: List[DiscussionCommentOut] = []

    class Config:
        from_attributes = True


class DiscussionCreate(BaseModel):
    destination_id: UUID
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
