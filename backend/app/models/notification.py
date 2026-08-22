from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Notification(SQLModel, table=True):
    __tablename__ = "notification"

    id: Optional[int] = Field(default=None, primary_key=True)
    recipient_id: str = Field(index=True)
    nc_id: Optional[str] = Field(default=None, index=True)
    ref_code: Optional[str] = Field(default=None)
    type: str  # assignment, reassignment, closed, rejected, reopened, corrective_action_assigned, corrective_action_proposed
    title: str
    message: str
    reason: Optional[str] = None
    channel: str = Field(default="in_app")  # in_app | email | push
    is_read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    read_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None  # soft delete