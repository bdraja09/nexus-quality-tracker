from sqlmodel import Session
from uuid import UUID
from app.models.audit import Audit
from app.models.audit_finding import AuditFinding
from app.services import nc_service


def create_audit(session: Session, dept_id: UUID, auditor_id: UUID, audit_type: str, scheduled_date) -> Audit:
    audit = Audit(dept_id=dept_id, auditor_id=auditor_id, audit_type=audit_type, scheduled_date=scheduled_date)
    session.add(audit)
    session.commit()
    session.refresh(audit)
    return audit


def add_finding(session: Session, audit_id: UUID, severity, description: str) -> AuditFinding:
    finding = AuditFinding(audit_id=audit_id, severity=severity, description=description)
    session.add(finding)
    session.commit()
    session.refresh(finding)
    return finding


def escalate_finding_to_nc(session: Session, finding_id: UUID, title: str, raised_by: UUID) -> AuditFinding:
    finding = session.get(AuditFinding, finding_id)
    if not finding:
        raise ValueError("Finding introuvable")

    audit = session.get(Audit, finding.audit_id)
    
    nc = nc_service.raise_nc(
        session,
        title=title,
        description=finding.description,
        severity=finding.severity,
        dept_id=audit.dept_id,
        raised_by=raised_by
    )

    finding.nc_id = nc.id
    session.add(finding)
    session.commit()
    session.refresh(finding)
    return finding