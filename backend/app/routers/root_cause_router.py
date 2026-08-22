from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.services import nc_service
from pydantic import BaseModel

router = APIRouter(prefix="/nc", tags=["root-causes"])


class RootCauseRequest(BaseModel):
    category: str
    description: str
    identified_by: str


@router.post("/{nc_id}/root-cause")
def add_root_cause(nc_id: str, payload: RootCauseRequest, session: Session = Depends(get_session)):
    try:
        return nc_service.add_root_cause(session, nc_id, payload.category, payload.description, payload.identified_by)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))