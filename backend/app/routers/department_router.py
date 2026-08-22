from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.auth import get_current_user
from app.services import department_service

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("/")
def list_departments(session: Session = Depends(get_session),
                      current_user: dict = Depends(get_current_user)):
    return department_service.list_departments(session)