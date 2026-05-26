"""Community feed router — Phase 4 W4.

  POST   /                    — create a post (auth; optional ride_log_id)
  GET    /                    — paginated feed, newest first (auth optional)
  GET    /{id}                — single post detail (auth optional)
  DELETE /{id}                — author-only delete
  POST   /{id}/like           — like (idempotent)
  DELETE /{id}/like           — unlike (idempotent)
  GET    /{id}/comments       — paginated comments, oldest first
  POST   /{id}/comments       — add a comment (auth)

A post optionally wraps a ``RideLog``: when ``ride_log_id`` is set, the
ride's photos are surfaced as the post's media so riders don't have to
re-upload anything to share a completed ride.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.notification import NotificationType
from app.models.post import Post, PostComment, PostLike
from app.models.ride_log import RideLog
from app.models.user import User
from app.schemas.post import (
    PostCommentCreate,
    PostCommentOut,
    PostCreate,
    PostListResponse,
    PostMediaOut,
    PostOut,
)
from app.services.notification_service import create_notification as _notify

router = APIRouter()


def _post_out(db: Session, post: Post, viewer: Optional[User]) -> PostOut:
    media = [
        PostMediaOut(url=m.url, media_type=m.media_type.value)
        for m in (post.ride_log.media if post.ride_log else [])
    ]
    liked_by_me = False
    if viewer is not None:
        liked_by_me = (
            db.query(PostLike)
            .filter(PostLike.post_id == post.id, PostLike.user_id == viewer.id)
            .first()
            is not None
        )
    return PostOut(
        id=post.id,
        author=post.author,
        ride_log_id=post.ride_log_id,
        caption=post.caption,
        media=media,
        like_count=len(post.likes),
        comment_count=len(post.comments),
        liked_by_me=liked_by_me,
        created_at=post.created_at,
    )


@router.post("", response_model=PostOut, status_code=201)
def create_post(
    payload: PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PostOut:
    if payload.ride_log_id is not None:
        ride_log = (
            db.query(RideLog)
            .filter(RideLog.id == payload.ride_log_id, RideLog.rider_id == user.id)
            .first()
        )
        if not ride_log:
            raise HTTPException(
                status_code=404,
                detail="Ride log not found or does not belong to you",
            )

    post = Post(author_id=user.id, ride_log_id=payload.ride_log_id, caption=payload.caption)
    db.add(post)
    db.commit()
    db.refresh(post)

    post = (
        db.query(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.ride_log).selectinload(RideLog.media),
            selectinload(Post.likes),
            selectinload(Post.comments),
        )
        .filter(Post.id == post.id)
        .one()
    )
    return _post_out(db, post, user)


@router.get("", response_model=PostListResponse)
def list_feed(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
) -> PostListResponse:
    base = db.query(Post)
    total = base.with_entities(func.count(Post.id)).scalar() or 0
    rows = (
        base.options(
            selectinload(Post.author),
            selectinload(Post.ride_log).selectinload(RideLog.media),
            selectinload(Post.likes),
            selectinload(Post.comments),
        )
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return PostListResponse(
        posts=[_post_out(db, p, user) for p in rows],
        total=total,
        page=page,
        limit=limit,
    )


def _get_post_or_404(db: Session, post_id: UUID) -> Post:
    post = (
        db.query(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.ride_log).selectinload(RideLog.media),
            selectinload(Post.likes),
            selectinload(Post.comments),
        )
        .filter(Post.id == post_id)
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@router.get("/{post_id}", response_model=PostOut)
def get_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
) -> PostOut:
    post = _get_post_or_404(db, post_id)
    return _post_out(db, post, user)


@router.delete("/{post_id}", status_code=204)
def delete_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="Only the author can delete this post")
    db.delete(post)
    db.commit()
    return Response(status_code=204)


@router.post("/{post_id}/like", status_code=204)
def like_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    post = db.query(Post.id, Post.author_id).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    stmt = (
        pg_insert(PostLike)
        .values(post_id=post_id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=["post_id", "user_id"])
        .returning(PostLike.post_id)
    )
    inserted = db.execute(stmt).first() is not None
    if inserted:
        # Only notify on an actual new like — re-POSTing an existing like
        # is idempotent and stays silent, same rule as ride join requests.
        _notify(
            db,
            user_id=post.author_id,
            type=NotificationType.post_liked,
            message=f"{user.name} liked your post",
            actor_id=user.id,
            post_id=post_id,
        )
    db.commit()
    return Response(status_code=204)


@router.delete("/{post_id}/like", status_code=204)
def unlike_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    db.query(PostLike).filter(
        PostLike.post_id == post_id, PostLike.user_id == user.id
    ).delete()
    db.commit()
    return Response(status_code=204)


@router.get("/{post_id}/comments", response_model=list[PostCommentOut])
def list_comments(
    post_id: UUID,
    db: Session = Depends(get_db),
    _user: Optional[User] = Depends(get_optional_user),
) -> list[PostCommentOut]:
    if not db.query(Post.id).filter(Post.id == post_id).first():
        raise HTTPException(status_code=404, detail="Post not found")
    rows = (
        db.query(PostComment)
        .options(selectinload(PostComment.author))
        .filter(PostComment.post_id == post_id)
        .order_by(PostComment.created_at.asc())
        .all()
    )
    return [PostCommentOut.model_validate(c) for c in rows]


@router.post("/{post_id}/comments", response_model=PostCommentOut, status_code=201)
def add_comment(
    post_id: UUID,
    payload: PostCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PostCommentOut:
    post = db.query(Post.id, Post.author_id).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comment = PostComment(post_id=post_id, author_id=user.id, body=payload.body)
    db.add(comment)
    _notify(
        db,
        user_id=post.author_id,
        type=NotificationType.post_commented,
        message=f"{user.name} commented on your post",
        actor_id=user.id,
        post_id=post_id,
    )
    db.commit()
    db.refresh(comment)
    comment = (
        db.query(PostComment)
        .options(selectinload(PostComment.author))
        .filter(PostComment.id == comment.id)
        .one()
    )
    return PostCommentOut.model_validate(comment)
