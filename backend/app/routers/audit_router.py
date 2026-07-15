from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from datetime import date
from pydantic import BaseModel
from app.database import get_session
from app.services import audit_service
from app.enums import Severity

router = APIRouter(prefix="/audits", tags=["audits"])


class AuditRequest(BaseModel):
    dept_id: str
    auditor_id: str
    audit_type: str
    scheduled_date: date

class FindingRequest(BaseModel):
    severity: Severity
    description: str

class EscalateRequest(BaseModel):
    title: str
    raised_by: str


@router.post("/")
def create_audit(payload: AuditRequest, session: Session = Depends(get_session)):
    return audit_service.create_audit(session, payload.dept_id, payload.auditor_id, 
                                        payload.audit_type, payload.scheduled_date)

@router.post("/{audit_id}/findings")
def add_finding(audit_id: str, payload: FindingRequest, session: Session = Depends(get_session)):
    return audit_service.add_finding(session, audit_id, payload.severity, payload.description)

@router.post("/findings/{finding_id}/escalate")
def escalate_finding(finding_id: str, payload: EscalateRequest, session: Session = Depends(get_session)):
    try:
        return audit_service.escalate_finding_to_nc(session, finding_id, payload.title, payload.raised_by)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))