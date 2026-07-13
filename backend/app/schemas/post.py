"""Feed post / like / comment schemas — Phase 4 W4."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.user import UserBrief

MAX_MEDIA_PER_POST = 10


class PostMediaIn(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    media_type: str = Field(default="image")
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("media_type")
    @classmethod
    def _known_type(cls, v: str) -> str:
        if v not in {"image", "video"}:
            raise ValueError("media_type must be 'image' or 'video'")
        return v


class PostMediaOut(BaseModel):
    id: UUID
    url: str
    media_type: str
    thumbnail_url: Optional[str] = None

    class Config:
        from_attributes = True


class PostCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    ride_log_id: Optional[UUID] = None
    destination_id: Optional[UUID] = None
    media: List[PostMediaIn] = Field(default_factory=list)

    @field_validator("body")
    @classmethod
    def _trim(cls, v: str) -> str:
        # Matches ChatMessageCreate: trim first, then enforce non-empty, so a
        # body of only whitespace is rejected rather than stored blank.
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("body cannot be empty")
        return trimmed

    @field_validator("media")
    @classmethod
    def _cap_media(cls, v: List[PostMediaIn]) -> List[PostMediaIn]:
        if len(v) > MAX_MEDIA_PER_POST:
            raise ValueError(f"at most {MAX_MEDIA_PER_POST} media items per post")
        return v


class PostUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("body")
    @classmethod
    def _trim(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("body cannot be empty")
        return trimmed


class PostCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def _trim(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("body cannot be empty")
        return trimmed


class PostCommentOut(BaseModel):
    id: UUID
    post_id: UUID
    body: str
    created_at: datetime
    updated_at: datetime
    author: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class PostCommentListResponse(BaseModel):
    comments: List[PostCommentOut] = []
    total: int
    page: int
    limit: int


class PostDestinationBrief(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True


class PostOut(BaseModel):
    id: UUID
    body: str
    created_at: datetime
    updated_at: datetime
    author: Optional[UserBrief] = None
    media: List[PostMediaOut] = []
    ride_log_id: Optional[UUID] = None
    destination: Optional[PostDestinationBrief] = None

    # Computed per request from a batched aggregate — see models/post.py for
    # why these are not stored columns.
    like_count: int = 0
    comment_count: int = 0
    # Null for anonymous callers, so the client can tell "not liked" apart
    # from "we don't know because you're logged out".
    liked_by_me: Optional[bool] = None

    class Config:
        from_attributes = True


class PostListResponse(BaseModel):
    posts: List[PostOut] = []
    total: int
    page: int
    limit: int


class LikeResponse(BaseModel):
    post_id: UUID
    liked: bool
    like_count: int
