"""Community feed router — Phase 4 W4.

Surface (under ``/api/posts``):

  GET    /                      — feed (auth optional; ?following_only, ?author_id)
  POST   /                      — create a post (auth)
  GET    /{id}                  — single post (auth optional)
  PATCH  /{id}                  — edit own post body (auth)
  DELETE /{id}                  — delete own post (auth)
  POST   /{id}/like             — like (auth, idempotent)
  DELETE /{id}/like             — unlike (auth, idempotent)
  GET    /{id}/comments         — paginated, oldest first (auth optional)
  POST   /{id}/comments         — comment (auth)
  DELETE /comments/{id}         — delete own comment, or any on your own post

Design notes
------------
**No N+1.** A page of posts needs like counts, comment counts, and whether
the caller liked each one. Done naively that is three queries per post. The
router instead collects the page's ids and issues exactly three grouped
queries for the whole page, regardless of page size — see
:func:`_annotate_posts`.

**Anonymous reads.** The feed is readable logged-out (the plan positions it
as discovery surface), so ``liked_by_me`` is ``None`` rather than ``False``
for anonymous callers: the client can then render a neutral control instead of
an "unliked" one that implies a session.

**Delete authority.** A post author deletes their own post. A comment can be
deleted by its author *or* by the author of the post it sits on — the post
owner moderates their own thread, which is the same author-or-owner rule
``chat.delete_message`` uses for author-or-captain.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.destination import Destination
from app.models.notification import EntityType, NotificationType
from app.models.post import Post, PostComment, PostLike, PostMedia
from app.models.ride_log import RideLog
from app.models.social import Follow
from app.models.user import User
from app.schemas.post import (
    LikeResponse,
    PostCommentCreate,
    PostCommentListResponse,
    PostCommentOut,
    PostCreate,
    PostDestinationBrief,
    PostListResponse,
    PostMediaOut,
    PostOut,
    PostUpdate,
)
from app.schemas.user import UserBrief
from app.services import notifications as notification_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _like_counts(db: Session, post_ids: Sequence[UUID]) -> Dict[UUID, int]:
    if not post_ids:
        return {}
    rows = (
        db.query(PostLike.post_id, func.count())
        .filter(PostLike.post_id.in_(post_ids))
        .group_by(PostLike.post_id)
        .all()
    )
    return {pid: n for pid, n in rows}


def _comment_counts(db: Session, post_ids: Sequence[UUID]) -> Dict[UUID, int]:
    if not post_ids:
        return {}
    rows = (
        db.query(PostComment.post_id, func.count())
        .filter(PostComment.post_id.in_(post_ids))
        .group_by(PostComment.post_id)
        .all()
    )
    return {pid: n for pid, n in rows}


def _liked_by(db: Session, post_ids: Sequence[UUID], user_id: UUID) -> set[UUID]:
    if not post_ids:
        return set()
    rows = db.query(PostLike.post_id).filter(
        PostLike.post_id.in_(post_ids), PostLike.user_id == user_id
    )
    return {r[0] for r in rows}


def _annotate_posts(
    db: Session, posts: Sequence[Post], viewer: Optional[User]
) -> List[PostOut]:
    """Build the response for a page of posts in a fixed number of queries.

    Three grouped queries for the whole page (likes, comments, and the
    viewer's own likes) rather than three per post. Page size does not change
    the query count.
    """
    ids = [p.id for p in posts]
    likes = _like_counts(db, ids)
    comments = _comment_counts(db, ids)
    mine = _liked_by(db, ids, viewer.id) if viewer else set()

    out: List[PostOut] = []
    for p in posts:
        out.append(
            PostOut(
                id=p.id,
                body=p.body,
                created_at=p.created_at,
                updated_at=p.updated_at,
                author=UserBrief.model_validate(p.author) if p.author else None,
                media=[PostMediaOut.model_validate(m) for m in p.media],
                ride_log_id=p.ride_log_id,
                destination=(
                    PostDestinationBrief.model_validate(p.destination)
                    if p.destination
                    else None
                ),
                like_count=likes.get(p.id, 0),
                comment_count=comments.get(p.id, 0),
                liked_by_me=(p.id in mine) if viewer else None,
            )
        )
    return out


def _load_post_or_404(db: Session, post_id: UUID) -> Post:
    post = (
        db.query(Post)
        .options(
            selectinload(Post.author),
            selectinload(Post.media),
            selectinload(Post.destination),
        )
        .filter(Post.id == post_id)
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------
@router.get("", response_model=PostListResponse)
def list_feed(
    following_only: bool = Query(default=False),
    author_id: Optional[UUID] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
) -> PostListResponse:
    q = db.query(Post)

    if author_id is not None:
        q = q.filter(Post.author_id == author_id)

    if following_only:
        if viewer is None:
            raise HTTPException(
                status_code=401,
                detail="following_only requires authentication",
            )
        # Same shape as the M6 ride feed's following filter: a subquery over
        # the follow edges rather than a join, so the posts index on
        # (author_id, created_at DESC) still drives the scan.
        followed = db.query(Follow.followed_id).filter(
            Follow.follower_id == viewer.id
        )
        q = q.filter(Post.author_id.in_(followed))

    total = q.with_entities(func.count(Post.id)).scalar() or 0

    rows = (
        q.options(
            selectinload(Post.author),
            selectinload(Post.media),
            selectinload(Post.destination),
        )
        # id.desc() is the tiebreaker — without a total order, two posts
        # created in the same transaction can repeat across pages.
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return PostListResponse(
        posts=_annotate_posts(db, rows, viewer),
        total=total,
        page=page,
        limit=limit,
    )


@router.post("", response_model=PostOut, status_code=201)
def create_post(
    payload: PostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PostOut:
    # Validate the optional anchors before writing anything, so a bad id does
    # not leave a half-built post to roll back (the M2 audit #11 pattern).
    if payload.ride_log_id is not None:
        log = (
            db.query(RideLog.id, RideLog.rider_id)
            .filter(RideLog.id == payload.ride_log_id)
            .first()
        )
        if not log:
            raise HTTPException(status_code=404, detail="Ride log not found")
        if log.rider_id != user.id:
            # You can write about your own ride, not somebody else's.
            raise HTTPException(
                status_code=403,
                detail="You can only attach your own ride log to a post",
            )
    if payload.destination_id is not None:
        if (
            not db.query(Destination.id)
            .filter(Destination.id == payload.destination_id)
            .first()
        ):
            raise HTTPException(status_code=404, detail="Destination not found")

    post = Post(
        author_id=user.id,
        body=payload.body,
        ride_log_id=payload.ride_log_id,
        destination_id=payload.destination_id,
    )
    db.add(post)
    db.flush()

    for item in payload.media:
        db.add(
            PostMedia(
                post_id=post.id,
                url=item.url,
                media_type=item.media_type,
                thumbnail_url=item.thumbnail_url,
            )
        )
    db.commit()

    fresh = _load_post_or_404(db, post.id)
    return _annotate_posts(db, [fresh], user)[0]


@router.get("/{post_id}", response_model=PostOut)
def get_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
) -> PostOut:
    post = _load_post_or_404(db, post_id)
    return _annotate_posts(db, [post], viewer)[0]


@router.patch("/{post_id}", response_model=PostOut)
def update_post(
    post_id: UUID,
    payload: PostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PostOut:
    post = _load_post_or_404(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")
    post.body = payload.body
    db.commit()
    fresh = _load_post_or_404(db, post_id)
    return _annotate_posts(db, [fresh], user)[0]


@router.delete("/{post_id}")
def delete_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only delete your own posts"
        )
    # Media, likes and comments go with it via cascade="all, delete-orphan"
    # on the relationships and ON DELETE CASCADE in the schema.
    db.delete(post)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Likes
# ---------------------------------------------------------------------------
@router.post("/{post_id}/like", response_model=LikeResponse)
def like_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LikeResponse:
    post = db.query(Post.id, Post.author_id).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Idempotent: a double-tap inserts once and reports the same state.
    # DO NOTHING returns no row on conflict, which is also how we know whether
    # this was a new like and therefore whether to notify.
    stmt = (
        pg_insert(PostLike)
        .values(post_id=post_id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=["post_id", "user_id"])
        .returning(PostLike.post_id)
    )
    inserted = db.execute(stmt).first()
    db.commit()

    if inserted is not None:
        notification_service.safe_notify_commit(
            db,
            user_id=post.author_id,
            type=NotificationType.post_liked,
            title=f"{user.name} liked your post",
            actor_id=user.id,
            entity_type=EntityType.post,
            entity_id=post_id,
        )

    return LikeResponse(
        post_id=post_id, liked=True, like_count=_like_counts(db, [post_id]).get(post_id, 0)
    )


@router.delete("/{post_id}/like", response_model=LikeResponse)
def unlike_post(
    post_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LikeResponse:
    if not db.query(Post.id).filter(Post.id == post_id).first():
        raise HTTPException(status_code=404, detail="Post not found")

    # Idempotent — deletes 0 or 1 rows, reports the same state either way.
    db.query(PostLike).filter(
        PostLike.post_id == post_id, PostLike.user_id == user.id
    ).delete(synchronize_session=False)
    db.commit()

    return LikeResponse(
        post_id=post_id,
        liked=False,
        like_count=_like_counts(db, [post_id]).get(post_id, 0),
    )


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------
@router.get("/{post_id}/comments", response_model=PostCommentListResponse)
def list_comments(
    post_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> PostCommentListResponse:
    if not db.query(Post.id).filter(Post.id == post_id).first():
        raise HTTPException(status_code=404, detail="Post not found")

    base = db.query(PostComment).filter(PostComment.post_id == post_id)
    total = base.with_entities(func.count(PostComment.id)).scalar() or 0
    rows = (
        base.options(selectinload(PostComment.author))
        # Oldest first: a comment thread reads as a conversation, unlike the
        # feed itself which is newest-first.
        .order_by(PostComment.created_at.asc(), PostComment.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return PostCommentListResponse(
        comments=[PostCommentOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.post("/{post_id}/comments", response_model=PostCommentOut, status_code=201)
def create_comment(
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
    db.commit()

    notification_service.safe_notify_commit(
        db,
        user_id=post.author_id,
        type=NotificationType.post_commented,
        title=f"{user.name} commented on your post",
        body=payload.body[:140],
        actor_id=user.id,
        entity_type=EntityType.post,
        entity_id=post_id,
    )

    fresh = (
        db.query(PostComment)
        .options(selectinload(PostComment.author))
        .filter(PostComment.id == comment.id)
        .one()
    )
    return PostCommentOut.model_validate(fresh)


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    row = (
        db.query(PostComment, Post.author_id.label("post_author_id"))
        .join(Post, Post.id == PostComment.post_id)
        .filter(PostComment.id == comment_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment, post_author_id = row
    # Author of the comment, or owner of the post it sits on. Same
    # author-or-owner shape as chat.delete_message's author-or-captain.
    if comment.author_id != user.id and post_author_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the comment author or the post author can delete this comment",
        )

    db.delete(comment)
    db.commit()
    return Response(status_code=204)
