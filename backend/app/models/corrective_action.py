from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4
from datetime import date, datetime
from typing import Optional

class CorrectiveAction(SQLModel, table=True):
    __tablename__ = "corrective_actions"
    
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    nc_id: UUID = Field(foreign_key="non_conformances.id")
    description: str
    assigned_to: UUID = Field(foreign_key="users.id")
    due_date: date
    completed_at: Optional[datetime] = None
    verified_by: Optional[UUID] = Field(default=None, foreign_key="users.id")