from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional
from app.enums import NCState


class NCEvent(SQLModel, table=True):
    __tablename__ = "nc_events"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    nc_id: UUID = Field(foreign_key="non_conformances.id")
    from_state: Optional[NCState] = Field(default=None)
    to_state: NCState
    actor_id: UUID = Field(foreign_key="users.id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None