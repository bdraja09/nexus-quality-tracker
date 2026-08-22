from sqlmodel import SQLModel, Field
from typing import Optional
from app.enums import Severity


class AuditFinding(SQLModel, table=True):
    __tablename__ = "audit_findings"

    id_finding: str = Field(primary_key=True)
    audit_id: str = Field(foreign_key="audits.id_audit")
    nc_id: Optional[str] = Field(default=None, foreign_key="non_conformances.id_nc")
    severity: Severity
    description: str