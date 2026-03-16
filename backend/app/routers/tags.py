"""Tags router — single GET /api/tags grouped by category.

Used by the M2 destination filter UX, plus M3/M7 ride/discussion flows that
also want tag chips. Kept separate from destinations because tags are a
top-level taxonomy, not a sub-resource.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.destination import Tag, TagCategory
from app.schemas.destination import TagListResponse, TagOut

router = APIRouter()


@router.get("", response_model=TagListResponse)
def list_tags(db: Session = Depends(get_db)) -> TagListResponse:
    tags = db.query(Tag).order_by(Tag.label).all()
    return TagListResponse(
        vibe=[TagOut.model_validate(t) for t in tags if t.category == TagCategory.vibe],
        vehicle_fit=[
            TagOut.model_validate(t)
            for t in tags
            if t.category == TagCategory.vehicle_fit
        ],
    )
