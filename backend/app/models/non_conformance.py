from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional
from app.enums import NCState, Severity


class NonConformance(SQLModel, table=True):
    __tablename__ = "non_conformances"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    ref_code: str
    title: str
    description: str
    severity: Severity
    dept_id: UUID = Field(foreign_key="departments.id")
    raised_by: UUID = Field(foreign_key="users.id")
    raised_at: datetime = Field(default_factory=datetime.utcnow)
    current_state: NCState = Field(default=NCState.RAISED)
    closed_at: Optional[datetime] = None