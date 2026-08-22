from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from datetime import date
from pydantic import BaseModel

from app.database import get_session
from app.auth import get_current_user
from app.services import audit_service
from app.enums import Severity

router = APIRouter(prefix="/audits", tags=["audits"])


class AuditRequest(BaseModel):
    dept_id: str
    auditor_id: str
    audit_type: str
    scheduled_date: date

class CompleteAuditRequest(BaseModel):
    findings: Optional[str] = None

class FindingRequest(BaseModel):
    severity: Severity
    description: str

class EscalateRequest(BaseModel):
    title: str


@router.get("/")
def list_audits(dept_id: Optional[str] = None, session: Session = Depends(get_session),
                 current_user: dict = Depends(get_current_user)):
    return audit_service.list_audits(session, dept_id=dept_id)


@router.post("/")
def create_audit(payload: AuditRequest, session: Session = Depends(get_session),
                  current_user: dict = Depends(get_current_user)):
    return audit_service.create_audit(session, payload.dept_id, payload.auditor_id,
                                       payload.audit_type, payload.scheduled_date)


@router.get("/{audit_id}")
def get_audit(audit_id: str, session: Session = Depends(get_session),
              current_user: dict = Depends(get_current_user)):
    try:
        return audit_service.get_audit(session, audit_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{audit_id}/complete")
def complete_audit(audit_id: str, payload: CompleteAuditRequest,
                    session: Session = Depends(get_session),
                    current_user: dict = Depends(get_current_user)):
    try:
        return audit_service.complete_audit(session, audit_id, payload.findings)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{audit_id}/findings")
def list_findings(audit_id: str, session: Session = Depends(get_session),
                   current_user: dict = Depends(get_current_user)):
    return audit_service.list_findings(session, audit_id)


@router.post("/{audit_id}/findings")
def add_finding(audit_id: str, payload: FindingRequest, session: Session = Depends(get_session),
                 current_user: dict = Depends(get_current_user)):
    try:
        return audit_service.add_finding(session, audit_id, payload.severity, payload.description)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/findings/{finding_id}/escalate")
def escalate_finding(finding_id: str, payload: EscalateRequest,
                      session: Session = Depends(get_session),
                      current_user: dict = Depends(get_current_user)):
    try:
        return audit_service.escalate_finding_to_nc(
            session, finding_id, payload.title, raised_by=current_user["id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))