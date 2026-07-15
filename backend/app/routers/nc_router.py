from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.services import nc_service
from app.services.nc_service import InvalidTransitionError
from app.enums import NCState, Severity
from pydantic import BaseModel
from datetime import date

router = APIRouter(prefix="/nc", tags=["non-conformances"])


class RaiseNCRequest(BaseModel):
    title: str
    description: str
    severity: Severity
    dept_id: str
    raised_by: str


class TransitionRequest(BaseModel):
    to_state: NCState
    actor_id: str
    notes: str = None


@router.post("/")
def create_nc(payload: RaiseNCRequest, session: Session = Depends(get_session)):
    return nc_service.raise_nc(session, payload.title, payload.description, 
                                 payload.severity, payload.dept_id, payload.raised_by)


@router.post("/{nc_id}/transition")
def transition_nc(nc_id: str, payload: TransitionRequest, session: Session = Depends(get_session)):
    try:
        return nc_service.transition_nc(session, nc_id, payload.to_state, payload.actor_id, payload.notes)
    except InvalidTransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{nc_id}")
def get_nc(nc_id: str, session: Session = Depends(get_session)):
    try:
        return nc_service.get_nc(session, nc_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{nc_id}/events")
def get_events(nc_id: str, session: Session = Depends(get_session)):
    return nc_service.get_nc_events(session, nc_id)

class RootCauseRequest(BaseModel):
    category: str
    description: str
    identified_by: str

class CorrectiveActionRequest(BaseModel):
    description: str
    assigned_to: str
    due_date: date

@router.post("/{nc_id}/root-cause")
def add_root_cause(nc_id: str, payload: RootCauseRequest, session: Session = Depends(get_session)):
    return nc_service.add_root_cause(session, nc_id, payload.category, payload.description, payload.identified_by)

@router.post("/{nc_id}/corrective-action")
def add_corrective_action(nc_id: str, payload: CorrectiveActionRequest, session: Session = Depends(get_session)):
    return nc_service.add_corrective_action(session, nc_id, payload.description, payload.assigned_to, payload.due_date)