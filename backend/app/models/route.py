"""Route + RoutePoint — optional curated path to a Destination."""
from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Route(Base):
    __tablename__ = "routes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    destination = relationship("Destination", back_populates="routes")
    creator = relationship("User", back_populates="created_routes")
    points = relationship(
        "RoutePoint",
        back_populates="route",
        cascade="all, delete-orphan",
        order_by="RoutePoint.ordinal",
    )
    ride_plans = relationship("RidePlan", back_populates="route")


class RoutePoint(Base):
    __tablename__ = "route_points"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    route_id = Column(
        UUID(as_uuid=True),
        ForeignKey("routes.id", ondelete="CASCADE"),
        nullable=False,
    )
    ordinal = Column(Integer, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    label = Column(String(200), nullable=True)
    is_stop = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("idx_route_points_route_order", "route_id", "ordinal"),
    )

    route = relationship("Route", back_populates="points")
