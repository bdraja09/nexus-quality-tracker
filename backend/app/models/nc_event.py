from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional
from app.enums import NCState


class NCEvent(SQLModel, table=True):
    __tablename__ = "nc_events"

    id_event: str = Field(primary_key=True)
    nc_id: str = Field(foreign_key="non_conformances.id_nc")
    from_state: Optional[NCState] = Field(default=None)
    to_state: NCState
    actor_id: str = Field(foreign_key="users.id_usr")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None