from sqlmodel import SQLModel, Field
from uuid import UUID, uuid4
from typing import Optional
from app.enums import Severity

class AuditFinding(SQLModel, table=True):
    __tablename__ = "audit_findings"
    
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    audit_id: UUID = Field(foreign_key="audits.id")
    nc_id: Optional[UUID] = Field(default=None, foreign_key="non_conformances.id")
    severity: Severity
    description: str