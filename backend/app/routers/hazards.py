"""Community hazard reports - potholes, gravel, police checks, animal
crossings - pinned to a location and shown on the discovery/live-ride
map. Time-decaying: "active" is computed from created_at + the type's
decay window (see models/hazard.py::HAZARD_DECAY), not a stored flag,
so stale reports fade on their own without a cron job. Reporting
requires login (spam/accountability); reading is public.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.destination import Destination
from app.models.hazard import HAZARD_DECAY, HazardReport, HazardType
from app.models.user import User
from app.schemas.hazard import HazardReportCreate, HazardReportListResponse, HazardReportOut

router = APIRouter()


def _to_out(h: HazardReport) -> HazardReportOut:
    expires_at = h.created_at + HAZARD_DECAY[HazardType(h.hazard_type)]
    return HazardReportOut(
        id=h.id,
        latitude=h.latitude,
        longitude=h.longitude,
        hazard_type=h.hazard_type,
        description=h.description,
        destination_id=h.destination_id,
        reporter=h.reporter,
        created_at=h.created_at,
        expires_at=expires_at,
        is_active=expires_at > datetime.now(timezone.utc),
    )


@router.get("", response_model=HazardReportListResponse)
def list_hazards(
    destination_id: UUID | None = Query(default=None),
    near_lat: float | None = Query(default=None, ge=-90, le=90),
    near_lng: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float = Query(default=25, ge=0.1, le=200),
    include_expired: bool = Query(default=False),
    db: Session = Depends(get_db),
    _viewer: User | None = Depends(get_optional_user),
) -> HazardReportListResponse:
    query = db.query(HazardReport).options(selectinload(HazardReport.reporter))
    if destination_id is not None:
        query = query.filter(HazardReport.destination_id == destination_id)
    if near_lat is not None and near_lng is not None:
        # Plain-SQL Haversine, same formula as destinations.py's radius
        # filter - no PostGIS in this stack, and this table is small
        # enough that an inline distance expression is fine.
        deg2rad = 0.017453292519943295
        lat_term = func.sin((HazardReport.latitude - near_lat) * deg2rad / 2)
        lng_term = func.sin((HazardReport.longitude - near_lng) * deg2rad / 2)
        haversine_km = 6371 * 2 * func.asin(
            func.sqrt(
                func.pow(lat_term, 2)
                + func.cos(near_lat * deg2rad) * func.cos(HazardReport.latitude * deg2rad) * func.pow(lng_term, 2)
            )
        )
        query = query.filter(haversine_km <= radius_km)

    rows = query.order_by(HazardReport.created_at.desc()).limit(200).all()
    out = [_to_out(h) for h in rows]
    if not include_expired:
        out = [h for h in out if h.is_active]
    return HazardReportListResponse(hazards=out)


@router.post("", response_model=HazardReportOut, status_code=201)
def create_hazard(
    payload: HazardReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HazardReportOut:
    if payload.destination_id is not None:
        exists = db.query(Destination.id).filter(Destination.id == payload.destination_id).first()
        if not exists:
            raise HTTPException(status_code=404, detail="Destination not found")

    hazard = HazardReport(
        latitude=payload.latitude,
        longitude=payload.longitude,
        hazard_type=payload.hazard_type,
        description=payload.description,
        destination_id=payload.destination_id,
        reported_by_user_id=user.id,
    )
    db.add(hazard)
    db.commit()
    db.refresh(hazard)
    hazard.reporter = user
    return _to_out(hazard)


@router.delete("/{hazard_id}", status_code=204)
def delete_hazard(
    hazard_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Reporter can retract their own report (marked it in error, or it
    already cleared). Admins can remove any (moderation)."""
    hazard = db.query(HazardReport).filter(HazardReport.id == hazard_id).first()
    if hazard is None:
        return Response(status_code=204)
    if hazard.reported_by_user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not your report")
    db.delete(hazard)
    db.commit()
    return Response(status_code=204)
