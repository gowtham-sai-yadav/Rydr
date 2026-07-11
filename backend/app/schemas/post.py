"""Pydantic schemas for Post + PostLike + PostComment."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.user import UserBrief


class PostMediaOut(BaseModel):
    url: str
    media_type: str


class PostCommentOut(BaseModel):
    id: UUID
    post_id: UUID
    author: UserBrief
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class PostCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class PostOut(BaseModel):
    id: UUID
    author: UserBrief
    ride_log_id: Optional[UUID] = None
    caption: str
    media: List[PostMediaOut] = []
    like_count: int = 0
    comment_count: int = 0
    liked_by_me: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class PostListResponse(BaseModel):
    posts: List[PostOut] = []
    total: int
    page: int
    limit: int


class PostCreate(BaseModel):
    caption: str = Field(min_length=1, max_length=2000)
    ride_log_id: Optional[UUID] = None
