"""Moderation router — Phase 4 admin surface.

Surface (all under ``/api/moderation``):

  POST  /reports        — any authenticated user files a report
  GET   /reports         — admin-only, filterable by status, paginated
  PATCH /reports/{id}    — admin-only, update status (sets reviewed_by/reviewed_at)

Filing a report requires no special permission — it's the abuse-reporting
entry point every user needs. Reading and actioning the queue is
admin-gated via ``get_current_admin_user`` (403 for non-admins, not 404 —
the existence of the moderation queue isn't something worth hiding).
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_current_admin_user, get_current_user, get_db
from app.models.report import Report, ReportStatus
from app.models.user import User
from app.schemas.report import (
    ReportCreate,
    ReportListResponse,
    ReportOut,
    ReportStatusUpdate,
)

router = APIRouter()


@router.post("/reports", response_model=ReportOut, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportOut:
    report = Report(
        reporter_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportOut.model_validate(report)


@router.get("/reports", response_model=ReportListResponse)
def list_reports(
    status: Optional[ReportStatus] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
) -> ReportListResponse:
    base = db.query(Report)
    if status is not None:
        base = base.filter(Report.status == status)

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


@router.patch("/reports/{report_id}", response_model=ReportOut)
def update_report(
    report_id: UUID,
    payload: ReportStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ReportOut:
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = payload.status
    report.reviewed_by = admin.id
    report.reviewed_at = func.now()
    db.commit()
    db.refresh(report)
    return ReportOut.model_validate(report)
