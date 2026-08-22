from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from datetime import date
from app.database import get_session
from app.services import nc_service
from pydantic import BaseModel

router = APIRouter(prefix="/nc", tags=["corrective-actions"])


class CorrectiveActionRequest(BaseModel):
    description: str
    assigned_to: str
    due_date: date


@router.post("/{nc_id}/corrective-action")
def add_corrective_action(nc_id: str, payload: CorrectiveActionRequest, session: Session = Depends(get_session)):
    try:
        return nc_service.add_corrective_action(session, nc_id, payload.description, payload.assigned_to, payload.due_date)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))