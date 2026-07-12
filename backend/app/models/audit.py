from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4
from datetime import date
from typing import Optional

class Audit(SQLModel, table=True):
    __tablename__ = "audits"
    
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    dept_id: UUID = Field(foreign_key="departments.id")
    auditor_id: UUID = Field(foreign_key="users.id")
    audit_type: str
    scheduled_date: date
    completed_date: Optional[date] = None