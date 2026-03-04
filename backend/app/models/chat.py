import uuid
from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ChatGroup(Base):
    __tablename__ = "chat_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_id = Column(UUID(as_uuid=True), ForeignKey("rides.id", ondelete="CASCADE"), unique=True, nullable=False)
    name = Column(String(200), nullable=False)

    ride = relationship("Ride", back_populates="chat_group")
