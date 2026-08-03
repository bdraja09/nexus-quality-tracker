from sqlmodel import SQLModel, Field
from datetime import datetime, date
from typing import Optional
from app.enums import NCState, Severity


class NonConformance(SQLModel, table=True):
    __tablename__ = "non_conformances"

    id_nc: str = Field(primary_key=True)
    ref_code: str
    title: str
    description: str
    severity: Severity
    dept_id: str = Field(foreign_key="departments.id_dept")
    raised_by: str = Field(foreign_key="users.id_usr")
    assigned_to: Optional[str] = Field(default=None, foreign_key="users.id_usr")
    due_date: Optional[date] = None
    raised_at: datetime = Field(default_factory=datetime.utcnow)
    current_state: NCState = Field(default=NCState.RAISED)
    closed_at: Optional[datetime] = None
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None