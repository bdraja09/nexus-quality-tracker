from sqlmodel import SQLModel, Field
from datetime import date, datetime
from typing import Optional


class CorrectiveAction(SQLModel, table=True):
    __tablename__ = "corrective_actions"

    id_action: str = Field(primary_key=True)
    nc_id: str = Field(foreign_key="non_conformances.id_nc")
    description: str
    assigned_to: str = Field(foreign_key="users.id_usr")
    due_date: date
    completed_at: Optional[datetime] = None
    verified_by: Optional[str] = Field(default=None, foreign_key="users.id_usr")