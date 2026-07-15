from sqlmodel import SQLModel, Field
from datetime import date
from typing import Optional


class Audit(SQLModel, table=True):
    __tablename__ = "audits"

    id_audit: str = Field(primary_key=True)
    dept_id: str = Field(foreign_key="departments.id_dept")
    auditor_id: str = Field(foreign_key="users.id_usr")
    audit_type: str
    scheduled_date: date
    completed_date: Optional[date] = None