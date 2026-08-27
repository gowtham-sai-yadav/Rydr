"""Content reporting + admin moderation queue — Phase 4 W7.

Rider-facing (auth):
  POST /api/reports          — flag a piece of content
  GET  /api/reports/mine     — my reports and their outcomes

Admin-facing (auth + is_admin):
  GET   /api/reports/admin           — the queue, filterable by status
  PATCH /api/reports/admin/{id}      — move a report to a terminal state

Design notes
------------
- Reporting is idempotent per (reporter, content). A repeat report of the same
  thing updates the existing row's reason and details rather than creating a
  duplicate, so the admin queue shows distinct complaints and ``report_count``
  means "how many people", not "how many clicks".
- The reported content is validated to exist before the report is accepted.
  Without that check the queue fills with reports against random UUIDs, and an
  admin cannot tell a stale report from a fabricated one.
- Reporters are told the outcome. A moderation system that never replies
  trains people to stop reporting, so resolving a report notifies its
  reporters.
- ``/admin`` is declared before ``/{report_id}``-shaped routes so the literal
  segment wins the match.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, require_admin
from app.models.chat import ChatMessage
from app.models.destination import Destination
from app.models.notification import EntityType, NotificationType
from app.models.post import Post, PostComment
from app.models.report import (
    Report,
    ReportStatus,
    ReportedContentType,
)
from app.models.ride import RidePlan
from app.models.user import User
from app.schemas.report import (
    AdminReportListResponse,
    AdminReportOut,
    ReportCreate,
    ReportListResponse,
    ReportOut,
    ReportResolve,
)
from app.schemas.user import UserBrief
from app.services import notifications as notification_service

router = APIRouter()

# Maps a reportable content type to the model whose existence proves the
# target is real. Kept as data rather than an if-chain so adding a reportable
# type is one line and cannot be half-done.
_TARGET_MODELS = {
    ReportedContentType.post: Post,
    ReportedContentType.post_comment: PostComment,
    ReportedContentType.destination: Destination,
    ReportedContentType.ride_plan: RidePlan,
    ReportedContentType.chat_message: ChatMessage,
    ReportedContentType.user: User,
}

_TERMINAL = {ReportStatus.actioned, ReportStatus.dismissed}


def _target_exists(db: Session, content_type: ReportedContentType, content_id: UUID) -> bool:
    model = _TARGET_MODELS.get(content_type)
    if model is None:  # pragma: no cover - enum and map are kept in sync
        return False
    return db.query(model.id).filter(model.id == content_id).first() is not None


def _report_counts(
    db: Session, reports: Sequence[Report]
) -> Dict[tuple, int]:
    """How many total reports exist per (content_type, content_id).

    One grouped query for the whole page rather than one per row.
    """
    if not reports:
        return {}
    keys = {(r.content_type, r.content_id) for r in reports}
    rows = (
        db.query(Report.content_type, Report.content_id, func.count(Report.id))
        .filter(
            Report.content_type.in_({k[0] for k in keys}),
            Report.content_id.in_({k[1] for k in keys}),
        )
        .group_by(Report.content_type, Report.content_id)
        .all()
    )
    return {(ct, cid): n for ct, cid, n in rows}


# ---------------------------------------------------------------------------
# Rider-facing
# ---------------------------------------------------------------------------
@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportOut:
    if not _target_exists(db, payload.content_type, payload.content_id):
        raise HTTPException(
            status_code=404,
            detail=f"No {payload.content_type.value} with that id",
        )

    if payload.content_type == ReportedContentType.user and payload.content_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot report yourself")

    # Idempotent per (reporter, content) — see module docstring. A second
    # report from the same person amends the first.
    stmt = (
        pg_insert(Report)
        .values(
            reporter_id=user.id,
            content_type=payload.content_type.value,
            content_id=payload.content_id,
            reason=payload.reason.value,
            details=payload.details,
            status=ReportStatus.open.value,
        )
        .on_conflict_do_update(
            constraint="uq_report_reporter_content",
            set_={
                "reason": payload.reason.value,
                "details": payload.details,
                # Amending reopens it: the reporter is telling us something
                # new about content an admin may already have dismissed.
                "status": ReportStatus.open.value,
                "resolved_at": None,
                "resolution_note": None,
            },
        )
        .returning(Report.id)
    )
    report_id = db.execute(stmt).scalar_one()
    db.commit()

    row = db.query(Report).filter(Report.id == report_id).one()
    return ReportOut.model_validate(row)


@router.get("/mine", response_model=ReportListResponse)
def my_reports(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportListResponse:
    base = db.query(Report).filter(Report.reporter_id == user.id)
    total = base.with_entities(func.count(Report.id)).scalar() or 0
    rows = (
        base.order_by(Report.created_at.desc(), Report.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return ReportListResponse(
        reports=[ReportOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Admin-facing
# ---------------------------------------------------------------------------
@router.get("/admin", response_model=AdminReportListResponse)
def admin_queue(
    status_filter: Optional[ReportStatus] = Query(default=None, alias="status"),
    content_type: Optional[ReportedContentType] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminReportListResponse:
    base = db.query(Report)
    if status_filter is not None:
        base = base.filter(Report.status == status_filter.value)
    if content_type is not None:
        base = base.filter(Report.content_type == content_type.value)

    total = base.with_entities(func.count(Report.id)).scalar() or 0
    rows = (
        base.options(
            selectinload(Report.reporter), selectinload(Report.resolver)
        )
        # Oldest first within the queue: a moderation queue is worked
        # front-to-back, and newest-first would starve the oldest complaint.
        .order_by(Report.created_at.asc(), Report.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    counts = _report_counts(db, rows)
    open_count = (
        db.query(func.count(Report.id))
        .filter(Report.status == ReportStatus.open.value)
        .scalar()
        or 0
    )

    return AdminReportListResponse(
        reports=[
            AdminReportOut(
                id=r.id,
                content_type=r.content_type,
                content_id=r.content_id,
                reason=r.reason,
                details=r.details,
                status=r.status,
                created_at=r.created_at,
                resolved_at=r.resolved_at,
                resolution_note=r.resolution_note,
                reporter=UserBrief.model_validate(r.reporter) if r.reporter else None,
                resolver=UserBrief.model_validate(r.resolver) if r.resolver else None,
                report_count=counts.get((r.content_type, r.content_id), 1),
            )
            for r in rows
        ],
        total=total,
        open_count=open_count,
        page=page,
        limit=limit,
    )


@router.patch("/admin/{report_id}", response_model=AdminReportOut)
def resolve_report(
    report_id: UUID,
    payload: ReportResolve,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminReportOut:
    report = (
        db.query(Report)
        .options(selectinload(Report.reporter))
        .filter(Report.id == report_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = payload.status.value
    report.resolution_note = payload.resolution_note

    if payload.status in _TERMINAL:
        report.resolved_by_id = admin.id
        report.resolved_at = datetime.now(timezone.utc)
    else:
        # Moving back to open/reviewing clears the resolution, so a reopened
        # report does not keep showing a stale "resolved by" attribution.
        report.resolved_by_id = None
        report.resolved_at = None

    db.commit()
    db.refresh(report)

    if payload.status in _TERMINAL:
        # Close the loop with the reporter. A moderation system that never
        # replies teaches people that reporting is pointless.
        notification_service.safe_notify_commit(
            db,
            user_id=report.reporter_id,
            type=NotificationType.report_resolved,
            title=(
                "Your report was actioned"
                if payload.status == ReportStatus.actioned
                else "Your report was reviewed"
            ),
            body=payload.resolution_note or None,
            entity_type=EntityType.report,
            entity_id=report.id,
        )

    return AdminReportOut(
        id=report.id,
        content_type=report.content_type,
        content_id=report.content_id,
        reason=report.reason,
        details=report.details,
        status=report.status,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
        resolution_note=report.resolution_note,
        reporter=(
            UserBrief.model_validate(report.reporter) if report.reporter else None
        ),
        resolver=UserBrief.model_validate(admin) if report.resolved_by_id else None,
        report_count=_report_counts(db, [report]).get(
            (report.content_type, report.content_id), 1
        ),
    )
