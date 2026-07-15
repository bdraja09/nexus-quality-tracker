from datetime import date
from app.services.id_generator import generate_id
from app.models.audit import Audit
from app.models.audit_finding import AuditFinding
from app.services import nc_service


def _normalize_date(value):
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    return value


def create_audit(session, dept_id: str, auditor_id: str, audit_type: str, scheduled_date):
    audit = Audit(
        id_audit=generate_id(session, "audit"),
        dept_id=dept_id,
        auditor_id=auditor_id,
        audit_type=audit_type,
        scheduled_date=_normalize_date(scheduled_date),
    )
    session.add(audit)
    session.commit()
    session.refresh(audit)
    return audit


def add_finding(session, audit_id: str, severity, description: str):
    finding = AuditFinding(
        id_finding=generate_id(session, "finding"),
        audit_id=audit_id, severity=severity, description=description
    )
    session.add(finding)
    session.commit()
    session.refresh(finding)
    return finding


def escalate_finding_to_nc(session, finding_id: str, title: str, raised_by: str):
    finding = session.get(AuditFinding, finding_id)
    if not finding:
        raise ValueError("Finding introuvable")

    audit = session.get(Audit, finding.audit_id)

    nc = nc_service.raise_nc(
        session, title=title, description=finding.description,
        severity=finding.severity, dept_id=audit.dept_id, raised_by=raised_by
    )

    finding.nc_id = nc.id_nc
    session.add(finding)
    session.commit()

    return nc