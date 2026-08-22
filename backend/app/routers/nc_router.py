from typing import Optional, List
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from pydantic import BaseModel
from app.models.non_conformance import NonConformance
from app.database import get_session
from app.auth import get_current_user
from app.services import nc_service
from app.services.nc_service import InvalidTransitionError, UnauthorizedTransitionError
from app.services.delay_risk_service import delay_risk_service
from app.enums import NCState, Severity
from fastapi.responses import StreamingResponse


router = APIRouter(prefix="/nc", tags=["non-conformances"])


class RaiseNCRequest(BaseModel):
    title: str
    description: str
    severity: Severity
    dept_id: str
    raised_by: str


class TransitionRequest(BaseModel):
    to_state: NCState
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[date] = None


class ReopenRequest(BaseModel):
    assigned_to: Optional[str] = None
    due_date: Optional[date] = None


class OperatorOut(BaseModel):
    id_usr: str
    first_name: str
    last_name: str
    email: str


class AssignRequest(BaseModel):
    operator_id: str
    due_date: date


# ============================================================
# Routes à chemin FIXE — toujours avant les routes /{nc_id}
# ============================================================

@router.post("/")
def create_nc(payload: RaiseNCRequest, session: Session = Depends(get_session)):
    return nc_service.raise_nc(
        session, payload.title, payload.description,
        payload.severity, payload.dept_id, payload.raised_by
    )


@router.get("/")
def list_ncs(
    state: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_user),
):
    return nc_service.list_ncs(session, current_user=current_user, state=state)


@router.get("/kpi")
def get_kpi(session: Session = Depends(get_session)):
    return nc_service.get_kpi(session)


@router.get("/kpi/trend")
def get_trend(session: Session = Depends(get_session)):
    return nc_service.get_trend(session)


@router.get("/operators", response_model=List[OperatorOut])
def list_operators(session: Session = Depends(get_session)):
    return nc_service.list_operators(session)


@router.get("/predict-delay-risk")
def predict_delay_risk_endpoint(
    dept_id: str,
    severity: str,
    raised_by_role: str,
    raised_at: datetime,
):
    try:
        result = delay_risk_service.predict_delay_risk(
            dept_id=dept_id,
            severity=severity,
            raised_by_role=raised_by_role,
            raised_at=raised_at,
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))



@router.get("/export/csv")
def export_csv(session: Session = Depends(get_session)):
    csv_content = nc_service.export_nc_events_csv(session)
    filename = f"nc_events_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ============================================================
# Routes à chemin VARIABLE — toujours après
# ============================================================

@router.post("/{nc_id}/transition")
def transition_nc(
    nc_id: str, payload: TransitionRequest,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    try:
        return nc_service.transition_nc(
            session, nc_id, payload.to_state, current_user, payload.notes,
            assigned_to=payload.assigned_to, due_date=payload.due_date,
        )
    except InvalidTransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except UnauthorizedTransitionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{nc_id}/reopen")
def reopen_nc(
    nc_id: str, payload: ReopenRequest,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    try:
        return nc_service.reopen_nc(
            session, nc_id, actor_id=current_user["id"],
            assigned_to=payload.assigned_to, due_date=payload.due_date,
        )
    except InvalidTransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{nc_id}/assign")
def assign_nc(
    nc_id: str, payload: AssignRequest,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    try:
        return nc_service.assign_nc(
            session, nc_id, payload.operator_id, payload.due_date, actor_id=current_user["id"]
        )
    except InvalidTransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{nc_id}")
def delete_nc(
    nc_id: str,
    session: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "Manager":
        raise HTTPException(status_code=403, detail="Seul un manager peut supprimer une NC")
    try:
        return nc_service.soft_delete_nc(session, nc_id, current_user["id"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/{nc_id}/events")
def get_events(nc_id: str, session: Session = Depends(get_session)):
    return nc_service.get_nc_events(session, nc_id)


@router.get("/{nc_id}")
def get_nc(nc_id: str, session: Session = Depends(get_session)):
    try:
        return nc_service.get_nc(session, nc_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

